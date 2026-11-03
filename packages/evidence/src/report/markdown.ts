import { formatIst } from '../log/format.js';
import { kwh, pct, rupees, type Severity } from '../analysis/findings.js';
import type { Report } from './build.js';

const LABEL: Readonly<Record<Severity, string>> = { high: 'ACTION', medium: 'CHECK', low: 'NOTE', info: 'INFO', ok: 'OK' };

/**
 * Escape text for Markdown: collapse line breaks (so a value cannot start a new heading,
 * list or table row) and backslash-escape characters with Markdown meaning. Mentions are
 * broken with a zero-width space so pasted reports cannot ping people.
 */
export function md(value: unknown): string {
  return String(value)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/([\\`*_[\]<>|#!()~&:])/g, '\\$1')
    .replace(/@/g, '@​');
}

function mdUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.href.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/ /g, '%20');
  } catch {
    return null;
  }
}

/** Plain Markdown version of the report (for e-mail, GitHub issues, or conversion to PDF). */
export function renderMarkdown(report: Report): string {
  const c = report.caseFile;
  const lines: string[] = [
    '# Electricity consumption evidence report',
    '',
    `Generated ${report.generatedAt.slice(0, 16).replace('T', ' ')} UTC with Meter Sakshi and the Open Tariff India dataset.`,
    '',
    `- Utility: ${md(c.utilityId.toUpperCase())}; sanctioned load ${c.sanctionedLoadKw} kW; ${c.meter.type} meter${c.meter.serial ? ` ${md(c.meter.serial)}` : ''}`,
    `- Device ${md(report.device.deviceId)}, meter constant ${report.device.impPerKwhUsed} imp/kWh`,
    `- Log ${formatIst(report.log.firstMinute)} to ${formatIst(report.log.lastMinute)}, ${report.log.records} records, ${pct(report.log.coverage)} coverage`,
    '',
    '## Findings',
    '',
  ];
  for (const f of report.findings) {
    lines.push(`- **[${LABEL[f.severity]}] ${md(f.title)}**  `, `  ${md(f.summary)}`);
    for (const d of f.details) lines.push(`  - ${md(d)}`);
  }
  if (report.bills.length > 0) {
    lines.push('', '## Bills compared with the meter', '', '| Bill | Billed | Logged | Coverage | Charged | Tariff gives | Verdict |', '|---|---|---|---|---|---|---|');
    for (const b of report.bills) {
      lines.push(
        `| ${md(b.bill.id)} | ${kwh(b.bill.billedUnits)} | ${kwh(b.estimatedKwh)} | ${pct(b.window.coverage)} | ${b.bill.billedAmount === undefined ? '' : rupees(b.bill.billedAmount)} | ${b.expectedAmountForBilled === undefined ? '' : rupees(b.expectedAmountForBilled)} | ${b.verdict.replaceAll('_', ' ')} |`,
      );
    }
  }
  lines.push('', '## How this was measured', '', ...report.method.map((m) => `- ${md(m)}`));
  lines.push('', '## Limitations', '', ...report.limitations.map((m) => `- ${md(m)}`));
  lines.push('', '## Next steps', '');
  report.nextSteps.forEach((s, i) => {
    const url = mdUrl(s.sourceUrl);
    lines.push(`${i + 1}. ${md(s.summary)}${url ? ` ([${md(s.sourceTitle ?? 'source')}](${url}))` : ''}`);
  });
  lines.push('', '## Integrity', '', md(report.log.chain.message), '', `Anchor: \`${report.log.chain.anchorHash}\`  `, `Last record: \`${report.log.lastHash}\``, '');
  return lines.join('\n');
}
