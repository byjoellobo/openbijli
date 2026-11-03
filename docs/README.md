# OpenBijli documentation

Start with the [project README](../README.md) for an overview and quick start.

## Understanding OpenBijli

| Document | What it covers |
|---|---|
| [architecture.md](architecture.md) | Monorepo layout, package dependencies, data flow, the bill pipeline, the evidence chain and the security model |
| [methodology.md](methodology.md) | How bills, solar sizing and evidence are calculated, and where they simplify |
| [data-model.md](data-model.md) | How a tariff order is encoded as a tariff book, with ground rules and validation |

## Working on the project

| Document | What it covers |
|---|---|
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Development setup, Conventional Commits, pull requests, tariff data in five steps |
| [tariff-update-workflow.md](tariff-update-workflow.md) | The yearly tariff season: calendar, making the change, the bot comment, review checklist |
| [ci-cd.md](ci-cd.md) | Every GitHub Actions workflow: what triggers it, what it checks or deploys |
| [releasing.md](releasing.md) | Versioning policy, release-please, tags, GitHub Releases and npm publishing |
| [../CHANGELOG.md](../CHANGELOG.md) | What changed in each release |

## Packages

| Package | README |
|---|---|
| `@openbijli/data` | [packages/data/README.md](../packages/data/README.md) |
| `@openbijli/engine` (CLI `openbijli`) | [packages/engine/README.md](../packages/engine/README.md) |
| `@openbijli/evidence` (CLI `meter-sakshi`) | [packages/evidence/README.md](../packages/evidence/README.md) |
| Tariff data files | [data/README.md](../data/README.md) |

## Meter Sakshi hardware

| Document | What it covers |
|---|---|
| [hardware/meter-sakshi/README.md](../hardware/meter-sakshi/README.md) | Parts, wiring, build and flash, installation, device security |
| [hardware/meter-sakshi/docs/log-format.md](../hardware/meter-sakshi/docs/log-format.md) | The log and hash-chain specification, with test vectors |
| [hardware/meter-sakshi/docs/safety-and-legal.md](../hardware/meter-sakshi/docs/safety-and-legal.md) | Installation rules and what is out of scope |

## Project policies

| Document | What it covers |
|---|---|
| [../SECURITY.md](../SECURITY.md) | How to report a vulnerability privately |
| [../CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) | Contributor Covenant 2.1 |
| [../SUPPORT.md](../SUPPORT.md) | Where to ask questions and report wrong numbers |
| [../CITATION.cff](../CITATION.cff) | How to cite OpenBijli |
| Licences | Code [MIT](../LICENSE), data [CC BY 4.0](../data/LICENSE.md), hardware [CERN-OHL-P-2.0](../hardware/LICENSE.md) |
