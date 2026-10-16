# Shared module merge gate

## Why this gate exists

PR #30 showed a valid gap in the original informational design. Its source CI finished at 20:45:12 UTC; the asynchronous shared review attached its check at 20:46:07 UTC, after source/evidence selection. The original three required checks were green and `Shared Module Review` was optional, so GitHub still considered the PR mergeable while the agent ran.

The owner selected this requirement: **merging is possible only after the consumer requirement finding is fixed**. Successful AI report delivery must not approve a known consumer violation.

## Implementation

`.github/workflows/shared-module-gate.yml` provides the native PR check **Shared Module Safety Gate**. It starts on PR open, update and reopen, alongside ordinary CI, rather than waiting for `workflow_run`. Branch protection requires this check in addition to the original three checks.

- The check uses no model or inference credentials. Its token has only `contents: read`.
- The assessor, dependency lockfile and registered wrappers come from the exact PR base revision in `automation/`.
- The candidate checkout supplies only module bytes, read with `git show`. Candidate package scripts and assessment code are never executed by this gate. A candidate symlink is read as its Git blob, not followed as a filesystem path.
- An unchanged registered module passes without installing dependencies or compiling consumers.
- A changed module uses the existing narrow assessor. Exit `0` passes; exit `1` blocks a requirement finding; exit `2` blocks unsupported or incomplete evidence. No finding exit is normalized to success here.
- Gate evidence has its own artifact name and is not substituted for the original source CI investigation artifacts.

## Relationship to the investigation

The existing workflow named **CI** still owns its original baseline checks and the review evidence artifact. Its successful conclusion can continue to trigger the shared-module investigator. The new workflow has a different name, so its failing deterministic gate does not suppress the successful-CI investigation path.

Expected unsafe-default result:

| Signal | Result |
| --- | --- |
| Application, root Bicep and deployment policy checks | Pass |
| CI Registered Consumer Assessment | Complete finding recorded for review |
| Shared Module Safety Gate | Fail because the inherited consumer becomes false |
| Shared Module Review | Pending while investigating; success after report delivery |
| Merge | Blocked by the required safety gate even after the report is delivered |

Restoring `zoneRedundant` default to `true` makes the scoped consumer comparison pass. The model cannot change this result or grant an exception. The comparison covers two registered sample consumers and a literal default edit, not arbitrary Bicep edits or live Azure state.

## Installation and retest

1. The owner merges the clean gate implementation PR after all its checks pass.
2. The required-check configuration must contain the original three contexts plus `Shared Module Safety Gate`, associated with the GitHub Actions app. Preserve strict checks and admin enforcement. Do not require the informational `Shared Module Review` delivery check as a substitute for this safety gate.
3. Update the demo feature branch with the installed main revision and push it, generating a fresh PR `synchronize` event. Re-running only an old CI run does not start this separate PR-event workflow.
4. Confirm the safety gate is queued/running alongside CI, then fails the intentional default change. Confirm the PR remains blocked while the investigation runs and after its report is delivered.
5. Restore the default on the demo branch and push. Confirm the safety gate passes before merging. Missing, cancelled, timed-out or failed required gate results do not authorize a merge.

GitHub check registration and the UI are asynchronous. A required check that has not reported is expected/waiting, not a successful consumer evaluation. Required statuses apply to GitHub's commit/check model; reusing a SHA across PRs can display historical checks, so inspect the current run and source identity during rehearsals.

## Session wording

The root baseline CI is green, but a separate deterministic consumer safety gate is red. The investigation explains the finding and proposes the correction. It does not decide whether the requirement can be waived, and a green investigation-delivery check does not make the unsafe change mergeable.

## Local verification

- Executed the exact workflow scope and enforcement commands with real Bicep: unchanged module skips compilation; unsafe default exits `1`; unsupported edit and symlink Git blob exit `2`; restored default exits `0` with no findings.
- All 159 existing tests passed, along with TypeScript typecheck/build. Both existing agentic workflows remain compiled and unchanged.
- Live gate execution and required-check configuration are separate release evidence. Confirm their actual results before claiming the gate is installed on main or that the current demo PR has exercised it.
