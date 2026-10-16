# When CI Fails — event flow

**Owner:** Nikila Fernando  
**Session:** 35 minutes, including four minutes for questions  
**Audience:** engineers comfortable with pull requests, CI and infrastructure as code  
**Revision:** 16 October 2026  
**Companion documents:** `SESSION-SPEAKER-NOTES.md` contains the full explanation and slide copy; `SESSION-CUE-SHEET.md` is the onstage checklist.

## 1. The promise to the audience

> Keep CI deterministic. Investigate selected questions with evidence, relevant context and a controlled handoff.

Show two small cases in one repository:

1. **Red CI:** application unit tests pass, Bicep compilation fails, and an independent organization policy check also fails. One investigation explains both causes and gives concrete repairs.
2. **Green baseline CI:** a shared module default changes. The root deployment overrides it, so ordinary CI passes. A deterministic assessment evaluates two registered sample consumers and identifies the one inheriting the changed default.

Both examples use the existing TypeScript/Bicep repository. Neither deploys Azure resources. The second example evaluates compiled candidate configuration for two registered sample consumers; it does not discover an enterprise fleet or establish live deployment impact.

**Readiness boundary:** local implementation and QA do not establish a live end-to-end delivery result. The revised workflows must be installed on clean `main`, both demonstrations must have inspected completed runs, and the presenter must rehearse them before calling the live session ready. Current run availability is recorded in the final QA report and the ledger below.

The clean implementation is available in [PR #19](https://github.com/Nikila99gimhan/session-beyond-failed-ci/pull/19), candidate `a66da173340484550104ccc6dc88378aa80eb032`. Its four source CI jobs passed in [run 38909060883](https://github.com/Nikila99gimhan/session-beyond-failed-ci/actions/runs/38909060883). This is installation-PR evidence, not either deliberate-error scenario. The owner will merge this clean PR manually. The two new live scenario investigations remain pending that merge and preparation.

## 2. Minute-by-minute delivery

| Time | Slides | Screen and action | Point to land |
| --- | --- | --- | --- |
| 00:00–03:00 | 1–2 | Start with an ordinary failed PR and the familiar habit of copying logs into chat. | The missing work is collecting a supported explanation and next steps. |
| 03:00–06:00 | 3–5 | Show normal CI YAML, investigator Markdown, then generated workflow YAML. | The source instructions, executable workflow and runtime evidence are different artifacts. |
| 06:00–14:00 | 6–8 | Follow the prepared Demo 1 source diff → three required CI checks → investigation check → two findings → issue and PR comment. | A compiler defect and a policy violation are independent; both repairs are visible. |
| 14:00–19:00 | 9–11 | Show evidence identity, one relevant MCP exchange and controlled delivery. | Evidence and permissions give the investigation its boundaries. |
| 19:00–26:00 | 12–14 | Follow Demo 2 default change → green root CI → selected assessment → two consumer results → scoped handoff. | Green checks describe what they evaluated; the extra question needs extra evidence. |
| 26:00–30:00 | 15–16 | Explain selection, separate budgets, measurements and bounded adoption. | Spend inference on unresolved contextual questions; keep enforcement deterministic. |
| 30:00–31:00 | 17 | Close with the three takeaways. | Deterministic gate, selected evidence, governed handoff. |
| 31:00–35:00 | 17 | Questions. Keep technical appendix bookmarks ready. | Answer the scope of the demonstrated implementation precisely. |

Timing is a rehearsal allocation, not a measured runtime benchmark. The delivery plan uses completed runs; the audience does not wait for inference.

## 3. Required preparation

### A. Establish one coherent release candidate

- Record the clean automation commit in the evidence ledger below.
- Ensure the automation revision needed for the demonstration is installed on the default branch. GitHub reads `workflow_run` automation from the default branch; a PR containing a workflow edit does not alone install that edit.
- Preserve the three existing required CI check names and branch protection. An investigation delivery check is a separate signal.
- Keep intentional failures on feature branches. Never merge the broken demonstration fixtures to make the presentation work.
- Verify no unrelated scenario edits are present before creating either demonstration branch.

### B. Prepare both completed demonstrations

- Create each fixture from the same clean baseline, on a separate `feature/` branch.
- Push the branch. With the configured PR-only CI trigger, creating or pushing a branch alone does not start scans or investigation.
- Open a PR targeting `main`; this is the event that starts normal CI.
- Record the source head, tested merge SHA, source run and attempt. Recheck that the prepared PR still has the recorded head.
- Verify the investigation's actual input reads, findings and writer result. A completed workflow alone does not establish a correct explanation.
- Save the approved issue, managed PR comment and check details as bookmarks.
- Rehearse with read-only browser tabs. Run fresh paid investigations during preparation, not repeatedly onstage.

### C. Prepare local tooling and fallback

- Install repository dependencies with `npm ci`.
- Run the release QA specified in the final verification report. At minimum, run the relevant tests, TypeScript typecheck/build, Bicep compilation on compliant source and strict workflow compilation with the project's pinned gh-aw version.
- Check the Bicep compiler is already available; avoid first-use downloads during the session.
- Keep screenshots or downloaded artifacts from the same completed run available offline.
- Keep the final deck and cue sheet available without network access.
- Confirm `DISABLE_CI_INVESTIGATOR` is not set to `true` for preparation. That switch skips new agent activations; it does not stop an already running job.

The local verification command is:

```bash
npm run verify:session-demos
```

It uses real Bicep compilation and isolates twelve cases, including the compiler defect, policy failure, each repair, shared-root override and registered-consumer comparison. Inspect `docs/session-evidence/local-verification.json` with the final QA report. Release checks passed 139 tests, TypeScript typecheck/build and strict compilation of both workflows using gh-aw v0.89.21 with zero warnings. Bicep 0.43.8 produced the actual BCP053 diagnostic for the output-contract fixture. Both deliberate mutant copies also passed the 139-test suite, establishing the specific application-test versus infrastructure-build distinction. These are local QA results, not proof of live agent interpretation or delivery.

## 4. Demo 1 — two independent causes

### Fixture

Start with compliant parameters and the valid network ranges from clean `main`.

| File | Deliberate change | Expected observation |
| --- | --- | --- |
| `infra/modules/network.bicep` | Rename exported `outboundSubnetId` to `functionSubnetId`; leave the caller unchanged. | BCP053 from Bicep 0.43.8 at the caller referring to the removed output. |
| `infra/parameters/active.json` | Set `publicNetworkAccess.value` to `Enabled`; keep the other policy inputs compliant. | `POL-AZ-NET-001` fails for the sample production policy. |

### Exact branch preparation

Run these commands **after the clean implementation PR has been merged into `main`**, in a clean working copy of this repository. Inspect `git status --short` first. If it contains unrelated work, use a separate checkout; do not discard that work. The branch names below are examples intended to be new.

```bash
git status --short
git fetch origin
git switch -c feature/hosting-output-update origin/main
python3 - <<'PY'
import json
from pathlib import Path
module = Path('infra/modules/network.bicep')
source = module.read_text()
before = 'output outboundSubnetId string ='
assert source.count(before) == 1, 'Expected one original output declaration'
module.write_text(source.replace(before, 'output functionSubnetId string =', 1))
parameters = Path('infra/parameters/active.json')
data = json.loads(parameters.read_text())
assert data['parameters']['publicNetworkAccess']['value'] == 'Disabled'
data['parameters']['publicNetworkAccess']['value'] = 'Enabled'
parameters.write_text(json.dumps(data, indent=2) + '\n')
PY
git diff -- infra/modules/network.bicep infra/parameters/active.json
git add infra/modules/network.bicep infra/parameters/active.json
git commit -m "Update function network output and access settings"
git push -u origin feature/hosting-output-update
```

Then manually open a PR from `feature/hosting-output-update` to `main`. Opening the PR initiates CI. The branch push alone does not. Expect the real compiler and independent sample policy checks to fail; leave this fixture unmerged.

### Screen sequence — eight minutes

1. **Source diff — one minute.** Show the renamed output, unchanged caller and separate parameter change. Do not reveal the whole report before showing the question.
2. **CI — two minutes.** Point to application unit tests passing, Bicep compilation failing and the independent policy job failing. The offline network preflight cannot validate a template that failed compilation; identify it as skipped where applicable.
3. **Investigation — two minutes.** Show the investigator tied to the exact source run, and the asynchronous `CI Investigation` check on the PR head. The check becoming successful means delivery succeeded; required CI remains red.
4. **Findings and repairs — two minutes.** Show both findings. First repair the module/caller contract by restoring the output name or updating the caller consistently. Separately restore public access to `Disabled`. Show the proposed verification commands.
5. **Delivery — one minute.** Open the issue, then the managed comment linking it from the same PR. Point to source commit identity. Finish with the failed gate still blocking the PR.

### What to say about the error

The compiler already gives useful information. This is intentionally a normal defect, not a fabricated obscure exception. The investigation's value is gathering both failed jobs, changed lines, sample policy context and concrete repairs into a repeatable handoff. If a clear compiler message already answers the whole question, a deterministic report or ordinary Copilot interaction can be enough.

### Repair verification

From a disposable copy of the corrected feature branch:

```bash
npm test
az bicep build --file infra/main.bicep --outfile compiled-template.json
npm run validate:policy
```

Run the configured offline preflight after compilation succeeds. Use the exact preflight command from the source CI workflow; its result covers the implemented network contract, not a real deployment. TypeScript build/typecheck are release QA and should only be called CI checks if they are actually added to CI.

## 5. Demo 2 — green root, changed consumer default

### Fixture and evidence

Change `param zoneRedundant bool = true` to `false` in `infra/modules/hostingPlan.bicep`. Leave the root module's explicit `zoneRedundant` input and compliant active value `true` intact.

| Evaluated configuration | Input to the module | Baseline value | Candidate value | Interpretation |
| --- | --- | --- | --- | --- |
| Root deployment | Explicit `true` | `true` | `true` | Current root configuration remains compliant. |
| Registered sample consumer A | Explicit `true` | `true` | `true` | Override protects this sample from the default change. |
| Registered sample consumer B | Parameter omitted | `true` | `false` | Inherits candidate default; conflicts with its recorded sample requirement. |

The registered consumers are compiled wrappers in the repository. The `Registered Consumer Assessment` CI job selects `infra/modules/hostingPlan.bicep` changes and runs `scripts/assess-shared-module.ts`. It uploads `shared-module-assessment.json` plus `consumer-templates/{baseline,candidate}/` in the `shared-module-evidence` artifact. A confirmed requirement finding is evidence for a separate review: the script's finding exit code is normalized to a successful CI job. Missing or unsupported evidence is an error, not a successful assessment.

The supported module edit is deliberately narrow: only the literal `zoneRedundant` default may change; the rest of the module must match. Unsupported module edits are reported as unknown/error. This is not a general Bicep interpreter or a claim to assess every hosting-module modification.

### Exact branch preparation

Create the second branch from the **same installed clean baseline**, not from the Demo 1 fixture. First confirm Demo 1's intended changes are committed and no unrelated edits are present. If `main` has moved since the first preparation, record the new baseline and rerun verification rather than presenting the two branches as an identical release.

```bash
git status --short
git fetch origin
git switch -c feature/hosting-plan-default origin/main
python3 - <<'PY'
from pathlib import Path
module = Path('infra/modules/hostingPlan.bicep')
source = module.read_text()
before = 'param zoneRedundant bool = true'
assert source.count(before) == 1, 'Expected one original literal default'
module.write_text(source.replace(before, 'param zoneRedundant bool = false', 1))
PY
git diff -- infra/modules/hostingPlan.bicep
git add infra/modules/hostingPlan.bicep
git commit -m "Adjust hosting plan redundancy default"
git push -u origin feature/hosting-plan-default
```

Manually open a PR from `feature/hosting-plan-default` to `main`. Verify all four source CI jobs pass, including `Registered Consumer Assessment`, which records the scoped finding. The trusted follow-up then selects the finding for a separate review. Leave the changed-default fixture unmerged during preparation.

### Screen sequence — seven minutes

1. **Question and change — one minute.** “The root is green. What about registered callers that use the default?” Show one changed default and the root's explicit override.
2. **Baseline — one minute.** Show all three ordinary CI jobs passing for this source revision.
3. **Selection — one minute.** Show `.github/workflows/shared-module-investigator.md` and the trusted `scripts/select-shared-module-review.cjs` selector. It validates the source relationship, module/registry/template evidence and finding before model inference; no change, no finding, stale source and exact replay are not new investigation work.
4. **Consumer evidence — two minutes.** Show the two compiled consumer results and the recorded redundancy requirement. Explain why A and B differ.
5. **Handoff and limits — two minutes.** Show the `Shared Module Review` check, `[Module Review]` issue and managed PR link. The assessment finding does not rewrite the successful baseline. A successful review check confirms report delivery, not approval. It is currently informational, not an additional required merge gate.

For a replay with an existing verified bot-authored occurrence, `recover_delivery` restores the PR link/check from the existing controlled report without model use. If selected consumer evidence is missing, unsupported or invalid, the trusted `review_status` job publishes a visible **Consumer evidence requires manual review** result without starting the model. Do not describe an evidence rejection as a verified consumer violation.

### Repair and limitation

Restoring the module default to `true` preserves the sample requirement for an omitted input. Alternatively, deliberately changing the module contract needs reviewed consumer migrations and an appropriate requirement change. An agent cannot approve that policy decision.

The local assessment command takes actual baseline and candidate files. Use absolute paths to those module snapshots in the placeholders below; the placeholders are inputs to supply, not files already present:

```bash
npx tsx scripts/assess-shared-module.ts \
  --baseline-module /absolute/path/to/baseline-hostingPlan.bicep \
  --candidate-module /absolute/path/to/candidate-hostingPlan.bicep \
  --output shared-module-assessment.json \
  --templates-dir consumer-templates
```

A requirement finding exits `1`; a compliant comparison exits `0`; an unsupported/incomplete assessment exits `2`. The PR CI wrapper deliberately records `1` as a review finding while preserving successful baseline CI. Do not apply that exit-code normalization to the existing deployment policy gate.

The compiled consumer evidence establishes this finding. If ownership is useful, the shared review may use the narrow `get_service_ownership` tool for the root service. That fact does not establish sample consumer owners. It does not fetch unrelated policy rules. `SAMPLE-ZONE-001` is the registered consumer requirement; it is not a policy-MCP rule.

These are two registered sample consumers. A future authorized collector could supply other repositories' resolved versions and effective inputs. Actual cloud impact also needs deployment or state evidence; this demo makes no live cloud claim.

## 6. Prepared evidence ledger

Replace `PENDING` only with inspected evidence. An older run may be used as an explicitly identified fallback, never relabelled as a run of the release candidate.

| Item | Demo 1 | Demo 2 |
| --- | --- | --- |
| Clean implementation candidate | `a66da173340484550104ccc6dc88378aa80eb032`, PR #19 | Same candidate; installation pending owner merge |
| Clean implementation CI | Four jobs passed, run `38909060883` | Installation evidence only, not scenario evidence |
| Feature branch / PR | PENDING — preparation | PENDING — preparation |
| Source head SHA | PENDING | PENDING |
| Tested merge SHA | PENDING | PENDING |
| Source CI run / attempt | PENDING | PENDING |
| Deterministic checks and relevant artifacts | PENDING | PENDING |
| Investigator / selected review run | PENDING | PENDING |
| Actual evidence reads and binding result | PENDING | PENDING |
| MCP request/status/version | PENDING | PENDING |
| Issue and managed PR comment | PENDING | PENDING |
| Check semantics / gate outcome | PENDING | PENDING |
| Agent AIC / detection AIC / total | PENDING — quote only if measured | PENDING — quote only if measured |
| End-to-end latency | PENDING — source completion to delivery | PENDING — source completion to delivery |

Historical mixed-failure run `38719251947` with investigator `38719310413`, PR #17 and issue #18 predates these revised scenarios. It can illustrate the existing evidence and delivery route after rechecking its availability. It does not prove the new compiler-defect or green-CI consumer paths.

## 7. Fallback and time control

| Situation | Action | Honest wording |
| --- | --- | --- |
| Fresh investigation is queued | Open the coherent completed run. | “This is the prepared run of the recorded revision.” |
| GitHub is unavailable | Use saved same-run screenshots and artifacts. | “These are captured outputs; I am not claiming a live run.” |
| MCP context is missing | Show the uncertainty result or explain the boundary. | “The observed failure remains; policy enrichment is unavailable.” |
| The report omits a cause or repair | Acknowledge the incomplete result, use verified source evidence. | “This handoff is incomplete; the independent check still protects the gate.” |
| Three minutes behind | Cut internal job logs and transport details. | Keep both demos, repairs, scope limits and close. |
| Six minutes behind | Use the Demo 2 comparison and prepared handoff directly. | Keep the green-root/omitted-input distinction and reserve Q&A. |

Do not rerun blindly, relax a required check, approve an exception or merge a broken fixture as a presentation workaround.

## 8. Finish and reset

- Stop switching screens at minute 30; close by minute 31.
- Keep Q&A until minute 35. Technical appendix answers are in the speaker notes.
- After the session, leave intentional demo PRs unmerged. Close them when no longer needed through normal repository handling.
- Return the working copy to a verified compliant branch; do not discard unrelated user changes.
- Cancel unwanted in-progress investigations separately. Use the repository kill switch if new paid investigations must stop.
- Retain the release QA and source evidence ledger with the final deck so later demos can distinguish the prepared release from newer changes.
