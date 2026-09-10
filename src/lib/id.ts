/** `crypto.randomUUID` only exists in a secure context. The README tells you
 *  to open the app from the LAN address Vite prints — `http://192.168.x.x` —
 *  which is *not* secure, so on iOS Safari and Chrome the whole app used to
 *  throw the moment it tried to mint an id. Fall back through
 *  `getRandomValues` and finally to time + Math.random. */

export function newId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();

  if (c?.getRandomValues) {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10
    const hex = Array.from(b, (n) => n.toString(16).padStart(2, "0"));
    return [
      hex.slice(0, 4).join(""),
      hex.slice(4, 6).join(""),
      hex.slice(6, 8).join(""),
      hex.slice(8, 10).join(""),
      hex.slice(10, 16).join(""),
    ].join("-");
  }

  // last resort: still collision-safe enough for one device's own lines
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
