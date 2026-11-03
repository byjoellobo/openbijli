# Open Tariff India

A versioned, source-linked dataset of Indian household electricity tariffs, a TypeScript
bill engine, a rooftop solar right-sizing and payback simulator, and **Meter Sakshi**, a
non-contact check meter that turns a meter's own pulse LED into evidence for a billing dispute.

Every rupee the engine produces points back to the page of the tariff order it came from.

## Why

- Rooftop solar is going in at scale: about 506,000 households installed systems under PM
  Surya Ghar in July 2026 alone, toward a target of 10 million households by March 2027
  ([Mercom India](https://mercomindia.com/pm-surya-ghar-powers-5-million-homes-total-capacity-hits-15-gw)).
- Whether a system pays back depends on slab tariffs, export rates and banking rules.
  Lower-consumption households face longer paybacks because they sit in cheaper slabs or
  get free units: CSEP finds a 3 kWp system for a 1,500 kWh/yr household takes 11 years in
  Delhi and 20 in Karnataka with subsidised tariffs, against 5 and 9 without
  ([CSEP working paper](https://csep.org/working-paper/rooftop-solar-a-trade-off-between-consumer-benefit-and-discom-finances/)).
- The rules differ by utility and change every year. "Every DISCOM has its own application
  form, portal, fee structure"; one commercial net-metering list shows feed-in rates from
  ₹2.25 to ₹3.56/kWh across 21 DISCOMs in eight states and UTs, and names MESCOM only in a
  heading with no data ([Quickest](https://quickestimate.co/blog/net-metering-discom-list-india)).
- Free calculators often use one state-average tariff and leave out export credit; Desi
  Utility's Uttar Pradesh subsidy calculator, for example, uses ₹7.5/kWh for the whole state
  and excludes net-metering credit ([Desi Utility](https://desiutility.com/solar/subsidy-calculator/uttar-pradesh)).
- Smart prepaid meters are spreading faster than trust in them. 39 million smart meters were
  installed under RDSS by 31 December 2025, and Noida and Ghaziabad residents report bills
  jumping, low-balance alerts arriving late or never, and waits of 12 hours to seven days
  for supply after a recharge ([ThePrint](https://theprint.in/feature/noida-ghaziabad-residents-prepaid-electricity-meter-system/2900340/)).
  Uttar Pradesh's consumer council says the utility's check meters are not installed to
  standard ([The Daily Jagran](https://www.thedailyjagran.com/uttar-pradesh/up-customers-complain-of-unusual-surge-in-electricity-bills-after-smart-meter-installation-uppcl-responds-10258268)),
  and a formal test of a smart prepaid meter costs ₹175 under an MVVNL order, with check-meter
  applications requiring half of any dues to be paid first ([Amar Ujala](https://www.amarujala.com/lucknow/up-if-your-postpaid-smart-meter-is-running-fast-get-it-checked-for-just-rs-50-this-is-the-method-2025-09-03)).

## What is here

| Part | Where | What it does |
|---|---|---|
| Tariff dataset | [`data/`](data/) | One JSON "tariff book" per regulator and financial year: slabs, fixed charges, ToD, surcharges, government subsidies, rooftop metering regimes, export rates, settlement and banking rules, consumer protections. Every block cites its source and says how sure we are. |
| `@open-tariff-india/data` | [`packages/data`](packages/data) | The validated catalog plus the zod schema and lookups. |
| `@open-tariff-india/engine` | [`packages/engine`](packages/engine) | `computeBill()` for one billing cycle and `simulateSolar()` for right-sizing and payback. CLI: `open-tariff`. |
| `@open-tariff-india/evidence` | [`packages/evidence`](packages/evidence) | Verifies Meter Sakshi logs, reconciles them against bills and prepaid deductions, runs home meter tests, renders a dispute report. CLI: `meter-sakshi`. |
| Web app | [`apps/web`](apps/web) | Bill check, solar sizing, dispute report and data browser, all running in the browser. |
| Meter Sakshi | [`hardware/meter-sakshi`](hardware/meter-sakshi) | ESP32 firmware, ESPHome variant, 3D-printable sensor clip and box, wiring and safety notes. |
| Tariff season workflow | [`.github/`](.github/), [`docs/tariff-update-workflow.md`](docs/tariff-update-workflow.md) | Pull-request review with automatic bill-impact comments, and a twice-monthly check that opens an issue when new orders are due. |

### Coverage (FY 2026-27)

9 tariff books, 25 utilities: Karnataka (MESCOM, BESCOM, HESCOM, GESCOM, CESC Mysore),
Maharashtra (MSEDCL), Gujarat (DGVCL, MGVCL, PGVCL, UGVCL), Delhi (BRPL, BYPL, TPDDL),
Uttar Pradesh (PVVNL, MVVNL, DVVNL, PuVVNL, KESCO), Tamil Nadu (TNPDCL), Kerala (KSEB),
Telangana (TGSPDCL, TGNPDCL) and Rajasthan (JVVNL, AVVNL, JdVVNL).

Every book is marked `partial`: each lists the values that could not be confirmed (often the
month's fuel adjustment or the electricity duty base) in its `gaps`, and the engine warns
whenever such a value affects a bill. Run `npm run dev` and open **Tariff data** to read them.

## Quick start

```bash
npm install
npm test            # builds the catalog from data/, then runs every test
npm run dev         # web app on http://localhost:5173

# CLIs from source
npx tsx --conditions=source packages/engine/src/cli.ts bill --utility mescom --units 200 --load 3
npx tsx --conditions=source packages/engine/src/cli.ts solar --utility mescom --monthly 250 --load 3
npx tsx --conditions=source packages/evidence/src/cli.ts report \
  --log hardware/meter-sakshi/samples/sample-log.csv \
  --case hardware/meter-sakshi/samples/sample-case.json --out report.html
```

As a library:

```ts
import { getTariff, getSolarResourceForUtility, catalog } from '@open-tariff-india/data';
import { computeBill, simulateSolar } from '@open-tariff-india/engine';

const bill = computeBill(getTariff('mescom'), { units: 200, sanctionedLoadKw: 3 });
bill.lines.forEach((l) => console.log(l.label, l.amount, l.cite[0]?.url));

const plan = simulateSolar({
  book: getTariff('mescom'),
  resource: getSolarResourceForUtility('mescom'),
  monthlyConsumptionKwh: Array(12).fill(250),
  sanctionedLoadKw: 3,
  costPerKw: 62500,
  centralSubsidy: catalog.national.centralSubsidies[0],
});
console.log(plan.recommended?.sizeKw, plan.rationale);
```

## How it works

- **Bills** go through a fixed pipeline: solar netting, energy slabs (telescopic or
  whole-consumption), fixed charges, ToD, additional charges in file order, government
  subsidies, solar credits. See [docs/methodology.md](docs/methodology.md).
- **Solar** is simulated hour by hour on a representative day per month, using NASA POWER
  2001-2025 irradiance on a latitude-tilted plane for a city in each utility's area. Every
  billing cycle for 25 years is then billed through the real tariff, including the
  net-metering bank and its settlement, the lower export rates some states pay subsidised
  systems, and network charges on generation.
- **Meter Sakshi** counts the meter's own test-LED flashes, so it reads what the meter
  registered without touching it. Logs are hash-chained minute by minute; the same chain is
  implemented in the firmware (C++) and the evidence engine (TypeScript), and tests prove they
  produce identical hashes.

## Principles

1. **Cite or omit.** A value without a source does not enter the dataset as fact.
2. **Say what is missing.** Gaps are data. Unconfirmed values are flagged in every output.
3. **New year, new file.** Tariff books are never edited in place for a new year, so old
   bills stay reproducible.
4. **The device never opens, wires into or alters the meter.** Meter Sakshi sits on the
   outside of the meter cover and reads light. See
   [hardware/meter-sakshi/docs/safety-and-legal.md](hardware/meter-sakshi/docs/safety-and-legal.md).
5. **Local first.** The web app and CLIs run on your machine; logs and bills are never uploaded.

## Status and limitations

- v0.1. The engine, simulator, evidence engine and firmware core are tested; the firmware
  compiles for ESP32 and its hash chain is verified against the TypeScript implementation,
  but it has not yet been run on a meter in the field.
- Bills use the sanctioned load; some states bill on recorded maximum demand.
- Solar uses an average day per month, which slightly overstates self-consumption.
- Household load profiles are illustrative unless you supply your own 24-hour profile (a
  Meter Sakshi log gives you one).
- The DLMS optical-port reading mode is not implemented: whether consumers may read that port
  is unverified, and the available WebAssembly DLMS library is GPL-2.0.

## Contributing

The lasting cost of this project is keeping tariffs current every April. See
[CONTRIBUTING.md](CONTRIBUTING.md) and [docs/tariff-update-workflow.md](docs/tariff-update-workflow.md).

## Licence

Code: MIT ([LICENSE](LICENSE)). Tariff data: CC BY 4.0 ([data/LICENSE.md](data/LICENSE.md)).
Hardware designs: CERN-OHL-P-2.0 ([hardware/LICENSE.md](hardware/LICENSE.md)).
