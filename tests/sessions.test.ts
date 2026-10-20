import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshDb, station, zoneOf, MIN, T0 } from "./helpers.ts";
import {
  startSession, getSession, pauseSession, resumeSession, stopSession, reopenSession, extendSession,
  transferSession, addItem, removeItem, listItems, listBoard,
} from "../lib/db/sessions.ts";
import { saveRate, listRates, createStation, updateStation, archiveStation, createZone, archiveZone } from "../lib/db/catalog.ts";
import { createCustomer } from "../lib/db/customers.ts";
import { all, run } from "../lib/db/index.ts";
import { UserError } from "../lib/errors.ts";

beforeEach(freshDb);

const start = (stationId: number, over: Record<string, unknown> = {}) =>
  startSession({ stationId, staffId: "u1", mode: "open", players: 1, now: T0, ...over });

test("start freezes the rate snapshot; later rate edits don't touch a running session", () => {
  const ps5 = station("ps5");
  const id = start(ps5);
  assert.equal(getSession(id).rate.hourlyPaise, 15000);
  const r = listRates().find((x) => x.zoneId === zoneOf(ps5))!;
  saveRate({ ...r, hourlyPaise: 99900 });
  assert.equal(getSession(id).rate.hourlyPaise, 15000);
});

test("a station can't run two unbilled sessions (double-click safe)", () => {
  const ps5 = station("ps5");
  start(ps5);
  assert.throws(() => start(ps5), /already in use/);
});

test("no rate at that time refuses to start with a clear message", () => {
  const ps5 = station("ps5");
  for (const r of listRates()) run("UPDATE rates SET active = 0 WHERE id = ?", r.id);
  assert.throws(() => start(ps5), /No rate is set for PS5 Zone/);
});

test("maintenance and unknown stations are refused", () => {
  const ps5 = station("ps5");
  updateStation(ps5, "PS5 1", true);
  assert.throws(() => start(ps5), /under maintenance/);
  assert.throws(() => start(99999), /Station not found/);
});

test("fixed needs a sane duration; prepaid derives minutes from the amount", () => {
  const ps5 = station("ps5");
  assert.throws(() => start(ps5, { mode: "fixed" }), /duration/);
  assert.throws(() => start(ps5, { mode: "fixed", plannedMinutes: 0 }), /duration/);
  assert.throws(() => start(ps5, { mode: "fixed", plannedMinutes: 99999 }), /duration/);
  const fixed = start(ps5, { mode: "fixed", plannedMinutes: 90 });
  assert.equal(getSession(fixed).plannedMinutes, 90);
  stopSession(fixed, T0 + MIN, "u1");
  run("UPDATE sessions SET billed = 1");
  assert.throws(() => start(ps5, { mode: "prepaid", advancePaise: 15000 }), /how the prepaid/);
  assert.throws(() => start(ps5, { mode: "prepaid", advancePaise: 1, advanceMethod: "cash" }), /too small/);
  const pre = start(ps5, { mode: "prepaid", advancePaise: 15000, advanceMethod: "upi" });
  assert.equal(getSession(pre).plannedMinutes, 60);
  assert.equal(getSession(pre).advanceMethod, "upi");
});

test("players and customer are validated", () => {
  const ps5 = station("ps5");
  assert.throws(() => start(ps5, { players: 0 }), /Players/);
  assert.throws(() => start(ps5, { players: 2.5 }), /Players/);
  assert.throws(() => start(ps5, { customerId: 424242 }), /Customer not found/);
  const cid = createCustomer("Ali", "98765 43210", "91", T0);
  const id = start(ps5, { customerId: cid });
  assert.equal(getSession(id).customerId, cid);
});

test("pause and resume accumulate; both are idempotent; stop folds an open pause", () => {
  const id = start(station("ps5"), { mode: "fixed", plannedMinutes: 60 });
  pauseSession(id, T0 + 10 * MIN);
  pauseSession(id, T0 + 12 * MIN); // second pause is ignored
  assert.equal(getSession(id).pausedAt, T0 + 10 * MIN);
  resumeSession(id, T0 + 25 * MIN);
  resumeSession(id, T0 + 26 * MIN); // second resume is ignored
  assert.equal(getSession(id).pausedTotalMs, 15 * MIN);
  pauseSession(id, T0 + 30 * MIN);
  stopSession(id, T0 + 40 * MIN, "u1"); // stopped while paused
  const s = getSession(id);
  assert.equal(s.pausedAt, null);
  assert.equal(s.pausedTotalMs, 25 * MIN);
  assert.equal(s.endedAt, T0 + 40 * MIN);
  stopSession(id, T0 + 99 * MIN, "u1"); // double click: no change
  assert.equal(getSession(id).endedAt, T0 + 40 * MIN);
});

test("a stopped session can't be paused or extended; reopen counts the gap as a pause", () => {
  const id = start(station("ps5"), { mode: "fixed", plannedMinutes: 60 });
  stopSession(id, T0 + 20 * MIN, "u1");
  assert.throws(() => pauseSession(id, T0 + 21 * MIN), /already been stopped/);
  assert.throws(() => extendSession(id, 15, "u1", T0), /already been stopped/);
  reopenSession(id, T0 + 25 * MIN, "u1");
  const s = getSession(id);
  assert.equal(s.endedAt, null);
  assert.equal(s.pausedTotalMs, 5 * MIN);
});

test("extend rules", () => {
  const ps5 = station("ps5");
  const open = start(ps5);
  assert.throws(() => extendSession(open, 15, "u1", T0), /no end time/);
  stopSession(open, T0 + MIN, "u1");
  run("UPDATE sessions SET billed = 1");
  const fixed = start(ps5, { mode: "fixed", plannedMinutes: 30 });
  extendSession(fixed, 15, "u1", T0);
  assert.equal(getSession(fixed).plannedMinutes, 45);
  assert.throws(() => extendSession(fixed, 0, "u1", T0), /Extend by/);
});

test("transfer: same zone only, target must be free and in service", () => {
  const ps5 = station("ps5");
  const zoneId = zoneOf(ps5);
  const second = createStation(zoneId, "PS5 2");
  const id = start(ps5);
  assert.throws(() => transferSession(id, station("pc"), "u1", T0), /same zone/);
  start(second);
  assert.throws(() => transferSession(id, second, "u1", T0), /already in use/);
  const third = createStation(zoneId, "PS5 3");
  updateStation(third, "PS5 3", true);
  assert.throws(() => transferSession(id, third, "u1", T0), /under maintenance/);
  const fourth = createStation(zoneId, "PS5 4");
  transferSession(id, fourth, "u1", T0);
  assert.equal(getSession(id).stationId, fourth);
});

test("items: validated, listed, removed; frozen once billed", () => {
  const id = start(station("ps5"));
  assert.throws(() => addItem(id, "Coke", 0, 4000, T0), /Quantity/);
  assert.throws(() => addItem(id, "Coke", 1, -1, T0), /Price/);
  assert.throws(() => addItem(id, "Coke", 1, 40.5, T0), /Price/);
  addItem(id, "Coke", 2, 4000, T0);
  const [item] = listItems(id);
  assert.equal(item.qty, 2);
  removeItem(item.id, "u1", T0);
  assert.equal(listItems(id).length, 0);
  stopSession(id, T0 + MIN, "u1");
  run("UPDATE sessions SET billed = 1");
  assert.throws(() => addItem(id, "Coke", 1, 4000, T0), /already billed/);
});

test("station and zone archive are blocked while in use", () => {
  const ps5 = station("ps5");
  start(ps5);
  assert.throws(() => archiveStation(ps5), /Finish and bill/);
  assert.throws(() => updateStation(ps5, "PS5 1", true), /Finish and bill/);
  assert.throws(() => archiveZone(zoneOf(ps5)), /Remove this zone's stations first/);
  const z = createZone("VR", "vr");
  archiveZone(z);
  assert.throws(() => createStation(z, "VR 1"), /Zone not found/);
});

test("duplicate zone and station names get a friendly error", () => {
  assert.throws(() => createZone("PS5 Zone", "ps5"), (e: unknown) => e instanceof UserError && /already exists/.test(e.message));
  assert.throws(() => createStation(zoneOf(station("ps5")), "PS5 1"), /already exists/);
});

test("listBoard returns plain serialisable objects with the live session attached", () => {
  const ps5 = station("ps5");
  const id = start(ps5, { customerId: createCustomer("Ali", "") });
  addItem(id, "Coke", 2, 4000, T0);
  const board = listBoard();
  assert.equal(board.length, 4);
  const st = board.flatMap((z) => z.stations).find((s) => s.id === ps5)!;
  assert.equal(st.session!.customerName, "Ali");
  assert.equal(st.session!.itemsPaise, 8000);
  assert.deepEqual(st.session!.items.map((i) => [i.name, i.qty, i.unitPaise]), [["Coke", 2, 4000]]);
  assert.equal(Object.getPrototypeOf(st), Object.prototype);
  assert.equal(Object.getPrototypeOf(st.session), Object.prototype);
  assert.doesNotThrow(() => JSON.stringify(board));
  assert.equal(board.flatMap((z) => z.stations).filter((s) => s.session).length, 1);
});

test("stop, undo stop, extend and removing an item are audited with who did them", () => {
  const id = start(station("ps5"), { mode: "fixed", plannedMinutes: 60 });
  extendSession(id, 15, "u2", T0 + MIN);
  addItem(id, "Coke", 2, 4000, T0);
  const [item] = listItems(id);
  removeItem(item.id, "u3", T0 + 2 * MIN);
  stopSession(id, T0 + 3 * MIN, "u4");
  stopSession(id, T0 + 4 * MIN, "u4"); // double click: still one entry
  reopenSession(id, T0 + 5 * MIN, "u5");
  const log = all<{ action: string; staff: string; detail: string }>("SELECT action, staff_id AS staff, detail FROM audit_log ORDER BY id");
  assert.deepEqual(log.map((l) => [l.action, l.staff]), [
    ["session.start", "u1"], ["session.extend", "u2"], ["item.remove", "u3"], ["session.stop", "u4"], ["session.reopen", "u5"],
  ]);
  assert.match(log[2].detail, /2 x Coke/);
});

test("prepaid minutes use the per-hour price including extra controllers", () => {
  const ps5 = station("ps5");
  const rate = listRates().find((r) => r.zoneId === zoneOf(ps5))!;
  saveRate({ ...rate, extraControllerPaise: 5000 }); // 150 + 50 per extra controller
  const id = start(ps5, { mode: "prepaid", advancePaise: 20000, advanceMethod: "cash", players: 2 });
  assert.equal(getSession(id).plannedMinutes, 60); // 200/hr for two players, not 80 minutes at 150/hr
});
