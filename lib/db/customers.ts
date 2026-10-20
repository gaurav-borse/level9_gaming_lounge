import { all, get, run, audit } from "./index.ts";
import { normalizePhone } from "../phone.ts";
import { UserError } from "../errors.ts";

export type Customer = { id: number; name: string; phone: string | null };

export function searchCustomers(q: string, limit = 8): Customer[] {
  const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
  return all<Customer>(
    `SELECT id, name, phone FROM customers
     WHERE name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' ORDER BY name LIMIT ?`,
    like, like, limit,
  );
}

/** A typed phone becomes digits with country code (or null when blank). */
function cleanPhone(phoneRaw: string, defaultCc: string): string | null {
  if (!phoneRaw.trim()) return null;
  const phone = normalizePhone(phoneRaw, defaultCc);
  if (!phone) throw new UserError("That phone number doesn't look right");
  return phone;
}

export function createCustomer(name: string, phoneRaw: string, defaultCc = "91", now = Date.now()): number {
  return Number(run("INSERT INTO customers (name, phone, created_at) VALUES (?, ?, ?)", name, cleanPhone(phoneRaw, defaultCc), now).lastInsertRowid);
}

export type CustomerRow = Customer & { notes: string; createdAt: number; visits: number; spentPaise: number; lastVisit: number | null };

// Visits and spend count paid bills only: a voided bill is not a visit.
const ROW_SQL = `SELECT c.id, c.name, c.phone, c.notes, c.created_at AS createdAt,
    (SELECT COUNT(*) FROM bills b WHERE b.customer_id = c.id AND b.status = 'paid') AS visits,
    (SELECT COALESCE(SUM(b.total_paise), 0) FROM bills b WHERE b.customer_id = c.id AND b.status = 'paid') AS spentPaise,
    (SELECT MAX(b.created_at) FROM bills b WHERE b.customer_id = c.id AND b.status = 'paid') AS lastVisit
  FROM customers c`;

/** Everyone, biggest spender first; `q` narrows by name or phone digits. */
function customerWhere(q: string): { sql: string; args: string[] } {
  const t = q.trim();
  if (!t) return { sql: "", args: [] };
  const like = `%${t.replace(/[%_!]/g, (c) => `!${c}`)}%`;
  const digits = t.replace(/\D/g, "");
  return { sql: `WHERE c.name LIKE ? ESCAPE '!'${digits ? " OR c.phone LIKE ?" : ""}`, args: [like, ...(digits ? [`%${digits}%`] : [])] };
}

export function countCustomers(q = ""): number {
  const w = customerWhere(q);
  return get<{ n: number }>(`SELECT COUNT(*) AS n FROM customers c ${w.sql}`, ...w.args)?.n ?? 0;
}

export function listCustomers(q = "", limit = 300, offset = 0): CustomerRow[] {
  const w = customerWhere(q);
  return all<CustomerRow>(`${ROW_SQL} ${w.sql} ORDER BY spentPaise DESC, c.name LIMIT ? OFFSET ?`, ...w.args, limit, offset);
}

export function getCustomer(id: number): CustomerRow | undefined {
  return get<CustomerRow>(`${ROW_SQL} WHERE c.id = ?`, id);
}

export function updateCustomer(id: number, name: string, phoneRaw: string, notes: string, staffId: string, defaultCc = "91", now = Date.now()): void {
  if (!name.trim()) throw new UserError("Customer name is required");
  if (!get("SELECT 1 AS x FROM customers WHERE id = ?", id)) throw new UserError("Customer not found");
  run("UPDATE customers SET name = ?, phone = ?, notes = ? WHERE id = ?", name.trim(), cleanPhone(phoneRaw, defaultCc), notes.trim(), id);
  audit(staffId, "customer.update", `${id}: ${name.trim()}`, now);
}
