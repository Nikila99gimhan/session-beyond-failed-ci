import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import {
  createGovernedPolicyServer,
  APPROVED_POLICY_TOOLS,
} from "../mcp-policy/src/server.js";
import {
  executeGetDeploymentPolicy,
  executeGetServiceOwnership,
  executeGetApprovedSkus,
  executeGetChangeWindow,
  createDefaultToolContext,
} from "../mcp-policy/src/policies.js";
import { FixturePolicyRepository } from "../mcp-policy/src/repository.js";
import { PolicyToolResponseEnvelope } from "../mcp-policy/src/types.js";

// @ts-ignore
const ajv = new (Ajv.default || Ajv)({ allErrors: true, strict: false });
const schemaPath = path.resolve(__dirname, "../contracts/policy-tool-response.schema.json");
const rawSchema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
delete rawSchema.$schema;
const validateEnvelope = ajv.compile(rawSchema);

function assertValidEnvelope(envelope: PolicyToolResponseEnvelope): void {
  const valid = validateEnvelope(envelope);
  if (!valid) {
    throw new Error(`Envelope schema validation failed: ${JSON.stringify(validateEnvelope.errors, null, 2)}`);
  }
  expect(valid).toBe(true);
}

const fixedDate = new Date("2026-09-16T12:00:00.000Z");
const deterministicContext = createDefaultToolContext({
  now: () => fixedDate,
  generateCorrelationId: () => "test-correlation-id-fixed",
  timeoutMs: 100,
});

describe("Read-Only Policy MCP Server", () => {
  describe("Static Tool Registration & Allowlist Assertion", () => {
    it("proves the exposed MCP tool list contains strictly the four approved tools", () => {
      const { toolNames } = createGovernedPolicyServer();
      const expectedTools = [
        "get_deployment_policy",
        "get_service_ownership",
        "get_approved_skus",
        "get_change_window",
      ];

      expect(toolNames).toEqual(expectedTools);
      expect(APPROVED_POLICY_TOOLS).toHaveLength(4);
      expect([...toolNames].sort()).toEqual([...expectedTools].sort());
    });
  });

  describe("Successful Tool Calls & Schema Validation", () => {
    it("get_deployment_policy produces valid success envelope for production web sites", async () => {
      const result = await executeGetDeploymentPolicy(
        { environment: "production", resourceType: "Microsoft.Web/sites" },
        deterministicContext
      );

      assertValidEnvelope(result);
      expect(result.status).toBe("SUCCESS");
      expect(result.tool).toBe("get_deployment_policy");
      expect(result.correlationId).toBe("test-correlation-id-fixed");
      expect(result.evaluatedAt).toBe(fixedDate.toISOString());

      const data = result.data as Array<{ policyId: string; severity: string; rule: string }>;
      expect(data).toHaveLength(1);
      expect(data[0].policyId).toBe("POL-AZ-NET-001");
      expect(data[0].severity).toBe("High");
      expect(data[0].rule).toContain("publicNetworkAccess must be explicitly set to 'Disabled'");

      expect(result.evidence).toHaveLength(1);
      expect(result.evidence[0].policyId).toBe("POL-AZ-NET-001");
      expect(result.evidence[0].source).toBe("enterprise-policy-registry");
    });

    it("get_service_ownership produces valid success envelope", async () => {
      const result = await executeGetServiceOwnership(
        { service: "azure-functions-service" },
        deterministicContext
      );

      assertValidEnvelope(result);
      expect(result.status).toBe("SUCCESS");
      expect(result.tool).toBe("get_service_ownership");

      const data = result.data as { ownerTeam: string; serviceTier: string };
      expect(data.ownerTeam).toBe("Cloud Platform Engineering");
      expect(data.serviceTier).toBe("Tier-1 Mission Critical");
      expect(result.evidence[0].policyId).toBe("SVC-OWN-001");
    });

    it("get_approved_skus produces valid success envelope and restricts EP3", async () => {
      const result = await executeGetApprovedSkus(
        { environment: "production" },
        deterministicContext
      );

      assertValidEnvelope(result);
      expect(result.status).toBe("SUCCESS");
      expect(result.tool).toBe("get_approved_skus");

      const data = result.data as { approvedSkus: string[]; restrictedSkus: string[]; finOpsApprovalRequired: boolean };
      expect(data.approvedSkus).toEqual(["EP1"]);
      expect(data.restrictedSkus).toContain("EP3");
      expect(data.finOpsApprovalRequired).toBe(true);
      expect(result.evidence[0].policyId).toBe("FINOPS-SKU-001");
    });

    it("get_change_window produces valid success envelope", async () => {
      const result = await executeGetChangeWindow(
        { service: "azure-functions-service" },
        deterministicContext
      );

      assertValidEnvelope(result);
      expect(result.status).toBe("SUCCESS");
      expect(result.tool).toBe("get_change_window");

      const data = result.data as { status: string; activeWindow: string };
      expect(data.status).toBe("OPEN");
      expect(data.activeWindow).toContain("Monday - Thursday");
      expect(result.evidence[0].policyId).toBe("CHG-WIN-001");
    });
  });

  describe("Input Validation and Fail-Closed Behavior", () => {
    it("fails closed on unapproved environment", async () => {
      const result = await executeGetDeploymentPolicy(
        { environment: "unapproved-sandbox", resourceType: "Microsoft.Web/sites" },
        deterministicContext
      );

      assertValidEnvelope(result);
      expect(result.status).toBe("ERROR");
      expect(result.error?.code).toBe("INVALID_INPUT");
      expect(result.error?.isRetryable).toBe(false);
      expect(result.evidence).toEqual([]);
    });

    it("fails closed on unapproved resource type", async () => {
      const result = await executeGetDeploymentPolicy(
        { environment: "production", resourceType: "Microsoft.Compute/virtualMachines" },
        deterministicContext
      );

      assertValidEnvelope(result);
      expect(result.status).toBe("ERROR");
      expect(result.error?.code).toBe("INVALID_INPUT");
      expect(result.error?.isRetryable).toBe(false);
    });

    it("fails closed on unknown service identifier", async () => {
      const result = await executeGetServiceOwnership(
        { service: "malicious-unknown-service" },
        deterministicContext
      );

      assertValidEnvelope(result);
      expect(result.status).toBe("ERROR");
      expect(result.error?.code).toBe("INVALID_INPUT");
      expect(result.error?.isRetryable).toBe(false);
    });
  });
});
