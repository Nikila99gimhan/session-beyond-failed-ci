import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import http from "node:http";
import {
  createGovernedPolicyServer,
  APPROVED_POLICY_TOOLS,
  runHttpServer,
} from "../mcp-policy/src/server.js";
import {
  executeGetDeploymentPolicy,
  executeGetServiceOwnership,
  executeGetApprovedSkus,
  executeGetChangeWindow,
  executeGetInvestigationContext,
  createDefaultToolContext,
} from "../mcp-policy/src/policies.js";
import { FixturePolicyRepository, CachedPolicyRepository } from "../mcp-policy/src/repository.js";
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
    it("proves the exposed MCP tool list contains strictly the five approved tools", () => {
      const { toolNames } = createGovernedPolicyServer();
      const expectedTools = [
        "get_deployment_policy",
        "get_service_ownership",
        "get_approved_skus",
        "get_change_window",
        "get_investigation_context",
      ];

      expect(toolNames).toEqual(expectedTools);
      expect(APPROVED_POLICY_TOOLS).toHaveLength(5);
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

  describe("Phase 2: Consolidated Batched Tool (get_investigation_context)", () => {
    it("produces valid consolidated investigation context for production azure-functions-service", async () => {
      const result = await executeGetInvestigationContext(
        {
          service: "azure-functions-service",
          environment: "production",
          ruleIds: ["POL-AZ-NET-001", "POL-AZ-SKU-003"],
        },
        deterministicContext
      );

      assertValidEnvelope(result);
      expect(result.status).toBe("SUCCESS");
      expect(result.tool).toBe("get_investigation_context");

      const data = result.data as any;
      expect(data.serviceOwnership.ownerTeam).toBe("Cloud Platform Engineering");
      expect(data.approvedSkus.approvedSkus).toEqual(["EP1"]);
      expect(data.approvedSkus.restrictedSkus).toContain("EP3");
      expect(data.applicableRules).toHaveLength(2);
      expect(data.freshness.isFresh).toBe(true);
      expect(data.freshness.policyVersion).toBe("2026.1");

      // Verify evidence consolidation
      expect(result.evidence.length).toBeGreaterThanOrEqual(3);
      const policyIds = result.evidence.map((e) => e.policyId);
      expect(policyIds).toContain("POL-AZ-NET-001");
      expect(policyIds).toContain("POL-AZ-SKU-003");
      expect(policyIds).toContain("SVC-OWN-001");
    });

    it("fails closed when requested policy version mismatches active catalog", async () => {
      const result = await executeGetInvestigationContext(
        {
          service: "azure-functions-service",
          environment: "production",
          policyVersion: "1999.0", // Mismatched version
        },
        deterministicContext
      );

      assertValidEnvelope(result);
      expect(result.status).toBe("ERROR");
      expect(result.error?.code).toBe("POLICY_NOT_FOUND");
      expect(result.error?.message).toContain("does not match active catalog version");
    });

    it("fails closed when caller requests unauthorized account scope (server-side authorization)", async () => {
      const result = await executeGetInvestigationContext(
        {
          service: "azure-functions-service",
          environment: "production",
          accountScope: "unauthorized-rogue-tenant",
        },
        deterministicContext
      );

      assertValidEnvelope(result);
      expect(result.status).toBe("ERROR");
      expect(result.error?.code).toBe("UNAUTHORIZED_SCOPE");
      expect(result.error?.message).toContain("unauthorized or outside permitted enterprise boundary");
    });
  });

  describe("Phase 3: Cached Policy Repository with Trust Boundaries", () => {
    it("tracks cache hits and accelerates repeated calls", async () => {
      const cachedRepo = new CachedPolicyRepository(new FixturePolicyRepository(), { ttlMs: 60_000 });
      const stats0 = cachedRepo.getStats();
      expect(stats0.hits).toBe(0);
      expect(stats0.misses).toBe(0);

      // Cold call
      const res1 = await cachedRepo.getApprovedSkus("production");
      expect(res1?.approvedSkus).toEqual(["EP1"]);
      expect(cachedRepo.getStats().misses).toBe(1);
      expect(cachedRepo.getStats().hits).toBe(0);

      // Warm call (should hit cache)
      const res2 = await cachedRepo.getApprovedSkus("production");
      expect(res2?.approvedSkus).toEqual(["EP1"]);
      expect(cachedRepo.getStats().hits).toBe(1);
      expect(cachedRepo.getStats().misses).toBe(1);
    });

    it("evicts expired entries after TTL and increments evictions", async () => {
      // 10ms short TTL
      const shortTtlRepo = new CachedPolicyRepository(new FixturePolicyRepository(), { ttlMs: 10 });
      await shortTtlRepo.getServiceOwnership("azure-functions-service");
      expect(shortTtlRepo.getStats().misses).toBe(1);

      // Wait 20ms for TTL expiry
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Next call should detect expiry, evict, and fetch fresh
      await shortTtlRepo.getServiceOwnership("azure-functions-service");
      expect(shortTtlRepo.getStats().evictions).toBe(1);
      expect(shortTtlRepo.getStats().misses).toBe(2);
    });

    it("guarantees tenant isolation across cache keys", async () => {
      const tenantA = new CachedPolicyRepository(new FixturePolicyRepository(), { tenantId: "tenant-A" });
      const tenantB = new CachedPolicyRepository(new FixturePolicyRepository(), { tenantId: "tenant-B" });

      await tenantA.getDeploymentPolicies("production", "Microsoft.Web/sites");
      expect(tenantA.getStats().misses).toBe(1);

      // Tenant B queries same resource - must NOT hit Tenant A's cache
      await tenantB.getDeploymentPolicies("production", "Microsoft.Web/sites");
      expect(tenantB.getStats().misses).toBe(1);
      expect(tenantB.getStats().hits).toBe(0);
    });
  });

  describe("Phase 4: HTTP Transport Protocol Verification", () => {
    it("starts HTTP MCP server and successfully responds to JSON-RPC tools/list", async () => {
      const testPort = 8789;
      const httpServer = await runHttpServer(testPort);

      try {
        const postData = JSON.stringify({
          jsonrpc: "2.0",
          id: "req-1",
          method: "tools/list",
          params: {},
        });

        const responseText = await new Promise<string>((resolve, reject) => {
          const req = http.request(
            {
              hostname: "127.0.0.1",
              port: testPort,
              path: "/mcp",
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json, text/event-stream",
                "Content-Length": Buffer.byteLength(postData),
              },
            },
            (res) => {
              let body = "";
              res.on("data", (chunk) => (body += chunk));
              res.on("end", () => resolve(body));
            }
          );
          req.on("error", reject);
          req.write(postData);
          req.end();
        });

        expect(responseText).toContain('"jsonrpc":"2.0"');
        expect(responseText).toContain("get_investigation_context");
        expect(responseText).toContain("get_deployment_policy");

        const invalidCall = await fetch(`http://127.0.0.1:${testPort}/mcp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: "invalid", method: "tools/call", params: {
            name: "get_investigation_context", arguments: { service: "azure-functions-service", environment: "production", ruleIds: "POL-AZ-NET-001" },
          } }),
        });
        const invalidBody = await invalidCall.json() as any;
        expect(JSON.parse(invalidBody.result.content[0].text).error.code).toBe("INVALID_INPUT");

        const oversizedCall = await fetch(`http://127.0.0.1:${testPort}/mcp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "x".repeat(16385),
        });
        expect(oversizedCall.status).toBe(413);
      } finally {
        await new Promise((resolve) => httpServer.close(resolve));
      }
    });
  });
});
