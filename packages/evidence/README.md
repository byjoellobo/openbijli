# @open-tariff-india/evidence

The Meter Sakshi evidence engine. It verifies hash-chained minute logs from a non-contact reader
of an electricity meter's pulse LED, reconciles them against bills and prepaid deductions, checks
supply restoration after recharges, evaluates home no-load and reference-load tests, and renders
a printable dispute report.

```ts
import { parseLog, buildReport, renderHtml, tariffComputerFor, rightsFor, parseCaseFile } from '@open-tariff-india/evidence';

const log = parseLog(csvText);
const caseFile = parseCaseFile(caseJson);   // utility, load, meter type, bills, ledger, tests
const report = await buildReport({ log, caseFile, billFor: tariffComputerFor(caseFile), rights: rightsFor(caseFile.utilityId) });
const html = renderHtml(report);            // self-contained, printable, every value escaped
```

CLI:

```bash
meter-sakshi verify log.csv
meter-sakshi report --log log.csv --case case.json --out report.html [--md report.md]
meter-sakshi simulate --days 7 --out sample.csv
```

Works in Node 22+ and browsers (WebCrypto). Log format: `hardware/meter-sakshi/docs/log-format.md`
in the repository. MIT.
