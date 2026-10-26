import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { freshDb, station, MIN, T0 } from "./helpers.ts";
import { all, get, getDb } from "../lib/db/index.ts";
import { createCustomer, listCustomers } from "../lib/db/customers.ts";
import { addExpense } from "../lib/db/expenses.ts";
import { saveInvestment } from "../lib/db/investments.ts";
import { saveCategory, saveItem } from "../lib/db/menu.ts";
import { getSetting, setSettings } from "../lib/db/settings.ts";
import { startSession, stopSession } from "../lib/db/sessions.ts";
import { buildDraft, finalizeBill } from "../lib/db/bills.ts";
import { clearAllData } from "../lib/db/clear.ts";
import { makeBackup, restoreBackup, listBackups } from "../lib/backup.ts";
import { checkChallenge, makeChallenge, CHALLENGE_MINUTES } from "../lib/danger.ts";

// The sign-in system's tables sit beside ours in the real database; a stub "user" table stands in for them.
beforeEach(() => {
  freshDb();
  getDb().exec("DROP TABLE IF EXISTS user; CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'staff')");
  getDb().prepare("INSERT INTO user VALUES ('u1', 'Owner', 'owner'), ('u2', 'Staff', 'staff')").run();
});

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "clear-"));
const count = (t: string) => get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)!.n;

function fill() {
  setSettings({ "setup.done": "1", "cafe.name": "Test Lounge", "gst.enabled": "1", "backup.folder": "x" });
  const c = createCustomer("Asha", "98765 43210");
  const s = startSession({ stationId: station("pool"), staffId: "u1", plannedMinutes: 1, players: 1, customerId: c, now: T0 });
  stopSession(s, T0 + 60 * MIN, "u1");
  const total = buildDraft(s, T0 + 60 * MIN).lines.reduce((a, l) => a + l.qty * l.unitPaise, 0);
  finalizeBill({ sessionId: s, staffId: "u1", role: "owner", discount: null, discountReason: "", payments: [{ method: "cash", amountPaise: total }], now: T0 + 61 * MIN });
  addExpense({ day: "2026-10-07", category: "Rent", note: "", amountPaise: 5000, stationId: station("pool") }, "u1");
  saveInvestment(null, { name: "Pool table", amountPaise: 150000, boughtOn: "2026-10-07", stationId: station("pool"), note: "" }, "u1");
  saveItem(null, { categoryId: saveCategory(null, "Drinks", "u1"), name: "Coke", pricePaise: 4000 }, "u1");
}

test("the confirmation code: right code passes whatever the case or spacing; wrong, forged and late ones don't", () => {
  const secret = "s3cret";
  const now = Date.UTC(2026, 9, 7, 12);
  const c = makeChallenge(secret, now);
  assert.match(c.code, /^[ACDEFGHJKMNPQRTUVWXY34679]{6}$/);
  assert.equal(c.expires, now + CHALLENGE_MINUTES * 60_000);
  const check = (typed: string, expires = String(c.expires), mac = c.mac, at = now + 60_000) => checkChallenge(secret, typed, expires, mac, at);
  assert.equal(check(c.code), "ok");
  assert.equal(check(` ${c.code.toLowerCase().slice(0, 3)} ${c.code.slice(3)} `), "ok", "lower case and spaces are fine");
  assert.equal(check("ZZZZZZ"), "wrong");
  assert.equal(check(""), "wrong");
  assert.equal(check(c.code, String(c.expires + 3_600_000)), "wrong", "a longer expiry with the old signature is a forgery");
  assert.equal(check(c.code, String(c.expires), "0".repeat(64)), "wrong");
  assert.equal(check(c.code, String(c.expires), "not hex"), "wrong");
  assert.equal(check(c.code, "abc"), "wrong");
  assert.equal(check(c.code, String(c.expires), c.mac, c.expires + 1), "expired");
  assert.equal(check(c.code, String(c.expires), c.mac, c.expires), "ok", "valid up to the last moment");
  assert.equal(checkChallenge("another secret", c.code, String(c.expires), c.mac, now), "wrong", "a code signed with another install's secret");
});

test("clearAllData empties everything but the logins and the setup flag, after saving a safety copy that restores it all", () => {
  fill();
  const dir = tmp();
  const second = path.join(tmp(), "usb");
  try {
    fs.mkdirSync(path.join(dir, "uploads"));
    fs.writeFileSync(path.join(dir, "uploads", "logo-0123456789abcdef.png"), "x");
    fs.writeFileSync(path.join(dir, "uploads", "notes.txt"), "keep me");
    makeBackup(getDb(), path.join(dir, "backups"), { second, now: T0 });
    assert.equal(listBackups(path.join(dir, "backups")).length, 1);

    const { safety } = clearAllData(getDb(), { dataDir: dir, second, deleteBackups: true, staffId: "u1", now: T0 + 5000 });
    for (const t of ["payments", "bill_lines", "bills", "session_items", "sessions", "expenses", "investments", "message_log", "customers", "menu_items", "menu_categories", "stock_moves", "rates", "stations", "zones"]) assert.equal(count(t), 0, t);
    assert.deepEqual(all<{ key: string; value: string }>("SELECT key, value FROM settings"), [{ key: "setup.done", value: "1" }], "settings are gone except the setup flag");
    assert.deepEqual(all<{ id: string }>("SELECT id FROM user").map((u) => u.id), ["u1", "u2"], "logins are kept");
    assert.deepEqual(all<{ action: string }>("SELECT action FROM audit_log").map((a) => a.action), ["data.clear"], "the old log is gone; this clearing is the first entry");
    assert.deepEqual(fs.readdirSync(path.join(dir, "uploads")), ["notes.txt"], "uploaded pictures go, other files stay");
    assert.match(safety, /^lounge-before-clear-\d{8}-\d{6}\.db$/);
    assert.deepEqual(listBackups(path.join(dir, "backups")).map((b) => b.name), [safety], "older backups deleted, the safety copy kept");
    assert.deepEqual(listBackups(second).map((b) => b.name), [safety], "also in the second folder");
    assert.equal(listBackups(path.join(dir, "backups"))[0].kind, "clear");

    restoreBackup(getDb(), path.join(dir, "backups", safety), path.join(dir, "backups"));
    assert.deepEqual(listCustomers().map((c) => c.name), ["Asha"], "restoring the safety copy brings it all back");
    assert.equal(count("bills"), 1);
    assert.equal(getSetting("cafe.name"), "Test Lounge");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(path.dirname(second), { recursive: true, force: true });
  }
});

test("without 'delete backups' the older ones stay", () => {
  fill();
  const dir = tmp();
  try {
    makeBackup(getDb(), path.join(dir, "backups"), { now: T0 });
    const { safety } = clearAllData(getDb(), { dataDir: dir, deleteBackups: false, staffId: "u1", now: T0 + 5000 });
    assert.equal(listBackups(path.join(dir, "backups")).length, 2);
    assert.ok(listBackups(path.join(dir, "backups")).some((b) => b.name === safety));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("if the safety copy can't be made, nothing is deleted", () => {
  fill();
  const dir = tmp();
  try {
    fs.writeFileSync(path.join(dir, "backups"), "a file where the folder should be");
    assert.throws(() => clearAllData(getDb(), { dataDir: dir, deleteBackups: true, staffId: "u1" }));
    assert.equal(count("bills"), 1);
    assert.equal(count("customers"), 1);
    assert.equal(getSetting("cafe.name"), "Test Lounge");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
