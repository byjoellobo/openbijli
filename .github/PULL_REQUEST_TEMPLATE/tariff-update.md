## Tariff update

**Book / year:** `data/tariffs/<bookId>/<FY>.json`
**Order:** <!-- regulator, order number, date, effective date, link -->

### What changed

<!-- One line per change: slab rates, fixed charges, new charges, subsidy rules, export rate, settlement. The bot comment below lists every field and the bill impact; use this space for context the diff cannot show. -->

### Checklist

- [ ] New financial year = new file; last year's file untouched (errata go in its `changelog`)
- [ ] Every value has a `cite` with the page number, and a short `quote` for slab tables and rates
- [ ] Each primary source has `sha256` (`npm run data:hash -- --book <file>`)
- [ ] `verification` is honest: `secondary` for news and third-party copies, `unverified` for placeholders
- [ ] Variable charges (FPPCA/FAC/PPAC) carry `asOf` and `variable: true`
- [ ] Rooftop solar: export rate, settlement period, banking rules and capacity limits checked against the current regulation
- [ ] Anything not expressible in the schema is described in `gaps`, and `status` is `partial` if bills are affected
- [ ] `npx tsx scripts/validate-book.ts <file>` passes and I checked at least two sample bills by hand against the order
- [ ] No em dashes in text fields

### Hand-checked bills

| kWh | load | my calculation | engine |
|---|---|---|---|
|  |  |  |  |
