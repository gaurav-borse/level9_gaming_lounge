import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshDb, station, MIN, T0 } from "./helpers.ts";
import { listBoard, startSession, stopSession } from "../lib/db/sessions.ts";
import { buildAlerts } from "../lib/notifications.ts";

beforeEach(freshDb);

const stations = () => listBoard().flatMap((z) => z.stations.filter((s) => s.session).map((s) => ({ id: s.id, name: s.name, session: s.session! })));

test("buildAlerts: overtime, ending soon and awaiting payment come from the live clock, most urgent first", () => {
  startSession({ stationId: station("ps5"), staffId: "u1", mode: "fixed", plannedMinutes: 60, players: 1, now: T0 }); // 60 min plan
  startSession({ stationId: station("pc"), staffId: "u1", mode: "fixed", plannedMinutes: 30, players: 1, now: T0 });
  const pool = startSession({ stationId: station("pool"), staffId: "u1", mode: "open", players: 1, now: T0 });
  stopSession(pool, T0 + 5 * MIN, "u1");

  const at = (min: number) => buildAlerts({ stations: stations(), stock: [], leadMin: 10, now: T0 + min * MIN });
  assert.deepEqual(at(1).map((a) => a.kind), ["payment"], "only the stopped session needs attention a minute in");
  assert.deepEqual(at(21).map((a) => [a.kind, a.detail]), [["ending", "9 minutes left"], ["payment", "Stopped, payment not taken yet"]]);
  assert.deepEqual(at(31).map((a) => a.kind), ["overtime", "payment"], "30-minute plan is over");
  const late = at(65);
  assert.deepEqual(late.map((a) => a.kind), ["overtime", "overtime", "payment"]);
  assert.match(late[0].detail, /^Time is up · 0:\d\d:\d\d over$/);
});

test("buildAlerts: stock that is out or low, listed after time alerts; healthy stock is silent", () => {
  const stock = [
    { id: 1, name: "Coke", onHand: 24 },
    { id: 2, name: "Water", onHand: 5 },
    { id: 3, name: "Chips", onHand: 0 },
    { id: 4, name: "Gum", onHand: -2 },
    { id: 5, name: "Cake", onHand: 6 },
  ];
  const a = buildAlerts({ stations: [], stock, leadMin: 10, now: T0 });
  assert.deepEqual(a.map((x) => [x.title, x.kind, x.detail]), [
    ["Chips", "out", "Out of stock"], ["Gum", "out", "Out of stock"], ["Water", "low", "Only 5 left"],
  ]);
  assert.ok(a.every((x) => x.href === "/menu"));
  assert.deepEqual(buildAlerts({ stations: [], stock: [], leadMin: 10, now: T0 }), []);
});

test("buildAlerts: a station with a running timer and a low item together keep a stable, severity-sorted order", () => {
  startSession({ stationId: station("pc"), staffId: "u1", mode: "fixed", plannedMinutes: 15, players: 1, now: T0 });
  const a = buildAlerts({ stations: stations(), stock: [{ id: 9, name: "Water", onHand: 2 }, { id: 8, name: "Coke", onHand: 0 }], leadMin: 10, now: T0 + 20 * MIN });
  assert.deepEqual(a.map((x) => x.kind), ["overtime", "out", "low"]);
  assert.deepEqual(a.map((x) => x.id), ["s" + stations()[0].id, "m8", "m9"]);
});
