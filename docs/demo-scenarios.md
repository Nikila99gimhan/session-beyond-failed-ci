# Session demo scenarios

These two examples show what an investigation adds to deterministic CI. The first explains independent build and policy failures. The second explains an inherited consumer requirement failure that the root application's checks do not reveal.

All checks are offline. No command in this guide provisions Azure resources. The sample policies and registered consumers are teaching fixtures, not a production organization inventory.

## Before starting

Use a clean checkout of the repository with the workflows installed on `main`. Install Node.js 20.19+, 22.12+, or 24+, Git and Azure CLI with Bicep, or use a direct Bicep compiler through `BICEP_BINARY` for the local verifier. GitHub must have the documented inference credential and required-check configuration before a hosted investigation can run; see the [operating runbook](OPERATING-RUNBOOK.md).

Run the deterministic examples locally without starting a model or creating GitHub issues:

```sh
npm ci
npm test
npm run typecheck
npm run verify:session-demos
```

The verifier creates intentional defects in a temporary directory and uses real Bicep compilation and the policy validator. It checks that fixing one of the first scenario's failures leaves the other failure intact, and that the shared default affects the registered inherited consumer. It does not invoke the hosted agent, threat detection or publishing jobs.

For a live demonstration, prepare each example on a separate branch from clean `main`. **Leave the intentional failures unmerged.** You can correct the defects on those branches later and merge only after the required checks pass and a human has reviewed the change.

## Expected results

| Signal | Scenario 1: build and policy | Scenario 2: shared default |
| --- | --- | --- |
| Application Tests | Pass | Pass |
| Bicep Syntax & Template Validation | Fail at compilation | Pass |
| Deployment Policy Check | Fail on public ingress | Pass |
| CI Registered Consumer Assessment | Module unchanged; no consumer assessment needed | Records a complete consumer requirement finding; this evidence job stays green |
| Required Shared Module Safety Gate | Pass; registered hosting module unchanged | Fail; inherited consumer no longer satisfies its requirement |
| Investigation | Failed-CI investigation | Selective shared-module investigation after successful baseline CI |
| Merge | Blocked by failed required CI checks | Blocked by the required consumer safety gate |

## Scenario 1: build compatibility and independent policy failure

A developer renames the network module's `outboundSubnetId` output to `functionSubnetId` without changing the caller. Application tests still pass, but the real Bicep compiler identifies the missing output. Separately, production parameters enable public ingress and violate sample rule `POL-AZ-NET-001`.

### Prepare a developer branch

Start with no uncommitted changes. Use a new branch name if the example already exists.

```sh
git switch main
git pull --ff-only
git switch -c feature/function-network-settings

node --input-type=module <<'JS'
import fs from 'node:fs';
const file = 'infra/modules/network.bicep';
const source = fs.readFileSync(file, 'utf8');
if (!source.includes('output outboundSubnetId string')) {
  throw new Error('Expected baseline network output is missing');
}
fs.writeFileSync(file, source.replace('output outboundSubnetId string', 'output functionSubnetId string'));
const parametersFile = 'infra/parameters/active.json';
const parameters = JSON.parse(fs.readFileSync(parametersFile, 'utf8'));
parameters.parameters.publicNetworkAccess.value = 'Enabled';
fs.writeFileSync(parametersFile, JSON.stringify(parameters, null, 2) + '\n');
JS

git diff --check
git diff -- infra/modules/network.bicep infra/parameters/active.json
git add infra/modules/network.bicep infra/parameters/active.json
git commit -m "Update function networking settings"
git push -u origin feature/function-network-settings
```

Pushing this branch alone starts no repository CI scan. **Open the PR to `main` manually when ready to demonstrate the run.** Opening, updating or reopening that PR starts the checks.

### What to show

1. Application tests pass. The compiler reports the actual missing output diagnostic and its caller. The offline network preflight is skipped because compilation failed; this is not an Azure deployment error.
2. The independent policy job still runs, records `Enabled` versus expected `Disabled`, and uploads its evidence.
3. Failed `CI` activates the governed investigator for an eligible same-repository PR. Its `CI Investigation` check appears asynchronously after CI completes.
4. The delivered issue separates both causes, cites the evidence, and proposes one correction per finding. A managed PR comment links the verified report. The original required CI failures keep merging blocked.

### Correction and verification

Restore `output outboundSubnetId string` in the module, or deliberately update every caller consistently. Restore `publicNetworkAccess` to `Disabled` in `infra/parameters/active.json`. Check the corrections independently:

```sh
npm test
az bicep build --file infra/main.bicep --outfile compiled-template.json
npm run validate:policy
```

These compiler and policy commands are independent checks. While demonstrating the defect, each is expected to fail for its own reason. After both corrections, commit and push to the existing PR to start a fresh CI run. A successful investigation report alone does not satisfy either failed required check.

## Scenario 2: shared default and a registered consumer

The root deployment explicitly supplies `zoneRedundant: true`. A different registered consumer omits that input and inherits the shared module default. Changing only the default to `false` therefore leaves the root build and deployment policy checks green while breaking that consumer's recorded requirement, `SAMPLE-ZONE-001`.

### Prepare a separate developer branch

Return to clean `main`; do not branch from Scenario 1.

```sh
git switch main
git pull --ff-only
git switch -c feature/hosting-plan-default

node --input-type=module <<'JS'
import fs from 'node:fs';
const file = 'infra/modules/hostingPlan.bicep';
const source = fs.readFileSync(file, 'utf8');
if (!source.includes('param zoneRedundant bool = true')) {
  throw new Error('Expected safe baseline default is missing');
}
fs.writeFileSync(file, source.replace('param zoneRedundant bool = true', 'param zoneRedundant bool = false'));
JS

git diff --check
git diff -- infra/modules/hostingPlan.bicep
git add infra/modules/hostingPlan.bicep
git commit -m "Update hosting plan defaults"
git push -u origin feature/hosting-plan-default
```

Open this PR to `main` manually. Baseline `CI` and the separate **Shared Module Safety** workflow start together.

### What to show

1. The root application tests, build and policy checks pass because the root still supplies its explicit safe value.
2. The CI consumer assessment compiles two registered wrappers against baseline and candidate module bytes. The explicit consumer stays `true`; the inherited consumer becomes `false`. The CI evidence job records the finding without turning the whole baseline `CI` workflow red.
3. The separate required **Shared Module Safety Gate** preserves the assessor's finding exit code and fails. The PR remains blocked while the explanation is being generated and after it is delivered.
4. Successful baseline `CI` enters a trusted selector. It checks authenticated source revisions, registered consumers, effective values and artifact bindings before starting the shared-module agent. Unchanged modules and passing consumers do not use the model. An exact previously delivered occurrence can recover its report link without another model run.
5. The issue explains inheritance and recommends restoring the default or making an explicitly reviewed caller correction. `Shared Module Review` success means the explanation was delivered; it does not waive the requirement.

### Correction and limits

Restore `param zoneRedundant bool = true`, commit, and push to the existing PR. Confirm the required consumer gate passes before considering a merge.

The automatic assessment supports only this literal boolean default change with the rest of the module unchanged. Other edits or incomplete evidence require manual review and block the required gate. This example has two registered local consumers; it does not discover other repositories, read Terraform state or verify live Azure configuration. See the [consumer fixtures](../fixtures/shared-module-consumers/README.md) and [merge gate](shared-module-merge-gate.md).

## Reading the result

Look for distinct causes, the exact source revision and run attempt, cited evidence, concrete code corrections, verification commands, and explicitly stated unknowns. If the issue is missing, do not substitute a hand-written report for a successful workflow demonstration: inspect activation, source selection, detection, controlled delivery and PR publication in the [runbook](OPERATING-RUNBOOK.md).
