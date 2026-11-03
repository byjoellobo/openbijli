# @open-tariff-india/engine

An Indian electricity bill engine and a rooftop solar right-sizing and payback simulator, driven
by `@open-tariff-india/data`.

```ts
import { getTariff, getSolarResourceForUtility, catalog } from '@open-tariff-india/data';
import { computeBill, simulateSolar } from '@open-tariff-india/engine';

const bill = computeBill(getTariff('tnpdcl'), { units: 300, sanctionedLoadKw: 2 });
// bimonthly TN bill: approved tariff, then the government's free-unit subsidy, line by line
for (const line of bill.lines) console.log(line.label, line.amount, line.verification, line.cite[0]?.url);

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
```

`computeBill` options: `utilityId`, `units` (per billing cycle), `sanctionedLoadKw`, `phase`,
`area`, `flags` (`smart_meter`, `prepaid`, ...), `todUnits`, `subsidies` (`apply: 'automatic' |
true | false`, `baselineUnits`), and `solar` (`exportedUnits`, `generatedUnits`,
`openingBankUnits`, `settle`, `capacityKw`, `centralSubsidy`, `regimeId`).

CLI:

```bash
open-tariff utilities
open-tariff bill --utility mescom --units 200 --load 3
open-tariff solar --utility mescom --monthly 250 --load 3 [--roof 4] [--cost 60000]
```

Methodology and simplifications: `docs/methodology.md` in the repository. MIT.
