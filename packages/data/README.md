# @open-tariff-india/data

Versioned, source-linked Indian household electricity tariffs: slabs, fixed charges, time of
day, surcharges, government subsidies, rooftop solar metering regimes, export rates, settlement
and banking rules. Every value cites the page of the tariff order it comes from.

```ts
import { getTariff, getUtilities, getSolarResourceForUtility, catalog } from '@open-tariff-india/data';

getUtilities();                        // 25 utilities with state, regulator, latest FY
const book = getTariff('mescom');      // tariff in force now (or pass a YYYY-MM-DD date)
book.categories[0].energy.schedules;   // slab tables
book.rooftopSolar.regimes;             // net metering / net billing / gross metering
book.gaps;                             // what could not be confirmed
```

Validation (pulls in zod, so it lives in a separate entry point):

```ts
import { validateBook } from '@open-tariff-india/data/schema';
const result = validateBook(JSON.parse(text));
if (!result.ok) console.error(result.errors);
```

The JSON Schema for editors ships as `@open-tariff-india/data/tariff-book.schema.json`.

Code MIT; data CC BY 4.0. Source and contribution guide: the Open Tariff India repository.
