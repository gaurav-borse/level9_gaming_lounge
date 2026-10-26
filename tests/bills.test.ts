import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshDb, station, MIN, T0 } from "./helpers.ts";
import { startSession, stopSession, addItem, getSession } from "../lib/db/sessions.ts";
import { buildDraft, finalizeBill, finalizeCounterSale, voidBill, getBill, listBills, unseenAdjustments, markAdjustmentsSeen } from "../lib/db/bills.ts";
import { buildReport } from "../lib/db/reports.ts";
import { resolveRange } from "../lib/reports-range.ts";
import { saveCategory, saveItem } from "../lib/db/menu.ts";
import { setSettings } from "../lib/db/settings.ts";
import { all } from "../lib/db/index.ts";

beforeEach(freshDb);

const begin = (kind: string, over: Record<string, unknown> = {}) =>
  startSession({ stationId: station(kind), staffId: "u1", plannedMinutes: 60, players: 1, now: T0, ...over });

const pay = (id: number, amountPaise: number, over: Record<string, unknown> = {}) =>
  finalizeBill({
    sessionId: id, staffId: "u1", role: "owner", discount: null, discountReason: "",
    payments: [{ method: "cash", amountPaise }], now: T0 + 90 * MIN, ...over,
  });

test("full flow: play, add item, stop, pay; invoice numbers are sequential; station frees up", () => {
  const id = begin("ps5", { plannedMinutes: 65 });
  addItem(id, "Coke", 2, 4000, T0);
  stopSession(id, T0 + 65 * MIN, "u1");
  const draft = buildDraft(id, T0 + 65 * MIN);
  assert.equal(draft.lines[0].unitPaise, 16250); // 65 min at 150/hr
  assert.equal(draft.lines.length, 2);

  const r = pay(id, 16250 + 8000);
  assert.equal(r.invoiceNo, 1);
  assert.equal(getSession(id).billed, true);

  const again = begin("ps5", { now: T0 + 100 * MIN, plannedMinutes: 30 });
  stopSession(again, T0 + 130 * MIN, "u1");
  assert.equal(pay(again, 7500).invoiceNo, 2);
});

test("billing twice is refused and leaves exactly one bill", () => {
  const id = begin("pool");
  stopSession(id, T0 + 60 * MIN, "u1");
  pay(id, 15000);
  assert.throws(() => pay(id, 15000), /already billed/);
  assert.equal(listBills().length, 1);
});

test("can't bill a running session", () => {
  const id = begin("pool");
  assert.throws(() => pay(id, 15000), /Stop the session/);
});

test("payments that don't match the total are refused and nothing is written", () => {
  const id = begin("pool");
  stopSession(id, T0 + 60 * MIN, "u1");
  assert.throws(() => pay(id, 14999), /add up/);
  assert.throws(() => finalizeBill({ sessionId: id, staffId: "u1", role: "owner", discount: null, discountReason: "", payments: [], now: T0 }), /at least one/);
  assert.equal(listBills().length, 0);
  assert.equal(getSession(id).billed, false);
  assert.equal(all("SELECT * FROM payments").length, 0);
});

test("mixed payments on one bill", () => {
  const id = begin("pool");
  stopSession(id, T0 + 60 * MIN, "u1");
  const r = finalizeBill({
    sessionId: id, staffId: "u1", role: "owner", discount: null, discountReason: "",
    payments: [{ method: "cash", amountPaise: 5000 }, { method: "upi", amountPaise: 10000 }], now: T0,
  });
  assert.deepEqual(getBill(r.billId)!.payments, [{ method: "cash", amountPaise: 5000 }, { method: "upi", amountPaise: 10000 }]);
});

test("discount needs a reason; staff are capped, the owner is not", () => {
  const id = begin("pool");
  stopSession(id, T0 + 60 * MIN, "u1"); // 15000
  assert.throws(() => pay(id, 13500, { discount: { type: "percent", value: 10 } }), /reason/);
  assert.throws(() => pay(id, 12000, { role: "staff", discount: { type: "percent", value: 20 }, discountReason: "regular" }), /at most 10%/);
  assert.equal(listBills().length, 0);
  const ok = pay(id, 13500, { role: "staff", discount: { type: "percent", value: 10 }, discountReason: "regular" });
  const b = getBill(ok.billId)!;
  assert.equal(b.discountPaise, 1500);
  assert.equal(b.totalPaise, 13500);
  assert.equal(b.discountReason, "regular");

  const id2 = begin("pool", { now: T0 + 200 * MIN });
  stopSession(id2, T0 + 260 * MIN, "u1");
  const owner = pay(id2, 7500, { role: "owner", discount: { type: "percent", value: 50 }, discountReason: "owner's friend" });
  assert.equal(getBill(owner.billId)!.totalPaise, 7500);
});

test("a fixed session is billed its full planned price even when stopped early, and time past the plan is not billed", () => {
  const early = begin("ps5", { plannedMinutes: 60 });
  assert.equal(buildDraft(early, T0).lines[0].unitPaise, 15000, "the price is there from the first second");
  stopSession(early, T0 + 40 * MIN, "u1");
  const r1 = finalizeBill({ sessionId: early, staffId: "u1", role: "owner", discount: null, discountReason: "", payments: [{ method: "upi", amountPaise: 15000 }], now: T0 });
  assert.equal(getBill(r1.billId)!.totalPaise, 15000);
  assert.equal(getBill(r1.billId)!.lines[0].name, "PS5 1 - 60 min");

  const long = begin("ps5", { plannedMinutes: 60, now: T0 + 100 * MIN });
  stopSession(long, T0 + 175 * MIN, "u1"); // nobody noticed for 15 minutes: the clock stopped at 60, so the bill is the plan
  assert.throws(() => finalizeBill({ sessionId: long, staffId: "u1", role: "owner", discount: null, discountReason: "", payments: [{ method: "cash", amountPaise: 18750 }], now: T0 }), /add up/);
  const r2 = finalizeBill({ sessionId: long, staffId: "u1", role: "owner", discount: null, discountReason: "", payments: [{ method: "cash", amountPaise: 15000 }], now: T0 });
  assert.equal(getBill(r2.billId)!.totalPaise, 15000);
  assert.equal(getBill(r2.billId)!.lines[0].name, "PS5 1 - 60 min");
});

test("GST on: tax breakup is recorded, total unchanged (inclusive)", () => {
  setSettings({ "gst.enabled": "1", "gst.pct": "18" });
  const id = begin("pc");
  stopSession(id, T0 + 60 * MIN, "u1"); // 13000 incl.
  const r = pay(id, 13000);
  const b = getBill(r.billId)!;
  assert.equal(b.totalPaise, 13000);
  assert.equal(b.taxPaise, 1983); // 13000 * 18 / 118
  assert.equal(b.lines[0].taxPct, 18);
});

test("void: owner only, reason required, once; writes the audit log", () => {
  const id = begin("pool");
  stopSession(id, T0 + 60 * MIN, "u1");
  const { billId } = pay(id, 15000);
  assert.throws(() => voidBill(billId, "oops", "u2", "staff", T0), /Only the owner/);
  assert.throws(() => voidBill(billId, "  ", "u1", "owner", T0), /reason/);
  voidBill(billId, "wrong station", "u1", "owner", T0);
  assert.equal(getBill(billId)!.status, "void");
  assert.throws(() => voidBill(billId, "again", "u1", "owner", T0), /already marked invalid/);
  const actions = all<{ action: string }>("SELECT action FROM audit_log ORDER BY id").map((a) => a.action);
  assert.deepEqual(actions, ["session.start", "session.stop", "bill.create", "bill.void"]);
});

test("listBills and getBill return the joined details", () => {
  const id = begin("pool");
  stopSession(id, T0 + 60 * MIN, "u1");
  const { billId } = pay(id, 15000);
  const [row] = listBills();
  assert.equal(row.stationName, "Pool 1");
  assert.equal(row.status, "paid");
  assert.equal(getBill(billId)!.lines[0].name, "Pool 1 - 60 min");
  assert.equal(getBill(99999), undefined);
});

test("listBills: payment methods per bill, and search by invoice, station, customer or 'counter', plus method, status and date filters", () => {
  const pool = begin("pool");
  stopSession(pool, T0 + 30 * MIN, "u1");
  const totalPool = buildDraft(pool, T0 + 30 * MIN).lines.reduce((s, l) => s + l.qty * l.unitPaise, 0);
  const half = Math.floor(totalPool / 2);
  finalizeBill({ sessionId: pool, staffId: "u1", role: "owner", discount: null, discountReason: "", payments: [{ method: "cash", amountPaise: half }, { method: "upi", amountPaise: totalPool - half }], now: T0 + 31 * MIN });

  const ps5 = begin("ps5");
  stopSession(ps5, T0 + 60 * MIN, "u1");
  const totalPs5 = buildDraft(ps5, T0 + 60 * MIN).lines.reduce((s, l) => s + l.qty * l.unitPaise, 0);
  const b = finalizeBill({ sessionId: ps5, staffId: "u1", role: "owner", discount: null, discountReason: "", payments: [{ method: "card", amountPaise: totalPs5 }], now: T0 + 2 * 24 * 60 * MIN });
  voidBill(b.billId, "test", "u1", "owner", T0 + 2 * 24 * 60 * MIN + MIN);

  const all_ = listBills();
  assert.deepEqual(all_.map((x) => x.invoiceNo), [2, 1], "newest first");
  assert.deepEqual(all_.map((x) => x.methods), [["card"], ["cash", "upi"]]);

  const ids = (f: Parameters<typeof listBills>[2]) => listBills(50, 0, f).map((x) => x.invoiceNo);
  assert.deepEqual(ids({ q: "INV-000001" }), [1]);
  assert.deepEqual(ids({ q: "2" }), [2]);
  assert.deepEqual(ids({ q: "ps5" }), [2], "station name, any case");
  assert.deepEqual(ids({ q: "Pool" }), [1]);
  assert.deepEqual(ids({ q: "counter" }), [], "no counter sales yet");
  assert.deepEqual(ids({ q: "50%_" }), [], "LIKE wildcards in the search are plain characters");
  assert.deepEqual(ids({ method: "upi" }), [1], "a split payment matches either method");
  assert.deepEqual(ids({ method: "cash" }), [1]);
  assert.deepEqual(ids({ method: "card" }), [2]);
  assert.deepEqual(ids({ status: "void" }), [2]);
  assert.deepEqual(ids({ status: "paid" }), [1]);
  assert.deepEqual(ids({ from: T0 + 24 * 60 * MIN }), [2]);
  assert.deepEqual(ids({ to: T0 + 24 * 60 * MIN }), [1]);
  assert.deepEqual(ids({ method: "card", status: "paid" }), [], "filters combine");
  assert.deepEqual(listBills(1, 1, {}).map((x) => x.invoiceNo), [1], "paging still works with filters");
});

test("listBills: counter sales are found by searching 'counter' and by their customer-less, station-less row", () => {
  const cat = saveCategory(null, "Drinks", "u1");
  const coke = saveItem(null, { categoryId: cat, name: "Coke", pricePaise: 4000 }, "u1");
  finalizeCounterSale({ lines: [{ itemId: coke, qty: 1 }], staffId: "u1", role: "owner", discount: null, discountReason: "", payments: [{ method: "upi", amountPaise: 4000 }], now: T0 });
  assert.deepEqual(listBills(50, 0, { q: "counter" }).map((x) => x.invoiceNo), [1]);
  assert.deepEqual(listBills(50, 0, { q: "Counter Sale" }).map((x) => x.invoiceNo), [1]);
  assert.deepEqual(listBills(50, 0, { method: "upi" }).map((x) => x.stationName), [null]);
});

test("staff may give exactly their percentage even when rounding pushes it a fraction of a paisa over", () => {
  // 31 minutes of PC at 130/hr is 6717 paise; 10% of that is 671.7, rounded to 672
  const id = begin("pc", { plannedMinutes: 31 });
  stopSession(id, T0 + 31 * MIN, "u1");
  const sub = getBill(pay(id, 6717 - 672, { role: "staff", discount: { type: "percent", value: 10 }, discountReason: "regular" }).billId)!;
  assert.deepEqual([sub.subtotalPaise, sub.discountPaise, sub.totalPaise], [6717, 672, 6045]);
  const again = begin("sim", { plannedMinutes: 31 }); // 31 minutes at 150/hr is 7750; the cap is 775
  stopSession(again, T0 + 31 * MIN, "u1");
  assert.throws(() => pay(again, 7750 - 800, { role: "staff", discount: { type: "flat", value: 800 }, discountReason: "x" }), /at most 10%/);
  assert.throws(() => pay(again, 7750 - 776, { role: "staff", discount: { type: "flat", value: 776 }, discountReason: "x" }), /at most 10%/, "one paisa over is refused");
  assert.equal(getBill(pay(again, 7750 - 775, { role: "staff", discount: { type: "flat", value: 775 }, discountReason: "x" }).billId)!.discountPaise, 775, "exactly the cap is fine");
});

test("amount taken: staff may take less with a reason, the owner may take more; booked as a discount or on the time line, flagged for the owner", () => {
  const id = begin("pool");
  stopSession(id, T0 + 60 * MIN, "u1"); // 15000
  const take = (over: Record<string, unknown>) =>
    finalizeBill({ sessionId: id, staffId: "u2", role: "staff", discount: null, discountReason: "", payments: [{ method: "cash", amountPaise: 12000 }], now: T0 + 70 * MIN, finalPaise: 12000, adjustReason: "agreed on 120", ...over });
  assert.throws(() => take({ adjustReason: " " }), /reason for changing the amount/);
  assert.throws(() => take({ finalPaise: 16000, payments: [{ method: "cash", amountPaise: 16000 }] }), /Only the owner can raise/);
  assert.throws(() => take({ finalPaise: -5 }), /not valid/);
  assert.throws(() => take({ payments: [{ method: "cash", amountPaise: 15000 }] }), /add up/, "payments must match the amount taken");
  assert.equal(listBills().length, 0, "refusals write nothing");

  const { billId } = take({});
  const b = getBill(billId)!;
  assert.deepEqual([b.subtotalPaise, b.discountPaise, b.totalPaise, b.adjustedPaise, b.adjustedReason], [15000, 3000, 12000, -3000, "agreed on 120"]);
  assert.equal(b.discountReason, "Adjusted: agreed on 120", "it shows as a discount in the figures");
  assert.equal(all<{ action: string }>("SELECT action FROM audit_log WHERE action = 'bill.adjust'").length, 1);

  // the owner is told once, until they mark it seen
  assert.deepEqual(unseenAdjustments().map((n) => [n.billId, n.wasPaise, n.totalPaise]), [[billId, 15000, 12000]]);
  markAdjustmentsSeen();
  assert.deepEqual(unseenAdjustments(), []);

  // the report counts what was taken and lists the change
  const r = buildReport(resolveRange("custom", "2026-10-07", "2026-10-07", T0));
  assert.equal(r.takingsPaise, 12000);
  assert.deepEqual([r.adjusted.bills, r.adjusted.lessPaise, r.adjusted.rows[0].wasPaise], [1, 3000, 15000]);

  const id2 = begin("pc", { now: T0 + 200 * MIN });
  stopSession(id2, T0 + 260 * MIN, "u1"); // 13000
  const up = finalizeBill({ sessionId: id2, staffId: "u1", role: "owner", discount: null, discountReason: "", payments: [{ method: "cash", amountPaise: 14000 }], now: T0 + 270 * MIN, finalPaise: 14000, adjustReason: "extra hour of food was not added" });
  const raised = getBill(up.billId)!;
  assert.deepEqual([raised.totalPaise, raised.adjustedPaise, raised.lines[0].unitPaise], [14000, 1000, 14000], "a raise goes on the time line");
  assert.equal(unseenAdjustments().length, 1, "and is new for the owner");

  const same = begin("sim", { now: T0 + 400 * MIN });
  stopSession(same, T0 + 460 * MIN, "u1");
  const plain = finalizeBill({ sessionId: same, staffId: "u2", role: "staff", discount: null, discountReason: "", payments: [{ method: "cash", amountPaise: 15000 }], now: T0 + 470 * MIN, finalPaise: 15000 });
  assert.equal(getBill(plain.billId)!.adjustedPaise, 0, "the same amount is not an adjustment");
});

test("amount taken on a counter sale can be lowered but not raised", () => {
  const cat = saveCategory(null, "Drinks", "u1");
  const coke = saveItem(null, { categoryId: cat, name: "Coke", pricePaise: 4000 }, "u1");
  const base = { lines: [{ itemId: coke, qty: 1 }], staffId: "u2", role: "owner" as const, discount: null, discountReason: "", now: T0 };
  assert.throws(() => finalizeCounterSale({ ...base, payments: [{ method: "cash", amountPaise: 5000 }], finalPaise: 5000, adjustReason: "x" }), /only be lowered/);
  const r = finalizeCounterSale({ ...base, payments: [{ method: "cash", amountPaise: 3500 }], finalPaise: 3500, adjustReason: "regular" });
  assert.deepEqual([getBill(r.billId)!.totalPaise, getBill(r.billId)!.adjustedPaise], [3500, -500]);
});
