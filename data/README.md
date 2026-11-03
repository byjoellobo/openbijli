# OpenBijli tariff data

The source of truth for every rate OpenBijli uses. Each value cites the page of the tariff
order, regulation or gazette it comes from, and says how sure we are of it.

| Path | Contents |
|---|---|
| `tariffs/<bookId>/<FY>.json` | Tariff books: one regulator, one financial year, one or more utilities |
| `national/india.json` | PM Surya Ghar CFA, MNRE benchmark cost, simulator assumptions, national consumer rights |
| `solar/nasa-power.json` | Monthly irradiance for reference cities (regenerate with `npm run solar:fetch`) |
| `schema/*.schema.json` | Generated JSON Schemas for editors (do not edit; run `npm run data:build`) |

How to read and edit a book: [docs/data-model.md](../docs/data-model.md).
How the yearly update works: [docs/tariff-update-workflow.md](../docs/tariff-update-workflow.md).
Validate your changes with `npm run data:check` before opening a pull request.

Licence: CC BY 4.0, see [LICENSE.md](LICENSE.md). Attribute as "OpenBijli contributors,
tariff data (CC BY 4.0)". The data is also available as the
[`@openbijli/data`](../packages/data/README.md) package.
