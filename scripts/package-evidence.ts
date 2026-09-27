import * as fs from "node:fs";
import * as path from "node:path";

export interface BoundedViolation {
  ruleId: string;
  name: string;
  severity: string;
  field: string;
  actualValue: unknown;
  expectedValue: unknown;
  complianceStandard: string;
  description: string;
}

export interface InvestigationContextBundle {
  schemaVersion: "1.0.0";
  generatedAt: string;
  runId: number;
  runNumber: number;
  runAttempt: number;
  headSha: string;
  repository: string;
  service: string;
  environment: string;
  accountScope: string;
  earliestFailedJob: string;
  policyVersion: string;
  status: "POLICY_REGRESSION" | "PASS" | "CODE_OR_TEST_FAILURE";
  violationsCount: number;
  violations: BoundedViolation[];
  affectedFiles: string[];
  parameterValues: Record<string, unknown>;
  evidenceDigest: string;
}

const MAX_BUNDLE_BYTES = 16384; // 16KB hard ceiling to prevent LLM context bloat

export function generateInvestigationContext(
  targetFile: string = "infra/parameters/active.json",
  policyResultFile: string = "policy-result.json",
  outputFile: string = "investigation-context.json"
): InvestigationContextBundle {
  const resolvedTarget = path.resolve(process.cwd(), targetFile);
  const resolvedPolicyResult = path.resolve(process.cwd(), policyResultFile);
  const resolvedOutput = path.resolve(process.cwd(), outputFile);

  let violations: BoundedViolation[] = [];
  let policyVersion = "2026.1";

  if (fs.existsSync(resolvedPolicyResult)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(resolvedPolicyResult, "utf-8"));
      policyVersion = parsed.policyVersion || "2026.1";
      if (Array.isArray(parsed.violations)) {
        violations = parsed.violations.map((v: any) => ({
          ruleId: String(v.ruleId),
          name: String(v.name),
          severity: String(v.severity),
          field: String(v.field),
          actualValue: v.actualValue,
          expectedValue: v.expectedValue,
          complianceStandard: String(v.complianceStandard || "NIST-SP-800-53"),
          description: String(v.description || ""),
        }));
      }
    } catch {
      // Fall through to empty violations
    }
  }

  let paramValues: Record<string, unknown> = {};
  if (fs.existsSync(resolvedTarget)) {
    try {
      const parsedParam = JSON.parse(fs.readFileSync(resolvedTarget, "utf-8"));
      const rawParams = parsedParam.parameters || {};
      for (const [k, v] of Object.entries(rawParams)) {
        paramValues[k] = (v as any)?.value;
      }
    } catch {
      // Fall through to empty parameters
    }
  }

  const runId = Number(process.env.GITHUB_RUN_ID || 0);
  const runNumber = Number(process.env.GITHUB_RUN_NUMBER || 0);
  const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT || 1);
  const headSha = process.env.GITHUB_SHA || "local-head-sha";
  const repository = process.env.GITHUB_REPOSITORY || "Nikila99gimhan/session-beyond-failed-ci";

  const bundle: InvestigationContextBundle = {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    runId,
    runNumber,
    runAttempt,
    headSha,
    repository,
    service: "azure-functions-service",
    environment: "production",
    accountScope: "production",
    earliestFailedJob: "deployment-policy",
    policyVersion,
    status: violations.length > 0 ? "POLICY_REGRESSION" : "PASS",
    violationsCount: violations.length,
    violations,
    affectedFiles: [targetFile],
    parameterValues: paramValues,
    evidenceDigest: "",
  };

  const serialized = JSON.stringify(bundle, null, 2);
  if (Buffer.byteLength(serialized, "utf-8") > MAX_BUNDLE_BYTES) {
    throw new Error(
      `Investigation context bundle size (${Buffer.byteLength(serialized, "utf-8")} bytes) exceeds maximum ceiling of ${MAX_BUNDLE_BYTES} bytes`
    );
  }

  fs.writeFileSync(resolvedOutput, serialized, "utf-8");
  console.log(`[EVIDENCE-BUNDLE] Bounded investigation context written to ${outputFile} (${Buffer.byteLength(serialized, "utf-8")} bytes)`);
  return bundle;
}

if (process.argv[1] && process.argv[1].endsWith("package-evidence.ts")) {
  const args = process.argv.slice(2);
  const target = args[0] || "infra/parameters/active.json";
  const policyResult = args[1] || "policy-result.json";
  const output = args[2] || "investigation-context.json";
  generateInvestigationContext(target, policyResult, output);
}
