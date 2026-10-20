import { all, get, run, audit } from "./index.ts";
import { UserError } from "../errors.ts";
import { dayStart } from "../bills-filter.ts";

export const EXPENSE_CATEGORIES = ["Rent", "Electricity", "Salaries", "Stock purchase", "Repairs", "Internet", "Marketing", "Other"] as const;

export type Expense = { id: number; day: string; category: string; note: string; amountPaise: number; stationId: number | null; stationName: string | null };

/** `stationId` ties the cost to one station (a repair on the pool table), so that station's return on investment counts it. Null = a shared cost. */
export function addExpense(e: { day: string; category: string; note: string; amountPaise: number; stationId?: number | null }, staffId: string, now = Date.now()): number {
  if (dayStart(e.day) === undefined) throw new UserError("Pick the date the money was spent");
  if (!e.category.trim()) throw new UserError("Pick a category");
  if (!Number.isInteger(e.amountPaise) || e.amountPaise <= 0) throw new UserError("Enter the amount spent");
  if (e.stationId != null && !get("SELECT 1 AS x FROM stations WHERE id = ?", e.stationId)) throw new UserError("Station not found");
  const id = Number(
    run("INSERT INTO expenses (day, category, note, amount_paise, station_id, staff_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", e.day, e.category.trim(), e.note.trim(), e.amountPaise, e.stationId ?? null, staffId, now).lastInsertRowid,
  );
  audit(staffId, "expense.add", `${e.category} ${e.amountPaise / 100} on ${e.day}`, now);
  return id;
}

export function deleteExpense(id: number, staffId: string, now = Date.now()): void {
  const row = get<{ day: string; category: string; amountPaise: number }>("SELECT day, category, amount_paise AS amountPaise FROM expenses WHERE id = ?", id);
  if (!row) throw new UserError("Expense not found");
  run("DELETE FROM expenses WHERE id = ?", id);
  audit(staffId, "expense.delete", `${row.category} ${row.amountPaise / 100} on ${row.day}`, now);
}

/** Newest first. `fromDay` / `toDay` are inclusive yyyy-mm-dd days; leave both out for everything. */
export function listExpenses(fromDay?: string, toDay?: string): Expense[] {
  return all<Expense>(
    `SELECT e.id, e.day, e.category, e.note, e.amount_paise AS amountPaise, e.station_id AS stationId, st.name AS stationName
     FROM expenses e LEFT JOIN stations st ON st.id = e.station_id
     WHERE (? IS NULL OR e.day >= ?) AND (? IS NULL OR e.day <= ?) ORDER BY e.day DESC, e.id DESC`,
    fromDay ?? null, fromDay ?? null, toDay ?? null, toDay ?? null,
  );
}
