# @openbijli/data

Versioned, source-linked Indian household electricity tariffs: slabs, fixed charges, time of
day, surcharges, government subsidies, rooftop solar metering regimes, export rates, settlement
and banking rules. Every value cites the page of the tariff order it comes from.

Part of [OpenBijli](https://github.com/byjoellobo/openbijli). Try it in the browser:
[byjoellobo.github.io/openbijli](https://byjoellobo.github.io/openbijli/).

## Install

```bash
npm install @openbijli/data
```

Requires Node.js 22.12+ or a modern browser bundler. ESM only.

## Usage

```ts
import { getTariff, getUtilities, getSolarResourceForUtility, catalog } from '@openbijli/data';

getUtilities();                        // 25 utilities with state, regulator, latest FY
const book = getTariff('mescom');      // tariff in force now (or pass a YYYY-MM-DD date)
book.categories[0].energy.schedules;   // slab tables
book.rooftopSolar.regimes;             // net metering / net billing / gross metering
book.gaps;                             // what could not be confirmed
getSolarResourceForUtility('mescom');  // NASA POWER irradiance for a reference city
catalog.national.centralSubsidies;     // PM Surya Ghar assistance
```

Other lookups: `getBook(bookId, financialYear)`, `getBookHistory(bookId)`,
`getUtility(utilityId)`, `getSolarResource(id)`. Lookups throw `TariffLookupError` for unknown
ids or dates outside every book.

## Validation

Validation pulls in zod, so it lives in a separate entry point and browser bundles that only
read data do not ship it:

```ts
import { validateBook } from '@openbijli/data/schema';

const result = validateBook(JSON.parse(text));
if (!result.ok) console.error(result.errors);
```

The JSON Schema for editors ships as `@openbijli/data/tariff-book.schema.json`.

## Coverage

FY 2026-27 tariff books for Karnataka, Maharashtra, Gujarat, Delhi, Uttar Pradesh, Tamil Nadu,
Kerala, Telangana and Rajasthan (25 utilities). Every book is `partial` and lists its known
gaps. See the [repository README](https://github.com/byjoellobo/openbijli#coverage-fy-2026-27).

## Contributing data

Tariff books live in `data/tariffs/` in the repository. See the
[data model](https://github.com/byjoellobo/openbijli/blob/main/docs/data-model.md) and the
[tariff update workflow](https://github.com/byjoellobo/openbijli/blob/main/docs/tariff-update-workflow.md).

## Licence

Code MIT. Tariff data CC BY 4.0: attribute as "OpenBijli contributors, tariff data (CC BY 4.0)".
See [LICENSE](https://github.com/byjoellobo/openbijli/blob/main/LICENSE) and
[data/LICENSE.md](https://github.com/byjoellobo/openbijli/blob/main/data/LICENSE.md).
