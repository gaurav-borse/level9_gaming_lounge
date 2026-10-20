import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { nextCookies } from "better-auth/next-js";
import { makeAuth, type Made } from "./auth-core.ts";
import { dataDir, getDb } from "./db/index.ts";

export const port = (): string => process.env.PORT ?? "3000";

/** Per-install secret: BETTER_AUTH_SECRET if set, otherwise generated once into data/auth-secret. */
function secret(): string {
  if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
  const file = path.join(dataDir(), "auth-secret");
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
  const s = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(file, s, { mode: 0o600 });
  return s;
}

export const authOpts = () => ({
  db: getDb(),
  secret: secret(),
  baseURL: `http://127.0.0.1:${port()}`,
  plugins: [nextCookies()],
});

type G = typeof globalThis & { __loungeAuth?: Made };

export function getAuth(): Made {
  const g = globalThis as G;
  return (g.__loungeAuth ??= makeAuth(authOpts()));
}
