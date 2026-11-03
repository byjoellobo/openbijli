# The annual tariff workflow

Most state regulators issue retail tariff orders in March for the financial year starting
1 April. Some revise at other times (Tamil Nadu on 1 July; Uttar Pradesh's FY 2026-27 order
came on 2 July 2026), and fuel or power-purchase adjustments change monthly. Keeping the
dataset current is the project's lasting cost, so the workflow is designed to make each
update small, reviewable and reproducible.

## Calendar

| When | What happens |
|---|---|
| 1st and 15th of every month | `tariff-season.yml` runs `scripts/season-check.ts`. If any book is due within 45 days or overdue, it opens or updates one issue, "Tariff season checklist", with a line per book and a link to its regulator. When every book is current, the issue closes. |
| When an order is published | Anyone opens a "New tariff order published" issue or goes straight to a pull request. |
| On each pull request touching `data/` | `tariff-pr.yml` validates every book and writes a summary; `tariff-pr-comment.yml` posts it as one comment, updated on each push. |
| Monthly | Variable charges (FPPCA, FAC, PPAC, FPPAS) are updated as errata to the current book, with `asOf` dates. |

Each book can set `revision.month` to move its due date (for example `7` for Tamil Nadu).

## Making the change

1. **New year, new file.** `data/tariffs/<bookId>/<FY>.json`. The filename and folder must
   match `financialYear` and `bookId`. Old files stay untouched so that old bills remain
   reproducible; corrections to an old file are recorded in its `changelog`.
2. **Copy, then update.** Start from last year's book. Change values, not structure, unless
   the order restructured the tariff (for example KERC moving LT-1 to a single slab in 2025).
3. **Cite precisely.** Page numbers for every table; a short `quote` for slab tables, rates
   and anything surprising. Mark news and third-party copies as `secondary`.
4. **Fingerprint sources.** `npm run data:hash -- --book <file>` stores the SHA-256 of each PDF
   so a reviewer can tell if a regulator silently replaces a document.
5. **Write down the gaps.** Unknown values are omitted or entered as `unverified` 0 with a
   note, and listed in `gaps`. `status` stays `partial` until every bill-relevant value is verified.
6. **Validate and hand-check.** `npx tsx scripts/validate-book.ts <file>` prints sample bills;
   check two against the order by hand and put them in the PR template.

## What the bot comment shows

```
### Karnataka ESCOMs retail tariff (KERC), LT-1 Domestic, FY 2027-28
`data/tariffs/ka-kerc/2027-28.json`: new year vs 2026-27; effective 2027-04-01; MESCOM, BESCOM, ...

| field | before | after |
|---|---|---|
| `categories[domestic].fixed.rules[per-kw].bands[0].amount` | 150 | 160 |
| `categories[domestic].energy.schedules[single-slab].slabs[0].rate` | 5.8 | 5.75 |

| kWh/cycle (3 kW) | 2026-27 | 2027-28 | change |
|---|---|---|---|
| 100 | ₹1,157.70 | ... | ... |

- 0 primary source(s) without sha256
- verification: 0 unverified, 1 secondary block(s); status **partial**, 5 gap(s)
```

The comment lists leaf-level changes (prose and citations are left out) and the bill impact
at 100, 200, 300 and 500 units for a 3 kW connection, so reviewers can spot a misplaced
decimal at a glance.

## Security of the review pipeline

The validation job runs pull-request code with a read-only token and only uploads an
artifact. The commenting job never checks out or runs pull-request code, and it treats the
artifact as untrusted: the PR number comes from the trusted `workflow_run` event (matched to
the head commit and this repository), and the body has mentions, raw HTML and images
neutralised before it is posted. This keeps write access away from untrusted code from forks.

## Review checklist for maintainers

- The order is the right one (regulator, category, effective date) and the PDF hash matches.
- Two or more slab rates and the fixed charge match the order's schedule page.
- Percentage charges apply to the right base, in the right order.
- Rooftop rules reflect the current regulation, not just the tariff order.
- Gaps are honest, and `status` matches them.
