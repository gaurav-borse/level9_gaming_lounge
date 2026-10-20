import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshDb, station, MIN, T0 } from "./helpers.ts";
import { createCustomer } from "../lib/db/customers.ts";
import { setSettings } from "../lib/db/settings.ts";
import { buildDraft, finalizeBill, voidBill } from "../lib/db/bills.ts";
import { pauseSession, startSession, stopSession } from "../lib/db/sessions.ts";
import { markMessage, pendingMessages } from "../lib/db/messages.ts";
import { compose, fill, waLink } from "../lib/whatsapp/compose.ts";

beforeEach(freshDb);

const begin = (customerId: number | null, kind = "ps5", extra: Partial<Parameters<typeof startSession>[0]> = {}) =>
  startSession({ stationId: station(kind), staffId: "u1", mode: "open", players: 1, customerId, now: T0, ...extra });
const types = (now = T0) => pendingMessages(now).map((m) => m.key.split(":")[0]).sort();

test("fill, compose and waLink", () => {
  assert.equal(fill("Hi {name} {oops} {constructor}", { name: "Asha" }), "Hi Asha {oops} {constructor}", "unknown words stay as typed");
  assert.equal(compose("welcome", "  ", { name: "A", lounge: "L" }), "Hi A, welcome to L! Have a great time.", "blank = standard wording");
  assert.equal(compose("welcome", "Yo {name}", { name: "A" }), "Yo A");
  assert.equal(waLink("919876543210", "a b\n&"), "https://wa.me/919876543210?text=a%20b%0A%26");
});

test("only customers with a phone get messages; switches turn them off", () => {
  begin(createCustomer("No Phone", ""), "pc");
  begin(null, "pool");
  assert.deepEqual(types(), []);

  begin(createCustomer("Asha Rao", "98765 43211"), "sim");
  assert.deepEqual(types(), ["started", "welcome"].sort());
  const started = pendingMessages(T0).find((m) => m.type === "started")!;
  assert.equal(started.to, "Asha Rao");
  assert.match(decodeURIComponent(started.href), /^https:\/\/wa\.me\/919876543211\?text=Hi Asha Rao, you're on .+ \(.+\) at .+\. Started 3:00 pm · Open play · ₹\d+\/hr · no fixed end time\.$/);

  setSettings({ "wa.welcome": "0" });
  assert.deepEqual(types(), ["started"]);
  setSettings({ "wa.enabled": "0" });
  assert.deepEqual(types(), []);
  setSettings({ "wa.enabled": "1", "wa.mode": "cloud" });
  assert.deepEqual(types(), [], "only prompt mode fills the tray");
});

test("welcome once per customer per day; opened and skipped messages never come back", () => {
  const c = createCustomer("Asha Rao", "98765 43211");
  begin(c, "ps5");
  begin(c, "pc");
  const welcome = pendingMessages(T0).filter((m) => m.type === "welcome");
  assert.equal(welcome.length, 1, "two sessions, one welcome");
  assert.match(welcome[0].key, /^welcome:\d+:2026-10-07$/);

  markMessage(welcome[0].key, "opened", T0);
  markMessage(pendingMessages(T0)[0].key, "skipped", T0);
  markMessage(welcome[0].key, "skipped", T0); // a second tap changes nothing
  assert.deepEqual(types(), ["started"]);
  assert.throws(() => markMessage("rm -rf", "opened"), /not valid/);
});

test("ending reminder: fixed time only, due at the lead time, none while paused or after stopping", () => {
  const c = createCustomer("Asha Rao", "98765 43211");
  setSettings({ "alert.leadMin": "10", "wa.welcome": "0", "wa.started": "0" });
  begin(c, "ps5"); // open play: no end time
  assert.deepEqual(types(), []);

  const fixed = begin(c, "pc", { mode: "fixed", plannedMinutes: 60 });
  const m = pendingMessages(T0 + 5 * MIN)[0];
  assert.equal(m.key, `ending:${fixed}`);
  assert.equal(m.dueAt, T0 + 50 * MIN, "60 minutes minus the 10 minute lead");
  assert.match(decodeURIComponent(m.href), /ends in about 10 minutes/);

  pauseSession(fixed, T0 + 5 * MIN);
  assert.deepEqual(types(T0 + 5 * MIN), []);
});

test("invoice message after a paid bill; not for void bills or old bills", () => {
  const c = createCustomer("Asha Rao", "98765 43211");
  setSettings({ "wa.welcome": "0", "wa.started": "0", "wa.ending": "0" });
  const s = begin(c, "ps5");
  stopSession(s, T0 + 60 * MIN, "u1");
  const total = buildDraft(s, T0 + 60 * MIN).lines.reduce((a, l) => a + l.qty * l.unitPaise, 0);
  const { billId } = finalizeBill({ sessionId: s, staffId: "u1", role: "owner", discount: null, discountReason: "", payments: [{ method: "cash", amountPaise: total }], now: T0 + 61 * MIN });

  const [m] = pendingMessages(T0 + 62 * MIN);
  assert.equal(m.key, `invoice:${billId}`);
  const text = decodeURIComponent(m.href);
  assert.match(text, /INV-000001/);
  assert.match(text, /Total: ₹/);
  assert.deepEqual(types(T0 + 26 * 60 * MIN), [], "a day later it is too late to offer");

  voidBill(billId, "mistake", "u1", "owner", T0 + 63 * MIN);
  assert.deepEqual(types(T0 + 64 * MIN), []);
});
