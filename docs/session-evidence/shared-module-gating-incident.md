# Shared-module agent scheduling incident

Observed 17 October 2026 during the first live shared-default rehearsal.

- PR: [#22](https://github.com/Nikila99gimhan/session-beyond-failed-ci/pull/22)
- Source CI: [38952038126](https://github.com/Nikila99gimhan/session-beyond-failed-ci/actions/runs/38952038126), four jobs successful.
- Follow-up: [38952114095](https://github.com/Nikila99gimhan/session-beyond-failed-ci/actions/runs/38952114095), failed before model execution.

## Observed chain

1. The registered consumer assessment produced the expected finding.
2. Trusted source and evidence selection succeeded.
3. The PR-head Shared Module Review check started.
4. Activation succeeded; the daily credit guard was not exceeded.
5. Optional `recover_delivery` and `review_status` jobs skipped, as intended for a new finding.
6. The agent also skipped. Detection and safe outputs therefore skipped.
7. PR delivery failed because there was no completed investigation report. Its visible error was a consequence of the scheduling defect.

## Cause and correction

The v0.89.21 compiler adds both optional jobs to the agent's dependency list. The original agent condition lacked a status-check function, so GitHub's implicit `success()` required every dependency to succeed. An intentionally skipped optional job prevented execution.

The Markdown source now uses an explicit status condition, requires successful activation and successful evidence selection plus an affirmative investigation decision, and refuses cancellation. The generated daily credit guard remains in place. Read permissions, source verification, issue destinations and controlled writer permissions are unchanged.

The test fixture records the actual failed run's dependency states. Regression tests read the generated lock file, reproduce the previous skip and evaluate positive/negative scheduling cases. This bounded predicate model is not a GitHub runner emulator. The new workflow still requires live verification after installation on main.

## Verification

- Twelve compiled-condition tests cover the observed skip, valid findings, failed/skipped/cancelled activation or selection, no finding, daily credit exhaustion and cancellation.
- Both Markdown/lock pairs remain compiled with the pinned gh-aw v0.89.21.
- The complete application suite and TypeScript checks are run on the hotfix PR.
- A new source CI event is required after installing the fix. Re-running the old follow-up alone can reuse the old workflow revision.

Earlier local tests established evaluator and publisher behavior but did not cover this generated dependency scheduling case. The first live rehearsal exposed that gap.
