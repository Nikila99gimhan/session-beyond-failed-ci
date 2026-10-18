# Shared module merge gate

A root application's green CI result covers the inputs that application evaluated. Another caller can inherit a shared module default that the root overrides. This repository separates enforcement of that caller's recorded requirement from the agent's explanation of the finding.

## Required check and asynchronous explanation

`.github/workflows/shared-module-gate.yml` defines **Shared Module Safety Gate** in the separate **Shared Module Safety** workflow. It starts directly on PR open, update and reopen events targeting `main`, alongside ordinary CI. Configure it as a required check in addition to the three baseline checks; a workflow file alone does not install branch protection.

The check uses no model or inference credentials. Its token has only `contents: read`. An unchanged registered hosting module passes without dependency installation or consumer compilation.

For a changed module:

- The assessor, dependency lockfile, registry and wrappers come from the exact trusted PR base revision.
- Candidate module bytes are read with `git show`. Candidate assessment code and package scripts are never executed by this gate. A candidate symlink is read as its Git blob rather than followed.
- The real Bicep compiler evaluates the two registered wrappers against baseline and candidate modules. The narrowly scoped assessor derives effective `zoneRedundant` values and compares them with the recorded requirement.
- Exit `0` passes. Exit `1` blocks a verified requirement finding. Exit `2` blocks unsupported, incomplete or invalid evidence. The required gate never normalizes a finding to success.
- Its `shared-module-gate-evidence` artifact remains separate from the original CI investigation artifacts.

Missing, canceled, timed-out or failed required results do not authorize merging. Preserve strict checks and administrator enforcement when configuring repository protection.

## Why the workflow named CI can stay green

Ordinary `CI` has a **Registered Consumer Assessment** job that records source evidence for review. That job allows a complete requirement finding to remain an informational artifact; unsupported assessment still fails the job. The separate required safety gate preserves the finding's failure exit status.

A successful workflow named `CI` can therefore trigger the shared investigator while **Shared Module Safety Gate** is red. Requiring only an asynchronous report-delivery check would leave a gap before the check is attached and would confuse successful explanation with requirement satisfaction.

For the session's unsafe-default example:

| Signal | Expected result |
| --- | --- |
| Application Tests | Pass |
| Root Bicep validation and deployment policy | Pass; root explicitly supplies `zoneRedundant: true` |
| CI Registered Consumer Assessment | Complete finding recorded; baseline CI remains green |
| Shared Module Safety Gate | Fail; inherited sample consumer becomes `false` |
| Shared Module Review | Starts after selection; success means the verified report was delivered |
| Merge | Blocked by the required gate until the recorded requirement passes |

Restoring the shared default to `true` makes the scoped comparison pass. The agent cannot change the check's result, edit the source or grant a waiver.

## Selection before model use

After successful eligible baseline CI, trusted selection verifies the exact source run, attempt, PR head and baseline. It retrieves authenticated module bytes, validates the registered wrappers and artifact digests, and recomputes the supported effective values.

An unchanged module or complete passing consumer assessment does not start the model. A complete verified finding can activate the investigator. A previously delivered exact occurrence can recover its report link without another inference run. Unsupported or invalid selected evidence produces a manual-review result without model use.

Both the source developer SHA and the tested PR merge SHA matter. GitHub check registration is asynchronous, and reusing a commit across PRs can display historical checks. Inspect the current source run and check identity before interpreting the UI.

## Supported scope

The automated assessment allows only the literal `param zoneRedundant bool = true` to `false` default change, with the rest of the module unchanged. Two registered sample wrappers are compiled: one explicitly supplies `true`; the other inherits the default. Their requirement is a sample consumer contract, not a universal Azure policy.

Other module edits, unsupported expressions, missing consumers, incorrect wrappers or inconsistent source/template bindings require manual review. The demo does not discover other repositories, read Terraform state or prove deployed Azure values. See the [consumer fixture documentation](../fixtures/shared-module-consumers/README.md) for the exact verifier contract.

## Verify and demonstrate

Use `npm run verify:session-demos` for the real-compiler local example without model calls. Use the [scenario preparation guide](demo-scenarios.md) for a fresh developer branch and manual PR creation.

For a hosted retest:

1. Install the clean gate and compiled investigator on `main`; confirm the four required check contexts in the [runbook](OPERATING-RUNBOOK.md).
2. Create or update a feature branch from that baseline and open its PR. Rerunning only an old CI workflow does not start this separate PR-event gate.
3. Confirm the gate queues alongside CI and fails the intentional default change. Confirm the PR remains blocked during investigation and after report delivery.
4. Restore the safe default on the same branch and push. Confirm a fresh required gate succeeds before considering a human-reviewed merge.

Keep intentional unsafe examples out of `main`. The gate enforces the recorded consumer requirement; the investigation provides the explanation and proposed correction.
