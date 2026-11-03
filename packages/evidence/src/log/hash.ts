/** SHA-256 helpers on WebCrypto, so the same code runs in Node 22+ and browsers. */

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto (crypto.subtle) is not available in this environment');
  return toHex(await subtle.digest('SHA-256', encoder.encode(text)));
}

export function genesisInput(deviceId: string, impPerKwh: number): string {
  return `meter-sakshi|v1|${deviceId}|${impPerKwh}`;
}

export function recordInput(previousHash: string, minute: string, pulses: number, flags: number): string {
  return `${previousHash}|${minute}|${pulses}|${flags}`;
}

export async function genesisHash(deviceId: string, impPerKwh: number): Promise<string> {
  return sha256Hex(genesisInput(deviceId, impPerKwh));
}
