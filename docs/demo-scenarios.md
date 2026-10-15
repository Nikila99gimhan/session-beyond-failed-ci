# Demo Scenarios & Rehearsal Runbook

This guide details the five experimental scenarios defined in the workshop plan, the exact commands to run each scenario, the expected CI results, and the investigator agent behavior.

For live runs, create a branch from `main`, commit the chosen fixture, and open a PR to `main`. Subsequent commits on the open PR run CI again. Branch creation and pushes without a PR do not run CI. Investigation activates only after failed same-repository PR CI. See [PR flow and activation](pr-investigation-flow.md); the workflow changes must first be merged into `main`.

---

## Scenario Matrix

| Scenario | Trigger / State | Expected CI Outcome | Investigator Agent Action |
|---|---|---|---|
| **A: Compliant Baseline** | `infra/parameters/compliant.json` | All checks pass (Green) | Does not run (`conclusion == success`) |
| **B: Policy Regression** | `infra/parameters/noncompliant.json` | `deployment-policy` fails with 4 violations | Runs; creates one handoff issue citing all four policy rules, owning team, and resolution options |
| **C: Unrelated Failure** | Failing test in `tests/hello.test.ts` | `application-tests` fails; independent policy check passes with compliant parameters | Runs; classifies as `CODE_OR_TEST_FAILURE`; avoids policy diagnosis |
| **D: Missing Policy Context** | MCP server policy endpoint simulated outage | `deployment-policy` fails | Runs; notes missing policy context under "Missing Evidence & Unknowns"; does not hallucinate policy |
| **E: Repeated Failure** | Repeat of Scenario B on same branch/PR | Same 4 violations | Updates existing issue or references prior run; avoids issue spam |

---

## Scenario Walkthroughs

### Scenario A — Compliant Baseline

1. **Activate Fixture**:
   ```bash
   npm run scenario:compliant
   ```
2. **Execute Local Validation**:
   ```bash
   npm test
   npm run validate:policy
   ```
3. **Observed Outcome**:
   - `hello.test.ts` passes.
   - `policy-checker.test.ts` passes.
   - `validate:policy` outputs:
     ```text
     [POLICY-CHECK:PASS] All 4 deployment policies satisfied for infra/parameters/active.json (Policy v2026.2).
     ```
   - Exit code: `0`.
   - In GitHub Actions: `CI` workflow is fully green. `ci-investigator` workflow is skipped or takes no action.

---

### Scenario B — Policy Regression (Core Workshop Demo)

1. **Activate Fixture**:
   ```bash
   npm run scenario:regression
   ```
2. **Execute Policy Check**:
   ```bash
   npm run validate:policy
   ```
3. **Observed Outcome**:
   - Policy checker exits with code `1`.
   - CLI output highlights four distinct violations:
     - `POL-AZ-NET-001`: `publicNetworkAccess` is `Enabled` (expected `Disabled`).
     - `POL-AZ-SKU-003`: `appServicePlanSku` is `EP3` (expected `EP1`).
     - `POL-AZ-AUTH-004`: `enableAuthentication` is `false` (expected `true`).
     - `POL-AZ-PRIV-005`: `enablePrivateNetworking` is `false` (expected `true`).
   - Machine-readable `policy-result.json` is generated.
4. **Investigator Agent Triage**:
   - Triggers on `workflow_run` failure.
   - Downloads `policy-result.json`.
   - Calls `get_investigation_context` for the four violated rules, ownership, and approved SKUs.
   - Identifies:
     - Owning team: **Cloud Platform Engineering** (`#cloud-platform-security`).
     - Cost delta: EP3 (~$580/mo) vs EP1 (~$145/mo).
     - Network exposure: Unrestricted public ingress on production workload.
   - Emits `create-issue` with clear human handoff options.

---

### Scenario C — Unrelated Application Failure

1. **Simulate Test Failure**:
   Edit `tests/hello.test.ts` or set an environment flag causing a test assertion failure.
2. **Execute Validation**:
   ```bash
   FAIL_APP_TEST=true npm test
   ```
3. **Observed Outcome**:
   - `application-tests` job fails.
   - `deployment-policy` runs independently and passes with compliant parameters.
4. **Investigator Agent Triage**:
   - Classifies run as `CODE_OR_TEST_FAILURE`.
   - Identifies the assertion failure stack trace.
   - Explicitly confirms deployment policy was not the cause.

---

### Scenario D — Missing Context / Degraded MCP

1. **Simulate MCP Dependency Outage**:
   The policy repository fixture includes `simulateUnavailable: true` support.
2. **Investigator Agent Triage**:
   - When calling `get_approved_skus` or `get_deployment_policy`, receives `DEPENDENCY_UNAVAILABLE` envelope.
   - The agent documents the outage under `Missing Evidence & Unknowns`:
     > "Policy registry service temporarily unavailable. SKU approval status could not be verified against catalog."
   - Refrains from guessing whether EP3 has an active waiver.

---

### Scenario E — Repeat Failure

1. **Trigger Repeat Run**:
   Rerun failed CI on an open PR, or push a new commit to that PR. Reruns are distinct source attempts; a push without an open PR does not run CI.
2. **Investigator Agent Triage**:
   - Checks existing open issues in the repository for matching run tags / commit SHA.
   - Consolidates or comments on existing thread rather than creating duplicate notifications.

---

## Reset Commands

To quickly reset back to clean baseline:
```bash
npm run scenario:compliant
npm test
npm run validate:policy
```
