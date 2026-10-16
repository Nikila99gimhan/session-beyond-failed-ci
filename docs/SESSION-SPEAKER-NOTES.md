# When CI Fails — speaker notes and slide specification

**Session:** Governed investigation with GitHub Copilot, GitHub Agentic Workflows and MCP  
**Speaker:** Nikila Fernando  
**Duration:** 35 minutes, including four minutes of questions  
**Revision:** 16 October 2026  
**Delivery companions:** `SESSION-EVENT-FLOW.md` for preparation and evidence bookmarks; `SESSION-CUE-SHEET.md` for short onstage prompts.

## How to use this document

Each section contains exact proposed slide copy, spoken notes and technical backup. The spoken notes form the main presentation. The backup is for rehearsal and questions; do not read all of it aloud. Browser time is included in each section's allocation.

The revised scenarios require release verification. Until the event-flow evidence ledger contains inspected run IDs and findings, describe their live readiness as pending. Source code and a passing local test are different evidence from a delivered live investigation. The final deck must match the released behavior.

Local QA verified twelve isolated cases using Bicep 0.43.8. The removed-output fixture emitted BCP053 alongside independent `POL-AZ-NET-001`; separate repairs proved the causes independent. The shared-default fixture retained passing root compilation/policy while one of two compiled registered consumers failed its sample requirement. The unchanged comparison passed both consumers. The 139-test suite passed on the release and both mutant copies, and typecheck/build plus both strict workflow compilations passed. See `docs/session-evidence/local-verification.json`. Clean implementation PR #19 passed four CI jobs in run `38909060883`; it still needs the owner's merge before the two new live investigation paths can be rehearsed.

## Session thesis

> CI decides what passed. A selected investigation explains supported causes, relevant context and next steps. Controlled delivery makes that result reviewable.

The first example joins two independent failures. The second asks a question ordinary root CI did not evaluate. Both use the same evidence and delivery principles.

## Slide 1 — When CI Fails

**Time:** 00:00–00:40

### Slide copy

**When CI Fails**

Governed investigation
with GitHub Copilot and MCP

Nikila Fernando
Microsoft MVP for Azure and Developer Technology
Senior Platform Engineer - Sysco Labs

### Say

“A red CI check is familiar. The next few minutes are usually less structured: read several jobs, compare a diff, find the applicable rule, and decide what to change. Today I will show a small investigation workflow around those existing checks, then extend the question to a shared module change while ordinary CI is green.”

### Cue

Start directly. Explain the problem before listing products. Keep the supplied event template and restrained white MVP mark; the logo is speaker branding, not evidence of product endorsement.

## Slide 2 — After a failed check

**Time:** 00:40–03:00

### Slide copy

**After a failed check**

Failed jobs
Changed code
Evaluated inputs
Applicable context

What changed?
What should I fix?
How do I verify it?

Log fragments often enter another chat.

### Say

“The compiler may already tell us exactly which symbol is wrong. I am not going to hide a simple error and pretend it needs intelligence. Sometimes the right solution is simply a better error message.

“The work gets broader when one PR fails in two different ways, or when the question reaches beyond the configuration that CI evaluated. Someone still has to collect the right evidence, separate the causes and give a useful next step.

“Pasting logs into Copilot can help. Our question is whether we can make that investigation repeatable, scoped and connected to the PR, with the original checks retaining their authority. The output must be better than a confident paragraph: it needs evidence, repairs and explicit limits.”

### Technical backup

Do not assert a measured number of daily failed pipelines or saved engineering hours. This repository establishes a mechanism, not organization-wide return on investment. Compare the agent with a good deterministic report and the team's existing troubleshooting practice.

## Slide 3 — The two demo scenarios

**Time:** 03:00–03:40

### Slide copy

**The two demo scenarios**

| Scenario | Observed result | Investigation question |
| --- | --- | --- |
| Compiler + policy | Tests pass, two checks fail | Which repairs address both causes? |
| Shared default | Root CI passes | Which registered callers inherit the change? |

One repository. No Azure deployment.

### Say

“First we will take a normal compiler error plus a separate policy violation. Then we will change a shared default that our root deployment overrides. The second example shows why green CI answers only the questions we encoded and the inputs we evaluated.

“I will use prepared completed runs, so we spend our time understanding the result rather than waiting for an inference queue.”

## Slide 4 — CI and investigation

**Time:** 03:40–04:40

### Slide copy

**CI and investigation**

Pull request
Deterministic CI
Selection
Investigation
MCP context
Controlled handoff

CI owns pass/fail. The agent proposes an explanation.

### Say

“The normal PR workflow performs deterministic checks. A selected follow-up reads the evidence and relevant context. The agent proposes a handoff. A separate output path validates and publishes permitted changes.

“This architecture separates the decision that a check failed from the explanation of the failure. The agent cannot grant a policy exception or turn a failed required check green. Later, the green-CI example will use a separate selected assessment; it will state that baseline CI passed.”

### Technical backup

The source CI job evaluates candidate code in an unprivileged PR context. Follow-up automation runs trusted code from its workflow revision and treats candidate logs and artifacts as untrusted data. Review effective token scopes as well as YAML permissions; a separate broad PAT would not be restricted by the job's permission block.

## Slide 5 — Workflow source and execution

**Time:** 04:40–06:00

### Slide copy

**Workflow source and execution**

| Artifact | Responsibility |
| --- | --- |
| ci.yml | Checks and evidence |
| Investigator .md | Task, tools and limits |
| Generated .lock.yml | Executable Actions workflow |
| Run logs and artifacts | Observed execution |

gh aw compile
Pinned compiler v0.89.21

### Say

[Show normal CI, then investigator Markdown, then the generated lock file.]

“GitHub Agentic Workflows lets us author the agent task in Markdown with configuration above it. Here are its instructions, allowed tools, output limits and activation conditions. The compiler generates the Actions YAML that GitHub runs.

“The lock file is executable workflow configuration. It is not a transcript and does not prove what the agent did. We use the actual run logs, artifacts and delivered output for that.”

### Technical backup

Use `gh aw compile ci-investigator --strict` and `gh aw compile shared-module-investigator --strict` with the repository's pinned compiler. Do not upgrade the toolchain during the event. Workflow source and compiled output must move together in the release. The familiar `pre_activation`, `activation`, `agent`, `detection`, `safe_outputs` and `conclusion` stages can be shown briefly; their existence alone does not establish correctness.

## Slide 6 — Compiler and policy failures

**Time:** 06:00–07:30

### Slide copy

**Compiler and policy failures**

Local verified scenario

Module export renamed
outboundSubnetId becomes functionSubnetId

Caller still references
network!.outputs.outboundSubnetId

Separate production input
publicNetworkAccess: Enabled

Real Bicep compilation. No Azure deployment.

### Say

[Open the prepared feature PR's two changed files.]

“A developer refactors this network module's exported output from `outboundSubnetId` to `functionSubnetId`. The caller still references the old output. In a separate edit, production public network access is enabled.

“The first defect breaks the Bicep module contract. The second conflicts with this sample organization's production rule. They are independently observable. Fixing one does not fix the other.

“This is a real compiler invocation, with no deployment. We will read its actual diagnostic rather than manufacture an obscure exception.”

### Technical backup

Start from compliant clean source, not a branch with an older subnet defect. Keep `infra/main.bicep` unchanged for the broken-caller scenario. Bicep 0.43.8 emitted BCP053 for the verified removed-output fixture. The report should cite the actual source diagnostic. The public-access rule is `POL-AZ-NET-001`, not a universal claim that every public Azure endpoint is prohibited.

## Slide 7 — Independent CI results

**Time:** 07:30–10:00

### Slide copy

**Independent CI results**

| Check | Result | Evidence |
| --- | --- | --- |
| Application unit tests | PASS | 139 tests pass on the fixture |
| Bicep compilation | FAIL | BCP053: missing module output |
| Deployment policy | FAIL | POL-AZ-NET-001: public access enabled |

Failed compilation skips the offline network preflight.

### Say

[Open source CI, point to all three checks, then the exact failing compiler step.]

“The application unit tests pass. They do not compile every infrastructure module and do not establish that a deployed service works. The Bicep compiler fails at this caller. The independent policy job still runs, so we retain its finding even when compilation fails.

“Notice the distinction inside the Bicep job. The compilation failed. The later offline network preflight cannot validate a compiled template that was never produced. That skipped step is not a successful deployment check.

“Now open the follow-up investigation. This is asynchronous, so it is a separate check on the source PR head. It starts after eligible CI has finished; it was never one of the initial deterministic jobs.”

### Technical backup

The configured CI trigger is PR opened/synchronize/reopened targeting `main`. A branch push without a PR does not run this CI. The investigator's workflow-run record can have an automation head distinct from the candidate head; use the source identity in its verified context. A PR CI run may test a generated merge SHA, so report both source head and tested SHA.

## Slide 8 — Findings and repairs

**Time:** 10:00–14:00

### Slide copy

**Findings and repairs**

| Finding | Code repair | Verification |
| --- | --- | --- |
| Output contract | Restore the export or update callers consistently | Bicep build |
| Production ingress | Restore publicNetworkAccess to Disabled | Policy check |

The report leads with repairs.
Delivery success leaves the required CI checks failed.

### Say

[Open the report's findings, then the same PR's managed issue-link comment.]

“The first row should lead with the source correction. We can restore the exported name, or deliberately update the caller and any other affected callers. We then compile again.

“The second row should lead with restoring public access to `Disabled`, followed by rerunning the policy check. If the organization intends a different requirement, that needs its normal approval process. A generated report cannot approve it.

“Ownership context is useful when escalation is necessary. It should not replace an obvious code repair with ‘ask the platform team.’ The developer needs to understand the change and the verification.

“Here is the linked issue, and here is the managed comment back on the source PR. A successful investigation check means the report was delivered through its permitted path. The two required checks are still failed, so delivery does not allow this broken PR to merge.

“We should also inspect what the report claims. Are both causes supported? Are the exact files and values correct? Did it distinguish a skipped step from a passed check? Those are acceptance criteria, not just presentation polish.”

### Technical backup

Local repair verification uses `npm test`, `az bicep build --file infra/main.bicep --outfile compiled-template.json`, then `npm run validate:policy`. Once compilation succeeds, run the workflow's offline preflight as well. A negative test can repair one dimension at a time to prove independence. The incident identity should include both the compiler cause and the policy rule; grouping by policy rule alone can collapse different mixed failures.

## Slide 9 — Evidence identity

**Time:** 14:00–15:40

### Slide copy

**Evidence identity**

Repository and source CI
Run ID and attempt
PR head and tested merge revision
Exact inputs and artifact digests

Assessments also bind baseline and candidate modules.
Missing or stale evidence stays explicit.

### Say

[Show one bounded evidence record, with source identities visible.]

“An old investigation must not describe a newer commit as broken. We bind the answer to the repository, source run, attempt and source head. Where CI tested a merge revision, we retain that identity too.

“Digests tell us whether the inputs match the recorded bytes. We also need the trusted source-run relationship. Hashing an arbitrary file does not make it authoritative.

“Candidate artifacts can contain instructions written by an attacker. We read them as evidence, not as authority. Privileged automation executes its trusted revision, not scripts downloaded from the PR.”

### Technical backup

Digest checks and schema validation are necessary consistency controls but do not prove a causal explanation. Bound downloads, schemas and parsers; fail closed or label missing evidence. A fallback to source logs must retain provenance and explicitly limit the claim. The PR publisher rechecks the latest source head to avoid writing a stale result over a newer one.

## Slide 10 — MCP context

**Time:** 15:40–17:20

### Slide copy

**MCP context**

get_investigation_context

service: azure-functions-service
environment: production
ruleIds: [POL-AZ-NET-001]
policyVersion: 2026.2

Applicable requirement
Ownership and freshness
Versioned evidence

Local sample catalog. Missing context remains uncertainty.

### Say

[Show the relevant request and response from the prepared run.]

“The model should not invent our production requirement or the team responsible for it. This tool returns selected facts from a versioned catalog. Here is the applicable rule and version; here is the ownership information and freshness metadata.

“For reproducibility, this demo packages sample policy data in the repository. In an organization, approved policy ownership and distribution may be separate. MCP describes the tool interface; the underlying service still has to authenticate callers, enforce access and provide authoritative data.

“If the tool is unavailable, the observed compiler or policy failure does not disappear. The report must say that the additional context is unverified.”

### Technical backup

The consolidated policy tool reduces predictable round trips. In-process caching can reuse reads during its real lifetime; fresh runners do not share a permanent warm cache. A supplied scope allowlist is not caller-bound authorization. The shared-consumer finding uses compiled evidence directly; optional `get_service_ownership` provides only the root service's owner. Sample consumer owners remain unknown unless their evidence supports them. The shared review does not fetch unrelated deployment rules and needs no new MCP server or tool. For a tiny static catalog a direct function or API could be simpler; MCP is useful when an explicit tool contract is part of the integration.

## Slide 11 — Controlled delivery

**Time:** 17:20–19:00

### Slide copy

**Controlled delivery**

Read-only agent
Proposed output
Detection and validation
Permitted writer
Issue and PR link

Trusted automation verifies the source and current PR head.
CI Investigation success confirms report delivery.

### Say

“The agent proposes output. Detection and deterministic validation examine that proposal before the limited writer applies it. The separate PR publisher verifies the delivered issue and source relationship before adding the PR link.

“This is a useful separation of capabilities, not a proof that every sentence is true. We still review the facts and proposed repairs. A successful detector does not certify that the whole causal explanation is correct.

“Repeated events also need care. We want an existing occurrence to be recognized rather than producing a new ticket every time. Describe the actual tested replay behavior; do not infer atomic organization-wide uniqueness from a prompt saying ‘do not duplicate.’”

### Technical backup

Agent read permissions, writer permissions and actual credential scopes must agree. Safe-output title/label filtering controls destinations; it is not atomic event idempotency. Read-only access still has confidentiality implications. The delivery check is an operational report signal and is distinct from required enforcement checks.

## Slide 12 — A shared default change

**Time:** 19:00–21:00

### Slide copy

**A shared default change**

Local verified scenario

Shared module default
param zoneRedundant bool = true
Candidate default: false

Root caller supplies zoneRedundant explicitly.
Active value stays true.

Root compilation and policy checks pass.
Which registered callers inherit the new default?

### Say

[Show the single default change and the root's explicit parameter. Then show green baseline CI.]

“The module still compiles. Our root deployment explicitly passes `true`, so it does not inherit the new default. Its evaluated policy inputs remain compliant. All normal CI jobs pass.

“That is a valid result for the checks and inputs evaluated. It does not answer a different question: what happens to a registered caller that omits this parameter?

“A failure-only investigator would never start here. We add a selected assessment for this known sensitive module path. Selection is deterministic and happens before the model runs.”

### Technical backup

Do not deliberately throw an exception to simulate impact. The `Registered Consumer Assessment` job compiles baseline and candidate consumer wrappers and resolves their effective values. A script exit `1` records a confirmed requirement finding and is normalized to a successful CI job; an assessment error `2` is not. This preserves the meaning of the original three required checks while adding informational review evidence. Healthy baseline CI is a required fact in this scenario; the review's report must not reuse wording that says baseline CI failed. Only the explicitly allowed assessment mode may accept that successful baseline.

## Slide 13 — Registered consumers

**Time:** 21:00–24:00

### Slide copy

**Registered consumers**

| Registered sample | Input | Baseline | Candidate |
| --- | --- | --- | --- |
| Consumer A | Explicit true | true | true |
| Consumer B | Omitted | true | false |

SAMPLE-ZONE-001 requires zone redundancy.
One of two registered samples violates the requirement.
Compiled configuration only. No live deployment claim.

### Say

[Open the recorded sample registry and compiled comparison.]

“Consumer A explicitly supplies `true`, so the default change does not affect its evaluated configuration. Consumer B omits the input. Its effective value moves from `true` to `false`, which conflicts with the recorded sample requirement.

“This is why reading only the changed default is insufficient. An override changes the result. The baseline and candidate compilation, caller inputs and requirement make the claim reviewable.

“The supported repair is to preserve the default, or deliberately review a module contract change and migrate the relevant consumers. We cannot conclude that a running production service has already changed. These are compiled candidate configurations for two registered samples.”

### Technical backup

For each consumer, evidence retains its declared reference, baseline/candidate module digests, explicit inputs, effective values and scope. The supported module change is only the literal `zoneRedundant` default edit; other module bytes must match. Unsupported expressions or changes are unknown/error rather than invented effective values. `SAMPLE-ZONE-001` belongs to the sample registry, not the policy MCP catalog. In a real multi-repository case, distinguish a declared module version from the version actually resolved by a build and the one deployed. A consumer pinned to an older release differs from one adopting a candidate; neither is automatically affected merely because it appears in an inventory.

## Slide 14 — Selection before inference

**Time:** 24:00–26:00

### Slide copy

**Selection before inference**

Sensitive module change
Trusted evidence check
Verified consumer finding
Selected investigation

No finding: no model
Exact replay: recover the existing report without AI
Invalid selected evidence: visible manual review

Shared Module Review is informational. Success means delivery.

### Say

[Show the sensitive-path route and the completed selected review.]

“The selector knows which path deserves this extra question. The deterministic assessment establishes the mismatch. The investigator can explain the source change, affected sample, requirement and repair; it should not invent more impact.

“The `Shared Module Review` check succeeds when the verified report is delivered. It is informational, not a required merge gate, and its text says baseline CI passed with a consumer configuration needing attention. The original three checks remain green. A report link is useful, but it does not silently turn the assessment into a deployment authorization or rewrite the original CI outcome.

“To extend this across an organization, add authorized evidence sources: known consumers, resolved versions, inputs and relevant deployment observations. The additional knowledge comes from those sources, not from asking the same model to think harder.”

### Technical backup

The selected assessment is a new explicit activation path, not a weakening of the failed-CI guard. `.github/workflows/shared-module-investigator.md` runs after successful source CI. Its trusted `select_review` job calls `scripts/select-shared-module-review.cjs`, validates the source, registered evidence and supported finding, and gates model execution. It skips no-change, no-finding, stale and replay cases before the agent. Exact replay uses `recover_delivery` to restore the managed PR feedback from the existing verified issue without model inference. Selected evidence rejection invokes `review_status`, publishing **Consumer evidence requires manual review** without starting AI or inventing a violation. Source binding and current-head checks apply in both modes. The boundary between informational review and a required gate is a repository policy choice; this release does not add the shared review to branch protection.

## Slide 15 — Investigation cost

**Time:** 26:00–28:00

### Slide copy

**Investigation cost**

Shared review routes before inference
Known facts without a model
Bounded evidence and relevant context
Shared review recovers replays without AI

Failure investigations still start on eligible failures.
Measure accepted handoff time and total cost.
Agent budget: 120 AIC
Detection has a separate budget.

### Say

“The cheapest useful investigation may be a deterministic explanation. A known rule with a known remedy often does not need a model. Here, deterministic code performs the checks and consumer comparison; the model's proposed value is the contextual handoff.

“The shared-module path selects its question before inference. It skips no-change, passed, stale and already-recorded cases, and it can recover an existing delivery without AI. The failed-CI workflow still starts the agent for eligible failures; its prompt can avoid duplicate output but cannot guarantee no inference cost. Keep the input bounded and request relevant context.

“Measure the result from source completion to a useful accepted handoff, including queueing, model work, detection and delivery. Record agent and detection credits separately. The agent's 120-credit setting is not a total-workflow budget. I am not claiming a cost saving or percentage improvement without a measured comparison.”

### Technical backup

Do not confuse MCP gateway call counts with all GitHub CLI/API requests. Cache-read tokens, fresh-runner startup, workflow compute and model credits are different quantities. A ten-minute timeout limits execution duration; it does not guarantee the end-to-end delivery SLA. A kill switch prevents new activation; running work needs separate cancellation.

## Slide 16 — Adoption scope

**Time:** 28:00–30:00

### Slide copy

**Adoption scope**

| Demonstrated | Broader adoption needs |
| --- | --- |
| One repository | Authorized consumer inventory |
| Local sample policy | Approved policy ownership and distribution |
| Two consumers | Resolved versions and effective inputs |
| No deployment | Relevant deployment or state evidence |

Supported assessment: literal zoneRedundant default change.

### Say

“A team can start with one useful question and one controlled handoff. Make deterministic reporting good first. Add the investigator where contextual interpretation is still useful, and evaluate whether engineers actually accept its explanation.

“This example is deliberately bounded: one repository, local sample policy, two registered consumers and no cloud deployment. It does not establish multi-tenant authorization, full fleet discovery or complete live cloud posture.

“A larger adoption needs authorized collectors, trustworthy version and deployment evidence, destination controls and operational ownership. Those are specific engineering additions. We do not need a new execution platform to explain or demonstrate this pattern.”

### Technical backup

No Azure Container Apps sandbox, Python subsystem, Terraform deployment or new fleet platform is part of this session. A later Terraform adapter could expose scoped plan/state evidence with appropriate secret handling; Bicep needs its own compiled/deployment evidence. Do not present a state file as a universal solution for infrastructure dependencies.

## Slide 17 — Questions

**Time:** 30:00–31:00; Q&A 31:00–35:00

### Slide copy

**Questions**

CI keeps deterministic checks.
Selected questions get bounded evidence.
Engineers receive a reviewable handoff.

Nikila Fernando

### Say

“We followed a red PR with two independent causes into a handoff with two concrete repairs. Then we asked an extra question about a shared default while ordinary root CI stayed green.

“The pattern is the same: keep the gate deterministic, select the evidence needed for the question, and deliver a result an engineer can verify. That gives us a useful starting point without claiming that an agent understands the whole organization.

“Thank you. We have four minutes for questions.”

## Technical Q&A — preparation, not extra slides

### Component map for a code walkthrough

| File or artifact | Explain this responsibility |
| --- | --- |
| `.github/workflows/ci.yml` | PR-only deterministic checks and unprivileged candidate assessment. The original three required check names retain their meanings. |
| `.github/workflows/ci-investigator.md` / `.lock.yml` | Failed-CI task source and generated execution. The failure-only guard is retained. |
| `.github/workflows/shared-module-investigator.md` / `.lock.yml` | Explicit successful-CI assessment path, with trusted deterministic selection before the agent. |
| `scripts/validate-deployment-policy.ts` | Checks selected active parameter values against the sample deployment policy; emits findings and a failing exit code on violations. |
| `scripts/package-evidence.ts` | Packages bounded policy evidence and input binding. It does not turn the model into the enforcement gate. |
| `scripts/validate-network-preflight.ts` | Offline compiled-template subnet contract check. It is distinct from Bicep compilation and Azure deployment. |
| `scripts/assess-shared-module.ts` | Compiles registered wrappers against baseline/candidate modules; resolves the supported effective boolean and records a requirement comparison. |
| `fixtures/shared-module-consumers/registry.json` | Versioned sample inventory and requirement, with fixed wrapper identities. This is not an automatically discovered enterprise inventory. |
| `fixtures/shared-module-consumers/{explicit-zone,inherited-zone}.bicep` | Two actual callers demonstrating an explicit override and an omitted input. |
| `shared-module-assessment.json` / `consumer-templates/` | The comparison report and baseline/candidate compiled artifacts in `shared-module-evidence`. |
| `scripts/select-shared-module-review.cjs` | Trusted verification of source identity, supported change, registry, templates and finding; decides whether inference is warranted. |
| `mcp-policy/src/server.ts` | Read-only tool transport backed by the local sample resolver. |
| `mcp-policy/src/{types,policies,repository}.ts` | Input/data contracts, applicable context resolution and repository/cache behavior. |
| `scripts/publish-investigation-feedback.cjs` | Explicit failure/shared-module modes, verified issue relationship, current-head checks, managed PR comment and delivery check. |
| `tests/shared-module-assessment.test.ts` | Focused evaluator and evidence consistency checks. Actual compilation evidence is a separate QA result. |
| `tests/shared-module-selection.test.ts` | Trusted selection and rejection cases before model use. |
| `tests/pr-feedback.test.ts` | Delivery identity, stale-head behavior, allowed destinations and mode-specific wording. |

### Runtime modes and truthful wording

| State | Inference | Report meaning |
| --- | --- | --- |
| Eligible failed same-repository PR CI | Failure investigation may run | “CI failed; here are supported causes, repairs and limits.” |
| Successful PR CI; no selected module or finding | Skip agent | “No selected investigation needed.” This does not assert universal safety. |
| Successful PR CI; verified registered-consumer finding | Shared review may run | “Baseline CI passed; this evaluated consumer configuration needs attention.” |
| Stale source or exact reviewed occurrence | Skip new shared model work | Retain the historical result for its original identity. |
| Unsupported or incomplete consumer evidence | Error/unknown; no invented effective value | Investigate the assessment failure through the failure path where eligible; do not approve the module. |

The initial checks and the follow-up checks can appear at different times because `workflow_run` starts after source CI. Opening a branch is not the scan trigger. A PR opened or updated against `main` is the normal source event.

### Why use an agent when Bicep already explains the compiler error?

For a self-contained diagnostic, the compiler or a deterministic enrichment can be sufficient. The demonstrated question crosses independent jobs, source changes, policy context and a reviewable delivery path. Evaluate whether the combined handoff reduces the engineer's work. The agent is not required merely because CI failed.

### Why do application tests pass if the infrastructure is broken?

The demonstrated test suite includes application unit tests and focused validator tests. It does not compile this actual module/caller contract as an application test. CI adds an actual Bicep compilation check. This is an example of different checks covering different boundaries; it is not proof of a full integration suite.

### Can we run the compiler locally?

Yes, and developers should. A failure that could have been caught locally is still a plausible CI failure. The session's point is the investigation after a failed check and its independent policy finding, not that the compiler requires a hosted runner. Avoid portraying a preventable local omission as an AI capability.

### Why not just Bash, OPA, Checkov or a better policy message?

Use deterministic tools to enforce encoded requirements and produce known facts. The shared-consumer comparison is deterministic too. A model is justified only when an unresolved contextual interpretation or handoff benefits from it. Compare with that stronger baseline, not a deliberately poor report.

### Where do the organization policies live?

This lab packages a versioned local sample catalog for reproducibility. A real organization may own and publish policy separately, with approved distribution and a source version applicable to each run. Repository location does not make a policy universally authoritative. EP1 approval or public-ingress restrictions are sample organization choices.

### What does MCP add?

A discoverable typed tool interface for selected context. The resolver still decides which records are authoritative and permitted. MCP does not grant access to other repositories or subscriptions, authenticate a tenant by itself, or make all returned content trustworthy. A simple API or function may be enough for a smaller case.

### What happens if MCP is unavailable or stale?

Keep the observed deterministic finding. Mark context as unavailable or unverified, retain the applicable evidence snapshot and avoid inventing owners, exceptions or approval. A later policy version should be described separately from the original evaluation. Retrying without new evidence does not establish truth.

### What keeps instructions inside a log from controlling the agent?

Treat source text, logs, artifacts and tool results as untrusted evidence. The trusted workflow defines tools, instructions and limits; separate output validation and destination checks constrain delivery. The permissions and data exposure still need explicit testing. A passing detector alone is not proof against every prompt-injection attack.

### Why not run the PR's analysis scripts in the privileged follow-up?

A PR author can change those scripts and dependencies. A privileged follow-up therefore executes trusted automation from the workflow revision, parses the candidate evidence and uses unprivileged compilation/assessment for candidate code. Never run downloaded candidate scripts with the investigator's secrets simply because they arrived as artifacts.

### Does a successful investigation check permit merging?

The delivery check reports the investigation's outcome. Required deterministic CI checks and repository settings decide merge eligibility. In Demo 1 the failed required checks remain failed. Demo 2 has a separate selected review; whether an organization makes such a review a required gate is an explicit policy decision, not a side effect of model wording.

### What if a new commit arrives while the investigation is running?

The evidence remains associated with its original source run/attempt/head. The publisher must compare the latest PR head before applying its current-head comment/check behavior. Historical results should be labelled as such and must not replace the current result. New CI can cancel older CI; asynchronous investigation still needs its own stale-result handling.

### Does deduplication guarantee one issue?

Describe the tested scope precisely. A canonical incident key can group related occurrences, and an exact run attempt can be recognized as replay. A search followed by creation is not an atomic uniqueness guarantee under concurrent runs. Prompt instructions and destination filtering do not supply a transactional writer.

### Does the shared assessment prove a production outage?

No. It proves an evaluated candidate value conflicts with a recorded requirement for one of two registered sample consumers. A live impact claim needs authorized records of resolved versions, deployment inputs and relevant state or observations. A declared dependency alone is insufficient.

### Why is the source CI assessment green if a consumer requirement failed?

It is an evidence-producing, informational assessment in this release. The deterministic script reports the finding; the CI wrapper records that finding without changing the three existing gate meanings. A separate selected review delivers the report. An organization can choose to make a deterministic consumer requirement a required gate, but that is an explicit enforcement change and is not silently introduced by this demo. Unsupported or incomplete assessment evidence is an error, not an approved result.

### Can this assessment understand arbitrary Bicep edits?

No. It intentionally supports the literal `zoneRedundant` default change with fixed trusted consumer wrappers. It checks that other module bytes match, parses only supported compiled boolean shapes, and rejects unsupported evidence. This narrow example is enough to demonstrate default inheritance and overrides truthfully. Supporting other contracts needs additional deterministic evaluators and tests.

### Can it inspect other repositories or subscriptions?

Only with authorized evidence sources and appropriate identity. Organization membership alone grants no discovery or cloud access. A collector must retain scope and provenance. The agent should receive the bounded facts needed for the question, with explicit coverage and unknowns.

### Does the agent fix code or approve exceptions?

This session produces suggested repairs and a handoff. A developer reviews and commits the changes. Policy exceptions follow the organization's actual approval process. Automatic remediation, deployment and exception approval are outside this demo.

### How should we measure value?

Compare time to an accepted explanation and repair, reviewer correction effort, unsupported-claim rate, repeated incidents, end-to-end latency and total compute/inference cost against a good deterministic baseline. No savings estimate is established by this repository alone. Quote only observed metrics from the coherent prepared run.

## Presenter acceptance checklist

- Both demos trace source changes to observed checks, evidence reads and correct delivery.
- Demo 1 identifies the real compiler failure and the independent policy rule, with concrete repairs.
- Demo 2 shows normal CI green and the explicit-versus-omitted input distinction from compiled consumer evidence.
- Every screen is tied to the recorded source revision; old run evidence is labelled old.
- Markdown, executable YAML and logs are explained as distinct artifacts.
- The model's value is stated without hiding a clear compiler message or inventing savings.
- No full integration-test, real deployment, fleet coverage or enterprise authorization claim is made.
- The last slide appears by minute 30; questions start by minute 31.
