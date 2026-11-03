# Contributing

Thank you for helping keep Indian electricity tariffs open and correct.

## Ways to help

- **New tariff order or FPPCA notice:** open a "New tariff order published" issue, or better,
  a pull request with the new book (see below).
- **Wrong number:** open a "Wrong number or bill" issue with your bill's line items (remove
  your name, account number and address) or the page of the order.
- **New utility:** add it to an existing book if its regulator's tariff already applies,
  otherwise create a new book.
- **Code and hardware:** issues and pull requests welcome. Keep the rule: the device never
  opens, wires into or alters the meter.

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

## Code

```bash
npm install
npm run typecheck
npm test               # or npm run test:coverage (80% lines/functions required)
npm run build
```

- TypeScript strict mode, ESM, no `any`. Validate untrusted input with zod.
- Pure functions in the engine; no hidden state, no mutation of inputs.
- New engine behaviour needs a test with a hand-worked expected value in a comment.
- No em dashes in code, docs or data text.

## Firmware

```bash
cd hardware/meter-sakshi/firmware
pio test -e native    # portable core: SHA-256, record format, pulse filter
pio run -e esp32dev
```

If you change the log format or hashing, update `packages/evidence`, the firmware core and
`hardware/meter-sakshi/docs/log-format.md` together, and refresh the test vectors.
