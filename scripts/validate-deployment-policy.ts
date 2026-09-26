import * as fs from "node:fs";
import * as path from "node:path";

interface PolicyRule {
  ruleId: string;
  name: string;
  resourceType: string;
  field: string;
  expectedValue: string;
  allowedValues?: string[];
  restrictedValues?: string[];
  severity: string;
  description: string;
  complianceStandard: string;
}

interface PolicyDefinition {
  policyVersion: string;
  lastUpdated: string;
  environment: string;
  rules: PolicyRule[];
}

interface PolicyViolation {
  ruleId: string;
  name: string;
  severity: string;
  field: string;
  actualValue: string | boolean | undefined;
  expectedValue: string | string[];
  filePath: string;
  description: string;
  complianceStandard: string;
}

interface PolicyResult {
  policyVersion: string;
  timestamp: string;
  status: "PASSED" | "FAILED";
  targetFile: string;
  evaluatedRulesCount: number;
  violationsCount: number;
  violations: PolicyViolation[];
}

function main() {
  const args = process.argv.slice(2);
  const targetFile = args[0] || "infra/parameters/active.json";
  const outputFile = args[1] || "policy-result.json";
  const policyFile = "policy/approved-deployment.json";

  const resolvedTarget = path.resolve(process.cwd(), targetFile);
  const resolvedPolicy = path.resolve(process.cwd(), policyFile);
  const resolvedOutput = path.resolve(process.cwd(), outputFile);

  if (!fs.existsSync(resolvedTarget)) {
    console.error(`[POLICY-CHECK:ERROR] Target parameter file not found: ${targetFile}`);
    process.exit(2);
  }

  if (!fs.existsSync(resolvedPolicy)) {
    console.error(`[POLICY-CHECK:ERROR] Policy file not found: ${policyFile}`);
    process.exit(2);
  }

  const policy: PolicyDefinition = JSON.parse(fs.readFileSync(resolvedPolicy, "utf-8"));
  const paramData = JSON.parse(fs.readFileSync(resolvedTarget, "utf-8"));
  const params = paramData.parameters || {};

  const violations: PolicyViolation[] = [];

  for (const rule of policy.rules) {
    const rawVal = params[rule.field]?.value;
    const actualVal = rawVal !== undefined ? String(rawVal) : undefined;

    if (rule.allowedValues && rule.allowedValues.length > 0) {
      if (!actualVal || !rule.allowedValues.includes(actualVal)) {
        violations.push({
          ruleId: rule.ruleId,
          name: rule.name,
          severity: rule.severity,
          field: rule.field,
          actualValue: rawVal,
          expectedValue: rule.allowedValues,
          filePath: targetFile,
          description: rule.description,
          complianceStandard: rule.complianceStandard,
        });
      }
    } else if (actualVal !== rule.expectedValue) {
      violations.push({
        ruleId: rule.ruleId,
        name: rule.name,
        severity: rule.severity,
        field: rule.field,
        actualValue: rawVal,
        expectedValue: rule.expectedValue,
        filePath: targetFile,
        description: rule.description,
        complianceStandard: rule.complianceStandard,
      });
    }
  }

  const result: PolicyResult = {
    policyVersion: policy.policyVersion,
    timestamp: new Date().toISOString(),
    status: violations.length === 0 ? "PASSED" : "FAILED",
    targetFile,
    evaluatedRulesCount: policy.rules.length,
    violationsCount: violations.length,
    violations,
  };

  fs.writeFileSync(resolvedOutput, JSON.stringify(result, null, 2), "utf-8");

  if (violations.length > 0) {
    console.error(`\n======================================================`);
    console.error(`[POLICY-CHECK:FAIL] Deployment policy validation failed!`);
    console.error(`Found ${violations.length} violation(s) against policy v${policy.policyVersion} in ${targetFile}:`);
    console.error(`======================================================\n`);

    for (const v of violations) {
      console.error(`  - Rule ID: ${v.ruleId} (${v.severity})`);
      console.error(`    Name:     ${v.name}`);
      console.error(`    Field:    ${v.field}`);
      console.error(`    Actual:   ${v.actualValue}`);
      console.error(`    Expected: ${Array.isArray(v.expectedValue) ? v.expectedValue.join(" | ") : v.expectedValue}`);
      console.error(`    Standard: ${v.complianceStandard}`);
      console.error(`    Details:  ${v.description}`);
      console.error(``);
    }

    console.error(`Evidence artifact written to: ${outputFile}\n`);
    process.exit(1);
  } else {
    console.log(`\n[POLICY-CHECK:PASS] All ${policy.rules.length} deployment policies satisfied for ${targetFile} (Policy v${policy.policyVersion}).`);
    console.log(`Evidence artifact written to: ${outputFile}\n`);
    process.exit(0);
  }
}

main();
