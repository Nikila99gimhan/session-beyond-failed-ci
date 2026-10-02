import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";

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

  if (!fs.existsSync(resolvedPolicyResult)) {
    throw new Error(`Policy result is missing: ${policyResultFile}`);
  }
  if (!fs.existsSync(resolvedTarget)) {
    throw new Error(`Parameter file is missing: ${targetFile}`);
  }

  const policyBytes = fs.readFileSync(resolvedPolicyResult);
  const parameterBytes = fs.readFileSync(resolvedTarget);
  let resultStatus: "PASSED" | "FAILED";
  let policyVersion: string;
  let violations: BoundedViolation[];
  try {
    const parsed = JSON.parse(policyBytes.toString("utf-8"));
    if (parsed.status !== "PASSED" && parsed.status !== "FAILED") throw new Error("invalid status");
    if (!Array.isArray(parsed.violations) || parsed.violationsCount !== parsed.violations.length) throw new Error("invalid violation count");
    if (parsed.status !== (parsed.violations.length ? "FAILED" : "PASSED")) throw new Error("status disagrees with violations");
    if (path.resolve(process.cwd(), parsed.targetFile) !== resolvedTarget) throw new Error("target file mismatch");
    if (typeof parsed.policyVersion !== "string" || !parsed.policyVersion) throw new Error("missing policy version");
    resultStatus = parsed.status;
    policyVersion = parsed.policyVersion;
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
  } catch (error) {
    throw new Error(`Policy result is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }

  const paramValues: Record<string, unknown> = {};
  try {
    const parsedParam = JSON.parse(parameterBytes.toString("utf-8"));
    if (!parsedParam.parameters || typeof parsedParam.parameters !== "object") throw new Error("missing parameters");
    for (const [k, v] of Object.entries(parsedParam.parameters)) {
      paramValues[k] = (v as any)?.value;
    }
  } catch (error) {
    throw new Error(`Parameter file is invalid: ${error instanceof Error ? error.message : String(error)}`);
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
    status: resultStatus === "FAILED" ? "POLICY_REGRESSION" : "PASS",
    violationsCount: violations.length,
    violations,
    affectedFiles: [targetFile],
    parameterValues: paramValues,
    evidenceDigest: createHash("sha256").update(policyBytes).update(parameterBytes).digest("hex"),
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
