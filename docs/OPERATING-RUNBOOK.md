# Governed CI Investigation Agent — Operating Runbook & QA Package

## 1. System Overview & Setup Requirements

The Governed CI Investigation Agent is an autonomous, read-only analytical workflow triggered on failed runs of the `CI` pipeline (`workflow_run` event on `conclusion == 'failure'`). It correlates code changes against organizational policy rules (`Policy v2026.1`) and service ownership catalogs via Model Context Protocol (MCP) and GitHub Actions evidence artifacts, posting an actionable, evidence-backed handoff issue or occurrence update.

### Permissions & Security Boundary
- **Deterministic CI Gate**: Executes `npm run validate:policy` (`scripts/validate-deployment-policy.ts`). Alone determines CI pass/fail status (`0` or `1`).
- **Agent Job Permissions**: Strictly read-only (`actions: read`, `contents: read`, `issues: read`, `pull-requests: read`). Executes in a hardened, egress-firewalled Linux container (`awf-agent` + `awf-squid` + `cli-proxy`) with dropped Linux capabilities (`CAP_SYS_CHROOT`, `CAP_SYS_ADMIN`).
- **Safe-Output Job Permissions**: Isolated runner with `issues: write`. Only executes pre-validated, schema-checked actions (`create_issue`, `add_comment`) emitted into quarantined JSONL.
- **Tokens**: Fine-grained PAT (`github_pat_...`) stored in secret `COPILOT_GITHUB_TOKEN` with Account permissions: **Copilot Requests (Read & write)** and Repository permissions (**Issues**, **Pull Requests**, **Actions**, **Contents**).

---

## 2. Fixture Commands & Scenario Verification

| Scenario | Local Command | Expected CI Outcome | Investigator Action |
|---|---|---|---|
| **Compliant Baseline** | `npm run scenario:compliant` | Green (`0` violations, pass) | Skipped (`conclusion != 'failure'`) |
| **Policy Regression** | `npm run scenario:regression` | Red (2 violations: `POL-AZ-NET-001`, `POL-AZ-SKU-003`) | Creates Issue or updates canonical occurrence |
| **Unrelated Failure** | `FAIL_APP_TEST=true npm test` | Red (`application-tests` failure) | Classifies as `CODE_OR_TEST_FAILURE` |
| **MCP Outage** | `npm run play:missing-mcp` | Red (policy check fails) | Reports missing context; fails closed |

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
- If an exact replay occurs (same run ID + attempt): `noop` suppresses duplicate writes.

---

## 4. Live Measured Performance & Cost Baseline

Data collected across live verified runs on `Nikila99gimhan/session-beyond-failed-ci`:

| Metric | Run #8 (`36269620350`) | Run #11 (`36270882686`) | Run #13 (`36321908546`) | Target / Cap |
|---|---|---|---|---|
| **Triggering CI Run** | CI #9 (`36269573747`) | CI #13 (`36270836892`) | CI #15 (`36321854790`) | N/A |
| **Total Wall Time** | 302s (~5.0 min) | 355s (~5.9 min) | 377s (~6.2 min) | `< 10 min` |
| **Agent CLI Loop** | 67s | 138s | 148s | Bounded |
| **Threat Detection** | 52s | 45s | 53s | Bounded |
| **Agent AIC** | 21.56 AIC | 45.34 AIC | 45.70 AIC | `120 AIC max` |
| **Threat Detection AIC** | 8.21 AIC | 8.21 AIC | 7.54 AIC | Included |
| **Total Run AIC** | **29.77 AIC** | **53.55 AIC** | **53.24 AIC** | `120 AIC max` |
| **Tool Calls Made** | 7 calls | 21 calls (12 redundant) | **1 tool call** (add_comment) | `< 5 calls` |
| **Blocked Domains** | 0 blocked | 2 blocked (`api.github.com`) | **0 blocked** (cli-proxy) | `0 blocked` |
| **Safe Output Status** | Skipped (no wildcard) | Delivered (#4 comment) | **Delivered (#4 comment)** | `100% delivered` |

---

## 5. Emergency Break-Glass & Disablement (Kill Switch)

If the investigation agent experiences runaway latency, upstream model outages, or unexpected behavior:

### Option A: Repository Variable Kill Switch (Zero Code Changes)
1. Go to repository **Settings > Secrets and variables > Actions > Variables**.
2. Add or update variable:
   - **Name**: `DISABLE_CI_INVESTIGATOR`
   - **Value**: `true`
3. Effect: All subsequent failed CI runs immediately evaluate `if: ... && vars.DISABLE_CI_INVESTIGATOR != 'true'` to `false` in `pre_activation` and skip execution without launching containers or spending AI credits.
4. **The deterministic CI policy gate remains 100% active and continues enforcing security rules.**

### Option B: GitHub Actions UI Disable
1. Navigate to repository **Actions** tab.
2. Under Workflows, select **Governed CI Investigation Agent**.
3. Click the `...` menu and select **Disable workflow**.

---

## 6. Rollback Runbook

To revert to the initial baseline workflow or roll back changes:
```bash
# 1. Checkout main branch
git checkout main

# 2. Revert the workflow files to previous known-good commit
git checkout <COMMIT_SHA> -- .github/workflows/ci-investigator.md

# 3. Recompile the lockfile
gh aw compile --validate

# 4. Commit and push
git commit -m "revert: rollback ci-investigator workflow to <COMMIT_SHA>"
git push origin main
```
