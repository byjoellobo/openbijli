# CI/CD

Everything runs on GitHub Actions. No secrets are required: deployments use GitHub's own
tokens, and npm publishing (off by default) uses OIDC trusted publishing.

## Workflows

| Workflow | File | Runs on | What it does | Permissions |
|---|---|---|---|---|
| CI | [`ci.yml`](../.github/workflows/ci.yml) | push to `main`, every pull request, manual | On Node 22 and 24: validates every tariff book and checks the committed JSON Schemas are current (`data:check`), type-checks, runs the unit tests with coverage (80% lines and functions required), builds every package and the web app, and smoke-tests both CLIs. A second job runs the Playwright browser tests (desktop and phone viewports, accessibility scan with axe) against the production build. Uploads the coverage report, and the Playwright report on failure. | `contents: read` |
| CodeQL | [`codeql.yml`](../.github/workflows/codeql.yml) | push to `main`, pull requests, Mondays, manual | Static security analysis of the TypeScript/JavaScript code and of the workflows themselves (`security-extended` queries). Results appear under Security, Code scanning. | `security-events: write` |
| Web app | [`pages.yml`](../.github/workflows/pages.yml) | push to `main`, manual | Builds the web app for `/openbijli/` and deploys it to GitHub Pages: https://byjoellobo.github.io/openbijli/ | `pages: write`, `id-token: write` |
| Release | [`release.yml`](../.github/workflows/release.yml) | push to `main`, manual with a tag | release-please keeps a `chore: release X.Y.Z` pull request up to date; merging it tags and publishes the GitHub Release, then the same run builds, attests and attaches the release assets and (if enabled) publishes to npm. See [releasing.md](releasing.md). | per job: `contents: write`, `pull-requests: write`, `id-token: write`, `attestations: write` |
| Meter Sakshi firmware | [`firmware.yml`](../.github/workflows/firmware.yml) | changes under `hardware/meter-sakshi/firmware/`, manual | Runs the native PlatformIO unit tests (SHA-256, record format, pulse filter) and compiles the ESP32 firmware. | `contents: read` |
| Tariff PR review | [`tariff-pr.yml`](../.github/workflows/tariff-pr.yml) | pull requests that touch `data/` | Validates the data on the untrusted PR code with a read-only token and writes a Markdown summary of every changed field and the bill impact at 100-500 units. | `contents: read` |
| Tariff PR comment | [`tariff-pr-comment.yml`](../.github/workflows/tariff-pr-comment.yml) | after Tariff PR review completes | Posts that summary as one sticky comment. Never checks out PR code; treats the summary as untrusted text (no mentions, HTML or images). | `pull-requests: write`, `actions: read` |
| Tariff season | [`tariff-season.yml`](../.github/workflows/tariff-season.yml) | 1st and 15th of each month, manual | Checks which tariff books are due a new financial year and keeps one "Tariff season checklist" issue up to date, closing it when everything is current. | `issues: write` |
| Dependabot | [`dependabot.yml`](../.github/dependabot.yml) | weekly | Grouped pull requests for GitHub Actions (`ci(deps)`) and npm minor/patch updates (`chore(deps)`). | n/a |

Every workflow starts from `contents: read` and grants more only to the job that needs it.
Third-party code never runs with a write token: pull request workflows are read-only, and the
privileged comment workflow does not execute anything from the pull request.

## Repository settings

Apply these once after creating the repository (Settings):

| Setting | Value |
|---|---|
| Pages, Source | GitHub Actions |
| Actions, General, Workflow permissions | Read repository contents by default, and tick "Allow GitHub Actions to create and approve pull requests" (release-please opens the release pull request) |
| General, Pull Requests | Allow squash merging only; use the pull request title as the commit message |
| General, Features | Enable Issues and Discussions |
| Code security | Enable private vulnerability reporting, Dependabot alerts and security updates, secret scanning and push protection |
| Environments | `github-pages` (created by the first Pages deploy). `npm-release` with required reviewers, only when npm publishing is enabled |
| Rules, branch ruleset for `main` | Require a pull request, require status checks to pass, block force pushes and deletions |
| Rules, tag ruleset for `v*` | Restrict creation, update and deletion to maintainers |

Required status checks for `main` (job names as GitHub shows them):

- `Test (Node 22)`
- `Test (Node 24)`
- `Browser tests (Playwright)`
- `Analyze (javascript-typescript)`
- `Analyze (actions)`

Leave `build` (firmware) and `review` (tariff data) optional: they only run when their paths
change, and a required check that never runs blocks the merge.

## Labels

The issue forms and workflows use these labels:

| Label | Used by |
|---|---|
| `bug` | Bug report form |
| `enhancement` | Feature request form |
| `data-error` | "Wrong number or bill" form |
| `tariff-data` | "New tariff order published" form |
| `tariff-season` | Tariff season workflow (the checklist issue) |
| `good first issue` | Suggested starting points for new contributors |
| `autorelease: pending`, `autorelease: tagged` | Created and managed by release-please on its release pull requests |

## Variables and secrets

| Name | Kind | Needed | Purpose |
|---|---|---|---|
| `NPM_PUBLISH` | repository variable | optional | Set to `true` to let the Release workflow publish to npm (see [releasing.md](releasing.md)). |
| `RELEASE_PLEASE_TOKEN` | secret | optional | Fine-grained token (contents and pull requests: read/write) so the release pull request triggers CI. Without it, close and reopen that pull request to run the checks. |

No secrets are required. `GITHUB_TOKEN` is provided by Actions.

Required checks and the release pull request: a pull request opened with `GITHUB_TOKEN` does
not start other workflows, so the required checks above never report on it. Add
`RELEASE_PLEASE_TOKEN`, or close and reopen the release pull request, before merging.

## Running the same checks locally

```bash
npm ci
npm run data:check
npm run typecheck
npm run test:coverage
npm run build
npx playwright install chromium   # once
npm run test:e2e
```
