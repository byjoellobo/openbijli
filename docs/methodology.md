# Methodology

How the bill engine, solar simulator and evidence engine turn tariff orders and meter pulses
into numbers, and where they simplify.

## Bill engine (`computeBill`)

One call prices one billing cycle (a month, or two months for bimonthly utilities).

1. **Solar netting** (only with a `solar` input)
   - *Net metering:* exports and the banked balance offset imports kWh for kWh. Leftover kWh are
     banked; a bill that closes the settlement period (each bill, each March, or a custom month)
     pays the bank at the export rate or lets it lapse. Kerala-style monthly banking charges
     shrink the carried balance.
   - *Net billing:* every imported kWh is billed; exports are credited in rupees.
   - *Gross metering:* all consumption is billed; all generation is credited.
   - Where a state pays subsidised systems less (Karnataka 2026: ₹1.96/2.14/2.58 instead of
     ₹3.89), the band containing the whole system size applies.
2. **Energy charge.** The first schedule whose conditions match the billed units, phase, area,
   load and flags. *Telescopic* prices each block at its rate; *whole* prices every unit at the
   rate of the slab the total falls in (Kerala above 250 units/month).
3. **Fixed charge.** The first matching rule; bands by load or by consumption; load rounded as
   the order says (Karnataka: nearest quarter kW, minimum 1 kW).
4. **Time of day.** Applied when the consumer qualifies and a time split is given. Percentage
   adjustments use the bill's average energy rate as the "normal tariff". Under net metering the
   split is scaled to the billed units.
5. **Additional charges** in file order: per-kWh (fuel adjustment, wheeling, surcharges, duty in
   paise), percentages of earlier lines (duty, PPAC, pension surcharge, rebates), flat charges
   (meter rent), consumption-banded flat charges, and solar charges per kW installed or per kWh
   generated (Tamil Nadu's network charge).
6. **Government subsidies.** By default only schemes every eligible household gets automatically
   (Tamil Nadu's free units); opt-in schemes (Gruha Jyothi, Delhi's 200-unit scheme) only when the
   caller says the household is enrolled. Credits never take the bill below zero.
   - *Payable schedule:* the regulator approves one tariff and the government pays the gap to a
     lower schedule; credit = energy at tariff minus energy at the payable schedule.
   - *Entitlement:* entitlement = min(cap, baseline x multiplier); above it, the household pays a
     bill for the excess units only (or the full bill, as the scheme says).
7. **Solar credits** as negative lines.

Each line is rounded to paise and carries its citations and verification level. Warnings name
every variable, secondary or unverified value used, and the book's known gaps.

### Known simplifications

- Sanctioned load is used where some states bill recorded maximum demand or connected load.
- Charges based on past consumption (true-up instalments) are not modelled.
- Delhi's subsidy test on gross consumption for solar homes, and Rajasthan's slab selection on
  total consumption for net-metered homes, are not modelled; both are listed in those books' gaps.

## Solar simulator (`simulateSolar`)

1. **Sunlight.** NASA POWER 2001-2025 monthly mean irradiance on a south-facing plane tilted at
   the site latitude (`data/solar/nasa-power.json`), for a reference city in the utility's area.
2. **Generation.** kWh per kWp per day = plane-of-array irradiance x performance ratio (0.75, the
   PM Surya Ghar commissioning minimum). Each year loses output at the degradation rate (0.8%/yr,
   the PM Surya Ghar warranty floor; NISE measured 1.99%/yr on Indian rooftops in 2018).
3. **Hourly shape.** Output is spread over the day by the sun's elevation at each clock hour.
   India runs on one clock, so solar time is corrected for longitude and the equation of time:
   solar noon is about 12:40 in Mangaluru and 12:20 in Delhi.
4. **Energy balance.** Each hour, solar first serves the house (load profile x monthly
   consumption); the rest is exported, the shortfall imported. One representative day per month,
   so bright-day exports and cloudy-day imports are slightly understated.
5. **Bills.** Every billing cycle of every year is billed through the engine with and without
   solar, carrying the net-metering bank between cycles and settling it when the regime says.
6. **Money.** Capital cost (your price per kW, or the MNRE benchmark) minus the PM Surya Ghar CFA
   (₹30,000/kW for 2 kW, ₹18,000 for the third, capped at ₹78,000) and any state top-up. Yearly
   cash flow = bill savings x tariff escalation + export income - maintenance (after the vendor's
   five free years) - an inverter replacement in year 12. NPV at your discount rate, IRR,
   simple and discounted payback, and levelised cost.
7. **Recommendation.** The feasible size with the highest NPV, within the regulatory share of
   sanctioned load, any regulatory cap and your roof. The rationale explains the marginal value of
   the next size up, which is where low export rates bite.

## Evidence engine (Meter Sakshi)

- **What is measured.** The meter's test LED flashes once per 1/k kWh (k = imp/kWh on the
  nameplate). Counting flashes gives the energy the meter registered.
- **Integrity.** Each minute's record is chained: hash = SHA-256(previous hash | minute | pulses |
  flags). Verification recomputes every hash in parallel batches and pinpoints the first edited
  record. Daily digests can be shared to timestamp a log independently.
- **Bill reconciliation.** Logged kWh between the bill dates, with gaps filled at the period's
  mean rate. A difference beyond 2% + 1 kWh at 98% coverage is reported as over- or under-billing;
  lower coverage only raises "possible" findings, and below 50% coverage there is no verdict.
  Amounts are recomputed from the tariff, pro-rated on days when a bill period differs from a
  billing cycle by more than 10%.
- **Prepaid audit.** Each month is priced as a whole from logged consumption, then spread over
  days by kWh (fixed charge evenly by day) and compared with daily deductions.
- **Supply and recharges.** Minutes flagged "supply lost" (device on battery) form outages; a
  recharge during an outage is matched to the minute supply returned.
- **Home meter tests.** No-load test: more than one pulse with the main switch off is reported
  (IS 13779 allows at most one at 115% voltage; the home test is indicative). Reference-load test:
  measured watts against a plug-in meter, allowing 1% (meter class) + the instrument's accuracy +
  1/pulses for counting.
