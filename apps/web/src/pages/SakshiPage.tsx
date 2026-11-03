import { useRef, useState } from 'react';
import {
  buildReport,
  parseCaseFile,
  parseLog,
  renderHtml,
  renderMarkdown,
  rightsFor,
  tariffComputerFor,
  type CaseFile,
  type Report,
} from '@open-tariff-india/evidence';
import { UtilitySelect } from '../components/UtilitySelect';
import { DEFAULT_UTILITY } from '../lib/catalog';
import { parseNumber } from '../lib/format';

interface BillRow {
  id: string;
  start: string;
  end: string;
  units: string;
  amount: string;
}

const IST = '+05:30';
const toIso = (local: string): string => `${local.length === 16 ? `${local}:00` : local}${IST}`;
const fromIso = (iso: string): string => iso.slice(0, 16);

function parseLedger(text: string): NonNullable<CaseFile['prepaidLedger']> {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line, i) => {
      const [when, type, amount] = line.split(',').map((p) => p.trim());
      if (!when || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(when)) throw new Error(`Ledger line ${i + 1}: write the time as 2026-10-02 09:30`);
      if (type !== 'recharge' && type !== 'deduction') throw new Error(`Ledger line ${i + 1}: type must be recharge or deduction`);
      const value = Number(amount);
      if (!Number.isFinite(value) || value < 0) throw new Error(`Ledger line ${i + 1}: amount must be a number`);
      return { timestamp: toIso(when.replace(' ', 'T')), type, amount: value };
    });
}

function download(name: string, type: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function SakshiPage() {
  const [logText, setLogText] = useState<string | null>(null);
  const [logName, setLogName] = useState('');
  const [utilityId, setUtilityId] = useState(DEFAULT_UTILITY);
  const [load, setLoad] = useState('3');
  const [meterType, setMeterType] = useState<'prepaid' | 'postpaid'>('postpaid');
  const [serial, setSerial] = useState('');
  const [bills, setBills] = useState<BillRow[]>([{ id: 'bill-1', start: '', end: '', units: '', amount: '' }]);
  const [ledger, setLedger] = useState('');
  const [reconnection, setReconnection] = useState('');
  const [notes, setNotes] = useState('');
  const [extras, setExtras] = useState<Pick<CaseFile, 'creepTests' | 'referenceTests'>>({});
  const [report, setReport] = useState<{ data: Report; html: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadSample(): Promise<void> {
    const [{ default: csv }, { default: caseJson }] = await Promise.all([
      import('../../../../hardware/meter-sakshi/samples/sample-log.csv?raw'),
      import('../../../../hardware/meter-sakshi/samples/sample-case.json?raw'),
    ]);
    const sample = parseCaseFile(JSON.parse(caseJson) as unknown);
    setLogText(csv);
    setLogName('sample-log.csv (demo data)');
    setUtilityId(sample.utilityId);
    setLoad(String(sample.sanctionedLoadKw));
    setMeterType(sample.meter.type);
    setSerial(sample.meter.serial ?? '');
    setBills(sample.bills.map((b) => ({ id: b.id, start: fromIso(b.periodStart), end: fromIso(b.periodEnd), units: String(b.billedUnits), amount: String(b.billedAmount ?? '') })));
    setLedger((sample.prepaidLedger ?? []).map((e) => `${e.timestamp.slice(0, 16).replace('T', ' ')}, ${e.type}, ${e.amount}`).join('\n'));
    setReconnection(String(sample.reconnectionStandardHours ?? ''));
    setNotes(sample.notes ?? '');
    setExtras({ ...(sample.creepTests ? { creepTests: sample.creepTests } : {}), ...(sample.referenceTests ? { referenceTests: sample.referenceTests } : {}) });
    setReport(null);
    setError('');
  }

  async function onFile(file: File | undefined): Promise<void> {
    if (!file) return;
    if (file.size > 60 * 1024 * 1024) {
      setError('That file is larger than 60 MB. Export a shorter date range from the device.');
      return;
    }
    setLogText(await file.text());
    setLogName(file.name);
    setReport(null);
  }

  async function generate(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      if (!logText) throw new Error('Choose the CSV log exported from your Meter Sakshi first.');
      const caseFile = parseCaseFile({
        utilityId,
        sanctionedLoadKw: parseNumber(load, 1),
        meter: { type: meterType, ...(serial ? { serial } : {}) },
        bills: bills
          .filter((b) => b.start && b.end && b.units)
          .map((b) => ({
            id: b.id || 'bill',
            periodStart: toIso(b.start),
            periodEnd: toIso(b.end),
            billedUnits: parseNumber(b.units, 0),
            ...(b.amount ? { billedAmount: parseNumber(b.amount, 0) } : {}),
          })),
        ...(ledger.trim() ? { prepaidLedger: parseLedger(ledger) } : {}),
        ...(reconnection ? { reconnectionStandardHours: parseNumber(reconnection, 24) } : {}),
        ...(notes ? { notes } : {}),
        ...extras,
      });
      const data = await buildReport({ log: parseLog(logText), caseFile, billFor: tariffComputerFor(caseFile), rights: rightsFor(caseFile.utilityId) });
      setReport({ data, html: renderHtml(data) });
      requestAnimationFrame(() => document.getElementById('result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const updateBill = (index: number, patch: Partial<BillRow>) => setBills(bills.map((b, i) => (i === index ? { ...b, ...patch } : b)));

  return (
    <>
      <h1>
        <span className="pulse" aria-hidden="true" />
        Build evidence for a billing dispute
      </h1>
      <p className="lede">
        Meter Sakshi counts the flashes of your meter's own pulse LED without touching the meter. Load its log, add the bill you
        are questioning, and get a report you can attach to a complaint.
      </p>
      <div className="workbench">
        <form className="controls steps" onSubmit={(e) => { e.preventDefault(); void generate(); }}>
          <p className="privacy">Your log and bill details stay in this browser. Nothing is uploaded.</p>
          <fieldset className="step">
            <legend>1. The device log</legend>
            <label className="field">
              <span>CSV file from your Meter Sakshi</span>
              <input type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} />
              <small>{logName ? `Loaded: ${logName}` : 'On the device page, choose Download log.'}</small>
            </label>
            <div className="actions">
              <button type="button" className="quiet" onClick={() => void loadSample()}>
                No device yet? Try demo data
              </button>
            </div>
          </fieldset>
          <fieldset className="step">
            <legend>2. Your connection</legend>
            <UtilitySelect value={utilityId} onChange={setUtilityId} />
            <div className="row">
              <label className="field">
                <span>Sanctioned load (kW)</span>
                <input type="number" min="0.25" step="0.25" value={load} onChange={(e) => setLoad(e.target.value)} />
              </label>
              <label className="field">
                <span>Meter</span>
                <select value={meterType} onChange={(e) => setMeterType(e.target.value as 'prepaid' | 'postpaid')}>
                  <option value="postpaid">Postpaid</option>
                  <option value="prepaid">Prepaid</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>Meter serial number (optional)</span>
              <input type="text" maxLength={40} value={serial} onChange={(e) => setSerial(e.target.value)} />
            </label>
          </fieldset>
          <fieldset className="step">
            <legend>3. The bills you are questioning</legend>
            <small className="hint">Copy the period, units and amount from each bill. Times are in IST.</small>
            <div className="bill-rows">
              {bills.map((b, i) => (
                <div className="bill-row" key={i}>
                  <label className="field">
                    <span>From</span>
                    <input type="datetime-local" value={b.start} onChange={(e) => updateBill(i, { start: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>To</span>
                    <input type="datetime-local" value={b.end} onChange={(e) => updateBill(i, { end: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>Units billed</span>
                    <input type="number" min="0" value={b.units} onChange={(e) => updateBill(i, { units: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>Amount (₹)</span>
                    <input type="number" min="0" value={b.amount} onChange={(e) => updateBill(i, { amount: e.target.value })} />
                  </label>
                  {bills.length > 1 && (
                    <button type="button" className="quiet small" onClick={() => setBills(bills.filter((_, j) => j !== i))}>
                      Remove this bill
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="actions">
              <button type="button" className="quiet" onClick={() => setBills([...bills, { id: `bill-${bills.length + 1}`, start: '', end: '', units: '', amount: '' }])}>
                Add another bill
              </button>
            </div>
          </fieldset>
          <fieldset className="step">
            <legend>4. Anything else (optional)</legend>
            {meterType === 'prepaid' && (
              <label className="field">
                <span>Recharges and deductions</span>
                <textarea rows={5} value={ledger} onChange={(e) => setLedger(e.target.value)} placeholder={'2026-10-02 09:30, recharge, 500\n2026-10-02 23:55, deduction, 160'} />
                <small>One per line from your utility app: date and time (IST), recharge or deduction, amount.</small>
              </label>
            )}
            <label className="field">
              <span>Hours within which supply must return after a recharge</span>
              <input type="number" min="0" value={reconnection} onChange={(e) => setReconnection(e.target.value)} />
              <small>Only if you know your state's standard; the national rules set no number of hours.</small>
            </label>
            <label className="field">
              <span>Your notes for the report</span>
              <textarea rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </fieldset>
          <div className="actions">
            <button type="submit" disabled={busy || !logText}>
              {busy ? 'Checking the log...' : 'Build report'}
            </button>
            {!logText && <small className="hint">Load a log first (step 1).</small>}
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
        <section id="result" className="result" aria-live="polite">
          {report ? (
            <ReportView report={report.data} html={report.html} />
          ) : (
            <div className="placeholder">
              <h2>Your report will appear here</h2>
              <p>
                It compares each bill with what the meter itself registered, checks prepaid deductions against the tariff, times how
                long supply took to return after a recharge, and lists the complaint routes the rules give you.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

const SEVERITY_TEXT: Readonly<Record<Report['findings'][number]['severity'], string>> = {
  high: 'Needs action',
  medium: 'Worth checking',
  low: 'Note',
  info: 'For information',
  ok: 'In order',
};

function ReportView({ report, html }: { report: Report; html: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(900);
  const important = report.findings.filter((f) => f.severity === 'high' || f.severity === 'medium');
  return (
    <>
      <h2>{important.length > 0 ? `${important.length} finding${important.length > 1 ? 's' : ''} to raise with your utility` : 'Nothing that needs action'}</h2>
      <ul className="finding-list">
        {report.findings.map((f) => (
          <li key={f.id} className={f.severity}>
            <span className="sev">{SEVERITY_TEXT[f.severity]}</span> {f.title}
          </li>
        ))}
      </ul>
      <div className="actions">
        <button type="button" onClick={() => download('meter-sakshi-report.html', 'text/html', html)}>
          Download report
        </button>
        <button type="button" className="quiet" onClick={() => download('meter-sakshi-report.md', 'text/markdown', renderMarkdown(report))}>
          Download as text (Markdown)
        </button>
      </div>
      <p className="hint">Open the downloaded report in a browser and print it to PDF to attach it to a complaint.</p>
      <iframe
        ref={frame}
        className="report-frame"
        title="Full evidence report"
        // No scripts run in the report (its own CSP is default-src 'none'); same-origin only lets this page measure its height.
        sandbox="allow-same-origin"
        srcDoc={html}
        style={{ height }}
        onLoad={() => {
          const doc = frame.current?.contentDocument;
          if (doc) setHeight(doc.documentElement.scrollHeight + 4);
        }}
      />
    </>
  );
}
