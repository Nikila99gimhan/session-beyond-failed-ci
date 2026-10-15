# PR scans and investigation

1. Create a branch from `main` and commit the change. Pushing without a PR does not start CI.
2. Open a PR to `main` (draft PRs are included). CI runs application tests, Bicep compilation with an offline network preflight, and the independent organization policy check.
3. A newer commit on that open PR starts CI again and cancels any older CI still running for the same PR. Reopening the PR also runs CI. Changing only the PR description does not.
4. Failed CI from a same-repository PR activates the investigator. Green or canceled CI does not. The kill switch, trusted default-branch automation, read-only agent permissions, detection, and separate controlled issue writer remain in place. Fork PRs receive CI checks but cannot activate the privileged investigator.
5. The investigator verifies both evidence sets, examines every failed job, retrieves source diffs through the GitHub API, and reports independent infrastructure and policy causes in a findings table. Missing evidence produces a partial investigation with an explicit unknown.

The infrastructure artifact records resolved subnet operations, input digests, source PR head and tested merge SHA. The policy bundle separately records source PR head and tested checkout SHA. A digest alone does not authenticate the source; the investigator must also verify run/repository/attempt and checkout identity. The offline preflight performs no Azure provisioning.

## Activation and demo

The `workflow_run` investigator must be installed on `main` to take effect. Merge only the clean workflow PR after its checks pass. PR #10 contains intentional Bicep and EP3 defects and must remain unmerged. After installing the workflow, update that test branch with the approved automation and push one new commit to its open PR to exercise the improved investigation.

PR #10's earlier Issue #11 is a historical partial result: it diagnosed the SKU violation but did not inspect the provisioning artifact. Its existing narrative must not be rewritten to suggest the earlier agent completed that investigation.
