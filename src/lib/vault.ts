import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Keeps secrets (the Tiingo keys added on the admin page) encrypted in the database. The key comes from ADMIN_PASSWORD, so a
 * copy of the database alone is not enough to read them. Changing ADMIN_PASSWORD makes the saved keys unreadable: add them again.
 */

const password = () => (process.env.ADMIN_PASSWORD ?? "").trim();
export const vaultReady = (): boolean => password().length >= 8;

let derived: { from: string; key: Buffer } | null = null;
function vaultKey(): Buffer {
  const pw = password();
  if (!pw) throw new Error("ADMIN_PASSWORD is not set");
  if (!derived || derived.from !== pw) derived = { from: pw, key: scryptSync(pw, "replay-vault-v1", 32) };
  return derived.key;
}

/** AES-256-GCM. The result is iv, tag and ciphertext in one base64 string. */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", vaultKey(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64");
}

/** The original text, or null if it can't be read (wrong password, or tampered with). */
export function decrypt(blob: string): string | null {
  try {
    const raw = Buffer.from(blob, "base64");
    const d = createDecipheriv("aes-256-gcm", vaultKey(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
