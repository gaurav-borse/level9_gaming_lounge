import { all, get } from "./index.ts";
import { listExpenses } from "./expenses.ts";
import type { Expense } from "./expenses.ts";
import { MAX_DAYS, dayKey } from "../reports-range.ts";
import type { Range } from "../reports-range.ts";
import type { PaymentMethod } from "../engine/bill.ts";

export type Slice = { name: string; paise: number; count: number };
export type DayRow = { day: string; bills: number; paise: number; taxPaise: number; expensesPaise: number; netPaise: number };

/**
 * Every figure on the Reports page for one period. All amounts are whole paise straight from the bills and expenses, and they reconcile:
 *   timePaise + foodPaise = subtotalPaise            (what the lines add up to, before discounts)
 *   subtotalPaise - discountPaise = takingsPaise     (what customers paid)
 *   takingsPaise - taxPaise - expensesPaise = netPaise
 * and the by-zone, by-station, by-item, by-staff, by-method and by-day tables each add up to their matching total above.
 * Only paid bills count. A bill the owner marked invalid is as if it never happened: it is left out of every figure and of
 * the busy-hours chart, and only listed (`invalid`) so nothing disappears without a trace.
 */
export type Report = {
  range: Range;
  bills: number;
  takingsPaise: number; // everything paid, GST included
  subtotalPaise: number;
  discountPaise: number;
  timePaise: number; // station time charges, before discounts
  foodPaise: number; // food, drinks and extras, before discounts
  taxPaise: number; // the GST part of takings: not income
  avgPaise: number;
  expensesPaise: number;
  netPaise: number;
  days: DayRow[];
  byZone: Slice[];
  byStation: Slice[];
  byItem: { name: string; qty: number; paise: number }[]; // the best sellers
  otherItems: { kinds: number; qty: number; paise: number } | null; // everything not in byItem, so the list still adds up
  byStaff: Slice[];
  byMethod: { method: PaymentMethod; paise: number }[];
  sessionsStarted: number;
  heat: number[][]; // sessions started: 7 rows (Monday first) x 24 hours
  heatMax: number;
  expenses: Expense[];
  expenseByCategory: { category: string; paise: number; count: number }[];
  invalid: { bills: number; paise: number; rows: InvalidBill[] }; // marked invalid in this period: shown, never counted
  cancelled: { sessions: number; rows: CancelledSession[] }; // started by mistake and cancelled in this period: shown, never counted
  adjusted: { bills: number; lessPaise: number; morePaise: number; rows: AdjustedBill[] }; // paid bills whose amount was changed at payment: already inside the figures above, listed so the owner can review them
};

export type AdjustedBill = { id: number; invoiceNo: number; createdAt: number; station: string | null; wasPaise: number; totalPaise: number; reason: string; by: string };

export type CancelledSession = { id: number; startedAt: number; cancelledAt: number; station: string; plannedMinutes: number | null; reason: string; by: string };

export type InvalidBill = { id: number; invoiceNo: number; createdAt: number; station: string | null; totalPaise: number; reason: string; by: string };

export const INVALID_LIST_MAX = 100;

export const TOP_ITEMS = 15;
const PAID = "b.status = 'paid' AND b.created_at >= ? AND b.created_at < ?";

export function buildReport(range: Range): Report {
  const a = [range.from, range.to];
  const sum = get<{ n: number; total: number; tax: number; sub: number; disc: number }>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(b.total_paise), 0) AS total, COALESCE(SUM(b.tax_paise), 0) AS tax,
            COALESCE(SUM(b.subtotal_paise), 0) AS sub, COALESCE(SUM(b.discount_paise), 0) AS disc FROM bills b WHERE ${PAID}`, ...a,
  )!;
  const lines = get<{ time: number; food: number }>(
    `SELECT COALESCE(SUM(CASE WHEN bl.kind = 'session' THEN bl.qty * bl.unit_paise END), 0) AS time,
            COALESCE(SUM(CASE WHEN bl.kind = 'item' THEN bl.qty * bl.unit_paise END), 0) AS food
     FROM bill_lines bl JOIN bills b ON b.id = bl.bill_id WHERE ${PAID}`, ...a,
  )!;

  const expenses = listExpenses(range.fromDay, range.toDay);
  const spentOn = new Map<string, number>();
  const cats = new Map<string, { paise: number; count: number }>();
  for (const e of expenses) {
    spentOn.set(e.day, (spentOn.get(e.day) ?? 0) + e.amountPaise);
    const c = cats.get(e.category) ?? { paise: 0, count: 0 };
    c.paise += e.amountPaise;
    c.count += 1;
    cats.set(e.category, c);
  }
  const expensesPaise = expenses.reduce((s, e) => s + e.amountPaise, 0);

  const billed = new Map(
    all<{ d: string; n: number; p: number; x: number }>(
      `SELECT strftime('%Y-%m-%d', b.created_at / 1000, 'unixepoch', 'localtime') AS d, COUNT(*) AS n, SUM(b.total_paise) AS p, SUM(b.tax_paise) AS x
       FROM bills b WHERE ${PAID} GROUP BY d`, ...a,
    ).map((r) => [r.d, r]),
  );
  const days: DayRow[] = [];
  for (let t = range.from; t < range.to && days.length < MAX_DAYS; ) {
    const day = dayKey(t);
    const b = billed.get(day);
    const spent = spentOn.get(day) ?? 0;
    days.push({ day, bills: b?.n ?? 0, paise: b?.p ?? 0, taxPaise: b?.x ?? 0, expensesPaise: spent, netPaise: (b?.p ?? 0) - (b?.x ?? 0) - spent });
    const d = new Date(t);
    t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  }

  const stationRows = all<{ zone: string; station: string; paise: number; n: number }>(
    `SELECT z.name AS zone, st.name AS station, SUM(bl.qty * bl.unit_paise) AS paise, COUNT(DISTINCT b.id) AS n
     FROM bill_lines bl JOIN bills b ON b.id = bl.bill_id JOIN sessions s ON s.id = b.session_id
     JOIN stations st ON st.id = s.station_id JOIN zones z ON z.id = st.zone_id
     WHERE bl.kind = 'session' AND ${PAID} GROUP BY st.id ORDER BY paise DESC`, ...a,
  );
  const zones = new Map<string, Slice>();
  for (const r of stationRows) {
    const z = zones.get(r.zone) ?? { name: r.zone, paise: 0, count: 0 };
    z.paise += r.paise;
    z.count += r.n;
    zones.set(r.zone, z);
  }

  const items = all<{ name: string; qty: number; paise: number }>(
    `SELECT bl.name AS name, SUM(bl.qty) AS qty, SUM(bl.qty * bl.unit_paise) AS paise FROM bill_lines bl JOIN bills b ON b.id = bl.bill_id
     WHERE bl.kind = 'item' AND ${PAID} GROUP BY bl.name ORDER BY paise DESC, bl.name`, ...a,
  );
  const rest = items.slice(TOP_ITEMS);

  const heat = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const r of all<{ dow: number; hr: number; n: number }>(
    `SELECT CAST(strftime('%w', started_at / 1000, 'unixepoch', 'localtime') AS INTEGER) AS dow,
            CAST(strftime('%H', started_at / 1000, 'unixepoch', 'localtime') AS INTEGER) AS hr, COUNT(*) AS n
     FROM sessions s WHERE started_at >= ? AND started_at < ?
       AND s.cancelled = 0 AND NOT EXISTS (SELECT 1 FROM bills b WHERE b.session_id = s.id AND b.status = 'void') GROUP BY dow, hr`, ...a,
  )) heat[(r.dow + 6) % 7][r.hr] = r.n;

  const bad = get<{ n: number; total: number }>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(b.total_paise), 0) AS total FROM bills b WHERE b.status = 'void' AND b.created_at >= ? AND b.created_at < ?`, ...a,
  )!;
  const invalidRows = all<InvalidBill>(
    `SELECT b.id, b.invoice_no AS invoiceNo, b.created_at AS createdAt, st.name AS station, b.total_paise AS totalPaise,
            COALESCE(b.void_reason, '') AS reason, COALESCE(u.name, 'Removed staff') AS by
     FROM bills b LEFT JOIN sessions s ON s.id = b.session_id LEFT JOIN stations st ON st.id = s.station_id LEFT JOIN user u ON u.id = b.voided_by
     WHERE b.status = 'void' AND b.created_at >= ? AND b.created_at < ? ORDER BY b.id DESC LIMIT ${INVALID_LIST_MAX}`, ...a,
  );

  const cancelledRows = all<CancelledSession>(
    `SELECT s.id, s.started_at AS startedAt, s.cancelled_at AS cancelledAt, st.name AS station, s.planned_minutes AS plannedMinutes,
            COALESCE(s.cancel_reason, '') AS reason, COALESCE(u.name, 'Removed staff') AS by
     FROM sessions s JOIN stations st ON st.id = s.station_id LEFT JOIN user u ON u.id = s.cancelled_by
     WHERE s.cancelled = 1 AND s.cancelled_at >= ? AND s.cancelled_at < ? ORDER BY s.cancelled_at DESC`, ...a,
  );

  const adjustedRows = all<AdjustedBill>(
    `SELECT b.id, b.invoice_no AS invoiceNo, b.created_at AS createdAt, st.name AS station, b.total_paise - b.adjusted_paise AS wasPaise,
            b.total_paise AS totalPaise, b.adjusted_reason AS reason, COALESCE(u.name, 'Removed staff') AS by
     FROM bills b LEFT JOIN sessions s ON s.id = b.session_id LEFT JOIN stations st ON st.id = s.station_id LEFT JOIN user u ON u.id = b.adjusted_by
     WHERE b.adjusted_paise != 0 AND ${PAID} ORDER BY b.id DESC`, ...a,
  );

  return {
    range,
    bills: sum.n,
    takingsPaise: sum.total,
    subtotalPaise: sum.sub,
    discountPaise: sum.disc,
    timePaise: lines.time,
    foodPaise: lines.food,
    taxPaise: sum.tax,
    avgPaise: sum.n ? Math.round(sum.total / sum.n) : 0,
    expensesPaise,
    netPaise: sum.total - sum.tax - expensesPaise,
    days,
    byZone: [...zones.values()].sort((x, y) => y.paise - x.paise || x.name.localeCompare(y.name)),
    byStation: stationRows.map((r) => ({ name: `${r.station} (${r.zone})`, paise: r.paise, count: r.n })),
    byItem: items.slice(0, TOP_ITEMS),
    otherItems: rest.length ? { kinds: rest.length, qty: rest.reduce((s, i) => s + i.qty, 0), paise: rest.reduce((s, i) => s + i.paise, 0) } : null,
    byStaff: all<Slice>(
      `SELECT COALESCE(u.name, 'Removed staff') AS name, SUM(b.total_paise) AS paise, COUNT(*) AS count FROM bills b
       LEFT JOIN user u ON u.id = b.staff_id WHERE ${PAID} GROUP BY b.staff_id ORDER BY paise DESC, name`, ...a,
    ),
    byMethod: all<{ method: PaymentMethod; paise: number }>(
      `SELECT p.method AS method, SUM(p.amount_paise) AS paise FROM payments p JOIN bills b ON b.id = p.bill_id WHERE ${PAID} GROUP BY p.method ORDER BY paise DESC, p.method`, ...a,
    ),
    sessionsStarted: heat.flat().reduce((s, n) => s + n, 0),
    heat,
    heatMax: Math.max(0, ...heat.flat()),
    expenses,
    invalid: { bills: bad.n, paise: bad.total, rows: invalidRows },
    cancelled: { sessions: cancelledRows.length, rows: cancelledRows.slice(0, INVALID_LIST_MAX) },
    adjusted: {
      bills: adjustedRows.length,
      lessPaise: adjustedRows.reduce((s, r) => s + Math.max(0, r.wasPaise - r.totalPaise), 0),
      morePaise: adjustedRows.reduce((s, r) => s + Math.max(0, r.totalPaise - r.wasPaise), 0),
      rows: adjustedRows.slice(0, INVALID_LIST_MAX),
    },
    expenseByCategory: [...cats].map(([category, c]) => ({ category, ...c })).sort((x, y) => y.paise - x.paise || x.category.localeCompare(y.category)),
  };
}
