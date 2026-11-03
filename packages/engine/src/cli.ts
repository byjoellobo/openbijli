#!/usr/bin/env node
/**
 * open-tariff CLI
 *
 *   open-tariff utilities
 *   open-tariff bill  --utility mescom --units 250 --load 3 [--enrolled --baseline 120] [--tariff-only]
 *   open-tariff solar --utility mescom --monthly 250 --load 3 [--roof 4]
 */
import { parseArgs } from 'node:util';
import { catalog, getSolarResourceForUtility, getTariff, getUtilities } from '@open-tariff-india/data';
import { computeBill } from './bill/compute.js';
import { formatInr } from './money.js';
import { simulateSolar } from './solar/simulate.js';

const out = (line = ''): void => {
  process.stdout.write(`${line}\n`);
};

function num(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (value === undefined || !Number.isFinite(parsed)) throw new Error(`--${name} must be a number`);
  return parsed;
}

function bill(values: Record<string, string | boolean | undefined>): void {
  const utility = String(values.utility ?? '');
  const book = getTariff(utility, values.date as string | undefined);
  const result = computeBill(book, {
    utilityId: utility,
    units: num(values.units as string, 'units'),
    sanctionedLoadKw: num((values.load as string) ?? '1', 'load'),
    // Default: automatic schemes only (what households are billed). --enrolled adds opt-in
    // schemes such as Gruha Jyothi; --tariff-only shows the regulator's tariff before subsidies.
    subsidies: {
      apply: values.enrolled === true ? true : values['tariff-only'] === true ? false : 'automatic',
      ...(values.baseline ? { baselineUnits: num(values.baseline as string, 'baseline') } : {}),
    },
  });
  out(`${book.title} (${book.financialYear}), ${result.billingCycle} bill, schedule ${result.scheduleId}`);
  for (const line of result.lines) out(`  ${line.label.padEnd(52)} ${formatInr(line.amount).padStart(14)}`);
  out(`  ${'Total'.padEnd(52)} ${formatInr(result.total).padStart(14)}`);
  for (const warning of result.warnings) out(`  ! ${warning}`);
}

function solar(values: Record<string, string | boolean | undefined>): void {
  const utility = String(values.utility ?? '');
  const monthly = num(values.monthly as string, 'monthly');
  const result = simulateSolar({
    book: getTariff(utility),
    utilityId: utility,
    resource: getSolarResourceForUtility(utility),
    monthlyConsumptionKwh: Array.from({ length: 12 }, () => monthly),
    sanctionedLoadKw: num((values.load as string) ?? '3', 'load'),
    ...(values.roof ? { roofLimitKw: num(values.roof as string, 'roof') } : {}),
    ...(values.cost
      ? { costPerKw: num(values.cost as string, 'cost') }
      : { costPerKw: catalog.national.assumptions.find((a) => a.id === 'market-cost-per-kw')?.value ?? 62500 }),
    centralSubsidy: catalog.national.centralSubsidies[0] ?? null,
  });
  out(`Size  Net cost      Year-1 saving  Payback  NPV`);
  for (const size of result.sizes) {
    if (!size.feasible) {
      out(`${String(size.sizeKw).padEnd(5)} ${size.infeasibleReason}`);
      continue;
    }
    out(
      `${String(size.sizeKw).padEnd(5)} ${formatInr(size.netCost, true).padEnd(13)} ${formatInr(size.year1?.savings ?? 0, true).padEnd(14)} ${(size.simplePaybackYears?.toFixed(1) ?? '-').padEnd(8)} ${formatInr(size.npv ?? 0, true)}`,
    );
  }
  out();
  for (const line of result.rationale) out(`  ${line}`);
  for (const warning of result.warnings) out(`  ! ${warning}`);
}

function main(): void {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      utility: { type: 'string' },
      units: { type: 'string' },
      load: { type: 'string' },
      date: { type: 'string' },
      monthly: { type: 'string' },
      roof: { type: 'string' },
      cost: { type: 'string' },
      baseline: { type: 'string' },
      enrolled: { type: 'boolean' },
      'tariff-only': { type: 'boolean' },
    },
  });
  switch (positionals[0]) {
    case 'utilities':
      for (const u of getUtilities()) out(`${u.id.padEnd(10)} ${u.shortName.padEnd(10)} ${u.state.padEnd(16)} FY ${u.latestFinancialYear}`);
      return;
    case 'bill':
      bill(values);
      return;
    case 'solar':
      solar(values);
      return;
    default:
      out('usage: open-tariff utilities | bill --utility ID --units N --load KW | solar --utility ID --monthly N --load KW');
      process.exitCode = positionals[0] ? 1 : 0;
  }
}

try {
  main();
} catch (error: unknown) {
  process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
