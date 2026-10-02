# Governed CI Investigation Agent — Operating Runbook & QA Package

## 1. System Overview & Setup Requirements

The Governed CI Investigation Agent is an analytical workflow triggered on failed runs of the `CI` pipeline (`workflow_run` event on `conclusion == 'failure'`). It correlates code changes against the **sample** versioned policy and ownership fixtures via Model Context Protocol (MCP) and GitHub Actions evidence artifacts, then proposes a human handoff issue or occurrence update. The deterministic check covers selected Bicep parameters; it is not a full Azure posture or deployment validation.

### Permissions & Security Boundary
- **Deterministic CI Gate**: Application tests, Bicep compilation, and `npm run validate:policy` determine CI pass/fail. The policy validator exits `0` or `1` for the selected parameter fixture; the investigator cannot turn a failed gate green.
- **Evidence Artifact**: The policy job uploads `policy-result.json`, `investigation-context.json`, and the exact `infra/parameters/active.json` it evaluated. The bundle digest is SHA-256 over raw policy-result bytes followed by raw active-parameter bytes. The digest detects a mismatch among these files; it does not authenticate the run or artifact by itself.
- **Agent Job Permissions**: The generated job requests `actions: read`, `contents: read`, `issues: read`, and `pull-requests: read`; the GitHub MCP/CLI proxy can instead use `GH_AW_GITHUB_MCP_SERVER_TOKEN` or `GH_AW_GITHUB_TOKEN` if configured. Audit those secrets' actual scopes before claiming the effective agent path is read-only. The agent must use safe outputs for writes.
- **Safe-Output Job Permissions**: The generated job requests `issues: write` for issue creation/comments. Comments are configured for issues only, with `[CI Failure] ` title prefix and `ci-failure` label required. This is destination filtering, not atomic exact-event deduplication.
- **Tokens**: `COPILOT_GITHUB_TOKEN` is used for Copilot inference. Job permissions do not narrow the scope of any separate PAT. Never place a broad GitHub write PAT in the agent's GitHub tool token secrets.
- **Scope**: The MCP server serves local fixture data for this repository's demo. Its `accountScope` allowlist filters request text; it does not authenticate a caller or establish tenant entitlement. Do not deploy it as a shared policy service without caller-bound authorization and server-derived scope.

---

## 2. Fixture Commands & Scenario Verification

| Scenario | Local Command | Expected CI Outcome | Investigator Action |
|---|---|---|---|
| **Compliant Baseline** | `npm run scenario:compliant` | Green (`0` violations, pass) | Skipped (`conclusion != 'failure'`) |
| **Policy Regression** | `npm run scenario:regression` | Red (2 violations: `POL-AZ-NET-001`, `POL-AZ-SKU-003`) | Creates Issue or updates canonical occurrence |
| **Unrelated Failure** | `FAIL_APP_TEST=true npm test` | Red (`application-tests` failure) | Classifies as `CODE_OR_TEST_FAILURE` |
| **MCP Outage** | `npm run play:missing-mcp` | Local simulation after a red policy check | Reports policy context as unverified; no live agent/writer is exercised |

---

## 3. Auditing & Inspection Procedures

### Inspecting Workflow Run & Telemetry
```bash
# Check status of workflow runs
gh run list --workflow="Governed CI Investigation Agent" --limit 5

# Download and inspect logs and artifacts
gh aw logs ci-investigator --last 1 --artifacts all

# Audit a specific run
gh aw audit <RUN_ID>
```

### Inspecting Safe-Output Delivery
The safe-output handler outputs a summary in the GitHub Actions Step Summary:
- If a new root cause is detected: `create_issue` creates `[CI Failure] ...`.
- If an existing canonical issue exists: `add_comment` appends a table row with `Run ID`, `Run #`, `Head SHA`, and `Run URL` to the canonical issue.
- A source run attempt is looked up from the source workflow run API. The prompt asks for `noop` on an exact replay, but the built-in writer has no atomic event-key check. Verify the issue and comments before relying on the result.

Before a live demo, check that any existing canonical issue has both the `[CI Failure] ` title prefix and `ci-failure` label. An older issue without the label is not an allowed comment destination; update it through normal reviewed repository administration or use a prepared completed run. Do not weaken the writer condition to make a demo pass.

For each run you present, record one audit row with: source repository/run ID/attempt/SHA, evidence artifact read and fallback reason, policy MCP calls and status, GitHub CLI/API reads where observable, agent/detection/stage/wall duration, agent/detection AIC, and issue/comment/noop result. Obtain these from `gh aw audit`, workflow logs, and issue history; do not manufacture missing values.

---

## 4. Live Measured Performance & Cost Baseline

Historical figures copied into the project handoff; this checkout has not authenticated or re-audited those run artifacts. Do not use these as current live QA evidence:

The compiled workflow sets 120 AIC for the agent and defaults detection to 400 AIC (`GH_AW_DEFAULT_DETECTION_MAX_AI_CREDITS` may override). The 120 setting is not a total workflow cap.

| Metric | Run #8 (`36269620350`) | Run #11 (`36270882686`) | Run #13 (`36321908546`) | Run #14 (`36323140408`) | Target / Cap |
|---|---|---|---|---|---|
| **Triggering CI Run** | CI #10 (`36269573747`) | CI #13 (`36270836892`) | CI #15 (`36321854790`) | CI #16 (`36323095466`) | N/A |
| **Total Wall Time** | 302s (~5.0 min) | 355s (~5.9 min) | 377s (~6.2 min) | 363s (~6.0 min) | `< 10 min` |
| **Agent CLI Loop** | 67s | 138s | 148s | 148s | Bounded |
| **Threat Detection** | 52s | 45s | 53s | 38s | Bounded |
| **Agent AIC** | 21.56 AIC | 45.34 AIC | 45.70 AIC | 42.67 AIC | `120 AIC max` |
| **Threat Detection AIC** | 8.21 AIC | 8.21 AIC | 7.54 AIC | 6.26 AIC | Included |
| **Total Run AIC** | **29.77 AIC** | **53.55 AIC** | **53.24 AIC** | **48.93 AIC** | Agent and detection budgets are separate |
| **Reported value ($0.01/AIC)**| **$0.30** | **$0.54** | **$0.53** | **$0.49** | Excludes other costs |
| **Reported gateway calls** | 7 calls | 21 calls (12 file reads) | 1 (`add_comment`) | 1 (`add_comment`) | Excludes CLI/API reads |
| **Firewall Requests** | 38 allowed, 0 blocked | 61 allowed, 2 blocked | 70 allowed, 0 blocked | 68 allowed, 0 blocked | `0 blocked` |
| **Safe Output Status** | Skipped (handler bug) | Reported delivered (#4 comment) | Reported delivered (#4 comment) | Reported delivered (#4 comment) | Re-audit before claiming |

---

## 5. Emergency Break-Glass & Disablement (Kill Switch)

If the investigation agent experiences runaway latency, upstream model outages, or unexpected behavior:

### Option A: Repository Variable Kill Switch (Zero Code Changes)
1. Go to repository **Settings > Secrets and variables > Actions > Variables**.
2. Add or update variable:
   - **Name**: `DISABLE_CI_INVESTIGATOR`
   - **Value**: `true`
3. Effect: New invocations evaluate the variable in the compiled activation condition and skip investigation. Already-running jobs may continue; cancel them separately in Actions if needed.
4. **The deterministic CI policy gate remains 100% active and continues enforcing security rules.**
*(Status: Configured in workflow expressions and compiled into lockfile)*.

### Option B: GitHub Actions UI Disable
1. Navigate to repository **Actions** tab.
2. Under Workflows, select **Governed CI Investigation Agent**.
3. Click the `...` menu and select **Disable workflow**.

---

## 6. Rollback Runbook (Reviewed PR Procedure)

To revert changes to the investigator workflow safely through enterprise review:

1. Create a dedicated rollback branch:
   ```bash
   git checkout -b rollback/revert-investigator-change
   ```
2. Checkout the workflow definition at the target known-good commit:
   ```bash
   git checkout <KNOWN_GOOD_SHA> -- .github/workflows/ci-investigator.md
   ```
3. Restore a coherent set of changed files if the workflow depends on server, contract, or packager changes. Recompile and validate the lockfile using the verified gh-aw compiler:
   ```bash
   gh aw compile ci-investigator --strict
   ```
4. Verify local tests pass:
   ```bash
   npm test
   ```
5. Stage the workflow source and generated lockfile **plus any server, packager, contract, and CI files restored in step 3**. Commit, push, and open a reviewed pull request:
   ```bash
   git add .github/workflows/ci-investigator.md .github/workflows/ci-investigator.lock.yml
   # Add each other file restored in step 3.
   git commit -m "revert: rollback ci-investigator workflow to <KNOWN_GOOD_SHA>"
   git push origin rollback/revert-investigator-change
   ```
6. Confirm that the deterministic CI policy gate (`ci.yml`) continues running and remains the sole pass/fail authority throughout the rollback.
