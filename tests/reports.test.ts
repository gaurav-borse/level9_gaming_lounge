import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshDb, station, MIN, T0 } from "./helpers.ts";
import { getDb } from "../lib/db/index.ts";
import { setSettings } from "../lib/db/settings.ts";
import { addItem, startSession, stopSession } from "../lib/db/sessions.ts";
import { saveCategory, saveItem } from "../lib/db/menu.ts";
import { buildDraft, finalizeBill, finalizeCounterSale, getBill, voidBill } from "../lib/db/bills.ts";
import { addExpense, deleteExpense, listExpenses } from "../lib/db/expenses.ts";
import { buildReport } from "../lib/db/reports.ts";
import { listAudit } from "../lib/db/audit.ts";
import { describeAction } from "../lib/audit-labels.ts";
import { resolveRange } from "../lib/reports-range.ts";
import { UserError } from "../lib/errors.ts";

// The sign-in system's "user" table lives beside ours in the real database; a stub stands in for it here.
beforeEach(() => {
  freshDb();
  getDb().exec("CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL)");
  getDb().prepare("INSERT INTO user VALUES ('u1', 'Gabor'), ('u2', 'Rahul')").run();
});

const DAY = 24 * 60 * MIN;

function visit(kind: string, minutes: number, at: number, staff = "u1", item?: [string, number, number]) {
  const s = startSession({ stationId: station(kind), staffId: staff, mode: "open", players: 1, customerId: null, now: at });
  if (item) addItem(s, item[0], item[1], item[2], at + MIN);
  stopSession(s, at + minutes * MIN, staff);
  const total = buildDraft(s, at + minutes * MIN).lines.reduce((a, l) => a + l.qty * l.unitPaise, 0);
  return finalizeBill({ sessionId: s, staffId: staff, role: "owner", discount: null, discountReason: "", payments: [{ method: kind === "pc" ? "upi" : "cash", amountPaise: total }], now: at + minutes * MIN + MIN });
}

test("resolveRange: today, yesterday, week from Monday, this and last month, chosen dates, bad input", () => {
  const now = new Date(2026, 9, 7, 15, 0).getTime(); // Wednesday 7 Oct 2026
  const days = (k: string, a?: string, b?: string) => {
    const r = resolveRange(k, a, b, now);
    return [r.key, r.fromDay, r.toDay];
  };
  assert.deepEqual(days("today"), ["today", "2026-10-07", "2026-10-07"]);
  assert.deepEqual(days("yesterday"), ["yesterday", "2026-10-06", "2026-10-06"]);
  assert.deepEqual(days("week"), ["week", "2026-10-05", "2026-10-07"], "Monday to today");
  assert.deepEqual(days("month"), ["month", "2026-10-01", "2026-10-07"]);
  assert.deepEqual(days("lastmonth"), ["lastmonth", "2026-09-01", "2026-09-30"]);
  assert.deepEqual(days("custom", "2026-08-30", "2026-09-02"), ["custom", "2026-08-30", "2026-09-02"]);
  assert.deepEqual(days("custom", "2026-09-02", "2026-08-30"), ["month", "2026-10-01", "2026-10-07"], "dates the wrong way round fall back");
  assert.deepEqual(days("custom", "nope", "2026-09-02"), ["month", "2026-10-01", "2026-10-07"]);
  assert.deepEqual(days("bogus"), ["month", "2026-10-01", "2026-10-07"]);
  const sunday = new Date(2026, 9, 11, 9, 0).getTime();
  assert.equal(resolveRange("week", undefined, undefined, sunday).fromDay, "2026-10-05", "Sunday still belongs to the week that began on Monday");
});

test("buildReport: takings, GST, expenses and net profit; void bills and other days left out", () => {
  setSettings({ "gst.enabled": "1", "gst.pct": "18" });
  const a = visit("ps5", 60, T0, "u1", ["Coke", 2, 8000]); // Wednesday 7 Oct, 15:00
  const b = visit("pc", 30, T0 + 3 * 60 * MIN, "u2"); // Wednesday evening
  const v = visit("pool", 30, T0 + 4 * 60 * MIN, "u2");
  voidBill(v.billId, "wrong table", "u1", "owner", T0 + 5 * 60 * MIN);
  visit("ps5", 30, T0 + 2 * DAY); // Friday: outside the range below
  addExpense({ day: "2026-10-07", category: "Rent", note: "", amountPaise: 100000 }, "u1");
  addExpense({ day: "2026-10-09", category: "Rent", note: "", amountPaise: 999900 }, "u1");

  const range = resolveRange("custom", "2026-10-07", "2026-10-08", T0);
  const r = buildReport(range);
  const billA = getBill(a.billId)!;
  const billB = getBill(b.billId)!;
  assert.equal(r.bills, 2, "the void bill and Friday's bill are not counted");
  assert.equal(r.takingsPaise, billA.totalPaise + billB.totalPaise);
  assert.equal(r.taxPaise, billA.taxPaise + billB.taxPaise);
  assert.ok(r.taxPaise > 0);
  assert.equal(r.avgPaise, Math.round(r.takingsPaise / 2));
  assert.equal(r.expensesPaise, 100000, "only the expense inside the dates");
  assert.equal(r.netPaise, r.takingsPaise - r.taxPaise - 100000, "GST is not income");

  assert.deepEqual(r.days.map((d) => d.day), ["2026-10-07", "2026-10-08"], "every day of the period, empty days included");
  assert.equal(r.days[0].paise, r.takingsPaise);
  assert.deepEqual([r.days[0].bills, r.days[1].bills, r.days[1].paise], [2, 0, 0]);
  assert.equal(r.days[0].expensesPaise, 100000);
  assert.equal(r.days[0].netPaise, r.netPaise);

  assert.deepEqual(r.byZone.map((z) => z.name).sort(), ["PC Gaming", "PS5 Zone"]);
  assert.deepEqual(r.byItem, [{ name: "Coke", qty: 2, paise: 16000 }]);
  assert.deepEqual(r.byStaff.map((s) => s.name).sort(), ["Gabor", "Rahul"]);
  assert.ok(r.byStaff.every((s) => s.count === 1), "one bill each");
  assert.deepEqual(r.byMethod.map((m) => m.method).sort(), ["cash", "upi"]);
  assert.equal(r.byMethod.reduce((s, m) => s + m.paise, 0), r.takingsPaise, "payments add up to takings");
  assert.deepEqual(r.expenseByCategory, [{ category: "Rent", paise: 100000, count: 1 }]);

  // Wednesday = row 2 (Monday first); sessions started at 15:00 and 18:00 (and the voided bill's at 19:00)
  assert.equal(r.heat[2][15], 1);
  assert.equal(r.heat[2][18], 1);
  assert.equal(r.heat[2][19], 1, "a voided bill's session still happened");
  assert.equal(r.heatMax, 1);
  assert.equal(r.heat.flat().reduce((s, n) => s + n, 0), 3);
});

test("an empty period gives zeros, not errors", () => {
  const r = buildReport(resolveRange("lastmonth", undefined, undefined, T0));
  assert.deepEqual([r.bills, r.takingsPaise, r.avgPaise, r.netPaise, r.heatMax], [0, 0, 0, 0, 0]);
  assert.equal(r.days.length, 30);
  assert.deepEqual([r.byZone, r.byItem, r.byStaff, r.byMethod], [[], [], [], []]);
});

test("expenses: validated, listed newest first by day, deletable, audited", () => {
  assert.throws(() => addExpense({ day: "2026-02-30", category: "Rent", note: "", amountPaise: 100 }, "u1"), UserError);
  assert.throws(() => addExpense({ day: "2026-10-07", category: " ", note: "", amountPaise: 100 }, "u1"), /category/);
  assert.throws(() => addExpense({ day: "2026-10-07", category: "Rent", note: "", amountPaise: 0 }, "u1"), /amount/);
  assert.throws(() => addExpense({ day: "2026-10-07", category: "Rent", note: "", amountPaise: 1.5 }, "u1"), /amount/);
  const a = addExpense({ day: "2026-10-05", category: "Rent", note: " Oct ", amountPaise: 5000 }, "u1");
  addExpense({ day: "2026-10-07", category: "Internet", note: "", amountPaise: 800 }, "u1");
  assert.deepEqual(listExpenses().map((e) => e.category), ["Internet", "Rent"]);
  assert.equal(listExpenses()[1].note, "Oct");
  assert.deepEqual(listExpenses("2026-10-06", "2026-10-31").map((e) => e.category), ["Internet"]);
  assert.deepEqual(listExpenses(undefined, "2026-10-05").map((e) => e.category), ["Rent"]);
  deleteExpense(a, "u1");
  assert.equal(listExpenses().length, 1);
  assert.throws(() => deleteExpense(a, "u1"), /not found/);
  const log = listAudit().rows.map((r) => r.action);
  assert.deepEqual(log.slice(0, 2), ["expense.delete", "expense.add"]);
});

test("audit log: newest first with names, searchable, paged, and plain-words labels", () => {
  const db = getDb();
  const put = db.prepare("INSERT INTO audit_log (at, staff_id, action, detail) VALUES (?, ?, ?, ?)");
  put.run(1, "u1", "rate.save", "PS5 Zone 160/hr");
  put.run(2, "u2", "bill.void", "INV-000004: wrong table");
  put.run(3, "gone", "staff.remove", "someone");
  const all = listAudit();
  assert.deepEqual(all.rows.map((r) => [r.who, r.action]), [["Removed staff", "staff.remove"], ["Rahul", "bill.void"], ["Gabor", "rate.save"]]);
  assert.equal(all.total, 3);
  assert.deepEqual(listAudit("void").rows.map((r) => r.who), ["Rahul"], "matches the action");
  assert.deepEqual(listAudit("gabor").rows.map((r) => r.action), ["rate.save"], "matches the person");
  assert.deepEqual(listAudit("160/hr").rows.length, 1, "matches the details");
  assert.equal(listAudit("100%").total, 0, "wildcards are plain characters");
  assert.deepEqual(listAudit("", 2, 2).rows.map((r) => r.action), ["rate.save"], "second page");
  assert.equal(listAudit("", 2, 2).total, 3);
  assert.equal(describeAction("bill.void"), "Voided a bill");
  assert.equal(describeAction("something.new"), "something.new");
});

test("every table on the Reports page adds up to its total, with discounts, GST, counter sales, many items and void bills mixed in", () => {
  setSettings({ "gst.enabled": "1", "gst.pct": "18" });
  const cat = saveCategory(null, "Drinks", "u1");
  const menu = Array.from({ length: 18 }, (_, i) => saveItem(null, { categoryId: cat, name: `Drink ${String(i).padStart(2, "0")}`, pricePaise: 3333 + i * 777 }, "u1"));

  const bills: number[] = [];
  const at = (day: number, hour: number) => new Date(2026, 9, 1 + day, hour, 7).getTime();
  const pay = (total: number, method: "cash" | "upi" | "card", split = false) =>
    split && total > 3 ? [{ method: "cash" as const, amountPaise: 1 }, { method, amountPaise: total - 1 }] : [{ method, amountPaise: total }];

  for (let i = 0; i < 24; i++) {
    const kind = ["ps5", "pc", "pool", "sim"][i % 4];
    const when = at(i % 6, 10 + (i % 11));
    const s = startSession({ stationId: station(kind), staffId: i % 3 ? "u1" : "u2", mode: "open", players: 1 + (i % 3), customerId: null, now: when });
    if (i % 2) addItem(s, `Extra ${i % 5}`, 1 + (i % 4), 1750 + 333 * i, when + MIN); // free-text extras
    stopSession(s, when + (17 + 13 * i) * MIN, "u1");
    const draft = buildDraft(s, when + (17 + 13 * i) * MIN).lines;
    const sub = draft.reduce((a, l) => a + l.qty * l.unitPaise, 0);
    const discount = i % 4 === 0 ? { type: "percent" as const, value: 7 } : i % 4 === 1 ? { type: "flat" as const, value: 1234 } : null;
    const total = sub - (discount ? (discount.type === "flat" ? Math.min(discount.value, sub) : Math.round((sub * discount.value) / 100)) : 0);
    bills.push(finalizeBill({ sessionId: s, staffId: i % 3 ? "u1" : "u2", role: "owner", discount, discountReason: discount ? "regular" : "", payments: pay(total, (["cash", "upi", "card"] as const)[i % 3], i % 5 === 0), now: when + (18 + 13 * i) * MIN }).billId);
  }
  for (let i = 0; i < 8; i++) { // counter sales of several different menu items
    const lines = [0, 1, 2].map((k) => ({ itemId: menu[(i * 3 + k) % menu.length], qty: 1 + ((i + k) % 3) }));
    const sub = lines.reduce((a, l) => a + l.qty * (3333 + menu.indexOf(l.itemId) * 777), 0);
    bills.push(finalizeCounterSale({ lines, staffId: "u2", role: "owner", discount: i % 2 ? { type: "percent", value: 10 } : null, discountReason: "x", payments: [{ method: "upi", amountPaise: sub - (i % 2 ? Math.round(sub / 10) : 0) }], now: at(i % 6, 20) }).billId);
  }
  voidBill(bills[3], "mistake", "u1", "owner", at(0, 23));
  voidBill(bills[27], "mistake", "u1", "owner", at(0, 23));
  addExpense({ day: "2026-10-02", category: "Rent", note: "", amountPaise: 123456 }, "u1");
  addExpense({ day: "2026-10-04", category: "Internet", note: "", amountPaise: 99901 }, "u1");
  addExpense({ day: "2026-10-04", category: "Rent", note: "", amountPaise: 5 }, "u1");

  const r = buildReport(resolveRange("custom", "2026-10-01", "2026-10-31", T0));
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  assert.equal(r.bills, 30, "32 bills minus 2 void");
  assert.ok(r.discountPaise > 0 && r.taxPaise > 0 && r.otherItems !== null, "the data really exercises discounts, GST and the item cut-off");

  assert.equal(r.timePaise + r.foodPaise, r.subtotalPaise, "time + food = what the lines add up to");
  assert.equal(r.subtotalPaise - r.discountPaise, r.takingsPaise, "minus discounts = takings");
  assert.equal(sum(r.byZone.map((z) => z.paise)), r.timePaise, "zones add up to time charges");
  assert.equal(sum(r.byStation.map((z) => z.paise)), r.timePaise, "stations add up to time charges");
  assert.equal(sum(r.byItem.map((i) => i.paise)) + (r.otherItems?.paise ?? 0), r.foodPaise, "items (and the rest) add up to food");
  assert.equal(r.byItem.length, 15);
  assert.equal(sum(r.byStaff.map((s) => s.paise)), r.takingsPaise, "staff add up to takings");
  assert.equal(sum(r.byStaff.map((s) => s.count)), r.bills);
  assert.equal(sum(r.byMethod.map((m) => m.paise)), r.takingsPaise, "payment methods add up to takings");
  assert.equal(sum(r.days.map((d) => d.paise)), r.takingsPaise, "days add up to takings");
  assert.equal(sum(r.days.map((d) => d.bills)), r.bills);
  assert.equal(sum(r.days.map((d) => d.taxPaise)), r.taxPaise);
  assert.equal(sum(r.days.map((d) => d.expensesPaise)), r.expensesPaise);
  assert.equal(sum(r.days.map((d) => d.netPaise)), r.netPaise, "daily net adds up to net profit");
  assert.equal(r.expensesPaise, 123456 + 99901 + 5);
  assert.equal(sum(r.expenseByCategory.map((c) => c.paise)), r.expensesPaise);
  assert.equal(r.netPaise, r.takingsPaise - r.taxPaise - r.expensesPaise);
  assert.equal(r.sessionsStarted, 24, "one session per station bill; counter sales start none");
  assert.equal(sum(r.heat.map((row) => sum(row))), 24);

  // the same bills read back one by one give the same totals
  const each = bills.map((id) => getBill(id)!).filter((b) => b.status === "paid");
  assert.equal(sum(each.map((b) => b.totalPaise)), r.takingsPaise);
  assert.equal(sum(each.map((b) => b.subtotalPaise)), r.subtotalPaise);
  assert.equal(sum(each.map((b) => b.discountPaise)), r.discountPaise);
  assert.equal(sum(each.map((b) => b.taxPaise)), r.taxPaise);
});

test("a long period still lists every day, so the days add up to the takings; absurdly long ones fall back", () => {
  visit("ps5", 60, new Date(2025, 2, 3, 12).getTime());
  const long = buildReport(resolveRange("custom", "2025-01-01", "2026-12-31", T0));
  assert.equal(long.days.length, 730);
  assert.equal(long.days.reduce((s, d) => s + d.paise, 0), long.takingsPaise);
  assert.ok(long.takingsPaise > 0);
  assert.equal(resolveRange("custom", "1900-01-01", "2100-01-01", T0).key, "month", "more than 10 years is not offered");
  assert.equal(resolveRange("custom", "2020-01-01", "2029-12-31", T0).key, "custom", "just under 10 years is");
});
