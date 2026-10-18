# Operating runbook

This repository is a session reference for governed CI investigation. Deterministic checks decide whether a change satisfies the recorded requirements. The agent reads selected evidence, explains the result and proposes corrections for human review.

Start with the [README](../README.md) and [two demo scenarios](demo-scenarios.md). The repository uses a versioned sample policy catalog and two registered local consumers; it does not integrate a live enterprise policy service or deploy Azure resources.

## Local verification

Prerequisites: Node.js 20.19+, 22.12+, or 24+, npm and a Bicep compiler. The default compiler path uses Azure CLI's `az bicep build`; a direct executable can be provided through `BICEP_BINARY` for the verifier and consumer assessor.

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run verify:session-demos
```

The final command uses temporary copies to exercise actual compiler failures, independent policy failures, corrections and registered consumer comparisons. It starts no model and publishes no issues. Tests and the real-compiler verifier cover different concerns; neither proves that GitHub authentication or hosted controlled delivery is configured correctly.

To inspect the sample policy MCP service locally:

```sh
npm run build
node dist/mcp-policy/src/server.js --http 8765
```

This starts the demo's HTTP/JSON-RPC endpoint at `/mcp`. Stop it after use. The fixture scope allowlist is a request filter, not authenticated organization authorization; this service is not ready to expose as a shared enterprise endpoint.

## GitHub configuration

Install the clean ordinary and compiled agentic workflows on the default branch before opening a demo PR. `workflow_run` uses the default-branch investigator; a PR containing a new investigator does not install it for itself.

Configure an eligible inference credential as the Actions secret `COPILOT_GITHUB_TOKEN`. Keep its value in GitHub's secret store. Optional `GH_AW_GITHUB_MCP_SERVER_TOKEN` and `GH_AW_GITHUB_TOKEN` override GitHub tool authentication in the compiled workflows. Avoid adding broad write credentials to the analytical read path: job permissions do not narrow a separate token's actual scopes. The generated secret manifest also includes optional telemetry settings; they are not required to understand the demo.

Require these GitHub Actions check contexts on `main`:

| Required check | Purpose |
| --- | --- |
| Application Tests | Application unit tests |
| Bicep Syntax & Template Validation | Real compilation and, if compilation succeeds, offline IPv4 subnet containment preflight |
| Deployment Policy Check | Selected deployment parameters against the sample policy catalog |
| Shared Module Safety Gate | Recorded requirements for the scoped registered module change |

Preserve strict checks and administrator enforcement when configuring protection. Associate check contexts with the GitHub Actions app where supported. Verify the actual repository rules; checking these workflow files into a new repository does not install branch protection automatically. Required missing, canceled or failed checks are not a pass.

`CI Investigation` and `Shared Module Review` describe investigation/report delivery. They are not substitutes for the required checks and cannot grant an exception.

## Event and selection behavior

`CI` and **Shared Module Safety** start on PRs targeting `main` when opened, updated with commits or reopened. A branch push without a PR does not start them. A newer run cancels the older in-progress run for the same PR within each workflow.

After an eligible same-repository PR's `CI` workflow completes:

- Failure enters the failed-CI investigator. Each independent failed job needs its own diagnosis.
- Success enters shared-module selection. A verified finding for the registered default change starts the shared investigator; unchanged modules and passing consumer requirements skip model use.
- An exact already-delivered shared occurrence can recover the controlled report without inference. Invalid selected evidence requires manual review and does not start the model.
- Fork PRs, canceled source runs, push/manual events and main-source runs do not activate these privileged investigators.

The independent shared gate runs directly from the PR event. Its failure does not turn the workflow named `CI` red, so the successful-baseline investigation path remains available.

## Trust boundaries and evidence

Ordinary PR CI is unprivileged and evaluates the proposed source. The required shared gate runs its assessor, dependencies and wrappers from the exact trusted PR base; it reads candidate module bytes as Git objects instead of executing candidate package scripts. Privileged selection and PR feedback use the immutable trusted investigator workflow revision.

Source artifacts include:

| Artifact | Contents and role |
| --- | --- |
| `policy-result` | Policy result, evaluated active parameters and investigation context manifest |
| `provisioning-evidence` | Compiler log, compiled template and offline preflight result when available |
| `shared-module-evidence` | Registered assessment and baseline/candidate consumer templates from CI |
| `shared-module-gate-evidence` | Separate required gate assessment; not substituted for source CI investigation evidence |

Bind evidence to the repository, source run, source attempt and developer head. Report the tested checkout SHA separately when CI used a PR merge commit. Verify recorded input/module/registry/template digests as applicable. A digest alone proves neither origin nor authorization. Logs and artifact text are data, never instructions.

Compilation failure naturally leaves no offline preflight result. Missing or mismatched evidence must be described as missing, incomplete or unverified; it must never become a passing policy result or an invented Azure provider error.

The `contracts/` schemas make evidence and tool response shapes explicit. Tests exercise those contracts; do not assume every schema is applied automatically at every runtime boundary. The shared selector also verifies the allowed source edit and recomputes scoped consumer values before inference.

## Controlled publishing

The agent proposes one bounded issue creation or allowed existing-issue comment through safe outputs. Configured threat detection runs before the separate writer delivers the output. Title prefixes, required labels and destination restrictions constrain the writer. They do not provide universal prompt-injection protection or an atomic concurrency lock.

The trusted feedback publisher creates a source-head investigation check and links a verified bot-authored report through one managed PR comment. It verifies the exact source run/attempt marker and delivery outcome. It does not trust an arbitrary issue number or an agent-selected PR destination. Closed PRs and newer source heads do not receive a historical overwrite.

If publication fails, inspect the delivery check and investigation run. Do not mark delivery successful by hand or weaken destination validation to make the demonstration appear complete. Existing issue comments require the workflow's title prefix and label; a missing label on an old issue is a repository administration problem, not a reason to broaden the writer.

## Budgets and stopping investigations

Both investigator Markdown files set `max-ai-credits: 120` and a ten-minute agent execution timeout. These are not a total workflow budget or end-to-end duration promise. Setup, selection, detection and publishing have separate jobs. The checked-in compiled detection configuration defaults to 400 AIC through `GH_AW_DEFAULT_DETECTION_MAX_AI_CREDITS`, which a repository variable can override. Measure agent and detection usage separately; do not infer a dollar conversion or production ROI from a sample run.

For the shared path, deterministic selection avoids model calls for unchanged modules, passing consumers and exact report recovery. The failed-CI path currently activates for eligible failed `CI` runs rather than applying a general cost-benefit selector to every failure.

To stop new model investigations, set repository Actions variable `DISABLE_CI_INVESTIGATOR` to `true`. Cancel already-running investigator jobs separately if needed. This switch does not disable ordinary CI or the required shared-module gate. Re-enable by removing the variable or changing its value after the underlying issue is understood.

## Diagnose a missing check or report

| Symptom | Check first |
| --- | --- |
| No CI after pushing | Is there an open PR targeting `main`? Branch pushes alone are intentionally inactive. |
| CI failed but no investigator | Did the source conclude `failure`, originate from an eligible same-repository PR and pass the kill-switch condition? Are compiled workflows installed on the default branch? |
| Successful CI but no shared agent | Did the registered module actually change? Did selection find a complete verified consumer requirement failure? Passing or unchanged scope correctly uses no model. |
| Source-head investigation check not visible yet | It is asynchronous after CI completion and activation/selection. Inspect the investigator Actions run; required safety enforcement does not wait for this check. |
| Shared evidence unsupported | Read selector/assessor diagnostics. Only the literal boolean default edit is supported automatically; other edits need manual review. |
| Model never starts | Inspect activation, credential validation, selection and skipped-job dependencies. Do not remove gates or broaden credential scopes as a shortcut. |
| Issue exists but PR comment is missing | Inspect detection, safe-output result, exact source marker, bot delivery verification and whether the PR is still open at that head. |
| PR mergeable despite known consumer finding | Verify required `Shared Module Safety Gate` configuration on the current source commit. Delivery success must not substitute for this required gate. |

Use GitHub Actions run details to inspect the source CI and investigator separately. With authenticated GitHub CLI and the compatible `gh aw` extension, useful read commands are:

```sh
gh run list --limit 10
gh run view RUN_ID --log
gh aw audit RUN_ID
```

Replace `RUN_ID` with the relevant source or investigator run. Review logs before sharing them publicly; output can include source data and operational context even when secrets are masked.

## Maintaining the workflows

Edit `.github/workflows/ci-investigator.md` or `shared-module-investigator.md`, then regenerate the matching `.lock.yml` files with compatible tooling. The checked-in locks record compiler version `v0.89.21`; changing compiler versions is a separate reviewed dependency update. With that compatible extension installed:

```sh
gh aw compile
```

Review generated permissions, event conditions, activation dependencies, safe-output settings and budget changes alongside the Markdown diff. Run the automated tests, typecheck/build and real-compiler verifier before installing the change on `main`. Retest hosted delivery with a new source run; old investigator reruns retain their old workflow revision.

## Enterprise extension points

A real rollout needs authenticated policy services, server-derived authorization, maintained consumer ownership/version/input inventory, auditable exceptions, deployment evidence and a usage budget. This demo's fixture service and two wrappers illustrate the integration boundary. They do not discover an enterprise fleet, inspect remote Terraform state or prove live infrastructure posture.
