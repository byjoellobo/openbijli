# Data model: how to encode a tariff order

Each file in `data/tariffs/<bookId>/<FY>.json` is one **tariff book**: one regulator's
retail tariff for one financial year, possibly covering several utilities (KERC's uniform
tariff covers all five Karnataka ESCOMs). The schema lives in
[`packages/data/src/schema.ts`](../packages/data/src/schema.ts); a generated JSON Schema
in `data/schema/` gives editors autocompletion through the `$schema` line.

The worked example is [`data/tariffs/ka-kerc/2026-27.json`](../data/tariffs/ka-kerc/2026-27.json).

## Ground rules

1. **Every number cites a source.** Blocks carry `cite: [{ ref, page?, quote? }]`, where
   `ref` is a key in the book's `sources` registry. Copy URLs exactly from where you read them.
2. **Say how sure you are.** `verification` is `verified` (read in a regulator order,
   regulation, gazette or utility page), `secondary` (news, legal databases, third-party
   copies) or `unverified` (placeholder). The engine warns whenever unverified data is used.
3. **Never guess.** If a value is unknown, leave the charge out or use an `unverified`
   placeholder of 0, and write the gap in `gaps`. A book with gaps has `status: "partial"`.
4. **Units are per billing cycle.** For bimonthly utilities (Tamil Nadu, Kerala), slab
   bounds and thresholds are bimonthly units. Fixed charges declare `period: month`
   (doubled on bimonthly bills) or `period: cycle`.
5. **New year, new file.** Never edit last year's book to hold this year's rates. Errata to
   a published book go in its `changelog`.

## Bill pipeline

The engine computes, in order:

1. **Solar netting** (if the consumer has rooftop solar) decides the billed units.
2. **Energy charge** from the first `energy.schedules` entry whose `when` matches
   (`aboveUnits < units <= upToUnits`, plus phase/area/load/flags). `telescopic` prices each
   block at its own rate; `whole` prices all units at the rate of the slab the total falls in.
3. **Fixed charge** from the first matching `fixed.rules` entry. `bandBy` picks the band by
   nothing, sanctioned load, or consumption. `loadRounding`: `ceil`, `ceil_half`, `round_quarter`.
4. **ToD** adjustments when a time split is given and the consumer qualifies
   (`appliesIf`, `aboveUnits`). `percent_of_energy_rate` applies to the bill's average energy rate.
5. **Additional charges**, in file order. `percent` charges may only refer to `energy`,
   `fixed`, `tod` or *earlier* charges, so put FPPCA before the duty that is levied on it.
   Kinds: `per_kwh`, `percent`, `flat`, `flat_by_units`, `per_solar_kw`, `per_solar_kwh`.
   `utilities`, `appliesIf` and `whenUnits` restrict where a charge applies.
6. **Government subsidies** as credits. Non-opt-in schemes apply automatically; opt-in
   schemes (`optIn: true`) only when the caller says the household is enrolled. Rules:
   `zero_bill_up_to`, `free_units`, `entitlement`, `percent_band`, `payable_schedule`.
7. **Solar credits**: net-billing export credit, gross-metering sale, or net-metering
   settlement at the export rate.

## Choosing a representation

| Tariff feature | Encode as |
|---|---|
| Slab table that changes with total consumption (Telangana groups, Kerala above 250/month) | several `energy.schedules` with `when.upToUnits`, catch-all last |
| Fixed charge by consumption band (Kerala) | fixed rule `bandBy: units`, bands `per: connection` |
| Fixed charge per kW, different rate by load band (Delhi) | fixed rule `bandBy: load_kw`, `method: telescopic` or `whole` as the order states |
| Customer charge by consumption band on top of a per-kW fixed charge (Telangana) | `flat_by_units` charge |
| Fuel surcharge that differs above/below a consumption level (Rajasthan) | two `per_kwh` charges with `whenUnits` |
| Discom-specific PPAC/FPPAS (Delhi) | one charge per discom with `utilities: [id]` |
| Prepaid or digital-payment rebate | negative `percent` charge with `appliesIf.flags` |
| Meter rent that differs by phase | `flat` charges with `appliesIf.phase` |
| Net meter rent for solar prosumers | `flat` charge with `appliesIf.flags: ["solar_prosumer"]` |
| Consumers pay a lower schedule than the approved tariff, government pays the gap (Tamil Nadu) | approved tariff in `energy`, payable tables in a `payable_schedule` subsidy |
| Lower export rate for PM Surya Ghar subsidised systems (Karnataka) | `exportRate.withCentralSubsidy` bands |
| Banked solar units decay monthly (Kerala) | `settlement.bankingChargePercentPerMonth` |
| Network charge on solar generation (Tamil Nadu) | `per_solar_kwh` with capacity band |
| Charges on past consumption (true-up instalments based on last year's units) | not modelled; describe in `gaps` |

## Validating

```bash
npx tsx scripts/validate-book.ts data/tariffs/<bookId>/<FY>.json   # one file + sample bills
npm run data:build                                                 # everything, regenerates the catalog
```
