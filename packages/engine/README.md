# @openbijli/engine

An Indian electricity bill engine and a rooftop solar right-sizing and payback simulator,
driven by [`@openbijli/data`](https://www.npmjs.com/package/@openbijli/data). Every bill line
carries the citation of the tariff order it came from.

Part of [OpenBijli](https://github.com/byjoellobo/openbijli). Try it in the browser:
[byjoellobo.github.io/openbijli](https://byjoellobo.github.io/openbijli/).

## Install

```bash
npm install @openbijli/engine
```

Requires Node.js 22.12+ or a modern browser bundler. ESM only. `@openbijli/data` is installed
as a dependency.

## Bills

```ts
import { getTariff } from '@openbijli/data';
import { computeBill } from '@openbijli/engine';

const bill = computeBill(getTariff('tnpdcl'), { units: 300, sanctionedLoadKw: 2 });
// bimonthly TN bill: approved tariff, then the government's free-unit subsidy, line by line
for (const line of bill.lines) console.log(line.label, line.amount, line.verification, line.cite[0]?.url);
bill.total;      // sum of lines in rupees, to the paisa
bill.payable;    // total rounded to the rupee, as most bills show
bill.warnings;   // unconfirmed or variable values that affected this bill
```

`computeBill` options: `utilityId`, `units` (per billing cycle), `sanctionedLoadKw`, `phase`,
`area`, `flags` (`smart_meter`, `prepaid`, ...), `todUnits`, `subsidies` (`apply: 'automatic' |
true | false`, `baselineUnits`), and `solar` (`exportedUnits`, `generatedUnits`,
`openingBankUnits`, `settle`, `capacityKw`, `centralSubsidy`, `regimeId`).

## Rooftop solar

```ts
import { getTariff, getSolarResourceForUtility, catalog } from '@openbijli/data';
import { simulateSolar } from '@openbijli/engine';

const plan = simulateSolar({
  book: getTariff('mescom'),
  resource: getSolarResourceForUtility('mescom'),
  monthlyConsumptionKwh: Array(12).fill(250),
  sanctionedLoadKw: 3,
  costPerKw: 62500,
  centralSubsidy: catalog.national.centralSubsidies[0],
});
plan.recommended?.sizeKw;   // highest-NPV feasible size
plan.rationale;             // why, in plain sentences
plan.sizes;                 // NPV, IRR, payback and year-one figures for every size
```

Optional inputs include `roofLimitKw`, `loadProfile` (`'evening_peak'`, `'daytime_home'`,
`'flat'` or 24 hourly weights), `billSubsidies` and `assumptions` (tariff escalation, discount
rate, degradation).

## CLI

```bash
npx openbijli utilities
npx openbijli bill --utility mescom --units 200 --load 3
npx openbijli solar --utility mescom --monthly 250 --load 3 [--roof 4] [--cost 60000]
```

## Documentation

- [Methodology and simplifications](https://github.com/byjoellobo/openbijli/blob/main/docs/methodology.md)
- [Architecture](https://github.com/byjoellobo/openbijli/blob/main/docs/architecture.md)
- [Changelog](https://github.com/byjoellobo/openbijli/blob/main/CHANGELOG.md)

## Licence

MIT. See [LICENSE](https://github.com/byjoellobo/openbijli/blob/main/LICENSE).
