import { all, get, run, tx, audit } from "./index.ts";
import { UserError } from "../errors.ts";
import { billableMs, chargedMinutes, sessionChargePaise } from "../engine/pricing.ts";
import { PAYMENT_METHODS, computeBill, validatePayments } from "../engine/bill.ts";
import type { BillLineInput, Discount, PaymentInput, PaymentMethod } from "../engine/bill.ts";
import type { RateSnapshot } from "../engine/pricing.ts";
import { getSession, listItems } from "./sessions.ts";
import type { SessionRow } from "./sessions.ts";
import { getSetting, setSettings } from "./settings.ts";
import { deductForBill, getMenuItem, lineTaxPct, restoreForBill } from "./menu.ts";
import { invoiceNumberFrom } from "../bills-filter.ts";
import type { BillFilter } from "../bills-filter.ts";

export type Draft = {
  session: SessionRow;
  stationName: string;
  customerName: string | null;
  playedMs: number;
  lines: BillLineInput[];
};

/** What the bill would be right now. For a stopped session this is final; for a running one it is a preview. */
export function buildDraft(sessionId: number, now: number): Draft {
  const session = getSession(sessionId);
  const st = get<{ name: string }>("SELECT name FROM stations WHERE id = ?", session.stationId);
  const cust = session.customerId
    ? get<{ name: string }>("SELECT name FROM customers WHERE id = ?", session.customerId)
    : undefined;
  const playedMs = billableMs(session, now);
  const charge = sessionChargePaise(playedMs, session.rate, session.players, session.plannedMinutes) + session.addedControllersPaise;
  const people = session.players + session.addedControllers;
  const label = `${st?.name ?? "Station"} - ${chargedMinutes(playedMs, session.rate, session.plannedMinutes)} min${people > 1 ? `, ${people} players` : ""}`;

  const lines: BillLineInput[] = [{ kind: "session", name: label, qty: 1, unitPaise: charge, taxPct: lineTaxPct() }];
  for (const it of listItems(sessionId)) {
    lines.push({ kind: "item", name: it.name, qty: it.qty, unitPaise: it.unitPaise, taxPct: lineTaxPct(), itemId: it.itemId ?? undefined });
  }
  return { session, stationName: st?.name ?? "Station", customerName: cust?.name ?? null, playedMs, lines };
}

export type FinalizeInput = {
  sessionId: number;
  staffId: string;
  role: "owner" | "staff";
  discount: Discount;
  discountReason: string;
  payments: PaymentInput[]; // collected now
  finalPaise?: number | null; // the amount actually taken, when it is not what the app worked out; needs adjustReason
  adjustReason?: string;
  now: number;
};

export function finalizeBill(i: FinalizeInput): { billId: number; invoiceNo: number } {
  return tx(() => {
    const s = getSession(i.sessionId);
    if (s.billed) throw new UserError("This session is already billed");
    if (s.endedAt === null) throw new UserError("Stop the session before billing it");

    const draft = buildDraft(i.sessionId, s.endedAt);
    let totals = computeBill(draft.lines, i.discount);

    checkDiscount(totals, i.discountReason, i.role);
    const adj = adjustment(draft.lines, totals, i);
    totals = adj.totals;

    const bad = validatePayments(totals.totalPaise, i.payments);
    if (bad) throw new UserError(bad);

    const { billId, invoiceNo } = writeBill({
      sessionId: s.id, customerId: s.customerId, lines: draft.lines, totals, discountReason: adj.paise < 0 && !i.discountReason.trim() ? `Adjusted: ${adj.reason}` : i.discountReason,
      payments: i.payments, staffId: i.staffId, now: i.now, audit: `total ${totals.totalPaise}`, adjusted: adj.paise === 0 ? undefined : { paise: adj.paise, reason: adj.reason },
    });
    run("UPDATE sessions SET billed = 1 WHERE id = ?", s.id);
    return { billId, invoiceNo };
  });
}

/**
 * The amount actually taken when it differs from what the app worked out. Taking less is booked as an extra discount (so every total, tax figure and
 * report stays consistent) and staff may do it; taking more is added to the session line and only the owner may do it. Either way a reason is required.
 * Mutates `lines` for a raise.
 */
function adjustment(lines: BillLineInput[], totals: ReturnType<typeof computeBill>, i: Pick<FinalizeInput, "finalPaise" | "adjustReason" | "discount" | "role">): { totals: ReturnType<typeof computeBill>; paise: number; reason: string } {
  const none = { totals, paise: 0, reason: "" };
  if (i.finalPaise === undefined || i.finalPaise === null || i.finalPaise === totals.totalPaise) return none;
  if (!Number.isInteger(i.finalPaise) || i.finalPaise < 0) throw new UserError("The amount is not valid");
  const reason = (i.adjustReason ?? "").trim();
  if (!reason) throw new UserError("Give a reason for changing the amount");
  const paise = i.finalPaise - totals.totalPaise;
  if (paise > 0) {
    if (lines[0].kind !== "session") throw new UserError("A counter sale can only be lowered");
    if (i.role !== "owner") throw new UserError("Only the owner can raise the amount");
    lines[0] = { ...lines[0], unitPaise: lines[0].unitPaise + paise };
    return { totals: computeBill(lines, i.discount), paise, reason };
  }
  return { totals: computeBill(lines, { type: "flat", value: totals.discountPaise - paise }), paise, reason };
}

function checkDiscount(totals: { discountPaise: number; subtotalPaise: number }, reason: string, role: "owner" | "staff"): void {
  if (totals.discountPaise <= 0) return;
  if (!reason.trim()) throw new UserError("Give a reason for the discount");
  if (role === "staff") {
    const maxPct = Number(getSetting("staff.maxDiscountPct"));
    // The most staff may give is the cap rounded the same way the discount is, so a discount of exactly 10% is never refused by a fraction of a paisa.
    if (totals.discountPaise > Math.round((totals.subtotalPaise * maxPct) / 100)) {
      throw new UserError(`Staff can give at most ${maxPct}% discount. Ask the owner.`);
    }
  }
}

/** The one place a bill is written: next invoice number, header, lines, payments and the stock that leaves. Call inside a transaction. */
function writeBill(b: {
  sessionId: number | null;
  customerId: number | null;
  lines: BillLineInput[];
  totals: ReturnType<typeof computeBill>;
  discountReason: string;
  payments: PaymentInput[];
  staffId: string;
  now: number;
  audit: string;
  action?: string; // audit action; by default bill.create / bill.counter
  adjusted?: { paise: number; reason: string }; // the amount was changed when taking payment
}): { billId: number; invoiceNo: number } {
  const invoiceNo = (get<{ n: number }>("SELECT COALESCE(MAX(invoice_no), 0) + 1 AS n FROM bills")?.n) ?? 1;
  const billId = Number(
    run(
      `INSERT INTO bills (invoice_no, session_id, customer_id, staff_id, subtotal_paise, discount_paise, discount_reason,
                          tax_paise, total_paise, created_at, adjusted_paise, adjusted_reason, adjusted_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      invoiceNo, b.sessionId, b.customerId, b.staffId, b.totals.subtotalPaise, b.totals.discountPaise, b.discountReason.trim(),
      b.totals.taxPaise, b.totals.totalPaise, b.now, b.adjusted?.paise ?? 0, b.adjusted?.reason ?? "", b.adjusted ? b.staffId : null,
    ).lastInsertRowid,
  );
  for (const l of b.lines) {
    run("INSERT INTO bill_lines (bill_id, kind, name, qty, unit_paise, tax_pct, item_id) VALUES (?,?,?,?,?,?,?)", billId, l.kind, l.name, l.qty, l.unitPaise, l.taxPct, l.itemId ?? null);
  }
  for (const p of b.payments) run("INSERT INTO payments (bill_id, method, amount_paise) VALUES (?,?,?)", billId, p.method, p.amountPaise);
  deductForBill(billId, b.staffId, b.now);
  audit(b.staffId, b.action ?? (b.sessionId === null ? "bill.counter" : "bill.create"), `INV-${invoiceNo} ${b.audit}`, b.now);
  if (b.adjusted) {
    const was = b.totals.totalPaise - b.adjusted.paise;
    audit(b.staffId, "bill.adjust", `INV-${invoiceNo}: ${was} -> ${b.totals.totalPaise} paise (${b.adjusted.reason})`, b.now);
  }
  return { billId, invoiceNo };
}

export type CounterLine = { itemId: number; qty: number };

/** Turn picked menu items into bill lines at today's prices and tax rates. Hidden items cannot be sold. */
export function counterLines(lines: CounterLine[]): BillLineInput[] {
  if (!Array.isArray(lines) || lines.length === 0) throw new UserError("Add at least one item");
  const merged = new Map<number, number>();
  for (const l of lines) {
    if (!Number.isInteger(l.itemId) || !Number.isInteger(l.qty) || l.qty < 1 || l.qty > 99) throw new UserError("Quantity must be between 1 and 99");
    merged.set(l.itemId, (merged.get(l.itemId) ?? 0) + l.qty);
  }
  return [...merged].map(([itemId, qty]) => {
    const m = getMenuItem(itemId);
    if (!m || !m.active) throw new UserError("An item you picked is not on the menu any more");
    if (qty > 99) throw new UserError(`${m.name}: at most 99 at a time`);
    return { kind: "item" as const, name: m.name, qty, unitPaise: m.pricePaise, taxPct: lineTaxPct(), itemId: m.id };
  });
}

export type CounterSaleInput = {
  lines: CounterLine[];
  staffId: string;
  role: "owner" | "staff";
  discount: Discount;
  discountReason: string;
  payments: PaymentInput[];
  finalPaise?: number | null;
  adjustReason?: string;
  now: number;
};

/** A sale with no session (a drink at the counter). Same discount rules, numbering and payment checks as a session bill. */
export function finalizeCounterSale(i: CounterSaleInput): { billId: number; invoiceNo: number } {
  return tx(() => {
    const lines = counterLines(i.lines);
    let totals = computeBill(lines, i.discount);
    checkDiscount(totals, i.discountReason, i.role);
    const adj = adjustment(lines, totals, i);
    totals = adj.totals;
    const bad = validatePayments(totals.totalPaise, i.payments);
    if (bad) throw new UserError(bad);
    return writeBill({
      sessionId: null, customerId: null, lines, totals, discountReason: adj.paise < 0 && !i.discountReason.trim() ? `Adjusted: ${adj.reason}` : i.discountReason, payments: i.payments,
      staffId: i.staffId, now: i.now, audit: `counter total ${totals.totalPaise}`, adjusted: adj.paise === 0 ? undefined : { paise: adj.paise, reason: adj.reason },
    });
  });
}

export function voidBill(billId: number, reason: string, userId: string, role: "owner" | "staff", now: number): void {
  if (role !== "owner") throw new UserError("Only the owner can mark a bill invalid");
  if (!reason.trim()) throw new UserError("Give a reason for marking this bill invalid");
  tx(() => {
    const b = get<{ status: string; invoiceNo: number }>("SELECT status, invoice_no AS invoiceNo FROM bills WHERE id = ?", billId);
    if (!b) throw new UserError("Bill not found");
    if (b.status === "void") throw new UserError("This bill is already marked invalid");
    run("UPDATE bills SET status = 'void', void_reason = ?, voided_by = ? WHERE id = ?", reason.trim(), userId, billId);
    restoreForBill(billId, userId, now);
    audit(userId, "bill.void", `INV-${b.invoiceNo}: ${reason.trim()}`, now);
  });
}

export type AdjustNotice = { billId: number; invoiceNo: number; by: string; wasPaise: number; totalPaise: number; reason: string };

/** Amount changes the owner has not looked at yet (for the bell). */
export function unseenAdjustments(): AdjustNotice[] {
  return all<AdjustNotice>(
    `SELECT b.id AS billId, b.invoice_no AS invoiceNo, COALESCE(u.name, 'Removed staff') AS by, b.total_paise - b.adjusted_paise AS wasPaise,
            b.total_paise AS totalPaise, b.adjusted_reason AS reason
     FROM bills b LEFT JOIN user u ON u.id = b.adjusted_by WHERE b.adjusted_paise != 0 AND b.id > ? ORDER BY b.id DESC LIMIT 30`,
    Number(getSetting("notice.adjustSeen")),
  );
}

export function markAdjustmentsSeen(): void {
  const top = get<{ id: number | null }>("SELECT MAX(id) AS id FROM bills WHERE adjusted_paise != 0")?.id ?? 0;
  setSettings({ "notice.adjustSeen": String(top) });
}

export type BillSummary = {
  id: number;
  invoiceNo: number;
  totalPaise: number;
  status: "paid" | "void";
  createdAt: number;
  stationName: string | null;
  customerName: string | null;
  methods: PaymentMethod[]; // how it was paid: one or several
  byHand: boolean; // typed in afterwards for a visit from before the app was used
};

const METHOD_ORDER: PaymentMethod[] = ["cash", "upi", "card"];

const BILL_JOINS = `FROM bills b
     LEFT JOIN sessions s ON s.id = b.session_id
     LEFT JOIN stations st ON st.id = s.station_id
     LEFT JOIN customers c ON c.id = b.customer_id`;

/** The WHERE clause for a filter, shared by the list and the count so a page number can never disagree with the total. */
function billWhere(f: BillFilter): { sql: string; args: (string | number)[] } {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (f.status) { where.push("b.status = ?"); args.push(f.status); }
  if (f.method) { where.push("EXISTS (SELECT 1 FROM payments p WHERE p.bill_id = b.id AND p.method = ?)"); args.push(f.method); }
  if (f.customerId !== undefined) { where.push("b.customer_id = ?"); args.push(f.customerId); }
  if (f.from !== undefined) { where.push("b.created_at >= ?"); args.push(f.from); }
  if (f.to !== undefined) { where.push("b.created_at < ?"); args.push(f.to); }
  if (f.q) {
    const like = `%${f.q.replace(/[%_!]/g, (c) => `!${c}`)}%`; // ! is the LIKE escape character
    const inv = invoiceNumberFrom(f.q);
    where.push(`(${inv !== null ? "b.invoice_no = ? OR " : ""}st.name LIKE ? ESCAPE '!' OR c.name LIKE ? ESCAPE '!' OR (b.session_id IS NULL AND 'counter sale' LIKE ? ESCAPE '!'))`);
    if (inv !== null) args.push(inv);
    args.push(like, like, like.toLowerCase());
  }
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", args };
}

export function countBills(f: BillFilter = {}): number {
  const w = billWhere(f);
  return get<{ n: number }>(`SELECT COUNT(*) AS n ${BILL_JOINS} ${w.sql}`, ...w.args)?.n ?? 0;
}

/** Newest first. Every filter is optional; they combine with AND. A counter sale has no station, so it matches "counter". */
export function listBills(limit = 50, offset = 0, f: BillFilter = {}): BillSummary[] {
  const w = billWhere(f);
  const rows = all<Omit<BillSummary, "methods" | "byHand"> & { methods: string | null; byHand: number }>(
    `SELECT b.id, b.invoice_no AS invoiceNo, b.total_paise AS totalPaise, b.status, b.created_at AS createdAt,
            st.name AS stationName, c.name AS customerName, b.entered_by_hand AS byHand,
            (SELECT GROUP_CONCAT(DISTINCT p.method) FROM payments p WHERE p.bill_id = b.id) AS methods
     ${BILL_JOINS}
     ${w.sql}
     ORDER BY b.id DESC LIMIT ? OFFSET ?`,
    ...w.args, limit, offset,
  );
  return rows.map((r) => ({ ...r, byHand: r.byHand === 1, methods: METHOD_ORDER.filter((m) => (r.methods ?? "").split(",").includes(m)) }));
}

export type BillDetail = BillSummary & {
  subtotalPaise: number;
  discountPaise: number;
  discountReason: string;
  taxPaise: number;
  voidReason: string | null;
  adjustedPaise: number; // what was taken minus what the app worked out (negative = less); 0 when it was not changed
  adjustedReason: string;
  adjustedBy: string | null; // name
  staffId: string;
  lines: { kind: string; name: string; qty: number; unitPaise: number; taxPct: number }[];
  payments: { method: PaymentMethod; amountPaise: number }[];
};

export function getBill(id: number): BillDetail | undefined {
  const b = billRow(id);
  if (!b) return undefined;
  return {
    ...b,
    lines: all("SELECT kind, name, qty, unit_paise AS unitPaise, tax_pct AS taxPct FROM bill_lines WHERE bill_id = ? ORDER BY id", id),
    payments: all("SELECT method, amount_paise AS amountPaise FROM payments WHERE bill_id = ? ORDER BY id", id),
  };
}

function billRow(id: number) {
  const r = get<Omit<BillDetail, "lines" | "payments" | "byHand"> & { byHand: number }>(
    `SELECT b.id, b.invoice_no AS invoiceNo, b.total_paise AS totalPaise, b.status, b.created_at AS createdAt,
            st.name AS stationName, c.name AS customerName, b.subtotal_paise AS subtotalPaise,
            b.discount_paise AS discountPaise, b.discount_reason AS discountReason, b.tax_paise AS taxPaise,
            b.void_reason AS voidReason, b.staff_id AS staffId, b.entered_by_hand AS byHand,
            b.adjusted_paise AS adjustedPaise, b.adjusted_reason AS adjustedReason, (SELECT name FROM user WHERE id = b.adjusted_by) AS adjustedBy
     FROM bills b
     LEFT JOIN sessions s ON s.id = b.session_id
     LEFT JOIN stations st ON st.id = s.station_id
     LEFT JOIN customers c ON c.id = b.customer_id
     WHERE b.id = ?`,
    id,
  );
  return r && { ...r, byHand: r.byHand === 1 };
}

export type PastBillInput = {
  stationId: number;
  customerId: number | null;
  startedAt: number; // when they started playing (epoch ms)
  minutes: number;
  timePaise: number; // what they paid for the playing time
  extrasPaise: number; // what they paid for food and extras (0 if none)
  method: PaymentMethod;
  note: string;
  staffId: string;
};

/**
 * A bill for a visit that was already paid before the app was used. It becomes a normal paid bill: the next invoice number,
 * a finished session on that station (so reports, hours played and investments count it), the lounge's GST setting applied
 * like any bill, and a flag so it shows as "Added by hand". Wrong ones can be voided like any other bill.
 */
export function addPastBill(i: PastBillInput, now = Date.now()): { billId: number; invoiceNo: number } {
  const endedAt = i.startedAt + i.minutes * 60_000;
  if (!Number.isFinite(i.startedAt) || i.startedAt < new Date(2000, 0, 1).getTime()) throw new UserError("Pick the date and time they started");
  if (!Number.isInteger(i.minutes) || i.minutes < 1 || i.minutes > 1440) throw new UserError("Minutes played must be between 1 and 1440");
  if (endedAt > now) throw new UserError("That visit would end in the future. Bills added by hand are for visits that are already over.");
  for (const p of [i.timePaise, i.extrasPaise]) if (!Number.isInteger(p) || p < 0) throw new UserError("Amounts can't be negative");
  if (i.timePaise + i.extrasPaise <= 0) throw new UserError("Enter what they paid");
  if (!PAYMENT_METHODS.includes(i.method)) throw new UserError("Choose how it was paid");
  return tx(() => {
    const st = get<{ name: string }>("SELECT name FROM stations WHERE id = ? AND active = 1", i.stationId);
    if (!st) throw new UserError("Station not found");
    if (i.customerId !== null && !get("SELECT 1 AS x FROM customers WHERE id = ?", i.customerId)) throw new UserError("Customer not found");
    const rate: RateSnapshot = { rateId: 0, name: "Added by hand", hourlyPaise: Math.round((i.timePaise * 60) / i.minutes), extraControllerPaise: 0, incrementMin: 1 };
    const sessionId = Number(
      run(
        `INSERT INTO sessions (station_id, customer_id, staff_id, mode, started_at, planned_minutes, ended_at, players, rate_json, notes, billed)
         VALUES (?, ?, ?, 'fixed', ?, ?, ?, 1, ?, ?, 1)`,
        i.stationId, i.customerId, i.staffId, i.startedAt, i.minutes, endedAt, JSON.stringify(rate), i.note.trim().slice(0, 500),
      ).lastInsertRowid,
    );
    const taxPct = lineTaxPct();
    const lines: BillLineInput[] = [
      ...(i.timePaise > 0 ? [{ kind: "session" as const, name: `${st.name} - ${i.minutes} min`, qty: 1, unitPaise: i.timePaise, taxPct }] : []),
      ...(i.extrasPaise > 0 ? [{ kind: "item" as const, name: "Food and extras", qty: 1, unitPaise: i.extrasPaise, taxPct }] : []),
    ];
    const totals = computeBill(lines, null);
    const made = writeBill({
      sessionId, customerId: i.customerId, lines, totals, discountReason: "", payments: [{ method: i.method, amountPaise: totals.totalPaise }],
      staffId: i.staffId, now: endedAt, audit: `added by hand, total ${totals.totalPaise}`, action: "bill.manual",
    });
    run("UPDATE bills SET entered_by_hand = 1 WHERE id = ?", made.billId);
    return made;
  });
}
