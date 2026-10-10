# Green policy change gap demo

This branch is a test-only proposal. It changes the sample organization's approved production SKU set from `EP1` to `EP1` plus `EP2` at policy version `2026.3`. It does not grant a real FinOps approval.

The normal `infra/parameters/active.json` fixture still requests `EP1`, so the deterministic deployment check stays green. The illustrative `infra/parameters/illustrative-consumer-ep2.json` requests `EP2`: it failed `POL-AZ-SKU-003` against the `2026.2` main catalog and passes against this proposed catalog. That is a real before/after result for this **one sample consumer**, not evidence about other repositories or deployed resources.

## Expected live result

1. Open this branch as a draft PR against `main` to trigger the existing CI workflow.
2. Verify Application Tests, Bicep Validation, and Deployment Policy Check pass.
3. Verify the failure-only investigator does not investigate the successful CI run. Its current activation condition requires `conclusion == 'failure'`; its branch allowlist also does not contain this scenario branch.
4. Keep the PR unmerged. The green status proves the current local checks pass, but provides no inventory or impact assessment for other policy consumers.

This scenario demonstrates the current routing gap. It does not add an impact detector, a new investigator trigger, or a production policy approval.
