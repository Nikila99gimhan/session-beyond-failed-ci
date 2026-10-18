# Security

This is a session reference implementation. Its policy catalog, ownership details and registered consumers are samples. It is not a hosted enterprise policy or authorization service.

## Report a vulnerability privately

Use GitHub's **Report a vulnerability** option under this repository's **Security** tab if private vulnerability reporting is enabled. If it is unavailable, use a contact method published on the [maintainer's GitHub profile](https://github.com/Nikila99gimhan) to request a private reporting channel. Do not post exploit details, tokens or sensitive logs in a public issue.

Include the affected revision, component, reproduction steps, expected security boundary and likely impact. Redact credentials and identifying information. There is no promised response SLA; this project is maintained as a community session example.

If you find a real exposed credential, notify its owner so they can revoke or rotate it. Removing a file or branch does not remove the credential from Git history, logs, artifacts, forks or other copies.

## Boundaries to preserve

- Required deterministic checks own merge eligibility. AI report delivery never grants an exception or approves a deployment.
- Privileged investigations execute trusted default-branch automation and accept only eligible same-repository PR runs. PR-controlled evidence must remain data, not executable automation in the privileged path.
- The agent's GitHub read path and the restricted publishing jobs have different responsibilities. A separate broad token can bypass job-level permission limits; audit effective token scopes.
- Never commit environment files, private keys, Terraform state/plans or real organizational policy/contact data. Avoid sensitive information in Actions artifacts and published investigation output.
- Keep the demo MCP service inside its intended worker/local boundary. Request scope filtering does not provide caller-bound authorization.

See the [operating runbook](docs/OPERATING-RUNBOOK.md) for the investigation kill switch and operational checks.
