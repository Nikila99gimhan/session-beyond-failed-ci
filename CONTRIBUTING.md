# Contributing

Keep changes focused on the session's two investigation examples and their security boundaries. Use synthetic data and propose a separate discussion before extending the project into a deployment or organization-wide inventory platform.

## Local checks

Use Node.js 20.19+, 22.12+, or 24+. For compiler and consumer checks, install Azure CLI with Bicep or set `BICEP_BINARY` to a standalone Bicep executable as described in the [README](README.md).

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run validate:policy
npm run verify:session-demos
```

The demo verifier exercises intentional defects in a temporary directory. Add or update meaningful tests when changing behavior, especially evidence bindings, output destinations, scope selection or gate enforcement. Documentation-only edits do not need new tests.

## Workflow changes

Edit `.github/workflows/ci-investigator.md` or `.github/workflows/shared-module-investigator.md`, then compile with the version recorded in the generated workflow headers (currently gh-aw v0.89.21):

```sh
gh aw compile ci-investigator shared-module-investigator --strict
```

Commit each changed Markdown source with its generated `.lock.yml`; review permissions, triggers, token overrides, network access, model budgets and output handlers in the generated diff. Avoid unrelated compiler upgrades in a small workflow fix.

Preserve the required deterministic CI checks, the trusted base/default-branch execution boundary, same-repository investigator eligibility, and controlled publishing. A successful report must never waive a consumer requirement finding.

## Pull requests and paid runs

- Start from clean `main`, describe the behavior changed and provide the checks you actually ran. Separate local verification from hosted agent-run evidence.
- Opening or updating a PR can start CI and, when eligible and enabled, a paid investigation. Coordinate live inference or repeated rehearsals with the maintainer; do not add automatic paid test loops.
- Keep intentional failing examples on dedicated demo branches. Do not merge a known defect into the baseline to make a demonstration easier.
- Do not include credentials, private policy data, presenter notes, generated evidence or personal filesystem paths. Follow [SECURITY.md](SECURITY.md) for sensitive reports.

Contributions are provided under the repository's [MIT license](LICENSE).
