import crypto from "node:crypto";

// No 0/O, 1/I/L, 5/S, 2/Z or 8/B: nothing that can be misread when retyping.
const CHARS = "ACDEFGHJKMNPQRTUVWXY34679";
export const CHALLENGE_MINUTES = 30;

const macOf = (secret: string, code: string, expires: number) => crypto.createHmac("sha256", secret).update(`clear:${code}:${expires}`).digest("hex");

/**
 * A random code the person must retype before something dangerous happens. It is signed with the install's secret and carries
 * its own expiry, so the server needs to remember nothing between showing it and checking it.
 */
export function makeChallenge(secret: string, now = Date.now()): { code: string; expires: number; mac: string } {
  const code = Array.from({ length: 6 }, () => CHARS[crypto.randomInt(CHARS.length)]).join("");
  const expires = now + CHALLENGE_MINUTES * 60_000;
  return { code, expires, mac: macOf(secret, code, expires) };
}

/** "ok", "expired" (right code, too late) or "wrong" (typed code doesn't match, or the signature was tampered with). Case and spaces don't matter. */
export function checkChallenge(secret: string, typed: string, expires: string, mac: string, now = Date.now()): "ok" | "expired" | "wrong" {
  const code = typed.replace(/\s+/g, "").toUpperCase();
  const exp = /^\d{1,15}$/.test(expires) ? Number(expires) : NaN;
  if (!code || !Number.isFinite(exp) || !/^[0-9a-f]{64}$/.test(mac)) return "wrong";
  const want = Buffer.from(macOf(secret, code, exp), "hex");
  const got = Buffer.from(mac, "hex");
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return "wrong";
  return now > exp ? "expired" : "ok";
}
