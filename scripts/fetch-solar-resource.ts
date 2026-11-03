/**
 * Rebuilds data/solar/nasa-power.json from the NASA POWER climatology API
 * (free, no key). Monthly means are the 2001-2025 climatology the API serves.
 *
 * Usage: tsx scripts/fetch-solar-resource.ts
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './lib/data-files.js';

interface Location {
  readonly id: string;
  readonly name: string;
  readonly stateCode: string;
  readonly lat: number;
  readonly lon: number;
}

/** Reference locations: one or more per utility service area. */
export const LOCATIONS: readonly Location[] = [
  { id: 'mangaluru', name: 'Mangaluru', stateCode: 'KA', lat: 12.87, lon: 74.88 },
  { id: 'udupi', name: 'Udupi', stateCode: 'KA', lat: 13.34, lon: 74.75 },
  { id: 'shivamogga', name: 'Shivamogga', stateCode: 'KA', lat: 13.93, lon: 75.57 },
  { id: 'bengaluru', name: 'Bengaluru', stateCode: 'KA', lat: 12.97, lon: 77.59 },
  { id: 'hubballi', name: 'Hubballi', stateCode: 'KA', lat: 15.36, lon: 75.12 },
  { id: 'kalaburagi', name: 'Kalaburagi', stateCode: 'KA', lat: 17.33, lon: 76.83 },
  { id: 'mysuru', name: 'Mysuru', stateCode: 'KA', lat: 12.3, lon: 76.64 },
  { id: 'pune', name: 'Pune', stateCode: 'MH', lat: 18.52, lon: 73.86 },
  { id: 'nashik', name: 'Nashik', stateCode: 'MH', lat: 20.0, lon: 73.79 },
  { id: 'nagpur', name: 'Nagpur', stateCode: 'MH', lat: 21.15, lon: 79.09 },
  { id: 'vadodara', name: 'Vadodara', stateCode: 'GJ', lat: 22.31, lon: 73.18 },
  { id: 'surat', name: 'Surat', stateCode: 'GJ', lat: 21.17, lon: 72.83 },
  { id: 'mehsana', name: 'Mehsana', stateCode: 'GJ', lat: 23.59, lon: 72.37 },
  { id: 'rajkot', name: 'Rajkot', stateCode: 'GJ', lat: 22.3, lon: 70.8 },
  { id: 'delhi', name: 'New Delhi', stateCode: 'DL', lat: 28.61, lon: 77.21 },
  { id: 'noida', name: 'Noida', stateCode: 'UP', lat: 28.54, lon: 77.39 },
  { id: 'meerut', name: 'Meerut', stateCode: 'UP', lat: 28.98, lon: 77.71 },
  { id: 'lucknow', name: 'Lucknow', stateCode: 'UP', lat: 26.85, lon: 80.95 },
  { id: 'agra', name: 'Agra', stateCode: 'UP', lat: 27.18, lon: 78.01 },
  { id: 'varanasi', name: 'Varanasi', stateCode: 'UP', lat: 25.32, lon: 82.97 },
  { id: 'kanpur', name: 'Kanpur', stateCode: 'UP', lat: 26.45, lon: 80.33 },
  { id: 'chennai', name: 'Chennai', stateCode: 'TN', lat: 13.08, lon: 80.27 },
  { id: 'coimbatore', name: 'Coimbatore', stateCode: 'TN', lat: 11.02, lon: 76.96 },
  { id: 'thiruvananthapuram', name: 'Thiruvananthapuram', stateCode: 'KL', lat: 8.52, lon: 76.94 },
  { id: 'kochi', name: 'Kochi', stateCode: 'KL', lat: 9.93, lon: 76.27 },
  { id: 'hyderabad', name: 'Hyderabad', stateCode: 'TG', lat: 17.39, lon: 78.49 },
  { id: 'warangal', name: 'Warangal', stateCode: 'TG', lat: 17.97, lon: 79.59 },
  { id: 'jaipur', name: 'Jaipur', stateCode: 'RJ', lat: 26.91, lon: 75.79 },
  { id: 'jodhpur', name: 'Jodhpur', stateCode: 'RJ', lat: 26.24, lon: 73.02 },
  { id: 'ajmer', name: 'Ajmer', stateCode: 'RJ', lat: 26.45, lon: 74.64 },
];

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;
const API = 'https://power.larc.nasa.gov/api/temporal/climatology/point';

type MonthlySeries = Record<(typeof MONTHS)[number], number>;

interface PowerResponse {
  properties: { parameter: Record<string, MonthlySeries> };
}

function monthly(series: MonthlySeries | undefined, label: string): number[] {
  if (!series) throw new Error(`NASA POWER response missing ${label}`);
  return MONTHS.map((m) => {
    const value = series[m];
    if (typeof value !== 'number' || value <= 0) throw new Error(`${label} ${m} is not a positive number`);
    return Math.round(value * 1000) / 1000;
  });
}

async function fetchLocation(location: Location): Promise<{ ghi: number[]; poa: number[] }> {
  const url = `${API}?parameters=ALLSKY_SFC_SW_DWN,SI_EF_TILTED_SURFACE&community=RE&longitude=${location.lon}&latitude=${location.lat}&format=JSON`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${location.id}: HTTP ${response.status}`);
  const body = (await response.json()) as PowerResponse;
  const parameters = body.properties.parameter;
  return {
    ghi: monthly(parameters.ALLSKY_SFC_SW_DWN, `${location.id} ALLSKY_SFC_SW_DWN`),
    poa: monthly(parameters.SI_TILTED_AVG_LATITUDE, `${location.id} SI_TILTED_AVG_LATITUDE`),
  };
}

async function main(): Promise<void> {
  const locations = [];
  for (const location of LOCATIONS) {
    const { ghi, poa } = await fetchLocation(location);
    locations.push({ ...location, poaKwhPerM2Day: poa, ghiKwhPerM2Day: ghi });
    process.stdout.write(`ok    ${location.id}\n`);
  }
  const today = new Date().toISOString().slice(0, 10);
  const file = {
    $schema: '../schema/solar-resource.schema.json',
    schemaVersion: 1,
    source: {
      title: 'NASA POWER Climatology API v2 (SYN1DEG/POWER), 2001-2025 monthly climatology',
      publisher: 'NASA Langley Research Center, Prediction Of Worldwide Energy Resources (POWER) project',
      url: 'https://power.larc.nasa.gov/docs/services/api/temporal/climatology/',
      type: 'dataset',
      accessed: today,
      note: 'Parameters ALLSKY_SFC_SW_DWN (GHI) and SI_EF_TILTED_SURFACE -> SI_TILTED_AVG_LATITUDE (equator-facing plane tilted at the site latitude).',
    },
    method:
      'poaKwhPerM2Day is irradiance on a fixed south-facing plane tilted at the site latitude, which is close to common Indian rooftop practice. The simulator converts it to AC output as kWh/kWp/day = POA x performance ratio, because module ratings assume 1 kW/m2.',
    locations,
  };
  await writeFile(path.join(DATA_DIR, 'solar', 'nasa-power.json'), `${JSON.stringify(file, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
