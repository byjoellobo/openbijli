import { formatIst } from '../log/format.js';
import { kwh, pct, rupees, type Finding, type Severity } from '../analysis/findings.js';
import type { Report } from './build.js';

const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for HTML element and attribute contexts. Every dynamic value goes through this. */
export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}

function safeUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

const SEVERITY_LABEL: Readonly<Record<Severity, string>> = { high: 'Action needed', medium: 'Check', low: 'Note', info: 'Info', ok: 'OK' };

const MAX_BARS = 120;

/** Sum consecutive points so a long log still fits the chart (e.g. 400 days become 4-day bars). */
function aggregate(values: readonly { label: string; value: number }[]): { points: { label: string; value: number }[]; per: number } {
  const per = Math.ceil(values.length / MAX_BARS);
  if (per <= 1) return { points: [...values], per: 1 };
  const points: { label: string; value: number }[] = [];
  for (let i = 0; i < values.length; i += per) {
    const chunk = values.slice(i, i + per);
    points.push({ label: chunk[0]?.label ?? '', value: chunk.reduce((s, v) => s + v.value, 0) });
  }
  return { points, per };
}

function barChart(values: readonly { label: string; value: number }[], unit: string, width = 720, height = 170): string {
  if (values.length === 0) return '';
  const max = values.reduce((m, v) => Math.max(m, v.value), 1e-9);
  const gap = 2;
  const barWidth = Math.max(2, (width - 40) / values.length - gap);
  const plotHeight = height - 34;
  const bars = values
    .map((v, i) => {
      const h = (v.value / max) * plotHeight;
      const x = 36 + i * (barWidth + gap);
      return `<rect x="${x.toFixed(1)}" y="${(plotHeight - h + 6).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"><title>${escapeHtml(v.label)}: ${v.value.toFixed(2)} ${escapeHtml(unit)}</title></rect>`;
    })
    .join('');
  const first = values[0]?.label ?? '';
  const last = values.at(-1)?.label ?? '';
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(unit)} chart">
<text x="0" y="14" class="axis">${max.toFixed(1)}</text><text x="0" y="${plotHeight + 6}" class="axis">0</text>
<g class="bars">${bars}</g>
<text x="36" y="${height - 6}" class="axis">${escapeHtml(first)}</text><text x="${width}" y="${height - 6}" class="axis" text-anchor="end">${escapeHtml(last)}</text>
</svg>`;
}

function findingHtml(f: Finding): string {
  const details = f.details.length > 0 ? `<ul>${f.details.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>` : '';
  return `<article class="finding ${f.severity}"><header><span class="badge">${SEVERITY_LABEL[f.severity]}</span><h3>${escapeHtml(f.title)}</h3></header><p>${escapeHtml(f.summary)}</p>${details}</article>`;
}

function row(cells: readonly unknown[], header = false): string {
  const tag = header ? 'th' : 'td';
  return `<tr>${cells.map((c) => `<${tag}>${escapeHtml(c)}</${tag}>`).join('')}</tr>`;
}

function billsTable(report: Report): string {
  if (report.bills.length === 0) return '<p>No bills were entered.</p>';
  const rows = report.bills.map((b) =>
    row([
      b.bill.id,
      `${formatIst(b.window.startMinute)} → ${formatIst(b.window.endMinute)}`,
      kwh(b.bill.billedUnits),
      kwh(b.estimatedKwh),
      pct(b.window.coverage),
      b.discrepancyPct === null ? 'n/a' : pct(b.discrepancyPct),
      b.bill.billedAmount === undefined ? '' : rupees(b.bill.billedAmount),
      b.expectedAmountForBilled === undefined ? '' : rupees(b.expectedAmountForBilled),
      b.verdict.replaceAll('_', ' '),
    ]),
  );
  return `<table>${row(['Bill', 'Period', 'Billed', 'Logged', 'Coverage', 'Difference', 'Charged', 'Tariff gives', 'Verdict'], true)}${rows.join('')}</table>`;
}

function consumerBlock(report: Report): string {
  const c = report.caseFile;
  const items: [string, string | undefined][] = [
    ['Consumer', c.consumer?.name],
    ['Account no.', c.consumer?.accountNumber],
    ['Address', c.consumer?.address],
    ['Utility', c.utilityId.toUpperCase()],
    ['Sanctioned load', `${c.sanctionedLoadKw} kW (${c.phase ?? 'single'}-phase)`],
    ['Meter', [c.meter.make, c.meter.serial, c.meter.type].filter(Boolean).join(', ')],
    ['Meter constant', `${report.device.impPerKwhUsed} imp/kWh`],
    ['Device', `${report.device.deviceId} (firmware ${report.device.firmware ?? 'unknown'})`],
    ['Log span', `${formatIst(report.log.firstMinute)} → ${formatIst(report.log.lastMinute)} (${report.log.records} records, ${pct(report.log.coverage)} coverage)`],
  ];
  return `<dl>${items
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`)
    .join('')}</dl>`;
}

const STYLE = `
:root{--ink:#1b1f24;--muted:#5b6470;--line:#d9dee4;--high:#b42318;--medium:#b54708;--low:#475467;--ok:#067647;--info:#175cd3;--bar:#2e6f8e}
*{box-sizing:border-box}body{font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",sans-serif;color:var(--ink);margin:0;background:#fff}
main{max-width:860px;margin:0 auto;padding:32px 24px 64px}h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:36px 0 12px;padding-bottom:6px;border-bottom:1px solid var(--line)}
h3{font-size:15px;margin:0}.lede{color:var(--muted);margin:0 0 24px}dl{display:grid;grid-template-columns:150px 1fr;gap:4px 16px;margin:0}dt{color:var(--muted)}dd{margin:0}
.finding{border:1px solid var(--line);border-left:4px solid var(--low);border-radius:6px;padding:12px 14px;margin:10px 0;break-inside:avoid}
.finding header{display:flex;gap:10px;align-items:baseline}.finding p{margin:6px 0 0}.finding ul{margin:6px 0 0;padding-left:18px;color:var(--muted)}
.badge{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
.high{border-left-color:var(--high)}.high .badge{color:var(--high)}.medium{border-left-color:var(--medium)}.medium .badge{color:var(--medium)}
.low .badge{color:var(--low)}.info{border-left-color:var(--info)}.info .badge{color:var(--info)}.ok{border-left-color:var(--ok)}.ok .badge{color:var(--ok)}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600}
.chart{width:100%;height:auto}.bars rect{fill:var(--bar)}.axis{font-size:11px;fill:var(--muted)}ol li,ul.plain li{margin:6px 0}a{color:var(--info)}
.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;word-break:break-all}footer{margin-top:40px;color:var(--muted);font-size:12px}
@media print{main{padding:0}h2{break-after:avoid}a{color:inherit}}
`;

/** Self-contained, printable HTML dispute report. */
export function renderHtml(report: Report): string {
  const days = aggregate(report.daily.map((d) => ({ label: d.date, value: d.kwh })));
  const daily = barChart(days.points, days.per > 1 ? `kWh per ${days.per} days` : 'kWh/day');
  const hourly = barChart(report.hourlyProfile.map((v, h) => ({ label: `${String(h).padStart(2, '0')}:00`, value: v })), 'kWh in hour', 720, 140);
  const steps = report.nextSteps
    .map((s) => {
      const url = safeUrl(s.sourceUrl);
      const source = url ? ` <a href="${escapeHtml(url)}" rel="noopener noreferrer">${escapeHtml(s.sourceTitle ?? 'source')}</a>` : '';
      return `<li>${escapeHtml(s.summary)}${source}</li>`;
    })
    .join('');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<title>Meter Sakshi evidence report: ${escapeHtml(report.caseFile.utilityId.toUpperCase())}</title><style>${STYLE}</style></head>
<body><main>
<h1>Electricity consumption evidence report</h1>
<p class="lede">Prepared with Meter Sakshi, a non-contact reader of the meter's pulse LED, and the OpenBijli dataset. Generated ${escapeHtml(report.generatedAt.slice(0, 16).replace('T', ' '))} UTC.</p>
${consumerBlock(report)}
<h2>Findings</h2>
${report.findings.map(findingHtml).join('')}
<h2>Bills compared with the meter</h2>
${billsTable(report)}
<h2>Daily consumption registered by the meter</h2>
${daily}
<h2>Average consumption by hour (IST)</h2>
${hourly}
<h2>How this was measured</h2>
<ul class="plain">${report.method.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>
<h2>Limitations</h2>
<ul class="plain">${report.limitations.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>
<h2>Next steps</h2>
<ol>${steps}</ol>
<h2>Integrity</h2>
<p>${escapeHtml(report.log.chain.message)}</p>
<p class="mono">Chain anchor (${escapeHtml(report.log.chain.anchor)}): ${escapeHtml(report.log.chain.anchorHash)}<br>Last record hash: ${escapeHtml(report.log.lastHash)}</p>
${report.caseFile.notes ? `<h2>Consumer's notes</h2><p>${escapeHtml(report.caseFile.notes)}</p>` : ''}
<footer>The device never opened, wired into or altered the meter. This report is the consumer's own evidence and is not a certified meter test.</footer>
</main></body></html>`;
}
