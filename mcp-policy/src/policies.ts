import {
  ALLOWED_ENVIRONMENTS,
  ALLOWED_RESOURCE_TYPES,
  ALLOWED_SERVICES,
  AllowedEnvironment,
  AllowedResourceType,
  AllowedService,
  ErrorCode,
  EvidenceEntry,
  PolicyToolResponseEnvelope,
  StructuredError,
} from "./types.js";
import { IPolicyRepository, FixturePolicyRepository } from "./repository.js";

export const POLICY_VERSION = "2026.1";
export const SCHEMA_VERSION = "1.0.0" as const;

export interface ToolContext {
  repository: IPolicyRepository;
  now: () => Date;
  generateCorrelationId: () => string;
  timeoutMs: number;
}

export function createDefaultToolContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    repository: overrides?.repository ?? new FixturePolicyRepository(),
    now: overrides?.now ?? (() => new Date()),
    generateCorrelationId: overrides?.generateCorrelationId ?? (() => `corr-${Math.random().toString(36).substring(2, 10)}`),
    timeoutMs: overrides?.timeoutMs ?? 5000,
  };
}

export function buildSuccessEnvelope<T>(
  tool: PolicyToolResponseEnvelope["tool"],
  request: Record<string, unknown>,
  data: T,
  evidence: EvidenceEntry[],
  context: ToolContext
): PolicyToolResponseEnvelope<T> {
  return {
    schemaVersion: SCHEMA_VERSION,
    policyVersion: POLICY_VERSION,
    tool,
    request,
    status: "SUCCESS",
    data,
    evidence,
    evaluatedAt: context.now().toISOString(),
    correlationId: context.generateCorrelationId(),
  };
}

export function buildErrorEnvelope(
  tool: PolicyToolResponseEnvelope["tool"],
  request: Record<string, unknown>,
  code: ErrorCode,
  message: string,
  isRetryable: boolean,
  context: ToolContext,
  details?: string
): PolicyToolResponseEnvelope {
  const error: StructuredError = {
    code,
    message,
    isRetryable,
    ...(details ? { details } : {}),
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    policyVersion: POLICY_VERSION,
    tool,
    request,
    status: "ERROR",
    error,
    evidence: [],
    evaluatedAt: context.now().toISOString(),
    correlationId: context.generateCorrelationId(),
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Operation timed out after ${timeoutMs}ms`);
      err.name = "TimeoutError";
      reject(err);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// 1. get_deployment_policy
export async function executeGetDeploymentPolicy(
  input: { environment: string; resourceType: string },
  context: ToolContext = createDefaultToolContext()
): Promise<PolicyToolResponseEnvelope> {
  const reqObj = { environment: input.environment, resourceType: input.resourceType };

  if (!ALLOWED_ENVIRONMENTS.includes(input.environment as AllowedEnvironment)) {
    return buildErrorEnvelope(
      "get_deployment_policy",
      reqObj,
      "INVALID_INPUT",
      `Environment '${input.environment}' is not permitted. Must be one of: ${ALLOWED_ENVIRONMENTS.join(", ")}`,
      false,
      context
    );
  }

  if (!ALLOWED_RESOURCE_TYPES.includes(input.resourceType as AllowedResourceType)) {
    return buildErrorEnvelope(
      "get_deployment_policy",
      reqObj,
      "INVALID_INPUT",
      `ResourceType '${input.resourceType}' is not permitted. Must be one of: ${ALLOWED_RESOURCE_TYPES.join(", ")}`,
      false,
      context
    );
  }

  try {
    const policies = await withTimeout(
      context.repository.getDeploymentPolicies(
        input.environment as AllowedEnvironment,
        input.resourceType as AllowedResourceType
      ),
      context.timeoutMs
    );

    if (!policies || policies.length === 0) {
      return buildErrorEnvelope(
        "get_deployment_policy",
        reqObj,
        "POLICY_NOT_FOUND",
        `No deployment policy found for ${input.resourceType} in ${input.environment}. Failing closed.`,
        false,
        context
      );
    }

    const evidence: EvidenceEntry[] = policies.map((p) => ({
      policyId: p.policyId,
      source: "enterprise-policy-registry",
      summary: p.description,
    }));

    return buildSuccessEnvelope("get_deployment_policy", reqObj, policies, evidence, context);
  } catch (err: unknown) {
    const error = err as Error;
    if (error.name === "TimeoutError") {
      return buildErrorEnvelope(
        "get_deployment_policy",
        reqObj,
        "TIMEOUT",
        error.message,
        true,
        context
      );
    }
    return buildErrorEnvelope(
      "get_deployment_policy",
      reqObj,
      "DEPENDENCY_UNAVAILABLE",
      `Policy repository unavailable: ${error.message}`,
      true,
      context
    );
  }
}

// 2. get_service_ownership
export async function executeGetServiceOwnership(
  input: { service: string },
  context: ToolContext = createDefaultToolContext()
): Promise<PolicyToolResponseEnvelope> {
  const reqObj = { service: input.service };

  if (!ALLOWED_SERVICES.includes(input.service as AllowedService)) {
    return buildErrorEnvelope(
      "get_service_ownership",
      reqObj,
      "INVALID_INPUT",
      `Service '${input.service}' is not in the approved service registry. Must be one of: ${ALLOWED_SERVICES.join(", ")}`,
      false,
      context
    );
  }

  try {
    const ownership = await withTimeout(
      context.repository.getServiceOwnership(input.service as AllowedService),
      context.timeoutMs
    );

    if (!ownership) {
      return buildErrorEnvelope(
        "get_service_ownership",
        reqObj,
        "POLICY_NOT_FOUND",
        `Service ownership metadata for '${input.service}' not found. Failing closed.`,
        false,
        context
      );
    }

    const evidence: EvidenceEntry[] = [
      {
        policyId: "SVC-OWN-001",
        source: "cmdb-service-directory",
        summary: `Owned by ${ownership.ownerTeam} (${ownership.serviceTier})`,
      },
    ];

    return buildSuccessEnvelope("get_service_ownership", reqObj, ownership, evidence, context);
  } catch (err: unknown) {
    const error = err as Error;
    if (error.name === "TimeoutError") {
      return buildErrorEnvelope(
        "get_service_ownership",
        reqObj,
        "TIMEOUT",
        error.message,
        true,
        context
      );
    }
    return buildErrorEnvelope(
      "get_service_ownership",
      reqObj,
      "DEPENDENCY_UNAVAILABLE",
      `Policy repository unavailable: ${error.message}`,
      true,
      context
    );
  }
}

// 3. get_approved_skus
export async function executeGetApprovedSkus(
  input: { environment: string },
  context: ToolContext = createDefaultToolContext()
): Promise<PolicyToolResponseEnvelope> {
  const reqObj = { environment: input.environment };

  if (!ALLOWED_ENVIRONMENTS.includes(input.environment as AllowedEnvironment)) {
    return buildErrorEnvelope(
      "get_approved_skus",
      reqObj,
      "INVALID_INPUT",
      `Environment '${input.environment}' is not permitted. Must be one of: ${ALLOWED_ENVIRONMENTS.join(", ")}`,
      false,
      context
    );
  }

  try {
    const skus = await withTimeout(
      context.repository.getApprovedSkus(input.environment as AllowedEnvironment),
      context.timeoutMs
    );

    if (!skus) {
      return buildErrorEnvelope(
        "get_approved_skus",
        reqObj,
        "POLICY_NOT_FOUND",
        `No approved SKU catalog found for environment '${input.environment}'. Failing closed.`,
        false,
        context
      );
    }

    const evidence: EvidenceEntry[] = [
      {
        policyId: "FINOPS-SKU-001",
        source: "finops-approved-sku-matrix",
        summary: skus.costPolicyRule,
      },
    ];

    return buildSuccessEnvelope("get_approved_skus", reqObj, skus, evidence, context);
  } catch (err: unknown) {
    const error = err as Error;
    if (error.name === "TimeoutError") {
      return buildErrorEnvelope(
        "get_approved_skus",
        reqObj,
        "TIMEOUT",
        error.message,
        true,
        context
      );
    }
    return buildErrorEnvelope(
      "get_approved_skus",
      reqObj,
      "DEPENDENCY_UNAVAILABLE",
      `Policy repository unavailable: ${error.message}`,
      true,
      context
    );
  }
}

// 4. get_change_window
export async function executeGetChangeWindow(
  input: { service: string },
  context: ToolContext = createDefaultToolContext()
): Promise<PolicyToolResponseEnvelope> {
  const reqObj = { service: input.service };

  if (!ALLOWED_SERVICES.includes(input.service as AllowedService)) {
    return buildErrorEnvelope(
      "get_change_window",
      reqObj,
      "INVALID_INPUT",
      `Service '${input.service}' is not in the approved service registry. Must be one of: ${ALLOWED_SERVICES.join(", ")}`,
      false,
      context
    );
  }

  try {
    const window = await withTimeout(
      context.repository.getChangeWindow(input.service as AllowedService),
      context.timeoutMs
    );

    if (!window) {
      return buildErrorEnvelope(
        "get_change_window",
        reqObj,
        "POLICY_NOT_FOUND",
        `Change window for service '${input.service}' not found. Failing closed.`,
        false,
        context
      );
    }

    const evidence: EvidenceEntry[] = [
      {
        policyId: "CHG-WIN-001",
        source: "change-management-database",
        summary: `Window status: ${window.status}. Active: ${window.activeWindow}`,
      },
    ];

    return buildSuccessEnvelope("get_change_window", reqObj, window, evidence, context);
  } catch (err: unknown) {
    const error = err as Error;
    if (error.name === "TimeoutError") {
      return buildErrorEnvelope(
        "get_change_window",
        reqObj,
        "TIMEOUT",
        error.message,
        true,
        context
      );
    }
    return buildErrorEnvelope(
      "get_change_window",
      reqObj,
      "DEPENDENCY_UNAVAILABLE",
      `Policy repository unavailable: ${error.message}`,
      true,
      context
    );
  }
}
