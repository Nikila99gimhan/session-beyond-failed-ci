import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { generateInvestigationContext } from "../scripts/package-evidence.js";

describe("Phase 2: Bounded Evidence Bundle (package-evidence)", () => {
  const testOutputDir = path.resolve(process.cwd(), "test-artifacts");

  it("packages bounded investigation-context.json from noncompliant fixture with exact violations", () => {
    if (!fs.existsSync(testOutputDir)) {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }
    const samplePolicyResult = path.join(testOutputDir, "sample-policy-result.json");
    fs.writeFileSync(
      samplePolicyResult,
      JSON.stringify({
        policyVersion: "2026.1",
        violations: [
          {
            ruleId: "POL-AZ-NET-001",
            name: "Prohibit Public Ingress on Production Functions",
            severity: "High",
            field: "publicNetworkAccess",
            actualValue: "Enabled",
            expectedValue: "Disabled",
            complianceStandard: "NIST-SP-800-53",
            description: "Production Functions must not expose unrestricted public access.",
          },
          {
            ruleId: "POL-AZ-SKU-003",
            name: "Approved Hosting Plan Tier Limit",
            severity: "Medium",
            field: "appServicePlanSku",
            actualValue: "EP3",
            expectedValue: "EP1",
            complianceStandard: "FinOps-Gov-2026",
            description: "Production plans must use EP1.",
          },
        ],
      }),
      "utf-8"
    );

    const outputFile = path.join(testOutputDir, "investigation-context.json");

    // Mock environment variables
    process.env.GITHUB_RUN_ID = "36270836892";
    process.env.GITHUB_RUN_NUMBER = "13";
    process.env.GITHUB_RUN_ATTEMPT = "1";
    process.env.GITHUB_SHA = "45a44e54490c80fc9be39f29950cda4d20141f55";
    process.env.GITHUB_REPOSITORY = "Nikila99gimhan/session-beyond-failed-ci";

    const bundle = generateInvestigationContext(
      "infra/parameters/noncompliant.json",
      samplePolicyResult,
      outputFile
    );

    expect(bundle.schemaVersion).toBe("1.0.0");
    expect(bundle.runId).toBe(36270836892);
    expect(bundle.runNumber).toBe(13);
    expect(bundle.runAttempt).toBe(1);
    expect(bundle.headSha).toBe("45a44e54490c80fc9be39f29950cda4d20141f55");
    expect(bundle.repository).toBe("Nikila99gimhan/session-beyond-failed-ci");
    expect(bundle.status).toBe("POLICY_REGRESSION");
    expect(bundle.violationsCount).toBe(2);

    const ruleIds = bundle.violations.map((v) => v.ruleId);
    expect(ruleIds).toContain("POL-AZ-NET-001");
    expect(ruleIds).toContain("POL-AZ-SKU-003");

    // Verify file size ceiling (< 16KB)
    const stats = fs.statSync(outputFile);
    expect(stats.size).toBeLessThan(16384);
    expect(stats.size).toBeGreaterThan(500);

    // Clean up
    fs.rmSync(testOutputDir, { recursive: true, force: true });
  });

  it("handles clean compliant fixture with zero violations", () => {
    if (!fs.existsSync(testOutputDir)) {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }
    const outputFile = path.join(testOutputDir, "investigation-context-clean.json");

    const bundle = generateInvestigationContext(
      "infra/parameters/compliant.json",
      "non-existent-result.json",
      outputFile
    );

    expect(bundle.violationsCount).toBe(0);
    expect(bundle.status).toBe("PASS");
    expect(bundle.parameterValues["appServicePlanSku"]).toBe("EP1");
    expect(bundle.parameterValues["publicNetworkAccess"]).toBe("Disabled");

    fs.rmSync(testOutputDir, { recursive: true, force: true });
  });
});
