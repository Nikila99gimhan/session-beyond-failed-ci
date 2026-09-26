# Enterprise Architecture & Implementation Defense Guide
## Governed Agentic CI Investigation System

---

## 1. Executive Summary & Value Proposition

In modern cloud-native enterprises, Infrastructure-as-Code (IaC) and application deployments fail continuously across hundreds of distributed engineering teams. The industry's conventional response to CI/CD failure has been:
1. **Developer Log Archaeology**: Engineers dig through thousands of lines of raw runner console logs to identify the root failure.
2. **Organizational Friction**: Developers lack real-time visibility into internal FinOps approvals, security compliance frameworks (NIST, CIS), or service ownership matrices, resulting in ad-hoc Slack pinging.
3. **Unsafe Automation**: Naive AI integrations give Large Language Models (LLMs) direct write permissions, uncontrolled network egress, or automated commit capabilities, exposing enterprises to prompt injection, supply chain tampering, and regulatory failure.

This repository demonstrates the **Enterprise Gold Standard for Governed Investigation Agents**:
- **Deterministic CI Gatekeeping**: Traditional CI maintains absolute pass/fail authority. The AI never decides whether code passes or fails.
- **Zero-Trust Sandboxing**: The investigation agent runs inside an isolated, egress-firewalled container with dropped Linux capabilities and zero write permissions.
- **Context Grounding via MCP**: Authoritative enterprise policies and service ownership are queried on-demand via the Model Context Protocol (MCP), eliminating hallucinations.
- **Separation of Thought and Action (`Safe-Outputs`)**: The agent only emits structured, quarantined intent data. A separate, non-AI elevated runner performs the verified write action (creating an engineering handoff issue).

---

## 2. End-to-End System Execution Flow

The investigation lifecycle operates across two completely separate pipelines with strict cryptographic and capability isolation.

```
+-----------------------------------------------------------------------------------------+
| PIPELINE 1: DETERMINISTIC CI WORKFLOW (.github/workflows/ci.yml)                        |
+-----------------------------------------------------------------------------------------+
   |
   |-- 1. application-tests (Vitest unit tests)
   |-- 2. bicep-validation (az bicep build syntax & template compiler check)
   |-- 3. deployment-policy (scripts/validate-deployment-policy.ts against policy catalog)
   |        |
   |        +--> [VIOLATION DETECTED: EP3 SKU + Public Network Access Enabled]
   |        +--> Emits: policy-result.json (Machine-readable evidence)
   |        +--> Uploads: GitHub Actions Artifact (policy-result)
   |        +--> Status: CONCLUSION = FAILURE (Exit Code 1)
   |
   v (Triggers via GitHub workflow_run event on conclusion == 'failure')
+-----------------------------------------------------------------------------------------+
| PIPELINE 2: GOVERNED AGENTIC INVESTIGATION (.github/workflows/ci-investigator.lock.yml) |
+-----------------------------------------------------------------------------------------+
   |
   +--> STAGE 1: pre_activation
   |      Checks fork status, repository permissions, and initializes trace IDs.
   |
   +--> STAGE 2: activation
   |      Validates PAT/OIDC tokens, evaluates daily AI credit budget (AIC guardrail),
   |      verifies lockfile freshness, and compiles immutable system prompt.
   |
   +--> STAGE 3: agent (SANDBOXED ZERO-TRUST EXECUTION)
   |      * Initializes isolated network namespace: awf-net / awf-ext.
   |      * Boots Squid egress proxy + API proxy containers.
   |      * Enters hardened chroot jail, drops CAP_SYS_CHROOT & CAP_SYS_ADMIN, switches to UID 1001.
   |      * Starts GitHub Copilot CLI engine.
   |      * Discovers tools: GitHub MCP + Local Policy MCP (JSON-RPC).
   |      * Multi-turn autonomous investigation:
   |          1. Downloads policy-result.json artifact from triggering run.
   |          2. Reads Git commit diff on policy-regression branch.
   |          3. Calls MCP tool get_deployment_policy(POL-AZ-NET-001, POL-AZ-SKU-003).
   |          4. Calls MCP tool get_service_ownership(azure-functions-service).
   |          5. Synthesizes root cause, financial delta, and remediation options.
   |      * Writes intent payload to quarantined /tmp/gh-aw/safeoutputs/outputs.jsonl.
   |
   +--> STAGE 4: detection
   |      Executes Cross-Prompt Injection Attack (XPIA) analysis and exfiltration scanning
   |      on agent outputs and reasoning logs.
   |
   +--> STAGE 5: safe_outputs
   |      Independent non-AI runner boots with elevated permissions (issues: write).
   |      Parses validated JSONL and creates GitHub Issue for human engineering handoff.
   |
   +--> STAGE 6: conclusion
          Flushes OpenTelemetry (OTEL) distributed traces and archives audit logs.
```

---

## 3. Defense of Run Duration & Resource Spending (~8 Minutes)

During execution, enterprise stakeholders frequently ask:  
*"Why does an automated investigation take ~8 minutes instead of returning in 5 seconds like ChatGPT?"*

### 3.1 Step-by-Step Runtime Budget Breakdown

| Phase | Duration | Operational Mechanism | Why It Cannot Be Skipped in Enterprise |
|---|---|---|---|
| **Container & Network Orchestration** | ~60–90s | Pulls and initializes three dedicated security images: `gh-aw-firewall/agent`, `api-proxy`, and `squid`. Configures virtual bridge networks (`awf-net`, `awf-ext`). | Enforces strict network segmentation so the agent cannot scan the runner host or access internal networks. |
| **Hardened Jail & Sandbox Setup** | ~30s | Mounts `procfs`, binds host cgroups read-only, installs one-shot token injection libraries, drops Linux capabilities, and drops privileges to user `1001`. | Prevents container breakouts and malicious code execution during analysis. |
| **Harness Boot & Tool Discovery** | ~45s | Node.js v22 boots Copilot CLI harness, executes `awf-reflect` to discover model aliases, registers GitHub MCP server, and boots the `mcp-policy` server via stdio JSON-RPC. | Guarantees standard tool-calling protocol alignment without hardcoding credentials. |
| **Autonomous Multi-Turn Reasoning Loop** | ~3–4m | The LLM performs 4 to 6 autonomous turns: fetches run metadata, downloads artifacts, inspects git diffs, executes multiple MCP tool calls, and synthesizes a structured report. | Real investigation requires iterative evidence gathering. A single zero-shot prompt cannot correlate live CI artifacts with diffs and organizational databases. |
| **Security Scanning & Safe Output Delivery** | ~60s | Scans agent outputs for XPIA prompt injection, spins up an isolated runner with GitHub write permissions, parses output JSONL, and posts the issue via GitHub API. | Guarantees that untrusted data from CI logs cannot compromise GitHub credentials or inject malicious text into enterprise issue trackers. |
| **Telemetry & Audit Flush** | ~30s | Flushes OpenTelemetry traces, formats markdown summaries, and archives audit artifacts. | Required for SOC2, ISO 27001, and corporate compliance auditability. |

### 3.2 Human vs. Autonomous Agent: The ROI Equation

| Dimension | Human Engineering Triage | Governed Agentic Workflow |
|---|---|---|
| **Time to Triage** | 30 to 90 minutes (context switching, log scrolling, locating owners) | **~8 minutes** (fully autonomous, background execution) |
| **Availability** | Business hours only; delays blocker resolution across timezones | **24/7/365** immediate reaction on every CI failure |
| **Consistency** | Highly variable; depends on engineer's familiarity with FinOps/SecOps policies | **100% deterministic**; cites exact rule IDs, standard names, and owning teams |
| **Interrupt Cost** | High cognitive overhead; interrupts active feature development | **Zero human interrupt** until an actionable, structured handoff issue exists |
| **Cost per Run** | ~$50–$120 (based on senior cloud engineer hourly rates) | **~$0.15–$0.40** (Copilot inference + GitHub Actions runner compute) |

---

## 4. Repository Structure & Architectural Defense

The repository is modularized to reflect clean enterprise separation of concerns:

```
session-beyond-failed-ci/
├── src/functions/              # 1. APPLICATION WORKLOAD
│   └── hello.ts                # TypeScript Azure Function implementation
├── infra/                      # 2. INFRASTRUCTURE AS CODE
│   ├── main.bicep              # Root Azure deployment template
│   ├── modules/                # Modular Azure resources (Hosting, Storage, Network)
│   └── parameters/             # Environment configurations (compliant vs noncompliant)
├── policy/                     # 3. ENTERPRISE GOVERNANCE CATALOG
│   ├── approved-deployment.json # Versioned governance rules (NIST / FinOps standards)
│   └── service-ownership.json  # Enterprise CMDB & Service Catalog
├── contracts/                  # 4. DATA CONTRACTS & SCHEMAS
│   ├── policy-tool-response.schema.json
│   ├── evidence-manifest.schema.json
│   └── review-report.schema.json
├── mcp-policy/                 # 5. ENTERPRISE MODEL CONTEXT PROTOCOL SERVER
│   └── src/server.ts           # JSON-RPC server exposing read-only governance tools
├── scripts/                    # 6. GATEKEEPING & SIMULATION
│   ├── validate-deployment-policy.ts # Deterministic CI gatekeeper
│   └── simulate-investigator.ts      # Offline rehearsal simulator
├── tests/                      # 7. QUALITY ASSURANCE
│   ├── hello.test.ts           # Application tests
│   ├── policy-checker.test.ts  # Policy logic unit tests
│   └── mcp.test.ts             # MCP server interface tests
├── .github/workflows/          # 8. PIPELINE DEFINITIONS
│   ├── ci.yml                  # Deterministic CI pipeline
│   ├── ci-investigator.md      # Agent prompt & operational policy (Human readable)
│   └── ci-investigator.lock.yml# Hardened, compiled agentic workflow (Machine executed)
└── docs/                       # 9. RUNBOOKS & REHEARSAL SPECS
    └── demo-scenarios.md       # Scenarios A through E verification runbook
```

### Component Defense Matrix

| Directory / File | Why It Exists | What Happens If Removed |
|---|---|---|
| `contracts/*.schema.json` | Enforces strict JSON Schema validation on tool inputs/outputs and report structures. | Without contracts, changes to the MCP tool payload break agent parsing, leading to prompt hallucination or malformed issues. |
| `policy/*.json` | Decouples policy definitions from application and CI scripts. Simulates an enterprise policy registry. | Hardcoding rules into CI scripts creates an unmaintainable sprawl where policy updates require rewriting pipelines across repositories. |
| `mcp-policy/` | Implements an open standard (Model Context Protocol) to expose governance tools safely. | Without MCP, you must pass raw database credentials or static dumps to the LLM prompt, exposing data and blowing context window limits. |
| `scripts/validate-deployment-policy.ts` | The deterministic gatekeeper. It evaluates Bicep parameters and exits `0` (pass) or `1` (fail). | **Crucial**: AI must never be the gatekeeper. Removing this forces the AI to judge pass/fail, violating deterministic compliance standards. |
| `infra/parameters/*.json` | Provides isolated, reproducible fixtures (`compliant.json` vs `noncompliant.json`). | Enables repeatable automated testing and workshop rehearsal without live cloud tenant credentials. |
| `.github/workflows/ci-investigator.md` | The human-authored declarative specification of the agent's persona, boundary, and output targets. | Human engineers review and audit `.md` files; they cannot easily audit 1,800-line compiled workflow YAMLs. |
| `.github/workflows/ci-investigator.lock.yml` | The compiled workflow with pinned container hashes, security proxies, chroot jails, and OIDC tokens. | The compiled lockfile guarantees that the agent runs under strict, unbypassable security guardrails in GitHub Actions. |

---

## 5. Enterprise Objection Handling (The Battlecard)

### Q1: "Why can't Copilot just automatically fix the Bicep template and commit the fix to git?"
**The Architect's Defense:**  
In enterprise production workloads, **unilateral autonomous code modification violates change management policies (SOC2 / ISO 27001)**. 
- A policy violation is often intentional (e.g. an engineering lead intentionally requested an `EP3` SKU for peak Black Friday load). 
- An agent automatically downgrading the SKU to `EP1` would cause an outage under high traffic.
- The correct enterprise pattern is **evidence-backed human handoff**: the agent explains the options (Option A: restore compliant parameters, Option B: request FinOps exception), and an authorized human engineer signs off.

### Q2: "Why use MCP instead of pasting all policies into the system prompt?"
**The Architect's Defense:**  
1. **Context Window & Cost Efficiency**: Enterprise policy catalogs contain thousands of rules across dozens of regulatory frameworks. Stuffing full policy manuals into LLM system prompts balloons token consumption, drives up inference costs, and dilutes model attention.
2. **Dynamic Grounding**: MCP tools allow the agent to fetch *only the specific rule relevant to the observed violation* on demand.
3. **Enterprise CMDB Integration**: In production, the MCP server connects directly to live enterprise systems (ServiceNow, Backstage, Microsoft Purview) via secure service connections without exposing backend credentials to the LLM.

### Q3: "Why is the Safe-Outputs pattern used instead of giving the agent write permissions?"
**The Architect's Defense:**  
If the runner executing the LLM has `issues: write` or `contents: write`, an adversary could inject a prompt into a git commit message or CI log (Indirect Prompt Injection / XPIA) commanding the agent to overwrite code, close open security vulnerabilities, or delete repository branches.  
Under `Safe-Outputs`:
- The container running the agent has **read-only access**.
- It can only write structured JSON proposals to an isolated file.
- The execution runner inspects and validates the JSON schema before performing any write action using dedicated, least-privilege tokens.

### Q4: "Why do we need scripts/validate-deployment-policy.ts if the agent can analyze the Bicep file directly?"
**The Architect's Defense:**  
LLMs are probabilistic; compliance must be **deterministic**.  
- A CI gate must never pass or fail based on model temperature, token sampling, or prompt variation.
- The TypeScript checker provides a 100% deterministic, audit-proof exit code and emits a structured `policy-result.json`.
- The LLM's role is not calculation or gatekeeping—its role is **correlation, synthesis, and human handoff generation**.

---

## 6. Regulatory & Security Compliance Alignment

| Standard | Requirement | How This Architecture Satisfies It |
|---|---|---|
| **NIST SP 800-53 (AC-6)** | Least Privilege | Agent container drops root capabilities, runs as UID 1001, and possesses zero write permissions. |
| **NIST SP 800-53 (SC-7)** | Boundary Protection | Squid proxy and API proxy block arbitrary egress; agent cannot establish unauthorized network sockets. |
| **SOC 2 Type II (CC6.6)** | Logical Boundary Access & Change Control | No autonomous code modification occurs. All actions route through GitHub Issues for human verification. |
| **ISO/IEC 27001 (A.12.1.2)** | Change Management | Parameter adjustments are documented, correlated with policy rules, and tied to service ownership. |
| **FinOps Foundation Core** | Cloud Cost Governance | Detects unauthorized SKU tier escalation (`EP3` vs `EP1`) before provisioning occurs in Azure. |
