# Shared module report publishing incident

## Observed run

- Demo PR: [#24](https://github.com/Nikila99gimhan/session-beyond-failed-ci/pull/24), branch `feature/hosting-plan-default-rehearsal-1`, head `82905dc63632cd9e48ce4779007d0c4aa74732ae`.
- Source CI: [38953775252](https://github.com/Nikila99gimhan/session-beyond-failed-ci/actions/runs/38953775252), attempt 1. All four CI jobs succeeded.
- Investigator: [38953876510, display #4](https://github.com/Nikila99gimhan/session-beyond-failed-ci/actions/runs/38953876510), using merged fix `3634468b369932ab48517d5980d1f5d7db59c13e`.
- Selection, activation, agent, detection and safe outputs succeeded. The optional recovery/status jobs intentionally skipped. This confirms PR #23 repaired the earlier scheduling problem.
- The writer created [issue #25](https://github.com/Nikila99gimhan/session-beyond-failed-ci/issues/25). Publishing its link to the PR failed with `Writer issue does not contain this source occurrence`.

## Cause

The prompt required occurrence and root-cause markers inside HTML comments. The original `safeoutputs.jsonl` artifact contains them. The ingested `agent_output.json` and published issue do not: gh-aw sanitization removes HTML comments before writing. The published issue still has the correct bot author, title and labels, but lacks the exact source occurrence required by the trusted publisher.

All publisher stage inputs were `success`, including `DETECTION_CONCLUSION`; `CREATED_ISSUE` was `25`. This was a metadata-format incompatibility, not another skipped agent or a missing write permission. The previous mock tests supplied unsanitized markers and missed this boundary.

## Repair

- Both investigator prompts now require the exact markers on separate lines in a fenced `text` block inside Source and audit, for new issues and occurrence comments.
- Sanitization remains enabled. Source repository/run/attempt/SHA checks, bot authorship, issue prefix/label checks, current PR checks and writer separation are unchanged.
- The shared-module flow uses the stable title `hosting plan default disables inherited zone redundancy`. The old marker-free title would otherwise cause the pinned writer to drop a new issue as a duplicate without adding its occurrence. Existing marker-free reports remain historical evidence; the prompt cannot reuse them by title alone.
- Both generated lockfiles were recompiled. Only their body hashes changed; executable jobs and permissions did not.

## Verification

- Downloaded the official `sanitize_content.cjs` and its local dependencies at **gh-aw v0.89.21**. Called its real `sanitizeContent` function twice, representing ingestion and writer sanitization. HTML markers disappear; both revised fenced marker blocks survive intact.
- `tests/fixtures/sanitized-report-markers.json` records the inputs, sanitized outputs, source URL and sanitizer SHA-256. This is a static local compatibility fixture, not a live Actions result.
- Publisher tests now use sanitized report bodies. Added cases cover both investigation modes: exact PR delivery, replay without another PR comment, an existing-issue occurrence comment, and refusal of a report whose markers were stripped.
- Selector replay cases now use the sanitized shared-module body/comment and still skip model execution for recorded occurrences.
- **159 tests passed across 10 suites**. Typecheck and build passed. Both pinned workflow compilations passed with zero warnings; `gh aw list` reports both compiled.

## Live retest after the hotfix reaches main

The user controls merging the hotfix. The existing failed investigator run remains failed; do not present it as repaired live evidence.

1. Merge the clean publishing hotfix into `main` after CI is green.
2. On PR #24's source **CI** run [38953775252](https://github.com/Nikila99gimhan/session-beyond-failed-ci/actions/runs/38953775252), choose **Re-run all jobs**. A new completed source attempt creates a fresh `workflow_run` event using the default branch workflow. Re-running only the failed publisher in investigator run #4 uses that old run's workflow revision.
3. Verify all four baseline CI jobs are green, the separate investigator runs, and its controlled issue contains both exact fenced markers for the new source attempt.
4. Verify the same PR has one managed shared-module comment with the issue link, and its `Shared Module Review` check links the report and succeeds. That success means report delivery, not approval of the module change.
5. To test exact-event replay without another paid investigation, re-run the new investigator after successful delivery. Selection should choose recovery, skip the model, and reuse the existing PR comment. Check actual jobs and before/after counts.

The repaired automatic issue-to-PR delivery is **not live verified** until those results are observed. Do not merge the deliberate default regression into main merely because the informational delivery check succeeds.
