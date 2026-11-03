import { describe, expect, it } from 'vitest';
import {
  LogFormatError,
  LogIndex,
  buildReport,
  escapeHtml,
  parseCaseFile,
  parseLog,
  reconcileBill,
  renderHtml,
  renderMarkdown,
  rightsFor,
  simulateLog,
  tariffComputerFor,
  verifyChain,
  type SimulateOptions,
  type TariffComputer,
} from '../src/index.js';

const START = '2026-10-01T00:00:00+05:30';
const DAY2_10AM = '2026-10-02T10:00:00+05:30';

async function makeLog(opts: Partial<SimulateOptions> = {}) {
  return simulateLog({ startIso: START, days: 3, dailyKwh: 10, digests: true, ...opts });
}

const baseCase = {
  utilityId: 'mescom',
  sanctionedLoadKw: 3,
  meter: { type: 'postpaid' as const },
  bills: [] as unknown[],
};

const stubTariff: TariffComputer = (units) => ({ total: units * 6 + 100, fixed: 100, label: 'test tariff' });

describe('log parsing and integrity', () => {
  it('round-trips a simulated log', async () => {
    const { text, log } = await makeLog();
    const parsed = parseLog(text);
    expect(parsed.records).toHaveLength(3 * 1440);
    expect(parsed.header.impPerKwh).toBe(3200);
    expect(parsed.digests.length).toBeGreaterThan(0);
    expect(parsed.records[0]?.hash).toBe(log.records[0]?.hash);
  });

  it('lists every format problem', () => {
    expect(() => parseLog('nonsense')).toThrow(LogFormatError);
    try {
      parseLog('# meter-sakshi-log v1\n# device_id=X\nminute_utc,pulses,flags,hash\nbad,line\n');
    } catch (error) {
      expect((error as LogFormatError).problems.some((p) => p.includes('imp_per_kwh'))).toBe(true);
      expect((error as LogFormatError).problems.some((p) => p.includes('line 4'))).toBe(true);
    }
  });

  it('verifies an untouched chain and pinpoints an edited record', async () => {
    const { text } = await makeLog();
    expect((await verifyChain(parseLog(text))).ok).toBe(true);

    const lines = text.split('\n');
    const target = lines.findIndex((l, i) => i > 200 && /^\d{4}-/.test(l));
    const parts = (lines[target] ?? '').split(',');
    lines[target] = [parts[0], String(Number(parts[1]) + 5), parts[2], parts[3]].join(',');
    const tampered = await verifyChain(parseLog(lines.join('\n')));
    expect(tampered.ok).toBe(false);
    expect(tampered.firstBrokenIndex).toBeDefined();
    expect(tampered.message).toContain('broken');
  });

  it('flags a forged daily digest', async () => {
    const { text, log } = await makeLog({ digests: false });
    const day = log.records[0]?.minute.slice(0, 10);
    const forged = `${text}# digest ${day} ${'0'.repeat(64)}\n`;
    const result = await verifyChain(parseLog(forged));
    expect(result.ok).toBe(false);
    expect(result.badDigests).toEqual([day]);
  });
});

describe('bill reconciliation', () => {
  it('finds consistent, over-billed and under-billed periods', async () => {
    const { log } = await makeLog();
    const index = new LogIndex(log);
    const observed = index.window(index.firstMinute, index.lastMinute + 1).kwh;
    expect(observed).toBeGreaterThan(20);
    expect(observed).toBeLessThan(40);
    const period = { id: 'b', periodStart: START, periodEnd: '2026-10-04T00:00:00+05:30' };

    expect(reconcileBill(index, { ...period, billedUnits: Math.round(observed) }).verdict).toBe('consistent');
    const over = reconcileBill(index, { ...period, billedUnits: observed + 15 }, stubTariff);
    expect(over.verdict).toBe('overbilled_units');
    expect(over.findings.some((f) => f.id.endsWith('-excess') && f.severity === 'high')).toBe(true);
    expect(reconcileBill(index, { ...period, billedUnits: observed - 10 }).verdict).toBe('underbilled');
  });

  it('refuses to judge with too little data and is cautious with gaps', async () => {
    const { log } = await makeLog({ missing: [{ startIso: '2026-10-01T12:00:00+05:30', minutes: 2 * 1440 }] });
    const index = new LogIndex(log);
    const result = reconcileBill(index, { id: 'b', periodStart: START, periodEnd: '2026-10-04T00:00:00+05:30', billedUnits: 30 });
    expect(result.verdict).toBe('insufficient_data');

    const { log: gappy } = await makeLog({ missing: [{ startIso: DAY2_10AM, minutes: 200 }] });
    const gIndex = new LogIndex(gappy);
    const est = reconcileBill(gIndex, { id: 'g', periodStart: START, periodEnd: '2026-10-04T00:00:00+05:30', billedUnits: 0 }).estimatedKwh;
    expect(reconcileBill(gIndex, { id: 'g', periodStart: START, periodEnd: '2026-10-04T00:00:00+05:30', billedUnits: est * 1.4 }).verdict).toBe('possible_overbilling');
  });

  it('checks reading arithmetic and amounts against the tariff', async () => {
    const { log } = await makeLog();
    const index = new LogIndex(log);
    const result = reconcileBill(
      index,
      { id: 'r', periodStart: START, periodEnd: '2026-10-04T00:00:00+05:30', billedUnits: 30, openingReading: 1000, closingReading: 1050, billedAmount: 400 },
      stubTariff,
    );
    expect(result.findings.some((f) => f.id === 'bill-r-readings')).toBe(true);
    const amount = result.findings.find((f) => f.id === 'bill-r-amount');
    expect(amount?.severity).toBe('medium'); // 400 vs 280 from the stub tariff
  });
});

describe('report: prepaid, supply and meter tests', () => {
  it('audits prepaid deductions, recharge restoration and home meter tests', async () => {
    const { text } = await makeLog({
      outages: [{ startIso: DAY2_10AM, minutes: 180 }],
      creepTest: { startIso: '2026-10-03T02:00:00+05:30', minutes: 30, leakWatts: 60 },
      referenceTest: { startIso: '2026-10-03T03:00:00+05:30', minutes: 30, watts: 2000, meterErrorPct: 8 },
    });
    const log = parseLog(text);
    const caseFile = {
      ...baseCase,
      meter: { type: 'prepaid' as const, serial: 'X1' },
      prepaidLedger: [
        { timestamp: '2026-10-02T10:30:00+05:30', type: 'recharge' as const, amount: 500 },
        ...['01', '02', '03'].map((d) => ({ timestamp: `2026-10-${d}T23:00:00+05:30`, type: 'deduction' as const, amount: 400 })),
      ],
      referenceTests: [{ start: '2026-10-03T03:00:00+05:30', end: '2026-10-03T03:30:00+05:30', referenceWatts: 2000 }],
      reconnectionStandardHours: 1,
      notes: '<script>alert("x")</script>',
    };
    const report = await buildReport({ log, caseFile, billFor: stubTariff, generatedAt: new Date('2026-10-29T00:00:00Z') });

    expect(report.overall).toBe('high');
    expect(report.findings.find((f) => f.id === 'prepaid')?.severity).toBe('high');
    expect(report.restorations[0]?.delayMinutes).toBe(150);
    expect(report.findings.some((f) => f.id.startsWith('recharge-') && f.severity === 'high')).toBe(true);
    expect(report.creep[0]?.pulses).toBeGreaterThanOrEqual(90);
    expect(report.findings.some((f) => f.id.startsWith('creep-') && f.severity === 'high')).toBe(true);
    expect(report.reference[0]?.error).toBeCloseTo(0.08, 2);
    expect(report.findings.some((f) => f.id.startsWith('reference-') && f.severity === 'medium')).toBe(true);
    expect(report.outages).toHaveLength(1);

    const html = renderHtml(report);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    expect(renderMarkdown(report)).toContain('# Electricity consumption evidence report');
  });

  it('passes clean meter tests and survives tariff errors', async () => {
    const { text } = await makeLog({
      creepTest: { startIso: '2026-10-03T02:00:00+05:30', minutes: 20 },
      referenceTest: { startIso: '2026-10-03T03:00:00+05:30', minutes: 30, watts: 2000 },
    });
    const report = await buildReport({
      log: parseLog(text),
      caseFile: {
        ...baseCase,
        bills: [{ id: 'b1', periodStart: START, periodEnd: '2026-10-04T00:00:00+05:30', billedUnits: 30, billedAmount: 300 }],
        referenceTests: [{ start: '2026-10-03T03:00:00+05:30', end: '2026-10-03T03:30:00+05:30', referenceWatts: 2000 }],
      },
      billFor: () => {
        throw new Error('no tariff for that date');
      },
    });
    expect(report.findings.some((f) => f.id.startsWith('creep-') && f.severity === 'ok')).toBe(true);
    expect(report.findings.some((f) => f.id.startsWith('reference-') && f.severity === 'ok')).toBe(true);
    expect(report.findings.some((f) => f.id === 'tariff')).toBe(true);
  });

  it('reports a broken chain as the top finding', async () => {
    const { text } = await makeLog();
    const broken = text.replace(/\n(2026-10-01T1\d:\d\dZ),(\d+),/, (_m, minute: string, pulses: string) => `\n${minute},${Number(pulses) + 1},`);
    const report = await buildReport({ log: parseLog(broken), caseFile: baseCase });
    expect(report.findings[0]?.id).toBe('chain');
    expect(report.findings[0]?.severity).toBe('high');
  });
});

describe('review hardening', () => {
  it('rejects non-canonical timestamps and malformed numbers', async () => {
    const { text } = await makeLog({ days: 1 });
    const lines = text.split('\n');
    const i = lines.findIndex((l) => /^\d{4}-/.test(l));
    const [, , flags, hash] = (lines[i] ?? '').split(',');
    const withLine = (line: string) => [...lines.slice(0, i), line, ...lines.slice(i + 1)].join('\n');
    expect(() => parseLog(withLine(`2026-02-30T00:00Z,1,${flags},${hash}`))).toThrow(/invalid timestamp/);
    expect(() => parseLog(withLine(`2026-09-30T18:30Z,,${flags},${hash}`))).toThrow(/plain non-negative integers/);
    expect(() => parseLog(withLine(`2026-09-30T18:30Z,0x10,${flags},${hash}`))).toThrow(/plain non-negative integers/);
    expect(() => parseLog(withLine(`2026-09-30T18:30Z,70000,${flags},${hash}`))).toThrow(/at most 65535/);
    expect(() => parseLog(`${text}# imp_per_kwh=6400\n`)).toThrow(/header lines must come before the data/);
  });

  it('fails digests for days absent from the export', async () => {
    const { text } = await makeLog({ days: 1, digests: false });
    const result = await verifyChain(parseLog(`${text}# digest 2025-01-01 ${'a'.repeat(64)}\n`));
    expect(result.ok).toBe(false);
    expect(result.badDigests).toEqual(['2025-01-01']);
  });

  it('flags exports whose header is not bound by the chain', async () => {
    const { text, log } = await makeLog({ days: 2, digests: false });
    const cut = log.records[1440];
    const prev = log.records[1439]?.hash ?? '';
    const lines = text.split('\n');
    const header = lines.slice(0, 4);
    const rest = lines.filter((l) => /^\d{4}-/.test(l) && l >= (cut?.minute ?? ''));
    const partial = [...header, `# chain_prev=${prev}`, 'minute_utc,pulses,flags,hash', ...rest].join('\n');
    const report = await buildReport({ log: parseLog(partial), caseFile: baseCase });
    expect(report.log.chain.ok).toBe(true);
    expect(report.log.chain.headerBound).toBe(false);
    expect(report.findings.some((f) => f.id === 'chain-partial' && f.severity === 'medium')).toBe(true);
  });

  it('does not pass meter tests run while the device was offline or on battery', async () => {
    const { text } = await makeLog({
      missing: [{ startIso: '2026-10-03T02:00:00+05:30', minutes: 40 }],
      outages: [{ startIso: '2026-10-03T05:00:00+05:30', minutes: 40 }],
    });
    const report = await buildReport({
      log: parseLog(text),
      caseFile: {
        ...baseCase,
        creepTests: [{ start: '2026-10-03T02:05:00+05:30', end: '2026-10-03T02:25:00+05:30' }],
        referenceTests: [{ start: '2026-10-03T05:05:00+05:30', end: '2026-10-03T05:35:00+05:30', referenceWatts: 2000 }],
      },
    });
    expect(report.findings.find((f) => f.id === 'creep-0')?.title).toMatch(/cannot be judged/);
    expect(report.findings.find((f) => f.id === 'reference-0')?.title).toMatch(/cannot be judged/);
  });

  it('does not treat a dead device battery as supply returning', async () => {
    const { text } = await makeLog({
      outages: [{ startIso: DAY2_10AM, minutes: 120 }],
      missing: [{ startIso: '2026-10-02T11:00:00+05:30', minutes: 300 }],
    });
    const report = await buildReport({
      log: parseLog(text),
      caseFile: { ...baseCase, meter: { type: 'prepaid' as const }, prepaidLedger: [{ timestamp: '2026-10-02T10:15:00+05:30', type: 'recharge' as const, amount: 300 }] },
    });
    expect(report.outages[0]?.endsInGap).toBe(true);
    expect(report.restorations[0]?.delayMinutes).toBeUndefined();
    expect(report.findings.some((f) => f.title.includes('stopped logging'))).toBe(true);
  });

  it('prices bimonthly prepaid audits per calendar month', async () => {
    const { log } = await makeLog({ days: 3 });
    const caseFile = parseCaseFile({ ...baseCase, utilityId: 'tnpdcl', meter: { type: 'prepaid' } });
    const report = await buildReport({
      log,
      caseFile: { ...caseFile, prepaidLedger: [{ timestamp: '2026-10-02T23:00:00+05:30', type: 'deduction', amount: 10 }] },
      billFor: tariffComputerFor(caseFile),
    });
    // ~300 kWh/month on a bimonthly book: pro-rated to a month, not billed as a whole two-month cycle.
    expect(report.prepaid?.expected).toBeGreaterThan(0);
  });

  it('keeps Markdown structure intact against hostile text', async () => {
    const { log } = await makeLog({ days: 1 });
    const report = await buildReport({
      log,
      caseFile: { ...baseCase, meter: { type: 'postpaid' as const, serial: '[x](javascript:alert(1)) @someone' } },
    });
    const markdown = renderMarkdown(report);
    expect(markdown).not.toContain('[x](javascript');
    expect(markdown).not.toContain(' @someone');
    expect(() => parseCaseFile({ ...baseCase, bills: [{ id: 'a\n# heading', periodStart: START, periodEnd: DAY2_10AM, billedUnits: 1 }] })).toThrow(/single line/);
  });
});

describe('case files and helpers', () => {
  it('validates case files', () => {
    expect(() => parseCaseFile({ ...baseCase, bills: [{ id: 'x', periodStart: START, periodEnd: START, billedUnits: 1 }] })).toThrow(/periodEnd/);
    expect(() => parseCaseFile({ ...baseCase, utilityId: 'Bad Id' })).toThrow(/Invalid case file/);
  });

  it('escapes HTML metacharacters', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });

  it('prices bills with the bundled MESCOM tariff and lists consumer rights', () => {
    const billFor = tariffComputerFor(parseCaseFile(baseCase));
    const priced = billFor(200, START);
    expect(priced?.total).toBe(1824.9); // 200 x 5.80 + 3 kW x 150 + 200 x 0.35 + 9% tax on energy+fixed
    expect(priced?.label).toContain('KERC');
    expect(rightsFor('mescom').some((r) => r.topic === 'check_meter')).toBe(true);
    const short = billFor(20, START, 3);
    expect(short?.label).toContain('pro-rated');
    expect(short?.fixed).toBeCloseTo(450 * (3 / (365.25 / 12)), 6);
  });
});
