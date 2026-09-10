import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { makeSyncCode, readSyncCode } from "@/lib/pairing";

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto });
}

const { decrypt, encrypt, exportKey, importKey, makeKey } =
  await import("@/lib/crypto");

describe("encryption", () => {
  it("round-trips a journal", async () => {
    const key = await makeKey();
    const journal = JSON.stringify({ app: "marginalia", pages: [1, 2, 3] });
    expect(await decrypt(key, await encrypt(key, journal))).toBe(journal);
  });

  it("produces different ciphertext each time, so pushes aren't fingerprints", async () => {
    const key = await makeKey();
    const a = await encrypt(key, "same journal");
    const b = await encrypt(key, "same journal");
    expect(a).not.toBe(b);
    expect(await decrypt(key, b)).toBe("same journal");
  });

  it("is unreadable with the wrong key", async () => {
    const packed = await encrypt(await makeKey(), "private");
    await expect(decrypt(await makeKey(), packed)).rejects.toBeDefined();
  });

  it("survives a key going through the sync code and back", async () => {
    const key = await makeKey();
    const same = await importKey(await exportKey(key));
    expect(await decrypt(same, await encrypt(key, "hello"))).toBe("hello");
  });

  it("handles the accents and dashes a journal actually contains", async () => {
    const key = await makeKey();
    const text = "café — naïve · résumé · 日本 · 🖋";
    expect(await decrypt(key, await encrypt(key, text))).toBe(text);
  });
});

describe("sync codes", () => {
  const config = { token: "ghp_example", gistId: "abc123", key: "a2V5" };

  it("round-trips", () => {
    expect(readSyncCode(makeSyncCode(config))).toEqual(config);
  });

  it("tolerates the whitespace a paste picks up", () => {
    expect(readSyncCode(`  ${makeSyncCode(config)}\n`)).toEqual(config);
  });

  it("refuses something that isn't a sync code", () => {
    expect(() => readSyncCode("hello")).toThrow(/sync code/);
    expect(() => readSyncCode("marg1.@@@@")).toThrow(/damaged|incomplete/);
  });

  it("refuses a code missing a piece", () => {
    const half = "marg1." + btoa(JSON.stringify({ t: "x" }));
    expect(() => readSyncCode(half)).toThrow(/incomplete/);
  });
});
