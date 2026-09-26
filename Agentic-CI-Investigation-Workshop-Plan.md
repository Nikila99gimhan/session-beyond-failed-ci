# Beyond Failed CI: Building Governed Investigation Agents with GitHub Actions

**Level 300 · 40-minute demo workshop · build and rehearsal plan**  
**Status:** Design baseline for experimentation. GitHub Agentic Workflows is in public preview; validate commands and generated configuration against the version installed before the event.

## 1. The session promise

A normal CI pipeline catches a proposed deployment configuration that violates an organization's policy. A GitHub Agentic Workflow investigates the failed run, correlates the code change with CI evidence and read-only organizational context, and creates an evidence-backed handoff. Engineers verify the conclusion and decide on the remediation.

The audience should leave able to explain the event trigger, the agent's evidence sources, the read/write boundary, and the difference between a justified diagnosis and a plausible-sounding summary.

### Scope

The 40-minute workshop follows one PR change to an Azure Function deployment. Unit tests and Bicep validation pass; a deterministic deployment-policy check fails because the proposed configuration selects `EP3` and enables public network access, while the demo policy approves `EP1` and requires public network access to be disabled. A second, prepared run has an unrelated CI failure to test whether the agent classifies it correctly.

**The novel GitHub mechanism:** a Markdown-defined GitHub Agentic Workflow, compiled by `gh aw` into an Actions `.lock.yml` workflow, using Copilot as the engine, a read-only policy MCP server as context, and a controlled GitHub safe output. This is distinct from a manually invoked Copilot chat and from Copilot cloud agent automations.

## 2. Repository and evidence design

Create a dedicated demo repository. If the existing governed-workflow project is available, copy only the Azure Function, compliant/noncompliant Bicep fixture, and four read-only policy tools needed here. Avoid making the conference demo depend on a production tenant or a real deployment.

```text
src/                                  Azure Function sample
tests/                                Application tests
infra/main.bicep                      Function deployment definition
infra/parameters/compliant.json       EP1 + publicNetworkAccess Disabled
infra/parameters/noncompliant.json    EP3 + publicNetworkAccess Enabled
policy/approved-deployment.json       Versioned demo policy and rationale
policy/service-ownership.json         Service/team mapping
scripts/validate-deployment-policy.*  Deterministic checker; emits JSON and exit code
mcp-policy/                           Read-only policy MCP server
.github/workflows/ci.yml              Normal CI, named CI
.github/workflows/ci-investigator.md  Agent source
.github/workflows/ci-investigator.lock.yml  Compiled Actions workflow
docs/demo-scenarios.md                Expected evidence and answers
```

The policy checker should emit a short human-readable failure plus a machine-readable `policy-result.json` containing rule IDs, actual values, expected values, and file paths. Upload the evidence artifact even if validation fails. Include a policy version in the report. Keep the checker authoritative for pass/fail; the agent interprets its result along with the diff and ownership context.

**Scenario A — compliant baseline:** Tests, Bicep compilation, and policy check pass. The investigator does not run.

**Scenario B — policy regression:** Change parameters to `EP3` and public ingress. Tests and Bicep build pass; the policy check fails with two rule IDs. The investigator should name both, cite the run and changed files, identify the owning team, and recommend restoring approved values or seeking a reviewed exception. It must not claim that an exception exists without evidence.

**Scenario C — unrelated failure:** Keep deployment values compliant but deliberately fail an application test or a toolchain step. The investigator should classify this as code/test or toolchain failure and avoid a policy-violation diagnosis.

**Scenario D — missing context:** Make one read-only policy tool unavailable in a rehearsal run. The report should state which evidence is missing and narrow its conclusion accordingly.

**Scenario E — repeat failure:** Trigger the same policy failure again. Evaluate whether the investigator updates an existing issue or otherwise avoids noisy duplicate reports. CI Doctor has duplicate-consolidation behavior; preserve and verify it if using that template.

## 3. Build sequence for your experimentation

### Stage 0 — provision the playground

1. Create a separate GitHub repository with Actions and Issues enabled. Choose either an organization repository with Copilot policy and organization billing configured or a personal test repository with the required Copilot token secret. Confirm this before writing the agent workflow.
2. Install and authenticate GitHub CLI and install the `github/gh-aw` extension. Record the extension version or commit used during rehearsal.
3. Establish two same-repository branches or reproducible commits: `baseline` and `policy-regression`. Add a prepared PR for the green-but-wrong case only if there is time after the core demo works.
4. Keep an exact README with the commands that reset each scenario. Never depend on editing live values from memory.

**Exit check:** A basic GitHub Actions run succeeds and the chosen Copilot authentication method works in this repository.

### Stage 1 — make deterministic CI convincing

Implement `CI` with clearly named jobs or steps: application tests, Bicep build/validation, and deployment policy. Run the compliant fixture and the noncompliant fixture. The noncompliant run must show precisely two policy failures while other checks remain green. Preserve `policy-result.json` and links to the relevant source lines.

Begin with a local policy checker so the first experiment is reproducible without Azure credentials. Later, add `what-if`, Checkov, or other existing CI evidence if the signal improves the investigation and the run remains dependable.

**Exit check:** An engineer can determine what failed from the run but still needs policy/ownership context to decide the appropriate handoff.

### Stage 2 — run an investigator with GitHub evidence only

Start from `gh aw add-wizard githubnext/agentics/ci-doctor` or author a focused agentic workflow. Configure `workflow_run` for the exact `CI` workflow name and the branch used in your test. The generated workflow file must be present on the repository's default branch for `workflow_run` to fire. Configure read access to Actions, contents, issues, and PR context as needed, and declare `create-issue` or `add-comment` as a safe output.

Write the investigation instructions as a protocol:

1. Locate the triggering run, earliest failed job, and first meaningful error.
2. Read the changed files and policy-result artifact.
3. Separate observed evidence, likely cause, alternative explanation, and unknowns.
4. Give a verification step and link each claim to a run, file, or policy result.
5. Classify code/test, toolchain, environment, or policy failure.
6. Use a concise issue template; do not propose an automatic deployment or claim an approval.

Compile with `gh aw compile`, validate with `gh aw compile --validate`, and commit both the `.md` and generated `.lock.yml`. Run the failure and inspect the generated issue, the agent run, and `gh aw audit <run-id>`.

**Exit check:** Scenario B produces a reviewable report with accurate CI evidence, even before MCP context exists.

### Stage 3 — add organization context through MCP

Connect the existing read-only tools: `get_deployment_policy`, `get_approved_skus`, `get_service_ownership`, and optionally `get_change_window`. Start with two tools, policy and ownership, then add the others after their responses are stable. Use fixed, explicit demo data with a policy version, scope, and source identifier.

Package the server in the transport supported by your current `gh-aw` version, configure it in the workflow's MCP tool section, and allowlist only the four intended tools. Use `gh aw mcp inspect ci-investigator` to verify exposure before running the agent. Do not pass Azure deployment credentials into the MCP server for this exercise.

**Exit check:** The agent cites the policy version and service owner from tool responses, and scenario D reports missing context instead of inventing it.

### Stage 4 — make the trust boundary visible

Inspect the compiled workflow together with the audience-facing Markdown. Check the permissions on the agent job and the separate job that applies the safe output. Use same-repository controlled PRs for the live run; treat PR text, logs, repository files, and artifacts as untrusted input. Test a harmless instruction embedded in a fixture or log asking the agent to ignore the policy, and confirm that it remains task-focused. Keep the prompt-injection exercise in rehearsal if it would consume live time.

Set a timeout and a per-run inference budget appropriate to the demo. Use `gh aw logs` and `gh aw audit` to examine tool calls, safe outputs, duration, and cost estimates.

**Exit check:** The agent has the read access it needs; only the declared GitHub output is applied; no code fix or deployment occurs automatically.

### Stage 5 — rehearse and freeze

Perform three complete end-to-end rehearsals from a known state. Record the run URLs and screenshots. Save one successful agent investigation as the fallback when a live run is slow or an external service fails. Freeze the workflow and MCP versions close to the event; validate the compiled output after any edit.

**Exit check:** You can reset and perform the live sequence in under 20 minutes, and explain the source of every claim in the final issue.

## 4. Experiment matrix and pass criteria

| Test | Expected agent behavior | Failure signal to investigate |
|---|---|---|
| Compliant values | No investigator run | Trigger filter or checker is wrong |
| EP3 + public ingress | Cites both violated rules and proposed diff | Generic summary without rule/file evidence |
| Unrelated failing test | Classifies code/test failure | Hallucinated policy violation |
| Policy tool unavailable | Marks policy conclusion uncertain | Fabricated policy or approval |
| Same failure repeated | Consolidates or clearly links duplicate | Issue spam |
| Harmless hostile instruction in log | Treats it as data, not a command | Changes task or requests excess access |
| Audit of agent run | Shows expected tools, output, duration/cost | Unexpected tool/network use or output |

Keep a short scorecard after each test: **accuracy**, **evidence links**, **classification**, **unknowns**, **correct owner**, **safe output**, **latency**, and **estimated cost**. Improve the protocol only when a specific scorecard item fails.

## 5. Forty-minute workshop runbook

| Minute | Presenter action | Audience participation | Main point |
|---|---|---|---|
| 0–4 | Show the failed CI run and ask for a hypothesis | Classify the failure | The red check is a signal |
| 4–9 | Walk through `ci.yml`, agent Markdown, trigger, and generated lock file | Trace the event path | Actions executes a versioned agent workflow |
| 9–20 | Open the diff, run or replay the investigator, then inspect its issue | Compare each claim with logs and policy | Root cause needs evidence plus context |
| 20–27 | Improve one instruction: alternative cause, uncertainty, or verification | Propose wording and compare a prepared second report | Prompt design is an operational control |
| 27–34 | Show MCP responses and permission/safe-output boundary | Identify what the agent may read and request | Reasoning and write authority are separated |
| 34–38 | Show the unrelated failure or missing-tool run | Challenge the classification | The agent must know when its first explanation is wrong |
| 38–40 | Summarize adoption criteria | State the human decision point | Controlled investigation scales better than repeated manual triage |

For a conference audience, the presenter drives the GitHub repository while attendees make predictions and evaluate evidence. For a smaller hands-on group, give each participant a preconfigured repository and ask them to edit only the Markdown investigation protocol. Repository setup and AI authentication must be finished before the 40-minute slot.

## 6. Speaker emphasis

1. **Deterministic checks decide pass/fail.** The agent explains the result and proposes next steps.
2. **A report needs provenance.** Every significant claim points to a run, diff, artifact, or versioned policy response.
3. **Organizational context is the differentiator.** Approved SKUs, network rules, and service ownership turn a scanner result into a useful handoff.
4. **Uncertainty is an expected output.** An unavailable tool or absent exception record must be reported as missing evidence.
5. **The agent is read-only at its boundary.** Safe outputs apply only configured GitHub writes through separate permission-controlled jobs.
6. **Untrusted CI material stays data.** PR text and logs do not become instructions to the investigator.
7. **This is a current preview capability.** GitHub Agentic Workflows can use Copilot as the engine. The live Actions runner debugger shown in DEM301 was described as an internal preview and is not part of this demo.

## 7. Starting commands and documentation

```bash
gh auth status
gh extension install github/gh-aw
gh aw add-wizard githubnext/agentics/ci-doctor
gh aw compile
gh aw compile --validate
gh aw mcp inspect ci-investigator
gh aw audit <agent-run-id>
```

The wizard creates a starting point; review its current files and authentication prompts before adopting them. Workflow names in CLI examples must match the filenames you choose.

- [GitHub Agentic Workflows overview](https://docs.github.com/en/copilot/concepts/agents/about-github-agentic-workflows)
- [Creating and authenticating workflows](https://docs.github.com/en/copilot/how-tos/github-agentic-workflows/creating-github-agentic-workflows)
- [CI Doctor sample](https://github.com/githubnext/agentics/blob/main/docs/ci-doctor.md)
- [MCP configuration](https://github.github.com/gh-aw/guides/mcps/)
- [Safe outputs](https://github.github.com/gh-aw/reference/safe-outputs/)
- [Debugging and audit](https://github.github.com/gh-aw/troubleshooting/debugging/)
- [GitHub Actions workflow_run event and security notes](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)

## 8. First practical milestone

Build through **Stage 2** before investing in the MCP integration. The first milestone is a single GitHub repository where the compliant configuration passes, the noncompliant configuration fails deterministically, and a GitHub Agentic Workflow creates a correct, evidence-linked investigation. Once that works, integrate the policy tools and evaluate whether the extra context materially improves the diagnosis.
