import * as fs from "node:fs";
import * as path from "node:path";
import {
  executeGetDeploymentPolicy,
  executeGetApprovedSkus,
  executeGetServiceOwnership,
  executeGetChangeWindow,
  createDefaultToolContext,
} from "../mcp-policy/src/policies.js";
import { FixturePolicyRepository } from "../mcp-policy/src/repository.js";

async function runSimulation() {
  const args = process.argv.slice(2);
  const scenario = args[0] || "regression";
  const simulateMissingContext = args.includes("--missing-mcp");

  console.log(`\n======================================================`);
  console.log(`🤖 GOVERNED INVESTIGATION AGENT SIMULATOR`);
  console.log(`Scenario: ${scenario.toUpperCase()} | Missing MCP: ${simulateMissingContext}`);
  console.log(`======================================================\n`);

  // Step 1: Simulate Trigger Evaluation
  if (scenario === "compliant") {
    console.log("Checking triggering run: CI (Workflow Run #101)");
    console.log("Status: COMPLETED | Conclusion: SUCCESS");
    console.log("✅ All checks passed. Investigator Agent remains idle (no issue generated).\n");
    return;
  }

  if (scenario === "unrelated") {
    console.log("Checking triggering run: CI (Workflow Run #102)");
    console.log("Status: COMPLETED | Conclusion: FAILURE");
    console.log("Failed Job: application-tests (Vitest assertion failure in tests/hello.test.ts)");
    console.log("Deployment Policy Job: SKIPPED\n");

    const report = `
## 🔍 Investigation Summary
- **Triggering Workflow**: \`CI\` (Run #102)
- **Commit**: \`a9f82d1\`
- **Classification**: \`CODE_OR_TEST_FAILURE\`
- **Owning Team**: \`Cloud Platform Engineering\` (#cloud-platform-security)

## 📋 Observed CI Evidence
- **Earliest Failed Job**: \`application-tests\`
- **Failure Detail**: \`AssertionError: expected 'Hello, World!' to match 'Welcome'\`
- **Policy Check Status**: Job was skipped due to upstream test failure.

## ⚖️ Root Cause & Alternatives
- **Primary Root Cause**: Application unit test regression in \`tests/hello.test.ts\`.
- **Policy Context**: No deployment policy violations detected or evaluated.

## 🛠️ Recommended Next Steps
1. Review recent code changes in \`src/functions/hello.ts\` and \`tests/hello.test.ts\`.
2. Fix test assertion or implementation and re-run CI.
`;
    console.log("📝 Generated Agent Issue:");
    console.log(report);
    fs.writeFileSync("investigation-report.md", report.trim(), "utf-8");
    console.log("Saved to: investigation-report.md\n");
    return;
  }

  // Scenario: Policy Regression
  console.log("Checking triggering run: CI (Workflow Run #103)");
  console.log("Status: COMPLETED | Conclusion: FAILURE");
  console.log("Failed Job: deployment-policy (Exit code: 1)");

  // Read policy-result.json if exists
  const policyResultPath = path.resolve(process.cwd(), "policy-result.json");
  let policyResult: any = null;
  if (fs.existsSync(policyResultPath)) {
    policyResult = JSON.parse(fs.readFileSync(policyResultPath, "utf-8"));
  }

  // Step 2: Query MCP Policy Tools
  console.log("\nConnecting to Read-Only Policy MCP Server...");
  const toolContext = createDefaultToolContext({
    repository: new FixturePolicyRepository({ simulateUnavailable: simulateMissingContext }),
  });

  const [netPolicyRes, skuRes, ownerRes, changeRes] = await Promise.all([
    executeGetDeploymentPolicy({ environment: "production", resourceType: "Microsoft.Web/sites" }, toolContext),
    executeGetApprovedSkus({ environment: "production" }, toolContext),
    executeGetServiceOwnership({ service: "azure-functions-service" }, toolContext),
    executeGetChangeWindow({ service: "azure-functions-service" }, toolContext),
  ]);

  console.log(`- MCP get_deployment_policy: ${netPolicyRes.status}`);
  console.log(`- MCP get_approved_skus:     ${skuRes.status}`);
  console.log(`- MCP get_service_ownership: ${ownerRes.status}`);
  console.log(`- MCP get_change_window:     ${changeRes.status}\n`);

  const ownerData: any = ownerRes.status === "SUCCESS" ? ownerRes.data : null;
  const skuData: any = skuRes.status === "SUCCESS" ? skuRes.data : null;
  const violations = policyResult?.status === "FAILED" && Array.isArray(policyResult.violations) ? policyResult.violations : [];

  const missingContexts: string[] = [];
  if (!policyResult || policyResult.status !== "FAILED") missingContexts.push("Policy result missing or not a failed result; violation details unverified.");
  if (skuRes.status !== "SUCCESS") missingContexts.push("SKU approval status unavailable from the policy registry; no exception inferred.");
  if (ownerRes.status !== "SUCCESS") missingContexts.push("Service ownership unavailable from the policy registry.");
  if (changeRes.status !== "SUCCESS") missingContexts.push("Change window unavailable from the policy registry.");

  const report = `
## 🔍 Investigation Summary
- **Triggering Workflow**: \`CI\` (Run #103)
- **Commit / Ref**: \`c3b4e12\`
- **Classification**: \`${violations.length ? "POLICY_REGRESSION" : "UNVERIFIED_FAILURE"}\`
- **Owning Team**: ${ownerData?.ownerTeam || "Unknown"} (Channel: \`${ownerData?.slackChannel || "Unknown"}\`)
- **Service Tier**: ${ownerData?.serviceTier || "Unknown"}

## 📋 Observed CI Evidence
- **Earliest Failed Job**: \`deployment-policy\`
- **Exit Code**: \`1\`
- **Violations Reported** (\`policy-result.json\`):
${violations.map((v: any) => `  - **Rule \`${v.ruleId}\`** (${v.severity}): ${v.name}
    - Proposed Value: \`${v.actualValue}\`
    - Policy Requirement: \`${v.expectedValue}\`
    - File Reference: \`${v.filePath}\`
    - Standard: ${v.complianceStandard}`).join("\n")}

## 🏢 Organizational Policy Context (MCP v2026.1)
- **SKU Approval Boundary**: ${skuData ? `Approved tier(s): \`${skuData.approvedSkus.join(", ")}\`.` : "Unverified: policy registry unavailable."}
- **Network Ingress Boundary**: ${netPolicyRes.status === "SUCCESS" ? "See returned policy rule for permitted ingress." : "Unverified: policy registry unavailable."}
- **Change Window Status**: \`${changeRes.status === "SUCCESS" ? (changeRes.data as any)?.status : "Unknown"}\`

## ⚖️ Root Cause & Alternatives
- **Primary Root Cause**: ${violations.length ? "The local deterministic policy result reports the parameter values listed above as violations." : "Unknown; no failed policy result was available."}
- **Alternative Explanations Considered**: A different environment or exception would need separate evidence; neither is established by this simulation.

## ❓ Missing Evidence & Unknowns
${missingContexts.length > 0 ? missingContexts.map(m => `- ${m}`).join("\n") : "- No missing policy context in this local simulation."}

## 🛠️ Verification & Recommended Next Steps (Human Handoff)
1. **Option A (Compliant Resolution)**:
   - Restore \`appServicePlanSku\` to \`EP1\`
   - Set \`publicNetworkAccess\` to \`Disabled\`
   - Verify locally with: \`npm run validate:policy\`
2. **Option B (Governed Exception)**:
   - If higher capacity or public ingress is required, consult **${ownerData?.ownerTeam || "the service owner (unverified)"}** through \`${ownerData?.slackChannel || "an independently verified channel"}\` about an exception.
`;

  console.log("📝 Local simulated handoff (no GitHub write):");
  console.log(report);

  fs.writeFileSync("investigation-report.md", report.trim(), "utf-8");
  console.log("Local simulation report saved to: investigation-report.md (not a live agent or writer test)\n");
}

runSimulation().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
