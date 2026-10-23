import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshDb, station, MIN, T0 } from "./helpers.ts";
import { all, get, getDb } from "../lib/db/index.ts";
import { setSettings } from "../lib/db/settings.ts";
import { addPastBill, getBill, listBills, voidBill } from "../lib/db/bills.ts";
import type { PastBillInput } from "../lib/db/bills.ts";
import { createCustomer, getCustomer } from "../lib/db/customers.ts";
import { archiveStation } from "../lib/db/catalog.ts";
import { buildReport } from "../lib/db/reports.ts";
import { resolveRange } from "../lib/reports-range.ts";
import { pendingMessages } from "../lib/db/messages.ts";
import { UserError } from "../lib/errors.ts";

// The sign-in system's "user" table lives beside ours in the real database; a stub stands in for it here.
beforeEach(() => {
  freshDb();
  getDb().exec("CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL)");
  getDb().prepare("INSERT INTO user VALUES ('u1', 'Owner')").run();
});

const NOW = T0 + 10 * 24 * 60 * MIN; // 17 Oct 2026, 15:00
const START = new Date(2026, 9, 5, 18, 30).getTime(); // 5 Oct 2026, 6:30 pm
const base = (over: Partial<PastBillInput> = {}): PastBillInput => ({
  stationId: station("ps5"), customerId: null, startedAt: START, minutes: 90, timePaise: 22500, extrasPaise: 8000, method: "upi", note: "", staffId: "u1", ...over,
});
const count = (t: string) => get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)!.n;

test("a bill added by hand is a normal paid bill: lines, payment, invoice number, finished session, flag", () => {
  const first = addPastBill(base(), NOW);
  const second = addPastBill(base({ startedAt: START + 3 * 60 * MIN, extrasPaise: 0, method: "cash", note: "paper register" }), NOW);
  assert.deepEqual([first.invoiceNo, second.invoiceNo], [1, 2], "next invoice numbers, like any bill");

  const b = getBill(first.billId)!;
  assert.equal(b.totalPaise, 30500);
  assert.equal(b.createdAt, START + 90 * MIN, "dated when the visit ended");
  assert.equal(b.status, "paid");
  assert.equal(b.byHand, true);
  assert.deepEqual(b.lines.map((l) => [l.kind, l.name, l.qty, l.unitPaise]), [["session", "PS5 1 - 90 min", 1, 22500], ["item", "Food and extras", 1, 8000]]);
  assert.deepEqual(b.payments, [{ method: "upi", amountPaise: 30500 }]);
  assert.equal(getBill(second.billId)!.lines.length, 1, "no food line when nothing was paid for food");

  const s = get<{ startedAt: number; endedAt: number; billed: number; notes: string; mode: string }>("SELECT started_at AS startedAt, ended_at AS endedAt, billed, notes, mode FROM sessions WHERE id = (SELECT session_id FROM bills WHERE id = ?)", second.billId)!;
  assert.deepEqual([s.startedAt, s.endedAt, s.billed, s.notes, s.mode], [START + 3 * 60 * MIN, START + 3 * 60 * MIN + 90 * MIN, 1, "paper register", "open"]);
  assert.equal(listBills(10).find((x) => x.id === first.billId)!.byHand, true);
  assert.equal(count("sessions"), 2);
  assert.ok(all<{ action: string }>("SELECT action FROM audit_log").some((a) => a.action === "bill.manual"));
});

test("the lounge's GST setting applies like on any bill", () => {
  setSettings({ "gst.enabled": "1", "gst.pct": "18" });
  const b = getBill(addPastBill(base({ extrasPaise: 0 }), NOW).billId)!;
  assert.equal(b.totalPaise, 22500, "prices are GST-inclusive: the total is what was paid");
  assert.equal(b.taxPaise, Math.round((22500 * 18) / 118));
});

test("it counts in reports, the customer's history and the station's hours, but never in WhatsApp prompts", () => {
  const asha = createCustomer("Asha Rao", "98765 43210");
  addPastBill(base({ customerId: asha }), NOW);
  addPastBill(base({ startedAt: START + 24 * 60 * MIN, timePaise: 10000, extrasPaise: 0, method: "cash" }), NOW);
  const r = buildReport(resolveRange("custom", "2026-10-05", "2026-10-06", NOW));
  assert.equal(r.bills, 2);
  assert.equal(r.takingsPaise, 30500 + 10000);
  assert.equal(r.timePaise, 22500 + 10000);
  assert.equal(r.foodPaise, 8000);
  assert.deepEqual(r.byMethod.map((m) => [m.method, m.paise]).sort(), [["cash", 10000], ["upi", 30500]]);
  assert.equal(r.byStation[0].name, "PS5 1 (PS5 Zone)");
  assert.equal(r.heat.flat().reduce((a, b) => a + b, 0), 2, "the visits show in the busy-hours chart");
  assert.deepEqual([getCustomer(asha)!.visits, getCustomer(asha)!.spentPaise], [1, 30500]);
  assert.deepEqual(pendingMessages(NOW).map((m) => m.type), [], "no invoice message for a visit that was long ago");
  setSettings({ "wa.enabled": "1" });
  const recent = createCustomer("Ravi", "98765 11111");
  addPastBill(base({ customerId: recent, startedAt: NOW - 3 * 60 * MIN, minutes: 30 }), NOW);
  assert.deepEqual(pendingMessages(NOW).filter((m) => m.type === "invoice"), [], "not even for one from today");
});

test("a wrong bill can be voided like any other", () => {
  const { billId } = addPastBill(base(), NOW);
  voidBill(billId, "typed the wrong amount", "u1", "owner", NOW);
  assert.equal(getBill(billId)!.status, "void");
  assert.equal(buildReport(resolveRange("custom", "2026-10-05", "2026-10-05", NOW)).bills, 0);
});

test("bad entries are refused and leave nothing behind", () => {
  const archived = station("pc");
  archiveStation(archived);
  const bad: [string, Partial<PastBillInput>, RegExp][] = [
    ["a visit that ends in the future", { startedAt: NOW - 30 * MIN, minutes: 60 }, /future/],
    ["no start time", { startedAt: Number.NaN }, /date and time/],
    ["a start before the year 2000", { startedAt: new Date(1999, 5, 1).getTime() }, /date and time/],
    ["zero minutes", { minutes: 0 }, /Minutes/],
    ["too many minutes", { minutes: 1441 }, /Minutes/],
    ["half a minute", { minutes: 1.5 }, /Minutes/],
    ["nothing paid", { timePaise: 0, extrasPaise: 0 }, /what they paid/],
    ["a negative amount", { timePaise: -100 }, /negative/],
    ["a fraction of a paisa", { timePaise: 100.5 }, /negative/],
    ["an unknown payment method", { method: "bitcoin" as never }, /how it was paid/],
    ["a station that doesn't exist", { stationId: 9999 }, /Station not found/],
    ["a station that was removed", { stationId: archived }, /Station not found/],
    ["a customer that doesn't exist", { customerId: 9999 }, /Customer not found/],
  ];
  for (const [what, over, msg] of bad) assert.throws(() => addPastBill(base(over), NOW), (e) => e instanceof UserError && msg.test(e.message), what);
  assert.deepEqual([count("bills"), count("sessions"), count("payments"), count("bill_lines")], [0, 0, 0, 0]);
  addPastBill(base({ timePaise: 0 }), NOW); // food only is fine
  addPastBill(base({ extrasPaise: 0, startedAt: NOW - 90 * MIN }), NOW); // ending exactly now is fine
  assert.equal(count("bills"), 2);
});
