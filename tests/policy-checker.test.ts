import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Deterministic Policy Checker", () => {
  const resultPath = path.resolve(__dirname, "../test-policy-result.json");

  it("should pass validation with zero violations on compliant.json", () => {
    if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);

    const cmd = `npx tsx scripts/validate-deployment-policy.ts infra/parameters/compliant.json test-policy-result.json`;
    const output = execSync(cmd, { cwd: path.resolve(__dirname, ".."), encoding: "utf-8" });

    expect(output).toContain("[POLICY-CHECK:PASS]");
    expect(fs.existsSync(resultPath)).toBe(true);

    const result = JSON.parse(fs.readFileSync(resultPath, "utf-8"));
    expect(result.status).toBe("PASSED");
    expect(result.violationsCount).toBe(0);
    expect(result.violations).toHaveLength(0);
    expect(result.policyVersion).toBe("2026.1");

    if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);
  });

  it("should fail validation with exactly two violations on noncompliant.json", () => {
    if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);

    const cmd = `npx tsx scripts/validate-deployment-policy.ts infra/parameters/noncompliant.json test-policy-result.json`;
    let error: any = null;
    try {
      execSync(cmd, { cwd: path.resolve(__dirname, ".."), encoding: "utf-8" });
    } catch (err) {
      error = err;
    }

    expect(error).not.toBeNull();
    expect(error.status).toBe(1);
    expect(error.stderr || error.stdout).toContain("[POLICY-CHECK:FAIL]");
    expect(error.stderr || error.stdout).toContain("POL-AZ-NET-001");
    expect(error.stderr || error.stdout).toContain("POL-AZ-SKU-003");

    expect(fs.existsSync(resultPath)).toBe(true);
    const result = JSON.parse(fs.readFileSync(resultPath, "utf-8"));
    expect(result.status).toBe("FAILED");
    expect(result.violationsCount).toBe(2);

    const ruleIds = result.violations.map((v: any) => v.ruleId);
    expect(ruleIds).toContain("POL-AZ-NET-001");
    expect(ruleIds).toContain("POL-AZ-SKU-003");

    const netViolation = result.violations.find((v: any) => v.ruleId === "POL-AZ-NET-001");
    expect(netViolation.actualValue).toBe("Enabled");
    expect(netViolation.expectedValue).toBe("Disabled");

    const skuViolation = result.violations.find((v: any) => v.ruleId === "POL-AZ-SKU-003");
    expect(skuViolation.actualValue).toBe("EP3");
    expect(skuViolation.expectedValue).toContain("EP1");

    if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);
  });
});
