/**
 * @open-tariff-india/evidence: the Meter Sakshi evidence engine.
 *
 *   const log = parseLog(csvText);
 *   const report = await buildReport({ log, caseFile, billFor: tariffComputerFor(caseFile), rights: rightsFor(id) });
 *   const html = renderHtml(report);
 */
export * from './log/format.js';
export { parseLog, LogFormatError } from './log/parse.js';
export { verifyChain, type ChainVerification } from './log/verify.js';
export { sha256Hex, genesisHash, genesisInput, recordInput } from './log/hash.js';
export { CaseFileSchema, parseCaseFile, type CaseFile, type BillClaim, type LedgerEntry, type TestWindow } from './case.js';
export { LogIndex, type DailyPoint, type Gap, type WindowStats } from './analysis/series.js';
export { reconcileBill, type BillReconciliation, type BillVerdict, type TariffComputer } from './analysis/reconcile.js';
export { auditPrepaid, type PrepaidAudit, type PrepaidDay } from './analysis/prepaid.js';
export { findOutages, matchRecharges, type Outage, type RechargeRestoration } from './analysis/supply.js';
export { creepTests, referenceTests, type CreepResult, type ReferenceResult } from './analysis/tests.js';
export { type Finding, type Severity } from './analysis/findings.js';
export { buildReport, METHOD, LIMITATIONS, type Report, type ReportInput, type RightsItem } from './report/build.js';
export { renderHtml, escapeHtml } from './report/html.js';
export { renderMarkdown } from './report/markdown.js';
export { simulateLog, type SimulateOptions } from './simulate.js';
export { tariffComputerFor, rightsFor } from './wiring.js';
