/**
 * Fingerprint a source document so reviewers can tell if a regulator silently
 * replaces a PDF.
 *
 * Usage:
 *   tsx scripts/hash-source.ts <url> [<url> ...]
 *   tsx scripts/hash-source.ts --book data/tariffs/ka-kerc/2026-27.json [--ref kerc-to-2025]
 *     (hashes every source in the book that lacks sha256, or just --ref, and writes the result back)
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const MAX_BYTES = 200 * 1024 * 1024;

/** Loopback, private, link-local and metadata hosts: never fetched, even after a redirect. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return true;
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

export async function sha256OfUrl(url: string): Promise<{ sha256: string; bytes: number; isPdf: boolean }> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error(`refusing non-http URL ${url}`);
  if (isPrivateHost(parsed.hostname)) throw new Error(`refusing private address ${parsed.hostname}`);
  const response = await fetch(parsed, { signal: AbortSignal.timeout(120_000), redirect: 'follow' });
  if (isPrivateHost(new URL(response.url || url).hostname)) throw new Error(`${url}: redirected to a private address`);
  if (!response.ok || !response.body) throw new Error(`${url}: HTTP ${response.status}`);
  const hash = createHash('sha256');
  let bytes = 0;
  let head = '';
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    if (bytes === 0) head = Buffer.from(chunk.subarray(0, 5)).toString('latin1');
    bytes += chunk.byteLength;
    if (bytes > MAX_BYTES) throw new Error(`${url}: larger than ${MAX_BYTES} bytes`);
    hash.update(chunk);
  }
  // Only fixed documents are worth fingerprinting; HTML pages change on every visit.
  const isPdf = head === '%PDF-' || (response.headers.get('content-type') ?? '').includes('pdf');
  return { sha256: hash.digest('hex'), bytes, isPdf };
}

/**
 * Insert `"sha256": "<hex>",` right after the source's "url" line, leaving the rest of the
 * hand-formatted file untouched. Returns null if the source block cannot be located.
 */
export function insertSha256(text: string, ref: string, sha256: string): string | null {
  const start = text.indexOf(`"${ref}": {`);
  if (start < 0) return null;
  const urlKey = text.indexOf('"url":', start);
  const blockEnd = text.indexOf('}', start);
  if (urlKey < 0 || urlKey > blockEnd) return null;
  const lineEnd = text.indexOf('\n', urlKey);
  if (lineEnd < 0 || lineEnd > blockEnd) return null;
  const indent = text.slice(text.lastIndexOf('\n', urlKey) + 1, urlKey);
  const urlLine = text.slice(urlKey, lineEnd).trimEnd();
  const isLastKey = !urlLine.endsWith(',');
  const fixedUrlLine = isLastKey ? `${urlLine},` : urlLine;
  const inserted = `${indent}"sha256": "${sha256}"${isLastKey ? '' : ','}`;
  return `${text.slice(0, urlKey)}${fixedUrlLine}\n${inserted}\n${text.slice(lineEnd + 1)}`;
}

async function hashBook(file: string, onlyRef?: string): Promise<void> {
  let text = await readFile(file, 'utf8');
  const book = JSON.parse(text) as { sources: Record<string, { url: string; type: string; sha256?: string }> };
  for (const [ref, source] of Object.entries(book.sources)) {
    if (onlyRef ? ref !== onlyRef : source.sha256 || source.type === 'news') continue;
    if (source.sha256) continue;
    try {
      const { sha256, bytes, isPdf } = await sha256OfUrl(source.url);
      if (!isPdf) {
        process.stdout.write(`skip  ${ref}: not a PDF (web pages change too often to fingerprint)\n`);
        continue;
      }
      const next = insertSha256(text, ref, sha256);
      if (next === null) {
        process.stderr.write(`skip  ${ref}: could not locate its "url" line; add sha256 ${sha256} by hand\n`);
        continue;
      }
      text = next;
      process.stdout.write(`ok    ${ref} ${sha256} (${bytes} bytes)\n`);
    } catch (error: unknown) {
      process.stderr.write(`fail  ${ref}: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    }
  }
  JSON.parse(text); // never write a file that no longer parses
  await writeFile(file, text);
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { book: { type: 'string' }, ref: { type: 'string' } } });
  if (values.book) return hashBook(values.book, values.ref);
  if (positionals.length === 0) throw new Error('usage: hash-source <url>... | --book <file> [--ref key]');
  for (const url of positionals) {
    const { sha256, bytes } = await sha256OfUrl(url);
    process.stdout.write(`${JSON.stringify({ url, sha256, bytes })}\n`);
  }
}

if (process.argv[1]?.includes('hash-source')) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
