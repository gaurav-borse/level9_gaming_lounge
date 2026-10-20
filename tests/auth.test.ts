import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { makeAuth, migrateAuth, createUser, hasAnyUser, listStaff, setPin, removeUser, renameUser, applyPinResetFile } from "../lib/auth-core.ts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeLockout } from "../lib/lockout.ts";
import { UserError } from "../lib/errors.ts";
import { closeDb, getDb } from "../lib/db/index.ts";

async function setup() {
  process.env.LOUNGE_DB = ":memory:";
  closeDb();
  const db = getDb();
  const opts = { db: db as DatabaseSync, secret: crypto.randomBytes(32).toString("hex"), baseURL: "http://127.0.0.1:3000" };
  await migrateAuth(opts);
  return makeAuth(opts);
}

const post = (m: Awaited<ReturnType<typeof setup>>, path: string, body: unknown, headers: Record<string, string> = {}) =>
  m.auth.handler(new Request(`http://127.0.0.1:3000/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000", ...headers },
    body: JSON.stringify(body),
  }));

test("owner can sign in with username + PIN and the session carries the role", async () => {
  const m = await setup();
  assert.equal(hasAnyUser(), false);
  await createUser(m, { username: "owner", pin: "4821", name: "Owner", role: "owner" });
  assert.equal(hasAnyUser(), true);

  const res = await m.auth.api.signInUsername({
    body: { username: "owner", password: "4821" }, headers: m.internalHeaders(), asResponse: true,
  });
  assert.equal(res.status, 200);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  assert.match(res.headers.getSetCookie().join(";"), /HttpOnly/i);
  const session = await m.auth.api.getSession({ headers: new Headers({ cookie }) });
  assert.equal((session?.user as { username?: string }).username, "owner");
  assert.equal((session?.user as { role?: string }).role, "owner");
});

test("sign-in and sign-up straight from the browser are refused", async () => {
  const m = await setup();
  await createUser(m, { username: "owner", pin: "4821", name: "Owner", role: "owner" });
  assert.equal((await post(m, "/sign-in/username", { username: "owner", password: "4821" })).status, 403);
  assert.equal((await post(m, "/sign-in/email", { email: "owner@lounge.invalid", password: "4821" })).status, 403);
  assert.equal((await post(m, "/sign-up/email", { name: "x", email: "x@y.com", password: "1234", username: "evil" })).status, 403);
  assert.equal(getDb().prepare("SELECT count(*) AS n FROM user").get()!.n, 1);
});

test("wrong PIN fails; staff default to the staff role; duplicate usernames rejected", async () => {
  const m = await setup();
  await createUser(m, { username: "owner", pin: "4821", name: "Owner", role: "owner" });
  const sid = await createUser(m, { username: "counter", pin: "1234", name: "Counter", role: "staff" });
  assert.ok(sid);
  await assert.rejects(m.auth.api.signInUsername({ body: { username: "owner", password: "0000" }, headers: m.internalHeaders() }));
  await assert.rejects(createUser(m, { username: "counter", pin: "9999", name: "Dup", role: "staff" }), UserError);
  const row = getDb().prepare("SELECT role FROM user WHERE username = 'counter'").get() as { role: string };
  assert.equal(row.role, "staff");
});

test("PIN length limits come from the auth config", async () => {
  const m = await setup();
  await assert.rejects(createUser(m, { username: "a", pin: "123", name: "A", role: "staff" }));
  await assert.rejects(createUser(m, { username: "b", pin: "1".repeat(13), name: "B", role: "staff" }));
});

test("lockout: attempts count when they START, so parallel guesses cannot beat it; success clears; window expires", () => {
  let t = 1_000_000;
  const l = makeLockout(5, 60_000, () => t);
  for (let i = 0; i < 5; i++) assert.equal(l.take("owner"), 0); // five tries allowed, none had to fail first
  const wait = l.take("owner");
  assert.ok(wait > 0 && wait <= 60);
  assert.equal(l.take("someone-else"), 0);
  t += 61_000;
  assert.equal(l.take("owner"), 0);
  l.clear("owner");
  for (let i = 0; i < 5; i++) assert.equal(l.take("owner"), 0);
});

const signIn = (m: Awaited<ReturnType<typeof setup>>, u: string, p: string) =>
  m.auth.api.signInUsername({ body: { username: u, password: p }, headers: m.internalHeaders() });

test("setPin replaces the PIN and signs the person out; removeUser deletes them", async () => {
  const m = await setup();
  await createUser(m, { username: "owner", pin: "4821", name: "Owner", role: "owner" });
  const id = await createUser(m, { username: "counter", pin: "1234", name: "Counter", role: "staff" });
  const first = await signIn(m, "counter", "1234");
  assert.ok(first.token);
  await setPin(m, id, "9876");
  await assert.rejects(signIn(m, "counter", "1234"));
  assert.ok((await signIn(m, "counter", "9876")).token);
  assert.equal(await m.auth.api.getSession({ headers: new Headers({ authorization: `Bearer ${first.token}` }) }), null);
  assert.deepEqual(listStaff().map((s) => [s.username, s.role]), [["owner", "owner"], ["counter", "staff"]]);
  await removeUser(m, id);
  assert.deepEqual(listStaff().map((s) => s.username), ["owner"]);
  await assert.rejects(setPin(m, id, "12"), /PIN must be/);
});

test("PIN reset file: replaces the oldest owner's PIN once, ignores junk, always deletes the file", async () => {
  const m = await setup();
  await createUser(m, { username: "owner", pin: "4821", name: "Owner", role: "owner" });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pin-"));
  const file = path.join(dir, "reset-owner-pin.txt");
  assert.equal(await applyPinResetFile(m, file), false); // no file
  fs.writeFileSync(file, "abc");
  assert.equal(await applyPinResetFile(m, file), false); // junk
  assert.equal(fs.existsSync(file), false);
  fs.writeFileSync(file, " 7315\n");
  assert.equal(await applyPinResetFile(m, file), true);
  assert.equal(fs.existsSync(file), false);
  await assert.rejects(signIn(m, "owner", "4821"));
  assert.ok((await signIn(m, "owner", "7315")).token);
  fs.rmSync(dir, { recursive: true });
});

test("a signed-in staff member can only read the session and sign out; account endpoints are closed", async () => {
  const m = await setup();
  await createUser(m, { username: "counter", pin: "1234", name: "Counter", role: "staff" });
  const res = await m.auth.api.signInUsername({ body: { username: "counter", password: "1234" }, headers: m.internalHeaders(), asResponse: true });
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const as = { cookie };
  assert.equal((await m.auth.handler(new Request("http://127.0.0.1:3000/api/auth/get-session", { headers: as }))).status, 200);
  assert.equal((await post(m, "/update-user", { name: "Renamed" }, as)).status, 403);
  assert.equal((await post(m, "/change-password", { currentPassword: "1234", newPassword: "9999" }, as)).status, 403);
  assert.equal((await post(m, "/revoke-sessions", {}, as)).status, 403);
  const row = getDb().prepare("SELECT name FROM user WHERE username = 'counter'").get() as { name: string };
  assert.equal(row.name, "Counter");
  assert.equal((await post(m, "/sign-out", {}, as)).status, 200);
});

test("sessions expire after 12 hours, not 7 days", async () => {
  const m = await setup();
  await createUser(m, { username: "owner", pin: "4821", name: "Owner", role: "owner" });
  const res = await m.auth.api.signInUsername({ body: { username: "owner", password: "4821" }, headers: m.internalHeaders(), asResponse: true });
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const s = await m.auth.api.getSession({ headers: new Headers({ cookie }) });
  const hours = (new Date(s!.session.expiresAt).getTime() - Date.now()) / 3_600_000;
  assert.ok(hours > 11 && hours <= 12.01, `expected about 12h, got ${hours.toFixed(1)}h`);
});

test("renameUser changes the display name only: blank, long and unknown ids are refused", async () => {
  const m = await setup();
  const id = await createUser(m, { username: "owner", pin: "4821", name: "Owner", role: "owner" });
  renameUser(id, "  Gabor Sebok ");
  assert.deepEqual(listStaff().map((p) => [p.name, p.username, p.role]), [["Gabor Sebok", "owner", "owner"]]);
  assert.throws(() => renameUser(id, "   "), /required/);
  assert.throws(() => renameUser(id, "x".repeat(61)), /too long/);
  assert.throws(() => renameUser("nobody", "A"), /not found/);
  const res = await m.auth.api.signInUsername({ body: { username: "owner", password: "4821" }, headers: m.internalHeaders(), asResponse: true });
  assert.equal(res.status, 200, "signing in still works with the same username and PIN");
});
