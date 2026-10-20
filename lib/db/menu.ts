import { all, get, run, tx, audit } from "./index.ts";
import { UserError } from "../errors.ts";
import { getSetting } from "./settings.ts";
import { stockStatus } from "../stock.ts";

export type MenuCategory = { id: number; name: string; active: boolean; sort: number };
export type MenuItem = {
  id: number;
  categoryId: number;
  categoryName: string;
  name: string;
  pricePaise: number;
  trackStock: boolean; // always true for items added now; kept for items from before every item was counted
  active: boolean;
  onHand: number | null; // null when stock is not tracked
};

type RawItem = Omit<MenuItem, "trackStock" | "active"> & { trackStock: number; active: number };
const toItem = (r: RawItem): MenuItem => ({ ...r, trackStock: r.trackStock === 1, active: r.active === 1, onHand: r.trackStock === 1 ? (r.onHand ?? 0) : null });

const ITEM_SQL = `SELECT m.id, m.category_id AS categoryId, c.name AS categoryName, m.name, m.price_paise AS pricePaise,
    m.track_stock AS trackStock, m.active,
    (SELECT COALESCE(SUM(delta), 0) FROM stock_moves WHERE item_id = m.id) AS onHand
  FROM menu_items m JOIN menu_categories c ON c.id = m.category_id`;

// ---- categories ----
export function listCategories(): MenuCategory[] {
  return all<{ id: number; name: string; active: number; sort: number }>(
    "SELECT id, name, active, sort FROM menu_categories WHERE active = 1 ORDER BY sort, id",
  ).map((c) => ({ ...c, active: c.active === 1 }));
}

function cleanName(v: string, label: string): string {
  const s = v.trim();
  if (!s) throw new UserError(`${label} is required`);
  if (s.length > 60) throw new UserError(`${label} is too long (max 60 characters)`);
  return s;
}

export function saveCategory(id: number | null, name: string, staffId: string, now = Date.now()): number {
  const n = cleanName(name, "Category name");
  return tx(() => {
    if (id === null) {
      const next = (get<{ n: number }>("SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM menu_categories")?.n) ?? 1;
      const newId = Number(run("INSERT INTO menu_categories (name, sort) VALUES (?, ?)", n, next).lastInsertRowid);
      audit(staffId, "menu.category.create", n, now);
      return newId;
    }
    if (!get("SELECT 1 AS x FROM menu_categories WHERE id = ?", id)) throw new UserError("Category not found");
    run("UPDATE menu_categories SET name = ? WHERE id = ?", n, id);
    audit(staffId, "menu.category.update", `${id}: ${n}`, now);
    return id;
  });
}

/** Removes the category and every item in it from the menu and the stock list. Rows stay in the database so old bills keep their history. */
export function deleteCategory(id: number, staffId: string, now = Date.now()): void {
  tx(() => {
    const c = get<{ name: string }>("SELECT name FROM menu_categories WHERE id = ? AND active = 1", id);
    if (!c) throw new UserError("Category not found");
    run("UPDATE menu_items SET active = 0 WHERE category_id = ?", id);
    run("UPDATE menu_categories SET active = 0 WHERE id = ?", id);
    audit(staffId, "menu.category.delete", c.name, now);
  });
}

// ---- items ----
export type ItemInput = { categoryId: number; name: string; pricePaise: number };

function validateItem(i: ItemInput): ItemInput {
  const name = cleanName(i.name, "Item name");
  if (!Number.isInteger(i.pricePaise) || i.pricePaise < 0 || i.pricePaise > 10_000_000) throw new UserError("Price is not valid");
  if (!get("SELECT 1 AS x FROM menu_categories WHERE id = ?", i.categoryId)) throw new UserError("Choose a category");
  return { ...i, name };
}

export function saveItem(id: number | null, input: ItemInput, staffId: string, now = Date.now()): number {
  const i = validateItem(input);
  return tx(() => {
    if (id === null) {
      const next = (get<{ n: number }>("SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM menu_items WHERE category_id = ?", i.categoryId)?.n) ?? 1;
      const newId = Number(
        run(
          "INSERT INTO menu_items (category_id, name, price_paise, track_stock, sort) VALUES (?,?,?,1,?)",
          i.categoryId, i.name, i.pricePaise, next,
        ).lastInsertRowid,
      );
      audit(staffId, "menu.item.create", `${i.name} @ ${i.pricePaise} paise`, now);
      return newId;
    }
    if (!get("SELECT 1 AS x FROM menu_items WHERE id = ?", id)) throw new UserError("Item not found");
    run(
      "UPDATE menu_items SET category_id = ?, name = ?, price_paise = ? WHERE id = ?",
      i.categoryId, i.name, i.pricePaise, id,
    );
    audit(staffId, "menu.item.update", `${id}: ${i.name} @ ${i.pricePaise} paise`, now);
    return id;
  });
}

/** Removes an item from the menu and stock. The row stays in the database so old tabs and bills keep their history. */
export function deleteItem(id: number, staffId: string, now = Date.now()): void {
  const m = get<{ name: string }>("SELECT name FROM menu_items WHERE id = ? AND active = 1", id);
  if (!m) throw new UserError("Item not found");
  run("UPDATE menu_items SET active = 0 WHERE id = ?", id);
  audit(staffId, "menu.item.delete", m.name, now);
}

/** The live menu: items and categories that have not been deleted. */
export function listMenu(): MenuItem[] {
  return all<RawItem>(`${ITEM_SQL} WHERE m.active = 1 AND c.active = 1 ORDER BY c.sort, c.id, m.sort, m.id`).map(toItem);
}

export function getMenuItem(id: number): MenuItem | undefined {
  const r = get<RawItem>(`${ITEM_SQL} WHERE m.id = ?`, id);
  return r ? toItem(r) : undefined;
}

/** The GST % every bill line uses: the lounge rate from Settings, or 0 when GST is off. */
export function lineTaxPct(): number {
  return getSetting("gst.enabled") === "1" ? Number(getSetting("gst.pct")) : 0;
}

// ---- stock ----
export type StockMove = { id: number; delta: number; reason: string; note: string; staffId: string; at: number; billId: number | null };

export type StockKind = "restock" | "adjust";

/** restock adds `qty`, adjust sets the on-hand count to `qty` (a stock-take). */
export function recordStock(itemId: number, kind: StockKind, qty: number, staffId: string, note: string, now = Date.now()): void {
  if (!Number.isInteger(qty) || qty < 0 || qty > 1_000_000 || (kind !== "adjust" && qty < 1)) {
    throw new UserError(kind === "adjust" ? "Count must be a whole number, zero or more" : "Quantity must be a whole number, 1 or more");
  }
  tx(() => {
    const item = getMenuItem(itemId);
    if (!item || !item.active) throw new UserError("Item not found");
    const delta = kind === "restock" ? qty : qty - (item.onHand ?? 0);
    if (delta === 0) throw new UserError(`${item.name} already shows ${qty}`);
    run("INSERT INTO stock_moves (item_id, delta, reason, staff_id, note, at) VALUES (?,?,?,?,?,?)", itemId, delta, kind, staffId, note.trim().slice(0, 120), now);
    audit(staffId, `stock.${kind}`, `${item.name}: ${delta > 0 ? "+" : ""}${delta}${note.trim() ? ` (${note.trim().slice(0, 120)})` : ""}`, now);
  });
}

export const stockHistory = (itemId: number, limit = 30): StockMove[] =>
  all<StockMove>(
    "SELECT id, delta, reason, note, staff_id AS staffId, at, bill_id AS billId FROM stock_moves WHERE item_id = ? ORDER BY id DESC LIMIT ?",
    itemId, limit,
  );

/** Active items that are counted, for the Stock tab. */
export const listStock = (): MenuItem[] => listMenu().filter((m) => m.trackStock);

/** Tracked, active items that are low or out: the number on the sidebar badge. */
export function lowStockCount(): number {
  return listStock().filter((m) => stockStatus(m.trackStock, m.onHand) !== "ok").length;
}

/** Called inside the bill transaction: each tracked item on the bill leaves stock once. */
export function deductForBill(billId: number, staffId: string, now: number): void {
  const rows = all<{ itemId: number; qty: number }>(
    `SELECT bl.item_id AS itemId, SUM(bl.qty) AS qty FROM bill_lines bl JOIN menu_items m ON m.id = bl.item_id
     WHERE bl.bill_id = ? AND m.track_stock = 1 GROUP BY bl.item_id`,
    billId,
  );
  for (const r of rows) {
    run("INSERT INTO stock_moves (item_id, delta, reason, bill_id, staff_id, at) VALUES (?,?,?,?,?,?)", r.itemId, -r.qty, "sale", billId, staffId, now);
  }
}

/** Voiding a bill puts back exactly what that bill took out. */
export function restoreForBill(billId: number, staffId: string, now: number): void {
  const rows = all<{ itemId: number; qty: number }>(
    "SELECT item_id AS itemId, -SUM(delta) AS qty FROM stock_moves WHERE bill_id = ? AND reason = 'sale' GROUP BY item_id",
    billId,
  );
  for (const r of rows) {
    if (r.qty > 0) run("INSERT INTO stock_moves (item_id, delta, reason, bill_id, staff_id, at) VALUES (?,?,?,?,?,?)", r.itemId, r.qty, "void", billId, staffId, now);
  }
}
