# @openbijli/evidence

The Meter Sakshi evidence engine. It verifies hash-chained minute logs from a non-contact reader
of an electricity meter's pulse LED, reconciles them against bills and prepaid deductions, checks
supply restoration after recharges, evaluates home no-load and reference-load tests, and renders
a printable dispute report.

Part of [OpenBijli](https://github.com/byjoellobo/openbijli). Try it in the browser with demo
data: [byjoellobo.github.io/openbijli/#/sakshi](https://byjoellobo.github.io/openbijli/#/sakshi).

## Install

```bash
npm install @openbijli/evidence
```

Works in Node.js 22.12+ and modern browsers (hashing uses WebCrypto). ESM only.

## Usage

```ts
import { parseLog, verifyChain, buildReport, renderHtml, tariffComputerFor, rightsFor, parseCaseFile } from '@openbijli/evidence';

const log = parseLog(csvText);              // strict parser; throws LogFormatError on bad input
const chain = await verifyChain(log);       // chain.ok, chain.firstBrokenIndex, chain.message
const caseFile = parseCaseFile(caseJson);   // utility, load, meter type, bills, ledger, tests
const report = await buildReport({ log, caseFile, billFor: tariffComputerFor(caseFile), rights: rightsFor(caseFile.utilityId) });
const html = renderHtml(report);            // self-contained, printable, every value escaped
```

`renderMarkdown(report)` gives a Markdown version, and `simulateLog()` generates realistic demo
logs for testing.

## CLI

```bash
npx meter-sakshi verify log.csv
npx meter-sakshi report --log log.csv --case case.json --out report.html [--md report.md]
npx meter-sakshi simulate --days 7 --out sample.csv
```

## What a report can and cannot show

A Meter Sakshi log shows what the meter itself registered, so it can expose billed units that
exceed the meter's own count, prepaid deductions out of line with the tariff, and slow supply
restoration after a recharge. It cannot prove the meter's measurement is accurate (home tests
are indicative only). See the
[Meter Sakshi README](https://github.com/byjoellobo/openbijli/blob/main/hardware/meter-sakshi/README.md).

## Documentation

- [Log format and hash chain](https://github.com/byjoellobo/openbijli/blob/main/hardware/meter-sakshi/docs/log-format.md)
- [Evidence methodology](https://github.com/byjoellobo/openbijli/blob/main/docs/methodology.md#evidence-engine-meter-sakshi)
- [Changelog](https://github.com/byjoellobo/openbijli/blob/main/CHANGELOG.md)

## Licence

MIT. See [LICENSE](https://github.com/byjoellobo/openbijli/blob/main/LICENSE).
