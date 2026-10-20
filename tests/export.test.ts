import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshDb, station, MIN, T0 } from "./helpers.ts";
import { createCustomer } from "../lib/db/customers.ts";
import { buildDraft, finalizeBill, getBill, voidBill } from "../lib/db/bills.ts";
import { startSession, stopSession } from "../lib/db/sessions.ts";
import { describeFilter, exportFileName, exportSheets } from "../lib/export/tables.ts";
import { saveInvestment } from "../lib/db/investments.ts";
import { wall, workbook } from "../lib/export/xlsx.ts";

beforeEach(freshDb);

const meta = { lounge: "Level 9 Gaming Lounge", by: "Gabor", at: T0 };

function paidVisit(customerId: number | null, kind: string, minutes: number, at: number) {
  const s = startSession({ stationId: station(kind), staffId: "u1", mode: "open", players: 1, customerId, now: at });
  stopSession(s, at + minutes * MIN, "u1");
  const total = buildDraft(s, at + minutes * MIN).lines.reduce((a, l) => a + l.qty * l.unitPaise, 0);
  return finalizeBill({ sessionId: s, staffId: "u1", role: "owner", discount: null, discountReason: "", payments: [{ method: "cash", amountPaise: total }], now: at + minutes * MIN + MIN });
}

const rows = (sheet: { data: unknown[][] }) => sheet.data as { value?: unknown }[][];
const header = (sheet: { data: unknown[][] }) => rows(sheet).find((r) => r[0]?.value === "Invoice" || r[0]?.value === "Name" || r[0]?.value === "Item")!;

test("wall() makes Excel show local clock time whatever the machine's time zone", () => {
  const ms = new Date(2026, 9, 7, 15, 30).getTime();
  const d = wall(ms);
  assert.deepEqual([d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()], [2026, 9, 7, 15, 30]);
});

test("bills export: one row per bill, void bills listed but left out of the totals, items on a second sheet", async () => {
  const c = createCustomer("Asha Rao", "98765 43210");
  const a = paidVisit(c, "ps5", 60, T0);
  const b = paidVisit(null, "pc", 30, T0 + 3 * 60 * MIN);
  const v = paidVisit(null, "pool", 30, T0 + 6 * 60 * MIN);
  voidBill(v.billId, "wrong table", "u1", "owner", T0 + 400 * MIN);

  const [bills, items, ...rest] = exportSheets({}, meta);
  assert.deepEqual([bills.sheet, items.sheet, ...rest.map((x) => x.sheet)], ["Bills", "Items", "Customers", "Stock", "Expenses"], "everything in one workbook");
  const r = rows(bills);
  assert.equal(r[0][0].value, "Level 9 Gaming Lounge");
  assert.match(String(r[3][0].value), /^Generated .+ by Gabor$/);
  const h = header(bills);
  assert.deepEqual(h.map((x) => x.value), ["Invoice", "Date & time", "Customer", "Station", "Paid by", "Subtotal", "Discount", "GST included", "Total", "Status", "Note"]);
  assert.equal(bills.stickyRowsCount, r.indexOf(h) + 1, "everything above and including the header row stays in view");

  const body = r.slice(r.indexOf(h) + 1, -1);
  assert.equal(body.length, 3);
  assert.deepEqual(body.map((x) => x[9].value).sort(), ["Paid", "Paid", "Void"]);
  const byInvoice = new Map(body.map((x) => [x[0].value, x]));
  assert.equal(byInvoice.get("INV-000003")![9].value, "Void");
  assert.equal(byInvoice.get("INV-000003")![10].value, "Void: wrong table");
  assert.equal(byInvoice.get("INV-000001")![2].value, "Asha Rao");
  assert.equal(byInvoice.get("INV-000002")![2].value, "Walk-in");

  const total = r.at(-1)!;
  assert.match(String(total[0].value), /^Total/);
  const paidRupees = (getBill(a.billId)!.totalPaise + getBill(b.billId)!.totalPaise) / 100;
  assert.equal(total[8].value, paidRupees, "the total counts paid bills only");

  const itemRows = rows(items);
  const itemHeader = header(items);
  const itemBody = itemRows.slice(itemRows.indexOf(itemHeader) + 1, -1);
  assert.equal(itemBody.length, 3, "one line per bill here");
  assert.equal(itemRows.at(-1)![6].value, paidRupees);

  const file = await workbook([bills, items]);
  assert.equal(file.subarray(0, 2).toString(), "PK", "an .xlsx file is a zip");
  assert.ok(file.length > 1000);
});

test("a date range limits the bills only, and the sheet says so", () => {
  paidVisit(createCustomer("Asha Rao", "98765 43210"), "ps5", 30, T0);
  paidVisit(null, "pc", 30, T0 + 3 * 60 * MIN);
  paidVisit(null, "pool", 30, T0 + 48 * 60 * MIN); // two days later
  const [bills, , customers] = exportSheets({ from: "2026-10-07", to: "2026-10-07", q: "ignored", status: "void" }, meta);
  const r = rows(bills);
  const h = header(bills);
  assert.equal(r.slice(r.indexOf(h) + 1, -1).length, 2, "only that day; the search and status in the address are not used");
  assert.match(String(r[2][0].value), /^From 7 Oct 2026 · Until 7 Oct 2026 · 2 bills$/);
  assert.equal(rows(customers).length > 6, true, "customers are complete whatever the dates");
  assert.equal(describeFilter({}), "All bills");
  assert.equal(describeFilter({ method: "upi", status: "void" }), "Paid by UPI · Void only");
  const all = exportSheets({}, meta)[0];
  assert.match(String(rows(all)[2][0].value), /^All bills · 3 bills$/);
});

test("customers and stock exports", async () => {
  const c = createCustomer("Asha Rao", "98765 43210");
  createCustomer("No Phone", "");
  paidVisit(c, "ps5", 60, T0);
  const [, , cust, stock] = exportSheets({}, meta);
  const body = rows(cust).slice(rows(cust).indexOf(header(cust)) + 1, -1);
  assert.deepEqual(body.map((x) => x[0].value), ["Asha Rao", "No Phone"], "biggest spender first");
  assert.equal(body[0][1].value, "+91 98765 43210");
  assert.equal(body[1][1].value, "", "no phone is an empty cell, not 'null'");
  assert.equal(body[0][2].value, 1);

  assert.equal(stock.sheet, "Stock");
  assert.equal((await workbook([cust, stock])).subarray(0, 2).toString(), "PK");
});

test("export file names are plain ASCII", () => {
  const at = new Date(2026, 9, 6, 12).getTime();
  assert.equal(exportFileName("Level 9 Gaming Lounge", at), "level-9-gaming-lounge-2026-10-06.xlsx");
  assert.equal(exportFileName("Café “Ñ” / Bar", at), "cafe-n-bar-2026-10-06.xlsx");
  assert.equal(exportFileName("!!!", at), "lounge-2026-10-06.xlsx");
});

test("Investments and Returns sheets appear only once there are investments, and add up", () => {
  assert.deepEqual(exportSheets({}, meta).map((x) => x.sheet), ["Bills", "Items", "Customers", "Stock", "Expenses"]);
  paidVisit(null, "pool", 60, T0); // 15000 paise, no GST
  saveInvestment(null, { name: "Pool table", amountPaise: 1_500_000, boughtOn: "2026-10-07", stationId: station("pool"), note: "" }, "u1");
  const sheets = exportSheets({}, { ...meta, at: T0 + 60 * MIN });
  assert.deepEqual(sheets.map((x) => x.sheet), ["Bills", "Items", "Customers", "Stock", "Expenses", "Investments", "Returns"]);
  const ret = rows(sheets[6]);
  const head = ret.find((r) => r[0]?.value === "Investment")!;
  const body = ret.slice(ret.indexOf(head) + 1);
  assert.deepEqual(body.map((r) => r[0].value), ["Pool 1", "All investments together"]);
  assert.equal(body[0][2].value, 15000, "invested, in rupees");
  assert.equal(body[0][3].value, 150, "earned");
  assert.equal(body[0][7].value, 0.01, "recovered: 1% as a fraction, shown as a percent in Excel");
});
