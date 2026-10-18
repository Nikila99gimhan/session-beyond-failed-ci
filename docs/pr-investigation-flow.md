# PR checks, investigation and feedback

## What starts each workflow

Creating or pushing a branch alone does not start these scans. `CI` and **Shared Module Safety** respond to PRs targeting `main` when they are opened, updated with commits, or reopened. Draft PRs are included. Editing only the PR description does not start CI. Each workflow cancels its older in-progress run for the same PR when a newer run starts.

The agentic workflows run after a completed workflow named `CI`, using `workflow_run` automation installed on the repository's default branch:

| Completed source CI | Additional selection | Result |
| --- | --- | --- |
| Failure | Same-repository PR to `main`, non-main source branch, kill switch off | Failed-CI investigation |
| Success | Same eligibility, changed registered module, complete verified consumer finding | Shared-module investigation |
| Success with unchanged module or no consumer finding | Deterministic selector only | No model investigation |
| Canceled, fork PR, push/manual event, or kill switch on | Ineligible | No privileged investigation |

A successful ordinary CI workflow is not proof that every required PR check passed: the separate required **Shared Module Safety Gate** can fail while baseline `CI` is green. See the [merge gate](shared-module-merge-gate.md).

## From Markdown to executable workflow

The investigator `.md` files contain configuration, tool access, budgets and the investigation instructions. Their matching `.lock.yml` files are generated executable workflows. GitHub Actions executes those compiled files; it does not discover and run arbitrary Markdown because a job failed.

The configuration selects the source event and eligibility. For shared modules, the trusted selector additionally verifies scope before model use. Editing Markdown requires recompilation with the repository-compatible GitHub Agentic Workflows tooling and review of the generated workflow. Preserve both source and lockfile in the same change.

## Evidence and tools

Failed-CI investigation inspects every failed job independently. It can read the policy bundle and provisioning artifact, actual compiler logs, and the source diff. A compiler failure skips the offline preflight; this is expected and is not evidence of a separate Azure deployment failure.

`gh-proxy` is the configured mediated GitHub read path for run, job, log, PR, issue and repository evidence. A separate temporary HTTP MCP service starts on the trusted worker at `http://localhost:8765/mcp` and exposes the versioned sample policy catalog. MCP uses HTTP/JSON-RPC here, not gRPC. It provides context for diagnosis rather than permission to deploy or approve an exception.

Logs, artifacts, code changes, commit messages and MCP responses remain untrusted input. Evidence must be tied to the expected repository, source run, attempt and source head. The tested checkout can be a PR merge commit, so its identity is recorded separately. Digests detect inconsistent bytes; a digest alone does not authenticate an artifact's origin. Missing or invalid evidence must stay an explicit unknown.

The shared-module selector performs deterministic source and consumer verification before activation. It checks the recorded baseline, authenticated candidate module, trusted registry, four compiled consumer templates, digests and derived values. Reading an artifact's claimed `FAILED` status alone is insufficient. Unsupported selected evidence produces a manual-review result without model use.

## Who can publish

The analytical agent has read-only job permissions and is instructed to propose corrections rather than edit files, push commits, deploy or grant policy waivers. Separate tool-token secrets can carry broader scopes than the job token: their real permissions must be audited before claiming an effectively read-only deployment.

The agent proposes a structured safe output. The configured threat-detection stage checks the candidate output before the separate issue writer delivers it. Issue creation is bounded to one issue with the workflow's title prefix and allowed labels. Existing issue comments require the configured prefix and label and cannot target PRs through that safe-output route. These controls reduce the write surface; they do not make arbitrary input trustworthy or guarantee atomic deduplication under concurrent runs.

Separate deterministic feedback jobs have the check and PR-comment write permissions. They check out the immutable trusted workflow revision with persisted credentials disabled, verify the exact source occurrence and bot-authored delivered issue, and choose the source PR themselves. They never run PR code or accept an agent-selected publication destination.

## What appears on the PR

1. Ordinary required checks start with the PR event. The shared consumer gate is a native PR check, so it does not wait for the agent.
2. After completed CI and eligible activation, the feedback job creates **CI Investigation** or **Shared Module Review** on the developer's source head. Shared-module feedback appears after deterministic selection. GitHub's check UI is asynchronous, so there may be a gap before it appears.
3. After successful detection and controlled issue delivery, the publisher verifies the exact source run and attempt, links the report in one managed PR comment, and completes the investigation check.
4. Existing-issue updates and exact replays can resolve a previously verified report. A stale source head or closed PR must not overwrite the current PR conversation. Missing, ambiguous or unbound delivery cannot produce a successful report-link comment.

A successful investigation check means report delivery succeeded. It does not make a failed required check pass, approve code or authorize merging. The required deterministic checks remain in control.

## Retesting changes

Workflow-run automation must be present on the default branch before it can handle new source runs. After installing a clean workflow update, start fresh source CI with a new commit or a source CI rerun. Rerunning an old investigator uses that investigator's old workflow revision. The separate shared-module gate needs a PR open, update or reopen event; rerunning only an old CI workflow does not start that gate.

For preparation commands and expected results, use the [two demo scenarios](demo-scenarios.md). For configuration and delivery troubleshooting, use the [operating runbook](OPERATING-RUNBOOK.md).
