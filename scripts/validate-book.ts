/**
 * Validate one tariff book and print sample bills, for contributors editing a file.
 *
 * Usage: tsx scripts/validate-book.ts data/tariffs/<book>/<FY>.json [--units 100,200,300] [--load 3]
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { validateBook, validateSolarResourceFile } from '../packages/data/src/validate.js';
import { computeBill } from '../packages/engine/src/bill/compute.js';
import { DATA_DIR } from './lib/data-files.js';

const out = (line = ''): void => {
  process.stdout.write(`${line}\n`);
};

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { units: { type: 'string' }, load: { type: 'string' }, phase: { type: 'string' } },
  });
  const file = positionals[0];
  if (!file) throw new Error('usage: tsx scripts/validate-book.ts <book.json> [--units 100,200] [--load 3]');

  const result = validateBook(JSON.parse(await readFile(file, 'utf8')) as unknown);
  if (!result.ok) {
    for (const error of result.errors) process.stderr.write(`error ${error}\n`);
    process.exit(1);
  }
  const book = result.value;
  const errors: string[] = [];
  if (path.basename(path.dirname(path.resolve(file))) !== book.bookId) errors.push(`folder must be named ${book.bookId}`);
  if (path.basename(file) !== `${book.financialYear}.json`) errors.push(`file must be named ${book.financialYear}.json`);
  const solar = validateSolarResourceFile(JSON.parse(await readFile(path.join(DATA_DIR, 'solar', 'nasa-power.json'), 'utf8')) as unknown);
  const locations = new Set(solar.ok ? solar.value.locations.map((l) => l.id) : []);
  for (const utility of book.utilities) {
    if (!locations.has(utility.solarResource)) errors.push(`utility ${utility.id}: unknown solarResource ${utility.solarResource}`);
  }
  if (errors.length > 0) {
    for (const error of errors) process.stderr.write(`error ${error}\n`);
    process.exit(1);
  }
  out(`ok    ${file} is valid (${book.utilities.length} utilities, ${Object.keys(book.sources).length} sources, status ${book.status})`);

  const units = (values.units ?? '50,100,200,300,500,1000').split(',').map(Number);
  const load = Number(values.load ?? '3');
  const phase = values.phase === 'three' ? 'three' : 'single';
  for (const utility of book.utilities) {
    out(`\n${utility.shortName} (${book.categories[0]?.billingCycle} bill, ${load} kW ${phase}-phase)`);
    out(`  units  tariff bill   household pays   warnings`);
    for (const u of units) {
      const tariff = computeBill(book, { utilityId: utility.id, units: u, sanctionedLoadKw: load, phase, subsidies: { apply: false } });
      const pays = computeBill(book, { utilityId: utility.id, units: u, sanctionedLoadKw: load, phase });
      out(`  ${String(u).padStart(5)}  ${tariff.total.toFixed(2).padStart(11)}  ${pays.total.toFixed(2).padStart(15)}   ${pays.warnings.length}`);
    }
    const sample = computeBill(book, { utilityId: utility.id, units: units[2] ?? 200, sanctionedLoadKw: load, phase });
    out(`  lines at ${sample.consumptionUnits} kWh: ${sample.lines.map((l) => `${l.id}=${l.amount}`).join(', ')}`);
    for (const w of sample.warnings) out(`  ! ${w}`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
