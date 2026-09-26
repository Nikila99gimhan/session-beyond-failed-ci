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

  const ownerData: any = ownerRes.data || { ownerTeam: "Unknown", serviceTier: "Unknown", slackChannel: "Unknown" };
  const skuData: any = skuRes.data || {};
  const violations = policyResult?.violations || [
    {
      ruleId: "POL-AZ-NET-001",
      name: "Prohibit Public Ingress on Production Functions",
      severity: "High",
      actualValue: "Enabled",
      expectedValue: "Disabled",
      filePath: "infra/parameters/active.json",
      complianceStandard: "NIST-SP-800-53 / CIS-Azure-9.1",
    },
    {
      ruleId: "POL-AZ-SKU-003",
      name: "Approved Hosting Plan Tier Limit",
      severity: "Medium",
      actualValue: "EP3",
      expectedValue: "EP1",
      filePath: "infra/parameters/active.json",
      complianceStandard: "FinOps-Gov-2026",
    },
  ];

  const missingContexts: string[] = [];
  if (simulateMissingContext || skuRes.status === "ERROR") {
    missingContexts.push("Policy SKU catalog temporarily unreachable (`DEPENDENCY_UNAVAILABLE`). SKU approval boundaries evaluated using cached assumptions.");
  }

  const report = `
## 🔍 Investigation Summary
- **Triggering Workflow**: \`CI\` (Run #103)
- **Commit / Ref**: \`c3b4e12\`
- **Classification**: \`POLICY_REGRESSION\`
- **Owning Team**: ${ownerData.ownerTeam} (Channel: \`${ownerData.slackChannel}\`)
- **Service Tier**: ${ownerData.serviceTier}

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
- **Cost / Capacity Boundary**: Approved tier is \`${(skuData.approvedSkus || ["EP1"]).join(", ")}\`. Proposed \`EP3\` incurs high operational expense (~$580/mo vs baseline ~$145/mo).
- **Network Ingress Boundary**: Ingress must be restricted (\`Disabled\`). Direct public endpoints on production workloads violate security policy.
- **Change Window Status**: \`${(changeRes.data as any)?.status || "OPEN"}\` (${(changeRes.data as any)?.activeWindow || "Standard"})

## ⚖️ Root Cause & Alternatives
- **Primary Root Cause**: Parameter configuration in \`infra/parameters/active.json\` introduced noncompliant hosting plan tier (\`EP3\`) and public network ingress (\`Enabled\`).
- **Alternative Explanations Considered**: Configuration could be intended for an isolated non-production sandbox, but targetEnvironment is explicitly set to \`production\`.

## ❓ Missing Evidence & Unknowns
${missingContexts.length > 0 ? missingContexts.map(m => `- ${m}`).join("\n") : "- None. All 4 policy MCP tools returned verifiable, authoritative records."}

## 🛠️ Verification & Recommended Next Steps (Human Handoff)
1. **Option A (Compliant Resolution)**:
   - Restore \`appServicePlanSku\` to \`EP1\`
   - Set \`publicNetworkAccess\` to \`Disabled\`
   - Verify locally with: \`npm run validate:policy\`
2. **Option B (Governed Exception)**:
   - If \`EP3\` and public ingress are mandatory for this service, contact **${ownerData.ownerTeam}** in \`${ownerData.slackChannel}\` to initiate a formal architectural exception.
`;

  console.log("📝 Generated Agent Issue (Safe Output: create-issue):");
  console.log(report);

  fs.writeFileSync("investigation-report.md", report.trim(), "utf-8");
  console.log("Evidence-backed report saved to: investigation-report.md\n");
}

runSimulation().catch(console.error);
