import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { freshDb } from "./helpers.ts";
import { getDb, get } from "../lib/db/index.ts";
import { createCustomer, listCustomers } from "../lib/db/customers.ts";
import { setSettings, getSetting } from "../lib/db/settings.ts";
import { MIGRATIONS } from "../lib/db/migrations.ts";
import { KEEP, checkBackupFile, ensureRecentBackup, listBackups, makeBackup, restoreBackup, secondCopyProblem, stamp } from "../lib/backup.ts";
import { UserError } from "../lib/errors.ts";

// The real database also holds the sign-in system's tables; a stub "user" table stands in for them here.
beforeEach(() => {
  freshDb();
  getDb().exec("DROP TABLE IF EXISTS user; CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'staff')");
  getDb().prepare("INSERT INTO user VALUES ('u1', 'Gabor', 'owner')").run();
});

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "bk-"));
const names = (dir: string) => fs.readdirSync(dir).sort();

test("makeBackup copies the live data, also to a second folder, and keeps only the newest 14 automatic ones", () => {
  const dir = tmp();
  const second = path.join(tmp(), "usb");
  try {
    createCustomer("Asha Rao", "98765 43210");
    const t0 = new Date(2026, 9, 7, 9, 0, 0).getTime();
    const first = makeBackup(getDb(), dir, { second, now: t0 });
    assert.equal(first.name, `lounge-${stamp(t0)}.db`);
    assert.equal(first.copyError, undefined);
    assert.deepEqual(names(second), [first.name], "the second folder (created on demand) has the same file");
    const copy = new DatabaseSync(path.join(dir, first.name), { readOnly: true });
    assert.equal((copy.prepare("SELECT name FROM customers").get() as { name: string }).name, "Asha Rao");
    copy.close();

    for (let i = 1; i <= KEEP + 3; i++) makeBackup(getDb(), dir, { second, now: t0 + i * 60_000 });
    for (const d of [dir, second]) assert.equal(listBackups(d).filter((b) => b.kind === "auto").length, KEEP, "older ones are removed");
    assert.ok(!names(dir).includes(first.name));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(path.dirname(second), { recursive: true, force: true });
  }
});

test("a second folder that can't be written to is reported, and the backup itself still exists", () => {
  const dir = tmp();
  const notAFolder = path.join(dir, "file.txt");
  fs.writeFileSync(notAFolder, "x");
  try {
    const r = makeBackup(getDb(), dir, { second: path.join(notAFolder, "inside"), now: Date.now() });
    assert.ok(r.copyError);
    assert.ok(fs.existsSync(path.join(dir, r.name)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ensureRecentBackup makes one only when the newest automatic backup is over 6 hours old", () => {
  const dir = tmp();
  try {
    const now = Date.now();
    assert.equal(ensureRecentBackup(getDb(), dir, { now }), true, "none yet");
    assert.equal(ensureRecentBackup(getDb(), dir, { now: now + 60 * 60_000 }), false, "an hour later is too soon");
    assert.equal(ensureRecentBackup(getDb(), dir, { now: now + 7 * 60 * 60_000 }), true, "7 hours later");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("restoreBackup puts the old data back, saves a safety copy first, and keeps the same connection working", () => {
  const dir = tmp();
  try {
    createCustomer("Before", "");
    setSettings({ "cafe.name": "Old Name" });
    const { name } = makeBackup(getDb(), dir);
    createCustomer("After", "");
    setSettings({ "cafe.name": "New Name" });
    assert.equal(listCustomers().length, 2);

    const { safety } = restoreBackup(getDb(), path.join(dir, name), dir);
    assert.deepEqual(listCustomers().map((c) => c.name), ["Before"]);
    assert.equal(getSetting("cafe.name"), "Old Name");
    assert.match(safety, /^lounge-before-restore-\d{8}-\d{6}\.db$/);

    assert.equal(listBackups(dir).length, 2, "the restore did not overwrite anything");
    // the safety copy holds what was there before, so the restore can be undone
    restoreBackup(getDb(), path.join(dir, safety), dir);
    assert.deepEqual(listCustomers().map((c) => c.name).sort(), ["After", "Before"]);
    assert.equal(getSetting("cafe.name"), "New Name");
    assert.equal((getDb().prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys, 1, "foreign keys are back on");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("restore refuses files that are not this app's backups, and changes nothing", () => {
  const dir = tmp();
  try {
    createCustomer("Keep me", "");
    fs.writeFileSync(path.join(dir, "junk.db"), "this is not a database");
    assert.throws(() => restoreBackup(getDb(), path.join(dir, "junk.db"), dir), UserError);

    const other = new DatabaseSync(path.join(dir, "other.db"));
    other.exec("CREATE TABLE something (x)");
    other.close();
    assert.throws(() => checkBackupFile(path.join(dir, "other.db")), /not a backup of this app/);

    const { name } = makeBackup(getDb(), dir);
    const newer = new DatabaseSync(path.join(dir, name));
    newer.exec(`PRAGMA user_version = ${MIGRATIONS.length + 1}`);
    newer.close();
    assert.throws(() => checkBackupFile(path.join(dir, name)), /newer version/);

    // a backup with nobody who can sign in would leave the lounge locked out (and /setup open to anyone)
    const { name: bare } = makeBackup(getDb(), dir);
    const noOwner = new DatabaseSync(path.join(dir, bare));
    noOwner.exec("UPDATE user SET role = 'staff'");
    noOwner.close();
    assert.throws(() => checkBackupFile(path.join(dir, bare)), /no owner account/);

    assert.deepEqual(listCustomers().map((c) => c.name), ["Keep me"]);
    assert.equal(listBackups(dir).filter((b) => b.kind === "restore").length, 0, "no safety copy for a refused restore");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a backup from an older version restores, leaving newer tables empty", () => {
  const dir = tmp();
  try {
    createCustomer("Old data", "");
    const { name } = makeBackup(getDb(), dir);
    const old = new DatabaseSync(path.join(dir, name));
    old.exec("DROP TABLE message_log; DROP TABLE expenses; PRAGMA user_version = 4");
    old.close();
    getDb().prepare("INSERT INTO message_log (key, outcome, at) VALUES ('welcome:1:2026-10-07', 'opened', 1)").run();
    restoreBackup(getDb(), path.join(dir, name), dir);
    assert.deepEqual(listCustomers().map((c) => c.name), ["Old data"]);
    assert.equal(get<{ n: number }>("SELECT COUNT(*) AS n FROM message_log")!.n, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("secondCopyProblem: silent when there is no second folder or the copy keeps up; speaks when the drive is gone, empty or behind", () => {
  const dir = tmp();
  const second = path.join(tmp(), "usb");
  const t0 = new Date(2026, 9, 7, 9, 0, 0).getTime();
  assert.equal(secondCopyProblem(dir, ""), null, "no second folder: nothing to check");
  makeBackup(getDb(), dir, { now: t0 });
  assert.match(secondCopyProblem(dir, second)!, /cannot be reached/, "the drive is not there");
  fs.mkdirSync(second);
  assert.match(secondCopyProblem(dir, second)!, /No backup has been copied/);
  makeBackup(getDb(), dir, { second, now: t0 + 60_000 });
  assert.equal(secondCopyProblem(dir, second), "", "in step");
  makeBackup(getDb(), dir, { now: t0 + 3 * 60 * 60_000 }); // the drive was unplugged for this one
  fs.utimesSync(path.join(dir, listBackups(dir)[0].name), new Date(t0 + 3 * 60 * 60_000), new Date(t0 + 3 * 60 * 60_000));
  fs.utimesSync(path.join(second, listBackups(second)[0].name), new Date(t0), new Date(t0));
  assert.match(secondCopyProblem(dir, second)!, /behind/);
});
