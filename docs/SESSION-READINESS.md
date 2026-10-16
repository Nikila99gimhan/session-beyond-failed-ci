# Session implementation and readiness

**Checked:** 16 October 2026  
**Implementation:** `feature/governed-demo-flow`  
**Review:** [PR #19](https://github.com/Nikila99gimhan/session-beyond-failed-ci/pull/19)  
**Duration:** 35 minutes, including four minutes for questions

## What already worked

The repository already had independent application tests, Bicep validation and deployment-policy enforcement; an offline subnet preflight; bounded policy evidence; a local versioned policy MCP catalog; a read-only investigation with separate controlled issue delivery; and a source-bound PR check/comment publisher. These components were retained. Main's existing three required check names and branch protection were verified and preserved.

## What changed

- Bicep compilation captures its real diagnostics. Investigator instructions require every independent cause, concrete code corrections and verification commands. Compiler signatures now contribute to incident grouping. Relevant failed rules determine the policy MCP request.
- Two registered sample consumers compile against baseline and candidate hosting modules. A literal redundancy-default change affects the caller that omits that input while the explicit caller remains unchanged.
- A successful PR CI run can enter an explicit shared-module assessment path. Trusted deterministic selection validates source/attempt/base/merge identity, authenticated module bytes, registry, templates and effective values before allowing inference.
- In the green-CI shared-module path, irrelevant changes, passing assessments, stale commits and recorded occurrences skip new model use. Prior controlled reports can recover missing PR feedback without another investigation. Rejected selected evidence creates a manual-review check. The existing failed-CI path still starts its eligible investigator; its prompt-level replay handling can suppress duplicate output but does not remove all inference cost.
- Shared reviews use a distinct check, issue prefix, label and managed PR comment. Delivery success preserves baseline CI's original conclusion and grants no merge approval.
- The event flow, detailed speaker notes, cue sheet and revised 17-slide deck use the same two examples. Azure provisioning, fleet discovery and additional platforms are outside these examples.

## QA results

| Check | Result and evidence |
|---|---|
| Full suite | 139 tests pass across nine suites |
| Both intentional fixture copies | Full 139-test suite passes with each defect scenario applied separately |
| TypeScript | Typecheck and build pass |
| Agentic workflow compilation | Both Markdown workflows compile using gh-aw v0.89.21, zero warnings |
| Real Bicep compilation | Bicep CLI 0.43.8 verifies 12 compiler/policy cases |
| Demo 1 defect | Actual BCP053 for missing `outboundSubnetId`; independent `POL-AZ-NET-001` public-ingress failure |
| Demo 1 repair isolation | Fixing the output contract leaves policy failed; fixing policy leaves compilation failed |
| Demo 2 root | Root compiles and policy passes with its explicit redundancy input |
| Demo 2 consumers | Default true to false produces one requirement finding among two registered consumers; unchanged module passes both |
| Trusted selection/delivery | Tests cover malformed and oversized evidence, symlinks, tampering, source mismatches, cross-mode reports, stale results, replay and recovery |
| Clean PR CI | [Run 38909060883](https://github.com/Nikila99gimhan/session-beyond-failed-ci/actions/runs/38909060883): all four jobs pass at `a66da173340484550104ccc6dc88378aa80eb032` |
| Branch protection | Application Tests, Bicep Syntax & Template Validation, Deployment Policy Check remain required; strict status checks and enforcement for admins remain enabled |

The machine-readable records are [local verification](session-evidence/local-verification.json) and [clean CI artifact verification](session-evidence/clean-ci.json). The clean CI source/base merge relationship and all three artifact digest checks were verified; the compiler log is present. Reproduce the real compiler cases with `npm run verify:session-demos` after installing the Bicep CLI. `BICEP_BINARY` can select a direct compiler executable. The harness creates defects in temporary copies and leaves the working infrastructure compliant.

An initial sandbox run could not open the existing HTTP/IPC sockets. Running with the required local permissions passed. Concurrent copies of the suite also collided on the existing fixed HTTP test port; the final complete suite and both fixture suites passed when run serially.

## Remaining gaps and release steps

1. **The owner will merge PR #19.** The implementation remains unmerged at the owner's request. `workflow_run` automation must be on the default branch before the new green-CI path can run.
2. **Prepare both live demo PRs after installation.** Verify each actual agent report, source evidence reads, MCP status, issue, PR comment and check. Record the IDs in the event-flow ledger. The clean installation PR's green CI does not prove either revised investigation end to end.
3. **Rehearse the 35-minute delivery.** Use completed runs and reserve four minutes for questions. No timed rehearsal or new AI-credit/latency measurement is claimed.
4. **Keep the scope precise.** The assessment supports a single literal bool-default edit and two sample consumers. Other module changes require manual review. It establishes compiled configuration, with no Azure deployment or organization-wide dependency discovery.
5. **Treat the catalog and delivery appropriately.** The MCP catalog is a local fixture. Enterprise use needs authorized context and consumer inventory. The Shared Module Review check is informational, and successful report delivery is not approval. Search-based incident grouping does not establish fleet-wide atomic uniqueness.

## Session readiness

**Code, local scenarios and presentation materials are ready for rehearsal. Live-demo readiness remains conditional on the owner's merge, two verified completed investigations and a timed rehearsal.**

Use [SESSION-EVENT-FLOW.md](SESSION-EVENT-FLOW.md) to prepare and operate the demos, [SESSION-SPEAKER-NOTES.md](SESSION-SPEAKER-NOTES.md) for the full technical explanation, and [SESSION-CUE-SHEET.md](SESSION-CUE-SHEET.md) onstage. The final deck lives in the repository's local `output/` directory and is delivered separately from the source PR.
