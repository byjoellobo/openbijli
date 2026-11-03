import type { ParsedLog } from './format.js';
import { genesisHash, recordInput, sha256Hex } from './hash.js';

export interface ChainVerification {
  readonly ok: boolean;
  readonly checked: number;
  /** genesis: chain starts at the device genesis. chain_prev: export continues an earlier chain. */
  readonly anchor: 'genesis' | 'chain_prev';
  readonly anchorHash: string;
  /**
   * True only for genesis-anchored logs, where the device id and meter constant are bound
   * into the first hash. A chain_prev export's header is not covered by the chain.
   */
  readonly headerBound: boolean;
  /** Index of the first record whose hash does not match, if any. */
  readonly firstBrokenIndex?: number;
  readonly brokenCount: number;
  /** Daily digests that do not match the record they point at. */
  readonly badDigests: readonly string[];
  readonly message: string;
}

const BATCH = 2048;

/**
 * Recompute every record hash. Records are checked in parallel batches: record i's
 * expected hash depends only on the STORED hash of record i-1, so a single edited
 * record breaks its own link and the next one, and is located exactly.
 */
export async function verifyChain(log: ParsedLog): Promise<ChainVerification> {
  const anchor = log.header.chainPrev ? 'chain_prev' : 'genesis';
  const anchorHash = log.header.chainPrev ?? (await genesisHash(log.header.deviceId, log.header.impPerKwh));
  const broken: number[] = [];

  for (let start = 0; start < log.records.length; start += BATCH) {
    const batch = log.records.slice(start, start + BATCH);
    const expected = await Promise.all(
      batch.map((record) => {
        const previous = record.index === 0 ? anchorHash : (log.records[record.index - 1]?.hash ?? '');
        return sha256Hex(recordInput(previous, record.minute, record.pulses, record.flags));
      }),
    );
    batch.forEach((record, i) => {
      if (expected[i] !== record.hash) broken.push(record.index);
    });
  }

  const lastHashOfDay = new Map<string, string>();
  for (const record of log.records) lastHashOfDay.set(record.minute.slice(0, 10), record.hash);
  // A digest must match the day it names; a digest for a day absent from the export is also a failure.
  const badDigests = log.digests.filter((d) => lastHashOfDay.get(d.date) !== d.hash).map((d) => d.date);

  const ok = broken.length === 0 && badDigests.length === 0;
  const first = broken[0];
  const message = ok
    ? `All ${log.records.length} records chain consistently from the ${anchor === 'genesis' ? 'device genesis' : 'stated previous hash'}.`
    : first !== undefined
      ? `Hash chain broken at record ${first + 1} (${log.records[first]?.minute}); ${broken.length} record(s) fail. The log was edited, reordered or corrupted.`
      : `Daily digest mismatch for ${badDigests.join(', ')}.`;

  return {
    ok,
    checked: log.records.length,
    anchor,
    anchorHash,
    headerBound: anchor === 'genesis',
    ...(first !== undefined ? { firstBrokenIndex: first } : {}),
    brokenCount: broken.length,
    badDigests,
    message,
  };
}
