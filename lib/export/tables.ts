import { getBill, listBills } from "../db/bills.ts";
import type { BillDetail } from "../db/bills.ts";
import { listCustomers } from "../db/customers.ts";
import { listExpenses } from "../db/expenses.ts";
import { buildReturns, listInvestments } from "../db/investments.ts";
import { listStock } from "../db/menu.ts";
import { hasFilter, parseBillFilter } from "../bills-filter.ts";
import type { BillFilter } from "../bills-filter.ts";
import { invoiceNo } from "../format.ts";
import { displayPhone } from "../phone.ts";
import { stockStatus } from "../stock.ts";
import { dayKey } from "../reports-range.ts";
import { sheetOf } from "./xlsx.ts";
import type { Meta } from "./xlsx.ts";

/** Very large exports would hold every bill in memory at once; the newest ones come first. */
export const MAX_ROWS = 20_000;

const rupee = (paise: number) => paise / 100;
const sumPaid = (rows: BillDetail[], pick: (b: BillDetail) => number) => rupee(rows.filter((b) => b.status === "paid").reduce((s, b) => s + pick(b), 0));
const day = (ms: number) => new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const METHOD = { cash: "Cash", upi: "UPI", card: "Card" } as const;

/** "Everything" or the filters on the Bills page, in words, so a printed sheet says what it contains. */
export function describeFilter(f: BillFilter): string {
  if (!hasFilter(f)) return "All bills";
  const parts = [
    f.q && `Search "${f.q}"`,
    f.method && `Paid by ${METHOD[f.method]}`,
    f.status && (f.status === "paid" ? "Paid only" : "Void only"),
    f.from !== undefined && `From ${day(f.from)}`,
    f.to !== undefined && `Until ${day(f.to - 1)}`,
  ].filter(Boolean);
  return parts.join(" · ");
}

function billsSheets(params: Record<string, string | undefined>, meta: Meta) {
  const filter = parseBillFilter({ from: params.from, to: params.to }); // only the dates: everything else is exported
  const found = listBills(MAX_ROWS + 1, 0, filter);
  const cut = found.length > MAX_ROWS;
  const bills = found.slice(0, MAX_ROWS).map((b) => getBill(b.id)!);
  const note = `${describeFilter(filter)}${cut ? ` · only the newest ${MAX_ROWS.toLocaleString("en-IN")} bills are included` : ""} · ${bills.length} ${bills.length === 1 ? "bill" : "bills"}`;
  const station = (b: BillDetail) => b.stationName ?? "Counter sale";
  const state = (b: BillDetail) => (b.status === "void" ? "Void" : "Paid");
  return [
    sheetOf(meta, {
      sheet: "Bills",
      title: "Bills",
      note,
      totalLabel: "Total (paid bills only)",
      rows: bills,
      cols: [
        { header: "Invoice", width: 14, value: (b) => invoiceNo(b.invoiceNo) },
        { header: "Date & time", width: 19, kind: "datetime", value: (b) => b.createdAt },
        { header: "Customer", width: 22, value: (b) => b.customerName ?? "Walk-in" },
        { header: "Station", width: 16, value: station },
        { header: "Paid by", width: 14, value: (b) => [...new Set(b.payments.map((p) => METHOD[p.method]))].join(", ") },
        { header: "Subtotal", width: 14, kind: "money", value: (b) => rupee(b.subtotalPaise), total: (r) => sumPaid(r, (b) => b.subtotalPaise) },
        { header: "Discount", width: 13, kind: "money", value: (b) => rupee(b.discountPaise), total: (r) => sumPaid(r, (b) => b.discountPaise) },
        { header: "GST included", width: 14, kind: "money", value: (b) => rupee(b.taxPaise), total: (r) => sumPaid(r, (b) => b.taxPaise) },
        { header: "Total", width: 14, kind: "money", value: (b) => rupee(b.totalPaise), total: (r) => sumPaid(r, (b) => b.totalPaise) },
        { header: "Status", width: 10, value: state },
        { header: "Note", width: 32, value: (b) => (b.status === "void" ? `Void: ${b.voidReason ?? ""}` : b.discountPaise > 0 ? `Discount: ${b.discountReason}` : "") },
      ],
    }),
    sheetOf(meta, {
      sheet: "Items",
      title: "Bill items",
      note,
      totalLabel: "Total (paid bills only)",
      rows: bills.flatMap((b) => b.lines.map((l) => ({ b, l }))),
      cols: [
        { header: "Invoice", width: 14, value: (r) => invoiceNo(r.b.invoiceNo) },
        { header: "Date & time", width: 19, kind: "datetime", value: (r) => r.b.createdAt },
        { header: "Station", width: 16, value: (r) => station(r.b) },
        { header: "Item", width: 30, value: (r) => r.l.name },
        { header: "Qty", width: 8, kind: "int", value: (r) => r.l.qty, total: (rows) => rows.filter((r) => r.b.status === "paid").reduce((s, r) => s + r.l.qty, 0) },
        { header: "Price", width: 13, kind: "money", value: (r) => rupee(r.l.unitPaise) },
        { header: "Amount", width: 14, kind: "money", value: (r) => rupee(r.l.qty * r.l.unitPaise), total: (rows) => rupee(rows.filter((r) => r.b.status === "paid").reduce((s, r) => s + r.l.qty * r.l.unitPaise, 0)) },
        { header: "Status", width: 10, value: (r) => state(r.b) },
      ],
    }),
  ];
}

function customersSheets(meta: Meta) {
  const rows = listCustomers("", MAX_ROWS);
  return [
    sheetOf(meta, {
      sheet: "Customers",
      title: "Customers",
      note: `${rows.length} ${rows.length === 1 ? "customer" : "customers"} · visits and spend count paid bills only (all time)`,
      rows,
      cols: [
        { header: "Name", width: 26, value: (c) => c.name },
        { header: "Phone", width: 18, value: (c) => (c.phone ? displayPhone(c.phone) : "") },
        { header: "Visits", width: 9, kind: "int", value: (c) => c.visits, total: (r) => r.reduce((s, c) => s + c.visits, 0) },
        { header: "Total spent", width: 15, kind: "money", value: (c) => rupee(c.spentPaise), total: (r) => rupee(r.reduce((s, c) => s + c.spentPaise, 0)) },
        { header: "Last visit", width: 19, kind: "datetime", value: (c) => c.lastVisit },
        { header: "Customer since", width: 19, kind: "datetime", value: (c) => c.createdAt },
        { header: "Notes", width: 40, value: (c) => c.notes },
      ],
    }),
  ];
}

const STATUS = { ok: "In stock", low: "Running low", out: "Out of stock", untracked: "Not counted" } as const;

function stockSheets(meta: Meta) {
  const rows = listStock();
  return [
    sheetOf(meta, {
      sheet: "Stock",
      title: "Menu & stock",
      note: `${rows.length} ${rows.length === 1 ? "item" : "items"}`,
      rows,
      cols: [
        { header: "Item", width: 28, value: (m) => m.name },
        { header: "Category", width: 20, value: (m) => m.categoryName },
        { header: "Price", width: 13, kind: "money", value: (m) => rupee(m.pricePaise) },
        { header: "In stock", width: 11, kind: "int", value: (m) => m.onHand },
        { header: "Status", width: 15, value: (m) => STATUS[stockStatus(m.trackStock, m.onHand)] },
        { header: "Stock value", width: 14, kind: "money", value: (m) => rupee(m.pricePaise * Math.max(0, m.onHand ?? 0)), total: (r) => rupee(r.reduce((s, m) => s + m.pricePaise * Math.max(0, m.onHand ?? 0), 0)) },
      ],
    }),
  ];
}

function expensesSheets(params: Record<string, string | undefined>, meta: Meta) {
  const f = parseBillFilter({ from: params.from, to: params.to }); // same dates as the bills
  const rows = listExpenses(f.from === undefined ? undefined : dayKey(f.from), f.to === undefined ? undefined : dayKey(f.to - 1));
  return [
    sheetOf(meta, {
      sheet: "Expenses",
      title: "Expenses",
      note: `${f.from === undefined && f.to === undefined ? "All expenses" : describeFilter(f).replace("All bills", "All")} · ${rows.length} ${rows.length === 1 ? "expense" : "expenses"}`,
      rows,
      cols: [
        { header: "Date", width: 14, value: (e) => e.day },
        { header: "Category", width: 18, value: (e) => e.category },
        { header: "Belongs to", width: 16, value: (e) => e.stationName ?? "Shared" },
        { header: "Note", width: 40, value: (e) => e.note },
        { header: "Amount", width: 14, kind: "money", value: (e) => rupee(e.amountPaise), total: (r) => rupee(r.reduce((s, e) => s + e.amountPaise, 0)) },
      ],
    }),
  ];
}

function investmentSheets(meta: Meta) {
  const invs = listInvestments();
  if (invs.length === 0) return [];
  const { cards, portfolio } = buildReturns(meta.at);
  const rows = [...cards.map((c) => ({ title: c.title, s: c })), { title: "All investments together", s: portfolio! }];
  return [
    sheetOf(meta, {
      sheet: "Investments",
      title: "Investments",
      note: `${invs.length} ${invs.length === 1 ? "investment" : "investments"}`,
      rows: invs,
      cols: [
        { header: "What", width: 28, value: (i) => i.name },
        { header: "Earns from", width: 20, value: (i) => i.stationName ?? "Whole lounge" },
        { header: "Bought on", width: 14, value: (i) => i.boughtOn },
        { header: "Amount", width: 15, kind: "money", value: (i) => rupee(i.amountPaise), total: (r) => rupee(r.reduce((s, i) => s + i.amountPaise, 0)) },
        { header: "Note", width: 36, value: (i) => i.note },
      ],
    }),
    sheetOf(meta, {
      sheet: "Returns",
      title: "Return on investment",
      note: "Earned = time charges after discounts, without GST (whole lounge: all earnings). Costs = expenses tagged to the station (whole lounge: all expenses). Counted from each purchase date.",
      rows,
      cols: [
        { header: "Investment", width: 28, value: (r) => r.title },
        { header: "Counted from", width: 14, value: (r) => r.s.since },
        { header: "Invested", width: 15, kind: "money", value: (r) => rupee(r.s.investedPaise) },
        { header: "Earned", width: 15, kind: "money", value: (r) => rupee(r.s.earnedPaise) },
        { header: "Costs", width: 14, kind: "money", value: (r) => rupee(r.s.costsPaise) },
        { header: "Earned after costs", width: 18, kind: "money", value: (r) => rupee(r.s.afterCostsPaise) },
        { header: "Still to earn back", width: 18, kind: "money", value: (r) => rupee(r.s.remainingPaise) },
        { header: "Recovered", width: 12, kind: "percent", value: (r) => r.s.recoveredPct },
        { header: "Return on investment", width: 20, kind: "percent", value: (r) => r.s.roiPct },
        { header: "Paid back on", width: 14, value: (r) => r.s.paybackDate ?? "" },
        { header: "Estimated payback (last 30 days' pace)", width: 34, value: (r) => r.s.fromRecent?.date ?? "" },
      ],
    }),
  ];
}

/** Everything in one workbook: Bills, Items, Customers, Stock, Expenses, and Investments and Returns when there are any. `params.from` / `params.to` (yyyy-mm-dd) limit the bills; customers and stock are always complete. */
export function exportSheets(params: Record<string, string | undefined>, meta: Meta) {
  return [...billsSheets(params, meta), ...customersSheets(meta), ...stockSheets(meta), ...expensesSheets(params, meta), ...investmentSheets(meta)];
}

/** "level-9-gaming-lounge-2026-10-06.xlsx": ASCII only, safe in a download header. */
export function exportFileName(lounge: string, at: number): string {
  const slug = lounge.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "lounge";
  const d = new Date(at);
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${slug}-${ymd}.xlsx`;
}
