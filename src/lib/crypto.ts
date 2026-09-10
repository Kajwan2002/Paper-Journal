/** End-to-end encryption for the synced copy.
 *
 *  A secret gist is unlisted, not private — anyone holding the URL can read
 *  it, and the URL travels with the token. So the journal is encrypted on
 *  the device before it ever leaves, with a key that lives only in the sync
 *  code you carry between your own devices. GitHub stores ciphertext and
 *  nothing else.
 *
 *  AES-GCM, 256-bit, fresh random IV per push. */

const ALGO = "AES-GCM";

export async function makeKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: ALGO, length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return toBase64(new Uint8Array(raw));
}

export async function importKey(encoded: string): Promise<CryptoKey> {
  const raw = fromBase64(encoded);
  return crypto.subtle.importKey("raw", raw, ALGO, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encrypt(key: CryptoKey, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    new TextEncoder().encode(plain),
  );
  const packed = new Uint8Array(iv.length + body.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(body), iv.length);
  return toBase64(packed);
}

export async function decrypt(key: CryptoKey, packed: string): Promise<string> {
  const bytes = fromBase64(packed);
  const iv = bytes.slice(0, 12);
  const body = bytes.slice(12);
  const plain = await crypto.subtle.decrypt({ name: ALGO, iv }, key, body);
  return new TextDecoder().decode(plain);
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(encoded: string): Uint8Array<ArrayBuffer> {
  const s = atob(encoded);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
