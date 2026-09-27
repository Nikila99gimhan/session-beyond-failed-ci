import { z } from "zod";

export const ALLOWED_ENVIRONMENTS = ["production", "staging", "development"] as const;
export type AllowedEnvironment = typeof ALLOWED_ENVIRONMENTS[number];

export const ALLOWED_RESOURCE_TYPES = [
  "Microsoft.Web/sites",
  "Microsoft.Storage/storageAccounts",
  "Microsoft.Web/serverfarms",
] as const;
export type AllowedResourceType = typeof ALLOWED_RESOURCE_TYPES[number];

export const ALLOWED_SERVICES = [
  "azure-functions-service",
  "cloud-core-service",
] as const;
export type AllowedService = typeof ALLOWED_SERVICES[number];

export const ErrorCodeSchema = z.enum([
  "INVALID_INPUT",
  "POLICY_NOT_FOUND",
  "DEPENDENCY_UNAVAILABLE",
  "TIMEOUT",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export interface StructuredError {
  code: ErrorCode;
  message: string;
  isRetryable: boolean;
  details?: string;
}

export interface EvidenceEntry {
  policyId: string;
  source: string;
  summary: string;
}

export interface PolicyToolResponseEnvelope<T = unknown> {
  schemaVersion: "1.0.0";
  policyVersion: string;
  tool: "get_deployment_policy" | "get_service_ownership" | "get_approved_skus" | "get_change_window" | "get_investigation_context";
  request: Record<string, unknown>;
  status: "SUCCESS" | "ERROR";
  data?: T;
  error?: StructuredError;
  evidence: EvidenceEntry[];
  evaluatedAt: string;
  correlationId: string;
}

export interface DeploymentPolicy {
  policyId: string;
  name: string;
  environment: AllowedEnvironment;
  resourceType: AllowedResourceType;
  rule: string;
  description: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  humanSecurityReviewRequired: boolean;
  complianceStandard: string;
}

export interface ApprovedSkusInfo {
  environment: AllowedEnvironment;
  approvedSkus: string[];
  restrictedSkus: string[];
  maxTier: string;
  costPolicyRule: string;
  estimatedCostPerMonth: Record<string, string>;
  finOpsApprovalRequired: boolean;
}

export interface ServiceOwnership {
  service: AllowedService;
  ownerTeam: string;
  serviceTier: string;
  technicalLead: string;
  securityLiaison: string;
  finOpsLead: string;
  slackChannel: string;
}

export interface ChangeWindow {
  service: AllowedService;
  status: "OPEN" | "RESTRICTED" | "FREEZE";
  activeWindow: string;
  nextChangeWindow: string;
  freezeWindowActive: boolean;
  requiresCabApproval: boolean;
}

// Zod schemas for tool inputs with strict bounds
export const DeploymentPolicyInputSchema = z.object({
  environment: z.string().trim().max(50),
  resourceType: z.string().trim().max(100),
});

export const ServiceOwnershipInputSchema = z.object({
  service: z.string().trim().max(100),
});

export const ApprovedSkusInputSchema = z.object({
  environment: z.string().trim().max(50),
});

export const ChangeWindowInputSchema = z.object({
  service: z.string().trim().max(100),
});

export const InvestigationContextInputSchema = z.object({
  service: z.string().trim().max(100),
  environment: z.string().trim().max(50),
  accountScope: z.string().trim().max(100).optional(),
  ruleIds: z.array(z.string().trim().max(50)).optional(),
  policyVersion: z.string().trim().max(20).optional(),
});

export type InvestigationContextInput = z.infer<typeof InvestigationContextInputSchema>;

export interface FreshnessMetadata {
  policyVersion: string;
  evaluatedAt: string;
  isFresh: boolean;
  ttlSeconds: number;
  sourceUrl: string;
}

export interface InvestigationContextData {
  serviceOwnership: ServiceOwnership;
  applicableRules: DeploymentPolicy[];
  approvedSkus: ApprovedSkusInfo;
  changeWindow: ChangeWindow;
  freshness: FreshnessMetadata;
  exceptions: Array<{ ruleId: string; status: string; details: string }>;
}
