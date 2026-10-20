import crypto from "node:crypto";
import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { betterAuth } from "better-auth";
import type { BetterAuthPlugin } from "better-auth";
import { username } from "better-auth/plugins";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";
import { getDb } from "./db/index.ts";
import { UserError } from "./errors.ts";

export type Role = "owner" | "staff";
export type AuthOpts = { db: DatabaseSync; secret: string; baseURL: string; plugins?: BetterAuthPlugin[] };

// From a browser only these two Better Auth endpoints work. Sign-up, sign-in and every account endpoint
// (update-user, change-password, ...) need our internal header, so logins always pass our lockout and
// staff cannot edit their own account outside the owner's controls.
const BROWSER_OK = new Set(["/get-session", "/sign-out"]);

function build(o: AuthOpts, internal: string) {
  return {
    database: o.db,
    secret: o.secret,
    baseURL: o.baseURL,
    trustedOrigins: [o.baseURL, o.baseURL.replace("127.0.0.1", "localhost")],
    session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 60 }, // 12 hours: a forgotten owner login does not last for days
    emailAndPassword: { enabled: true, autoSignIn: false, minPasswordLength: 4, maxPasswordLength: 12 },
    user: { additionalFields: { role: { type: "string" as const, required: false, defaultValue: "staff", input: false } } },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (!BROWSER_OK.has(ctx.path) && ctx.headers?.get("x-lounge-internal") !== internal) {
          throw new APIError("FORBIDDEN", { message: "Not allowed" });
        }
      }),
    },
    plugins: [username(), ...(o.plugins ?? [])],
  };
}

/** Create Better Auth's tables. Run this BEFORE makeAuth, which checks that they exist. */
export async function migrateAuth(o: AuthOpts): Promise<void> {
  const { runMigrations } = await getMigrations(build(o, "migrate-only"));
  await runMigrations();
}

export function makeAuth(o: AuthOpts) {
  const internal = crypto.randomBytes(16).toString("hex");
  const internalHeaders = (base?: Headers) => {
    const h = new Headers(base);
    h.set("x-lounge-internal", internal);
    return h;
  };
  return { auth: betterAuth(build(o, internal)), internalHeaders };
}

export type Made = ReturnType<typeof makeAuth>;

export function hasAnyUser(): boolean {
  return getDb().prepare("SELECT 1 AS x FROM user LIMIT 1").get() !== undefined;
}

export async function createUser(
  m: Made,
  u: { username: string; pin: string; name: string; role: Role },
): Promise<string> {
  try {
    // A variable, not a literal: the username plugin adds a field TypeScript can't see through the plugin list.
    const body = { name: u.name, email: `${u.username}@lounge.invalid`, password: u.pin, username: u.username };
    const res = await m.auth.api.signUpEmail({ body, headers: m.internalHeaders() });
    getDb().prepare("UPDATE user SET role = ? WHERE id = ?").run(u.role, res.user.id);
    return res.user.id;
  } catch (e) {
    const msg = (e as { body?: { message?: string } }).body?.message;
    throw msg ? new UserError(msg) : e; // Better Auth's own wording ("Username is already taken…") is safe to show
  }
}

export type StaffRow = { id: string; name: string; username: string; role: Role };

export function listStaff(): StaffRow[] {
  return getDb()
    .prepare("SELECT id, name, username, role FROM user ORDER BY createdAt, id")
    .all()
    .map((r) => ({ ...r }) as StaffRow);
}

export function renameUser(userId: string, name: string): void {
  const clean = name.trim();
  if (!clean) throw new UserError("Name is required");
  if (clean.length > 60) throw new UserError("Name is too long (max 60 characters)");
  if (getDb().prepare("UPDATE user SET name = ? WHERE id = ?").run(clean, userId).changes === 0) throw new UserError("Person not found");
}

/** Replace a user's PIN. Caller must already have checked the actor is allowed to. */
export async function setPin(m: Made, userId: string, pin: string): Promise<void> {
  if (pin.length < 4 || pin.length > 12) throw new Error("PIN must be 4 to 12 characters");
  const ctx = await m.auth.$context;
  await ctx.internalAdapter.updatePassword(userId, await ctx.password.hash(pin));
  await ctx.internalAdapter.deleteUserSessions(userId); // sign that person out everywhere
}

export async function removeUser(m: Made, userId: string): Promise<void> {
  const ctx = await m.auth.$context;
  await ctx.internalAdapter.deleteUser(userId);
}

/**
 * Forgot-PIN recovery for someone who can touch the laptop: put the new PIN in data/reset-owner-pin.txt
 * and restart. The oldest owner's PIN is replaced and the file is deleted.
 */
export async function applyPinResetFile(m: Made, file: string): Promise<boolean> {
  if (!fs.existsSync(file)) return false;
  const pin = fs.readFileSync(file, "utf8").trim();
  fs.rmSync(file, { force: true });
  if (!/^\d{4,8}$/.test(pin)) return false;
  const owner = getDb().prepare("SELECT id FROM user WHERE role = 'owner' ORDER BY createdAt, id LIMIT 1").get() as { id: string } | undefined;
  if (!owner) return false;
  await setPin(m, owner.id, pin);
  return true;
}
