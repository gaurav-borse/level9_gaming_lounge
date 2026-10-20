import type { PaymentMethod } from "./engine/bill.ts";

export type BillFilter = {
  q?: string; // invoice number, station or customer
  method?: PaymentMethod; // at least one payment made this way
  status?: "paid" | "void";
  from?: number; // inclusive, ms
  to?: number; // exclusive, ms
  customerId?: number; // one customer's bills (set by the code, not by the address bar)
};

const METHODS = ["cash", "upi", "card"] as const;

/** "2026-10-06" as the start of that local day. Anything that is not a real date gives undefined. */
export function dayStart(v: string | undefined): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? "");
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date.getTime() : undefined;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** The Bills page's search box and dropdowns (from the address bar) as a safe filter. Unknown values are ignored. */
export function parseBillFilter(params: Record<string, string | string[] | undefined>): BillFilter {
  const q = (one(params.q) ?? "").trim().slice(0, 60);
  const method = METHODS.find((m) => m === one(params.method));
  const status = one(params.status) === "paid" || one(params.status) === "void" ? (one(params.status) as "paid" | "void") : undefined;
  const from = dayStart(one(params.from));
  const toDay = dayStart(one(params.to));
  const to = toDay === undefined ? undefined : new Date(new Date(toDay).getFullYear(), new Date(toDay).getMonth(), new Date(toDay).getDate() + 1).getTime();
  return { ...(q ? { q } : {}), ...(method ? { method } : {}), ...(status ? { status } : {}), ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}) };
}

/** "INV-000012", "inv12", "12" and "#12" all mean invoice 12; anything else is not an invoice number. */
export function invoiceNumberFrom(q: string): number | null {
  const m = /^(?:inv[-\s]?|#)?0*(\d{1,9})$/i.exec(q.trim());
  return m ? Number(m[1]) : null;
}

export const hasFilter = (f: BillFilter): boolean => Object.keys(f).length > 0;
