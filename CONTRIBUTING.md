# Contributing to OpenBijli

Thank you for helping keep Indian electricity tariffs open and correct. Please follow the
[Code of Conduct](CODE_OF_CONDUCT.md) in every issue, discussion and pull request.

## Ways to help

- **New tariff order or FPPCA notice:** open a "New tariff order published" issue, or better,
  a pull request with the new book (see below).
- **Wrong number:** open a "Wrong number or bill" issue with your bill's line items (remove
  your name, account number and address) or the page of the order.
- **New utility:** add it to an existing book if its regulator's tariff already applies,
  otherwise create a new book.
- **Code and hardware:** issues and pull requests welcome. Keep the rule: the device never
  opens, wires into or alters the meter.
- **Docs and translations:** clearer explanations for households are always welcome.

Not sure where to start? Ask in [Discussions](https://github.com/byjoellobo/openbijli/discussions)
or look for issues labelled `good first issue`.

## Development setup

You need Node.js 22.12 or later and Git. PlatformIO is only needed for firmware work.

```bash
git clone https://github.com/byjoellobo/openbijli.git
cd openbijli
npm install

npm run typecheck          # strict TypeScript across packages and scripts
npm test                   # builds the catalog from data/, then runs every unit test
npm run test:coverage      # same, with coverage (80% lines/functions required)
npm run build              # builds the packages and the web app
npm run dev                # web app on http://localhost:5173

npx playwright install chromium   # once, before the first browser test run
npm run test:e2e           # Playwright browser tests of the web app
```

`npm test`, `npm run typecheck`, `npm run build` and `npm run dev` all regenerate the bundled
catalog (`packages/data/src/generated/`) from `data/` first, so the app and tests always use the
data in your working tree.

## Branches, commits and pull requests

1. Fork the repository and create a branch from `main` (for example `data/ka-kerc-2027-28` or
   `fix/tod-scaling`).
2. Make focused commits. Keep unrelated changes in separate pull requests.
3. Run `npm run typecheck`, `npm test` and, for web app changes, `npm run test:e2e`.
4. Open a pull request against `main`. Use the **tariff-update** template for data changes
   (append `?template=tariff-update.md` to the compare URL); otherwise the default template
   applies.
5. CI must pass and a maintainer must approve. Pull requests are squash-merged, so the pull
   request title becomes the commit message on `main`.

### Conventional Commits

Commit messages and pull request titles must follow
[Conventional Commits](https://www.conventionalcommits.org/), because
[release-please](https://github.com/googleapis/release-please) builds the version number and the
changelog from them (see [docs/releasing.md](docs/releasing.md)).

```
<type>(<optional scope>): <description>
```

| Type | Use for | Release effect |
|---|---|---|
| `feat` | A new feature or a new tariff book | Minor version bump, listed under Features |
| `fix` | A bug fix or a corrected tariff value | Patch version bump, listed under Bug fixes |
| `data` | Data-only maintenance that is not a correction (sources, fingerprints, gaps) | No release on its own |
| `docs` | Documentation only | No release on its own |
| `perf` | A faster engine, simulator or app with the same results | Patch version bump, listed under Performance |
| `refactor`, `test` | Code changes that do not change behaviour | No release on its own |
| `ci`, `build`, `chore` | Workflows, tooling, dependencies | No release on its own |

Add `!` after the type (for example `feat(engine)!: ...`) or a `BREAKING CHANGE:` footer for
incompatible API or data-schema changes. Suggested scopes: `data`, `engine`, `evidence`,
`web`, `firmware`, `scripts`, `ci`.

Examples:

```
feat(data): add KERC FY 2027-28 tariff book
fix(engine): scale ToD split to billed units under net metering
docs: explain whole-consumption slabs in methodology
```

## Tariff data in five steps

1. Read [docs/data-model.md](docs/data-model.md) and the worked example
   [`data/tariffs/ka-kerc/2026-27.json`](data/tariffs/ka-kerc/2026-27.json).
2. Copy last year's book to `data/tariffs/<bookId>/<new FY>.json`. Do not edit last year's file.
3. Update every value from the new order, with page numbers and short quotes. Add each document
   to `sources`, then fingerprint the PDFs: `npm run data:hash -- --book <file>`.
4. Check it: `npx tsx scripts/validate-book.ts <file>`. Work out two bills by hand from the order
   and compare them with the printed sample bills.
5. Open a pull request with the **tariff-update** template. A bot comments with every changed
   field and the bill impact at 100-500 units; a reviewer checks the values against the PDF.

The full yearly process is in [docs/tariff-update-workflow.md](docs/tariff-update-workflow.md).

## Code

- TypeScript strict mode, ESM, no `any`. Validate untrusted input with zod.
- Pure functions in the engine; no hidden state, no mutation of inputs.
- New engine behaviour needs a test with a hand-worked expected value in a comment.
- The web app must keep working offline and must not send user data anywhere.
- No em dashes in code, docs or data text.

## Firmware

```bash
cd hardware/meter-sakshi/firmware
pio test -e native    # portable core: SHA-256, record format, pulse filter
pio run -e esp32dev
```

If you change the log format or hashing, update `packages/evidence`, the firmware core and
`hardware/meter-sakshi/docs/log-format.md` together, and refresh the test vectors.

## Licensing of contributions

By contributing you agree that your contribution is licensed under the licence of the part of
the repository it touches: MIT for code and firmware, CC BY 4.0 for tariff data in `data/`, and
CERN-OHL-P-2.0 for hardware designs. Only contribute values you are allowed to share; tariff
orders and gazettes are public documents, but copied tables from paid or proprietary sources
are not.
