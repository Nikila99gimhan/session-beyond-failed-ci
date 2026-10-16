# Registered sample consumers

These two local wrappers are an explicit sample inventory for the session. They do not discover other repositories, inspect Terraform state, or prove deployed Azure configuration.

| Consumer | Input to `hostingPlan.bicep` | Recorded requirement |
|---|---|---|
| `sample-explicit-zone` | Explicit `zoneRedundant: true` | `zoneRedundant` must be true |
| `sample-inherited-zone` | Omits `zoneRedundant` and inherits its default | `zoneRedundant` must be true |

The registry records wrapper digests, sample service references, and requirement `SAMPLE-ZONE-001`. This is a sample consumer contract, not a universal Azure rule. Its `sample-2026.1` version is independent of the organization's deployment-policy catalog version.

## What the check establishes

`scripts/assess-shared-module.ts` copies each trusted wrapper beside a baseline or candidate module in a temporary directory and compiles all four combinations with the real Bicep compiler. It reads the resulting nested ARM template and resolves only literal booleans and direct parameter references. It checks the emitted hosting-plan `zoneRedundant` property against the registered requirement.

For the automatic demo assessment, the baseline and candidate module must be byte-identical except for the single literal `param zoneRedundant bool = true` / `false` declaration. Any other edit produces `ERROR` and requires manual review. This narrow source check is deliberate: a privileged selector can verify the authenticated source bytes and the fixed caller inputs independently of an artifact produced by PR-controlled CI. It is not a generic Bicep interpreter or dependency-analysis engine.

The verifier rejects missing consumers, unsupported expressions, compilation failures, modified wrapper digests, mismatched source identity, module/registry/template digests, and inconsistent derived values. An incomplete assessment is never a pass.

## CLI

Prepare a baseline copy from the PR's recorded base SHA, then run in an **unprivileged** job:

```sh
node --import tsx scripts/assess-shared-module.ts \
  --baseline-module /tmp/baseline-hostingPlan.bicep \
  --candidate-module infra/modules/hostingPlan.bicep \
  --registry fixtures/shared-module-consumers/registry.json \
  --output shared-module-assessment.json \
  --templates-dir consumer-templates
```

Default compiler: `az bicep build --no-restore`. To use a direct Bicep binary, set `BICEP_BINARY` to its executable path. No shell evaluates the compiler command. No Azure deployment is attempted. External module restoration is disabled; additional dependencies outside this isolated module are unsupported.

In GitHub Actions, these source bindings are required: `GITHUB_REPOSITORY`, `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT`, `SOURCE_HEAD_SHA`, `GITHUB_SHA`, and `BASELINE_SHA`. The head SHA identifies the developer commit; tested SHA identifies the PR merge commit checked by CI; baseline SHA identifies the PR's recorded base.

Exit codes:

- `0`: both registered consumers satisfy the recorded requirement.
- `1`: complete evidence supports a consumer requirement violation.
- `2`: evidence is incomplete, unsupported, or invalid.

The artifact consists of `shared-module-assessment.json` and:

```text
consumer-templates/
  baseline/sample-explicit-zone.json
  baseline/sample-inherited-zone.json
  candidate/sample-explicit-zone.json
  candidate/sample-inherited-zone.json
```

`verifySharedModuleAssessment` is the trusted read-side API. It receives the report, authenticated baseline/candidate source bytes, the trusted registry bytes, source-run identity, and all four compiled template byte buffers. It recomputes the scoped values and bindings before model activation. Reading the artifact's claimed status alone is insufficient.

A real organization would need an authorized consumer inventory, pinned module versions, resolved deployment inputs, and appropriate deployment evidence. Those integrations are outside this demo.
