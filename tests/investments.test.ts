import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshDb, station, MIN, T0 } from "./helpers.ts";
import { setSettings } from "../lib/db/settings.ts";
import { addItem, startSession, stopSession } from "../lib/db/sessions.ts";
import { buildDraft, finalizeBill, getBill, voidBill } from "../lib/db/bills.ts";
import { addExpense } from "../lib/db/expenses.ts";
import { buildReturns, deleteInvestment, listInvestments, saveInvestment } from "../lib/db/investments.ts";
import { addDays, daysBetween, describeSpan, summarize } from "../lib/returns.ts";
import { allocateDiscount, computeBill } from "../lib/engine/bill.ts";
import { UserError } from "../lib/errors.ts";

beforeEach(freshDb);

const DAY = 24 * 60 * MIN;
const L = (rupees: number) => rupees * 100;

function sale(kind: string, minutes: number, at: number, o: { discount?: { type: "percent" | "flat"; value: number }; item?: [string, number, number] } = {}) {
  const s = startSession({ stationId: station(kind), staffId: "u1", mode: "open", players: 1, customerId: null, now: at });
  if (o.item) addItem(s, o.item[0], o.item[1], o.item[2], at + MIN);
  stopSession(s, at + minutes * MIN, "u1");
  const draft = buildDraft(s, at + minutes * MIN).lines;
  const total = computeBill(draft, o.discount ?? null).totalPaise;
  return finalizeBill({ sessionId: s, staffId: "u1", role: "owner", discount: o.discount ?? null, discountReason: o.discount ? "regular" : "", payments: [{ method: "cash", amountPaise: total }], now: at + (minutes + 1) * MIN }).billId;
}

test("allocateDiscount: shares add up to the discount, in proportion, the last line takes the remainder", () => {
  assert.deepEqual(allocateDiscount([30000, 8000], 3800), [3000, 800]);
  assert.deepEqual(allocateDiscount([100, 100, 100], 100), [33, 33, 34]);
  assert.deepEqual(allocateDiscount([0, 0], 0), [0, 0]);
  assert.deepEqual(allocateDiscount([5], 5), [5]);
  for (const [lines, d] of [[[1, 1, 1], 2], [[999, 1, 12345], 777], [[7, 0, 0], 3], [[1000], 0]] as [number[], number][]) {
    assert.equal(allocateDiscount(lines, d).reduce((a, b) => a + b, 0), d, `${lines} / ${d}`);
  }
});

test("summarize: running total, payback day, pace and the two projections", () => {
  const earned = new Map([["2026-10-01", 10000], ["2026-10-02", 20000], ["2026-10-04", 30000]]);
  const costs = new Map([["2026-10-02", 5000]]);
  const s = summarize({ investedPaise: 100000, since: "2026-10-01", today: "2026-10-04", earned, costs });
  assert.deepEqual(s.series.map((p) => p.cumulativePaise), [10000, 25000, 25000, 55000]);
  assert.equal(s.daysSince, 4);
  assert.deepEqual([s.earnedPaise, s.costsPaise, s.afterCostsPaise], [60000, 5000, 55000]);
  assert.equal(s.remainingPaise, 45000);
  assert.equal(s.paybackDate, null);
  assert.equal(s.recoveredPct, 55);
  assert.equal(s.roiPct, -45);
  assert.equal(s.overallPerDayPaise, 13750);
  assert.deepEqual([s.recentDays, s.recentPerDayPaise], [4, 13750]);
  assert.deepEqual(s.fromRecent, { days: 4, date: "2026-10-08" }, "45000 left at 55000 per 4 days: 3.27 days rounds up to 4");
  assert.deepEqual(s.months, [{ month: "2026-10", earnedPaise: 60000, costsPaise: 5000 }]);

  const paid = summarize({ investedPaise: 25000, since: "2026-10-01", today: "2026-10-04", earned, costs });
  assert.equal(paid.paybackDate, "2026-10-02", "the first day the running total reached the amount");
  assert.deepEqual([paid.remainingPaise, paid.fromRecent, paid.fromOverall], [0, null, null]);
  assert.ok(paid.roiPct > 0);
});

test("summarize: nothing earned yet, a purchase in the future, costs bigger than earnings", () => {
  const none = summarize({ investedPaise: 50000, since: "2026-10-01", today: "2026-10-03", earned: new Map(), costs: new Map() });
  assert.deepEqual([none.afterCostsPaise, none.recoveredPct, none.fromRecent, none.fromOverall, none.paybackDate], [0, 0, null, null, null]);
  const future = summarize({ investedPaise: 50000, since: "2026-11-01", today: "2026-10-03", earned: new Map([["2026-10-02", 999]]), costs: new Map() });
  assert.deepEqual([future.started, future.daysSince, future.earnedPaise, future.series.length, future.remainingPaise], [false, 0, 0, 0, 50000]);
  const loss = summarize({ investedPaise: 50000, since: "2026-10-01", today: "2026-10-02", earned: new Map([["2026-10-01", 1000]]), costs: new Map([["2026-10-02", 4000]]) });
  assert.deepEqual([loss.afterCostsPaise, loss.recoveredPct, loss.fromRecent], [-3000, 0, null]);
  assert.ok(loss.roiPct < -100, "a loss on top of the money spent is below -100%");
});

test("only the last 30 days set the recent pace", () => {
  const earned = new Map<string, number>();
  for (const d of daysBetween("2026-01-01", "2026-03-31")) earned.set(d, d < "2026-03-02" ? 100 : 1000);
  const s = summarize({ investedPaise: 10_000_000, since: "2026-01-01", today: "2026-03-31", earned, costs: new Map() });
  assert.equal(s.recentDays, 30);
  assert.equal(s.recentPerDayPaise, 1000);
  assert.ok(s.overallPerDayPaise < s.recentPerDayPaise, "the slow early weeks pull the overall pace down");
});

test("dates and spans", () => {
  assert.equal(addDays("2026-02-27", 3), "2026-03-02");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.deepEqual(daysBetween("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  assert.deepEqual(daysBetween("2026-10-05", "2026-10-04"), []);
  assert.deepEqual([describeSpan(1), describeSpan(12), describeSpan(60), describeSpan(1468), describeSpan(900)], ["1 day", "12 days", "about 2 months", "about 4 years", "about 2.5 years"]);
});

test("a station's return counts its time charges after discounts and GST, and the costs tagged to it", () => {
  setSettings({ "gst.enabled": "1", "gst.pct": "18" });
  const pool = station("pool");
  const b1 = sale("pool", 60, T0); // 15000, tax 2288, earned 12712
  const b2 = sale("pool", 120, T0 + DAY, { discount: { type: "percent", value: 10 }, item: ["Coke", 2, 4000] }); // 30000 time + 8000 food, 10% off the whole bill
  const b3 = sale("pool", 30, T0 + DAY + 4 * 60 * MIN);
  voidBill(b3, "wrong table", "u1", "owner", T0 + DAY + 6 * 60 * MIN);
  sale("pool", 60, T0 - 2 * DAY); // before the purchase date: not counted
  assert.equal(getBill(b1)!.taxPaise, 2288);

  addExpense({ day: "2026-10-08", category: "Repairs", note: "cloth", amountPaise: L(50), stationId: pool }, "u1");
  addExpense({ day: "2026-10-08", category: "Rent", note: "", amountPaise: L(2000) }, "u1");
  saveInvestment(null, { name: "Pool table", amountPaise: L(300), boughtOn: "2026-10-07", stationId: pool, note: "" }, "u1");
  saveInvestment(null, { name: "Interiors", amountPaise: L(150000), boughtOn: "2026-10-07", stationId: null, note: "" }, "u1");

  const { cards, portfolio } = buildReturns(T0 + 2 * DAY);
  const table = cards.find((c) => c.stationId === pool)!;
  assert.equal(table.earnedPaise, 12712 + (27000 - 4119), "time lines only: 12712 + 22881");
  assert.equal(table.costsPaise, L(50), "only the cost tagged to this station");
  assert.equal(table.afterCostsPaise, 12712 + 22881 - L(50));
  assert.equal(table.investedPaise, L(300));
  assert.equal(table.remainingPaise, 0);
  assert.equal(table.paybackDate, "2026-10-08", "the running total passed ₹300 on the second day");
  assert.deepEqual(table.series.map((p) => p.cumulativePaise), [12712, 12712 + 22881 - 5000, 12712 + 22881 - 5000]);
  assert.deepEqual([table.sessions, table.playedMs], [2, 3 * 60 * MIN], "the void bill and the one before the purchase are not counted");

  const lounge = cards.find((c) => c.stationId === null)!;
  assert.equal(lounge.earnedPaise, 12712 + 22881 + (7200 - 1098), "the whole lounge counts the food too, also after discount and GST");
  assert.equal(lounge.costsPaise, L(50) + L(2000), "and every expense");
  assert.equal(lounge.afterCostsPaise, portfolio!.afterCostsPaise, "so the lounge card is the net profit");

  // the same figure worked out from the bills themselves: total minus GST, summed
  const kept = [b1, b2].map((id) => getBill(id)!);
  assert.equal(lounge.earnedPaise, kept.reduce((s, b) => s + b.totalPaise - b.taxPaise, 0));
  assert.equal(portfolio!.investedPaise, L(300) + L(150000));
  assert.equal(portfolio!.count, 2);
});

test("payback estimate for an investment that has not paid back", () => {
  const pool = station("pool");
  sale("pool", 60, T0); // 15000, no GST
  saveInvestment(null, { name: "Pool table", amountPaise: L(150000), boughtOn: "2026-10-07", stationId: pool, note: "" }, "u1");
  const c = buildReturns(T0 + 2 * DAY).cards[0];
  assert.equal(c.afterCostsPaise, 15000);
  assert.equal(c.remainingPaise, L(150000) - 15000);
  assert.equal(c.daysSince, 3);
  assert.equal(c.overallPerDayPaise, 5000);
  assert.deepEqual(c.fromRecent, { days: 2997, date: addDays("2026-10-09", 2997) }, "14985000 left at 15000 per 3 days");
  assert.equal(c.paybackDate, null);
  assert.ok(Math.abs(c.recoveredPct - 0.1) < 1e-9);
});

test("investments are validated and managed", () => {
  const pool = station("pool");
  const ok = { name: " Pool table ", amountPaise: L(150000), boughtOn: "2026-10-07", stationId: pool, note: " second hand " };
  const id = saveInvestment(null, ok, "u1");
  assert.deepEqual(listInvestments().map((i) => [i.name, i.amountPaise, i.boughtOn, i.stationId, i.note]), [["Pool table", L(150000), "2026-10-07", pool, "second hand"]]);
  assert.throws(() => saveInvestment(null, { ...ok, name: " " }, "u1"), /name/);
  assert.throws(() => saveInvestment(null, { ...ok, amountPaise: 0 }, "u1"), /amount/);
  assert.throws(() => saveInvestment(null, { ...ok, amountPaise: 12.5 }, "u1"), /amount/);
  assert.throws(() => saveInvestment(null, { ...ok, boughtOn: "2026-02-30" }, "u1"), /date/);
  assert.throws(() => saveInvestment(null, { ...ok, stationId: 9999 }, "u1"), /Station not found/);
  assert.throws(() => saveInvestment(9999, ok, "u1"), /not found/);
  assert.equal(listInvestments().length, 1, "refused ones are not saved");
  saveInvestment(id, { ...ok, amountPaise: L(140000), stationId: null }, "u1");
  assert.deepEqual(listInvestments().map((i) => [i.amountPaise, i.stationId, i.stationName]), [[L(140000), null, null]]);
  deleteInvestment(id, "u1");
  assert.equal(listInvestments().length, 0);
  assert.throws(() => deleteInvestment(id, "u1"), UserError);
  assert.deepEqual(buildReturns(T0), { cards: [], portfolio: null });
  assert.throws(() => addExpense({ day: "2026-10-07", category: "Rent", note: "", amountPaise: 100, stationId: 9999 }, "u1"), /Station not found/);
});
