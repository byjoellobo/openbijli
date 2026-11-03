# Security policy

## Supported versions

OpenBijli is pre-1.0. Security fixes go into the latest release only.

| Version | Supported |
|---|---|
| 0.1.x (latest) | Yes |
| Older | No |

## Reporting a vulnerability

Please **do not** open a public issue, discussion or pull request for a security problem.

Report it privately through GitHub's private vulnerability reporting:

1. Go to the [Security tab](https://github.com/byjoellobo/openbijli/security) of the repository.
2. Choose **Report a vulnerability**, or open
   [a new advisory](https://github.com/byjoellobo/openbijli/security/advisories/new) directly.
3. Describe the issue, the affected component and version, steps to reproduce, and the impact
   you expect. A proof of concept helps, but please keep it minimal.

Only the maintainers can see the report. We will discuss the fix with you in the advisory and
credit you when it is published, unless you prefer to stay anonymous.

## What to expect

- **Acknowledgement** within 7 days.
- **Initial assessment** (confirmed, needs more information, or not a vulnerability) within
  14 days.
- **Fix or mitigation** as soon as practical, prioritised by severity. We aim to release fixes
  for high-severity issues within 30 days of confirmation.
- A **GitHub security advisory** and a release note once a fix is available.

This is a volunteer project, so timelines are goals rather than guarantees. We will keep you
informed if something takes longer.

## Scope

In scope:

| Component | Notes |
|---|---|
| Web app (`apps/web`) | Runs entirely in the browser and sends no user data anywhere. A Content-Security-Policy is set in the built page. Report anything that executes injected script, leaks entered data or bypasses the CSP. |
| Evidence engine (`packages/evidence`) | Parses untrusted Meter Sakshi logs and case files with strict validation, and renders HTML reports with every value escaped and a restrictive CSP. Report parser crashes on crafted input, escaping failures, or hash-chain verification that accepts an edited log. |
| Meter Sakshi firmware (`hardware/meter-sakshi/firmware`) | The device web server requires a PIN (salted and hashed, with lockout), checks the Host header against DNS rebinding, rejects cross-site POSTs and blocks framing. Report authentication bypasses, PIN brute-force paths, log tampering that survives export, or memory-safety bugs. |
| Bill engine and data packages | Report input that crashes the engine or makes it return a wrong bill silently instead of an error or warning. |
| CI workflows (`.github/workflows`) | Report ways for an untrusted pull request to obtain write tokens or secrets (the tariff review is split into an unprivileged and a privileged workflow for this reason). |

Out of scope:

- Wrong tariff numbers or outdated orders. Please use the
  [Wrong number or bill](https://github.com/byjoellobo/openbijli/issues/new?template=data-error.yml)
  issue form instead.
- Attacks that require physical access to an installed Meter Sakshi beyond what a household
  member already has, or that require modifying the electricity meter itself.
- Vulnerabilities in third-party dependencies without a demonstrated impact on OpenBijli
  (Dependabot tracks those; a report is still welcome if you are unsure).
- Missing security headers on GitHub Pages that GitHub does not allow us to set.

## Safety note

Meter Sakshi never opens, wires into or alters an electricity meter. A report that depends on
doing so is outside the project's design. See
[hardware/meter-sakshi/docs/safety-and-legal.md](hardware/meter-sakshi/docs/safety-and-legal.md).
