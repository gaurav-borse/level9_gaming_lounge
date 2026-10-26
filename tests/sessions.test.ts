import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshDb, station, zoneOf, MIN, T0 } from "./helpers.ts";
import {
  startSession, getSession, pauseSession, resumeSession, stopSession, reopenSession, extendSession,
  transferSession, addItem, removeItem, listItems, listBoard, cancelSession, addController,
} from "../lib/db/sessions.ts";
import { saveRate, listRates, createStation, updateStation, archiveStation, createZone, archiveZone } from "../lib/db/catalog.ts";
import { createCustomer } from "../lib/db/customers.ts";
import { billableMs, chargedMinutes, sessionChargePaise } from "../lib/engine/pricing.ts";
import { buildDraft } from "../lib/db/bills.ts";
import { all, run, audit } from "../lib/db/index.ts";
import { listAudit } from "../lib/db/audit.ts";
import { UserError } from "../lib/errors.ts";

beforeEach(freshDb);

const start = (stationId: number, over: Record<string, unknown> = {}) =>
  startSession({ stationId, staffId: "u1", plannedMinutes: 1, players: 1, now: T0, ...over });

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

test("a session needs a sane duration", () => {
  const ps5 = station("ps5");
  assert.throws(() => start(ps5, { plannedMinutes: undefined as never }), /duration/);
  assert.throws(() => start(ps5, { plannedMinutes: 0 }), /duration/);
  assert.throws(() => start(ps5, { plannedMinutes: 1.5 }), /duration/);
  assert.throws(() => start(ps5, { plannedMinutes: 99999 }), /duration/);
  const id = start(ps5, { plannedMinutes: 90 });
  assert.equal(getSession(id).plannedMinutes, 90);
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
  const id = start(station("ps5"), { plannedMinutes: 60 });
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
  const id = start(station("ps5"), { plannedMinutes: 60 });
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
  run("UPDATE sessions SET planned_minutes = NULL"); // a session from before every session had a set time
  assert.throws(() => extendSession(open, 15, "u1", T0), /no end time/);
  stopSession(open, T0 + MIN, "u1");
  run("UPDATE sessions SET billed = 1");
  const fixed = start(ps5, { plannedMinutes: 30 });
  extendSession(fixed, 15, "u1", T0);
  assert.equal(getSession(fixed).plannedMinutes, 45);
  assert.throws(() => extendSession(fixed, 0, "u1", T0), /Add 1 to 1440/);
});

test("the clock stops when the time is up: extending continues from that moment, and the wait is not played time", () => {
  const id = start(station("ps5"), { plannedMinutes: 60 });
  extendSession(id, 15, "u1", T0 + 90 * MIN); // nobody acted for 30 minutes
  const s = getSession(id);
  assert.equal(s.plannedMinutes, 75, "the plan grows by exactly what was added");
  assert.equal(billableMs(s, T0 + 90 * MIN), 60 * MIN, "and the played time is still the 60 that were paid for: 15 more to go");
  assert.equal(billableMs(s, T0 + 100 * MIN), 70 * MIN);
  assert.equal(sessionChargePaise(billableMs(s, T0 + 100 * MIN), s.rate, 1, s.plannedMinutes), 18750, "75 minutes at 150/hr");
  const paused = start(station("pc"), { plannedMinutes: 30 });
  extendSession(paused, 10, "u1", T0 + 5 * MIN); // still inside the time: plain addition
  assert.equal(getSession(paused).plannedMinutes, 40);
});

test("cancel: owner only, reason needed; no bill, station free at once, kept as cancelled; billed or already cancelled sessions refuse", () => {
  const ps5 = station("ps5");
  const id = start(ps5, { plannedMinutes: 60 });
  addItem(id, "Maggi", 1, 5000, T0 + MIN, "u1");
  assert.deepEqual(all("SELECT action FROM audit_log WHERE action = 'item.add'").length, 1, "a custom item is logged when staff add it");
  assert.throws(() => cancelSession(id, "oops", "u2", "staff", T0 + 2 * MIN), /Only the owner/);
  assert.throws(() => cancelSession(id, "  ", "u1", "owner", T0 + 2 * MIN), /reason/);
  assert.equal(getSession(id).billed, false, "refusals change nothing");

  cancelSession(id, "wrong station", "u1", "owner", T0 + 2 * MIN);
  const row = all<{ billed: number; cancelled: number; reason: string; by: string; ended: number }>("SELECT billed, cancelled, cancel_reason AS reason, cancelled_by AS by, ended_at AS ended FROM sessions WHERE id = ?", id)[0];
  assert.deepEqual({ ...row }, { billed: 1, cancelled: 1, reason: "wrong station", by: "u1", ended: T0 + 2 * MIN });
  assert.equal(all("SELECT id FROM bills").length, 0, "no bill");
  assert.equal(listBoard().flatMap((z) => z.stations).find((s) => s.id === ps5)!.session, null, "the station is free");
  assert.doesNotThrow(() => start(ps5), "and can be started again");
  assert.throws(() => cancelSession(id, "again", "u1", "owner", T0 + 3 * MIN), /already cancelled/);
  assert.deepEqual(all<{ action: string }>("SELECT action FROM audit_log WHERE action = 'session.cancel'").length, 1);

  // a stopped session that is waiting for payment can be cancelled too; a billed one cannot (mark its bill invalid instead)
  const other = station("pc");
  const s2 = start(other);
  stopSession(s2, T0 + MIN, "u1");
  cancelSession(s2, "not played", "u1", "owner", T0 + 5 * MIN);
  assert.equal(getSession(s2).endedAt, T0 + MIN, "keeps the time it was stopped at");
  const s3 = start(other);
  run("UPDATE sessions SET billed = 1 WHERE id = ?", s3);
  assert.throws(() => cancelSession(s3, "late", "u1", "owner", T0 + 6 * MIN), /already billed/);
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
  const id = start(station("ps5"), { plannedMinutes: 60 });
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


test("stopping after the time was up bills exactly the plan, whenever Stop is pressed", () => {
  const id = start(station("ps5"), { plannedMinutes: 60 });
  stopSession(id, T0 + 95 * MIN, "u1"); // 35 minutes late
  const s = getSession(id);
  assert.equal(billableMs(s, T0 + 999 * MIN), 60 * MIN, "played time is capped at the plan");
  assert.equal(buildDraft(id, s.endedAt!).lines[0].unitPaise, 15000);
  const early = start(station("pc"), { plannedMinutes: 60 });
  stopSession(early, T0 + 20 * MIN, "u1");
  assert.equal(buildDraft(early, T0 + 20 * MIN).lines[0].unitPaise, 13000, "stopping early still pays the plan");
});

test("a plan that the billing step does not divide is still billed exactly: 50 minutes in 15-minute steps is 50, not 60", () => {
  const rate = { rateId: 1, name: "S", hourlyPaise: 6000, extraControllerPaise: 0, incrementMin: 15 };
  assert.equal(chargedMinutes(50 * MIN, rate, 50), 50);
  assert.equal(sessionChargePaise(50 * MIN, rate, 1, 50), 5000);
  assert.equal(chargedMinutes(51 * MIN, rate, 50), 60, "time past the plan (old sessions only) still rounds up");
});

test("pause is refused once the time is up; before that it works", () => {
  const id = start(station("ps5"), { plannedMinutes: 30 });
  pauseSession(id, T0 + 10 * MIN);
  resumeSession(id, T0 + 12 * MIN);
  assert.throws(() => pauseSession(id, T0 + 45 * MIN), /Time is up/);
});

test("extending a paused-then-expired session keeps the pause and continues from the stopped clock", () => {
  const id = start(station("ps5"), { plannedMinutes: 30 });
  pauseSession(id, T0 + 10 * MIN);
  resumeSession(id, T0 + 15 * MIN); // 5 paused: the end is at T0 + 35
  extendSession(id, 10, "u1", T0 + 50 * MIN); // 15 minutes late
  const s = getSession(id);
  assert.equal(s.plannedMinutes, 40);
  assert.equal(billableMs(s, T0 + 50 * MIN), 30 * MIN, "still 30 played at the moment of extending");
});

test("adding a controller charges only the rest of the planned time, and later added time too", () => {
  const ps5 = station("ps5");
  const r = listRates().find((x) => x.zoneId === zoneOf(ps5))!;
  saveRate({ ...r, extraControllerPaise: 6000 }); // 60 per hour
  const id = start(ps5, { plannedMinutes: 60, players: 2 }); // one extra from the start
  addController(id, "u1", T0 + 30 * MIN); // 30 minutes left: 30
  assert.deepEqual([getSession(id).addedControllers, getSession(id).addedControllersPaise], [1, 3000]);
  extendSession(id, 30, "u1", T0 + 40 * MIN); // the added controller also pays for the 30 new minutes
  assert.equal(getSession(id).addedControllersPaise, 6000);
  stopSession(id, T0 + 90 * MIN, "u1");
  const line = buildDraft(id, getSession(id).endedAt!).lines[0];
  // 90 min at 150/hr = 22500, the controller paid for at the start 90 min at 60/hr = 9000, the added one 6000
  assert.equal(line.unitPaise, 22500 + 9000 + 6000);
  assert.match(line.name, /90 min, 3 players$/);
  assert.equal(all("SELECT 1 FROM audit_log WHERE action = 'session.controller'").length, 1);
  assert.throws(() => addController(id, "u1", T0 + 91 * MIN), /already been stopped/);
});

test("a failed sign-in is logged against 'Not signed in' with the name that was tried", () => {
  audit("-", "login.fail", "username: rahul", T0);
  const row = listAudit("rahul").rows[0];
  assert.deepEqual([row.who, row.action, row.detail], ["Not signed in", "login.fail", "username: rahul"]);
});
