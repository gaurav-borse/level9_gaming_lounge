import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { freshDb, station, MIN, T0 } from "./helpers.ts";
import { all, closeDb, get, getDb, run } from "../lib/db/index.ts";
import { MIGRATIONS } from "../lib/db/migrations.ts";
import {
  deleteCategory, deleteItem, getMenuItem, listCategories, listMenu, listStock, lowStockCount, recordStock, saveCategory, saveItem, stockHistory,
} from "../lib/db/menu.ts";
import { addMenuItem, getSession, listItems, startSession, stopSession } from "../lib/db/sessions.ts";
import { buildDraft, counterLines, finalizeBill, finalizeCounterSale, getBill, voidBill } from "../lib/db/bills.ts";
import { setSettings } from "../lib/db/settings.ts";
import { LOW_STOCK_AT, sortByStockStatus, stockStatus } from "../lib/stock.ts";
import { menuIconFor } from "../lib/menu-icon.ts";

beforeEach(freshDb);

const cat = (name = "Drinks") => saveCategory(null, name, "u1");
const item = (categoryId: number, over: Partial<Parameters<typeof saveItem>[1]> = {}) =>
  saveItem(null, { categoryId, name: "Coke", pricePaise: 4000, ...over }, "u1");
const onHand = (id: number) => getMenuItem(id)!.onHand;

test("stockStatus: every item warns at 5 or fewer, is out at zero or below, ok above 5", () => {
  assert.equal(LOW_STOCK_AT, 5);
  assert.equal(stockStatus(false, null), "untracked");
  assert.equal(stockStatus(true, 24), "ok");
  assert.equal(stockStatus(true, 6), "ok");
  assert.equal(stockStatus(true, 5), "low");
  assert.equal(stockStatus(true, 1), "low");
  assert.equal(stockStatus(true, 0), "out");
  assert.equal(stockStatus(true, -2), "out");
});

test("sortByStockStatus: out first, then low, then ok, keeping the original order inside a status", () => {
  const rows = [
    { n: "a", status: "ok" as const }, { n: "b", status: "low" as const }, { n: "c", status: "out" as const },
    { n: "d", status: "ok" as const }, { n: "e", status: "out" as const },
  ];
  assert.deepEqual(sortByStockStatus(rows).map((r) => r.n), ["c", "e", "b", "a", "d"]);
});

function upgradeFrom(version: number, seed: (db: DatabaseSync) => void, check: (dir: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lounge-up-"));
  const file = path.join(dir, "lounge.db");
  try {
    const old = new DatabaseSync(file);
    for (let i = 0; i < version; i++) old.exec(MIGRATIONS[i]);
    old.exec(`PRAGMA user_version = ${version}`);
    seed(old);
    old.close();
    process.env.LOUNGE_DB = file;
    closeDb();
    getDb();
    assert.equal((get<{ user_version: number }>("PRAGMA user_version"))?.user_version, MIGRATIONS.length);
    check(dir);
  } finally {
    closeDb();
    process.env.LOUNGE_DB = ":memory:";
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("a fresh database has the menu tables and an upgrade keeps data and leaves a safety copy", () => {
  assert.ok(get("SELECT 1 AS x FROM sqlite_master WHERE name = 'stock_moves'"));
  upgradeFrom(1, (db) => db.prepare("INSERT INTO settings (key, value) VALUES ('cafe.name', 'Before')").run(), (dir) => {
    assert.equal(get<{ value: string }>("SELECT value FROM settings WHERE key = 'cafe.name'")?.value, "Before");
    const copy = new DatabaseSync(path.join(dir, "backups", "lounge-before-v2.db"), { readOnly: true });
    assert.equal((copy.prepare("SELECT value FROM settings WHERE key = 'cafe.name'").get() as { value: string }).value, "Before");
    assert.equal((copy.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 1, "the copy is the old version");
    copy.close();
  });
});

test("upgrading from the first menu release turns stock counting on for every existing item", () => {
  upgradeFrom(
    2,
    (db) => {
      db.prepare("INSERT INTO menu_categories (name) VALUES ('Snacks')").run();
      db.prepare("INSERT INTO menu_items (category_id, name, price_paise, track_stock) VALUES (1, 'Chips', 3000, 0)").run();
    },
    (dir) => {
      assert.equal(getMenuItem(1)!.trackStock, true);
      assert.equal(getMenuItem(1)!.onHand, 0);
      assert.ok(fs.existsSync(path.join(dir, "backups", "lounge-before-v3.db")));
    },
  );
});

test("categories and items: validation, and every new item is counted in stock straight away", () => {
  const c = cat();
  assert.throws(() => saveCategory(null, "  ", "u1"), /required/);
  assert.throws(() => item(c, { name: "" }), /required/);
  assert.throws(() => item(c, { pricePaise: -1 }), /Price/);
  assert.throws(() => item(9999), /category/);
  const id = item(c);
  assert.equal(getMenuItem(id)!.trackStock, true, "no switch to turn on: every item is counted");
  assert.equal(onHand(id), 0);
  assert.deepEqual(listStock().map((m) => m.name), ["Coke"], "it is on the stock list without anyone asking");
  assert.equal(lowStockCount(), 1, "and starts out of stock until restocked");
  saveItem(id, { categoryId: c, name: "Pepsi", pricePaise: 3500 }, "u1");
  assert.deepEqual([getMenuItem(id)!.name, getMenuItem(id)!.pricePaise], ["Pepsi", 3500]);
  assert.equal(saveCategory(c, "Cold drinks", "u1"), c);
  assert.equal(listCategories()[0].name, "Cold drinks");
});

test("deleting an item or a category removes it from the menu and stock, while bills keep their history", () => {
  const c = cat();
  const coke = item(c);
  const chips = item(c, { name: "Chips" });
  const other = item(cat("Snacks"), { name: "Nuts" });
  recordStock(coke, "restock", 5, "u1", "");
  assert.equal(listMenu().length, 3);

  deleteItem(chips, "u1");
  assert.deepEqual(listMenu().map((m) => m.name), ["Coke", "Nuts"]);
  assert.throws(() => deleteItem(chips, "u1"), /not found/, "already gone");
  assert.throws(() => recordStock(chips, "restock", 1, "u1", ""), /not found/, "a deleted item cannot be restocked");

  deleteCategory(c, "u1");
  assert.deepEqual(listCategories().map((x) => x.name), ["Snacks"]);
  assert.deepEqual(listMenu().map((m) => m.name), ["Nuts"], "the category's items go with it");
  assert.deepEqual(listStock().map((m) => m.name), ["Nuts"]);
  assert.throws(() => deleteCategory(c, "u1"), /not found/);
  assert.equal(other > 0, true);
  assert.ok(all("SELECT 1 FROM audit_log WHERE action = 'menu.category.delete'").length === 1);
  assert.ok(all("SELECT 1 FROM audit_log WHERE action = 'menu.item.delete'").length === 1);
});

test("an item deleted while it is on a tab still bills correctly and still leaves stock", () => {
  const coke = item(cat());
  recordStock(coke, "restock", 5, "u1", "");
  const s = startSession({ stationId: station("pc"), staffId: "u1", plannedMinutes: 1, players: 1, now: T0 });
  addMenuItem(s, coke, 2, T0);
  deleteItem(coke, "u1");
  assert.throws(() => addMenuItem(s, coke, 1, T0), /not on the menu/);
  stopSession(s, T0 + 30 * MIN, "u1");
  const total = buildDraft(s, T0 + 30 * MIN).lines.reduce((a, l) => a + l.qty * l.unitPaise, 0);
  const paid = finalizeBill({ sessionId: s, staffId: "u1", role: "owner", discount: null, discountReason: "", payments: [{ method: "cash", amountPaise: total }], now: T0 + 31 * MIN });
  assert.equal(getBill(paid.billId)!.lines.some((l) => l.name === "Coke" && l.qty === 2), true);
  assert.equal(onHand(coke), 3);
});

test("recordStock: restock, stock-take, and the refusals", () => {
  const id = item(cat());
  assert.equal(onHand(id), 0);
  recordStock(id, "restock", 24, "u1", "delivery");
  assert.equal(onHand(id), 24);
  recordStock(id, "adjust", 20, "u1", "stock-take");
  assert.equal(onHand(id), 20);
  assert.deepEqual(stockHistory(id).map((m) => [m.reason, m.delta]), [["adjust", -4], ["restock", 24]]);
  assert.throws(() => recordStock(id, "adjust", 20, "u1", ""), /already shows 20/);
  assert.throws(() => recordStock(id, "restock", 0, "u1", ""), /1 or more/);
  assert.throws(() => recordStock(id, "restock", 1.5, "u1", ""), /whole number/);
  assert.throws(() => recordStock(id, "adjust", -1, "u1", ""), /zero or more/);
  assert.throws(() => recordStock(9999, "restock", 5, "u1", ""), /not found/);
  assert.ok(all("SELECT 1 FROM audit_log WHERE action = 'stock.restock'").length >= 1);
});

test("lowStockCount counts items that are low or out, and listStock skips deleted ones", () => {
  const c = cat();
  const a = item(c, { name: "A" });
  const b = item(c, { name: "B" });
  const gone = item(c, { name: "D" });
  deleteItem(gone, "u1");
  assert.equal(lowStockCount(), 2, "A and B start at zero stock");
  recordStock(a, "restock", 10, "u1", "");
  recordStock(b, "restock", 5, "u1", "");
  assert.equal(lowStockCount(), 1, "B has 5 left (warns), A has 10 (fine)");
  recordStock(b, "restock", 1, "u1", "");
  assert.equal(lowStockCount(), 0, "6 left is no longer low");
  assert.deepEqual(listStock().map((m) => m.name), ["A", "B"]);
});

test("menu items on a tab: the price is frozen, and stock leaves once, when the bill is paid", () => {
  const c = cat();
  const coke = item(c, { pricePaise: 4000 });
  const chips = item(c, { name: "Chips", pricePaise: 3000 });
  recordStock(coke, "restock", 10, "u1", "");
  recordStock(chips, "restock", 4, "u1", "");
  const s = startSession({ stationId: station("ps5"), staffId: "u1", plannedMinutes: 1, players: 1, now: T0 });
  addMenuItem(s, coke, 2, T0);
  addMenuItem(s, chips, 1, T0);
  saveItem(coke, { categoryId: c, name: "Coke", pricePaise: 9900 }, "u1");
  assert.deepEqual(listItems(s).map((i) => [i.name, i.unitPaise, i.itemId]), [["Coke", 4000, coke], ["Chips", 3000, chips]], "price is frozen when added");
  assert.equal(onHand(coke), 10, "nothing leaves stock while the tab is open");
  stopSession(s, T0 + 30 * MIN, "u1");
  const total = buildDraft(s, T0 + 30 * MIN).lines.reduce((a, l) => a + l.qty * l.unitPaise, 0);
  const bill = finalizeBill({ sessionId: s, staffId: "u1", role: "owner", discount: null, discountReason: "", payments: [{ method: "cash", amountPaise: total }], now: T0 + 31 * MIN });
  assert.equal(onHand(coke), 8);
  assert.equal(onHand(chips), 3);
  assert.deepEqual(all<{ delta: number; bill_id: number }>("SELECT delta, bill_id FROM stock_moves WHERE reason = 'sale' AND item_id = ?", coke), [{ delta: -2, bill_id: bill.billId }]);
  assert.throws(() => addMenuItem(s, coke, 1, T0), /already billed/);
});

test("addMenuItem refuses deleted items and bad quantities", () => {
  const id = item(cat());
  const s = startSession({ stationId: station("pc"), staffId: "u1", plannedMinutes: 1, players: 1, now: T0 });
  assert.throws(() => addMenuItem(s, id, 0, T0), /between 1 and 99/);
  assert.throws(() => addMenuItem(s, id, 100, T0), /between 1 and 99/);
  deleteItem(id, "u1");
  assert.throws(() => addMenuItem(s, id, 1, T0), /not on the menu/);
  assert.equal(getSession(s).billed, false);
});

test("GST: every line uses the lounge rate, and GST off means no tax anywhere", () => {
  const food = item(cat(), { name: "Sandwich", pricePaise: 10500 });
  setSettings({ "gst.enabled": "1", "gst.pct": "12" });
  assert.deepEqual(counterLines([{ itemId: food, qty: 1 }]).map((l) => l.taxPct), [12]);
  setSettings({ "gst.enabled": "0" });
  assert.deepEqual(counterLines([{ itemId: food, qty: 1 }]).map((l) => l.taxPct), [0]);
});

test("counter sale: no session, sequential invoice numbers, merged lines, stock leaves once, bad payments change nothing", () => {
  const c = cat();
  const coke = item(c);
  recordStock(coke, "restock", 10, "u1", "");
  const pay = (amountPaise: number, over: Record<string, unknown> = {}) =>
    finalizeCounterSale({ lines: [{ itemId: coke, qty: 1 }, { itemId: coke, qty: 2 }], staffId: "u1", role: "owner", discount: null, discountReason: "", payments: [{ method: "upi", amountPaise }], now: T0, ...over });

  assert.throws(() => pay(11999), /add up/);
  assert.equal(onHand(coke), 10, "a refused payment leaves stock alone");
  assert.equal(get<{ n: number }>("SELECT COUNT(*) AS n FROM bills")?.n, 0);

  const first = pay(12000);
  assert.equal(first.invoiceNo, 1);
  assert.equal(onHand(coke), 7, "1 + 2 merged into 3");
  const b = getBill(first.billId)!;
  assert.equal(b.stationName, null);
  assert.deepEqual(b.lines.map((l) => [l.name, l.qty, l.unitPaise]), [["Coke", 3, 4000]]);
  assert.deepEqual(b.payments, [{ method: "upi", amountPaise: 12000 }]);
  assert.equal(pay(12000).invoiceNo, 2);

  assert.throws(() => finalizeCounterSale({ lines: [], staffId: "u1", role: "owner", discount: null, discountReason: "", payments: [], now: T0 }), /at least one item/);
  assert.throws(() => finalizeCounterSale({ lines: [{ itemId: coke, qty: 100 }], staffId: "u1", role: "owner", discount: null, discountReason: "", payments: [], now: T0 }), /between 1 and 99/);
  deleteItem(coke, "u1");
  assert.throws(() => pay(12000), /not on the menu/);
});

test("counter sale discounts: a reason is required and staff are capped, the owner is not", () => {
  const coke = item(cat());
  setSettings({ "staff.maxDiscountPct": "10" });
  const sale = (role: "owner" | "staff", value: number, reason: string, pay: number) =>
    finalizeCounterSale({ lines: [{ itemId: coke, qty: 1 }], staffId: "u1", role, discount: { type: "percent", value }, discountReason: reason, payments: [{ method: "cash", amountPaise: pay }], now: T0 });
  assert.throws(() => sale("owner", 10, "", 3600), /reason/);
  assert.throws(() => sale("staff", 50, "friend", 2000), /at most 10%/);
  assert.equal(sale("staff", 10, "regular", 3600).invoiceNo, 1);
  assert.equal(sale("owner", 50, "friend", 2000).invoiceNo, 2);
});

test("voiding a bill puts back exactly what it took out, once", () => {
  const coke = item(cat());
  recordStock(coke, "restock", 10, "u1", "");
  const sold = finalizeCounterSale({ lines: [{ itemId: coke, qty: 4 }], staffId: "u1", role: "owner", discount: null, discountReason: "", payments: [{ method: "cash", amountPaise: 16000 }], now: T0 });
  assert.equal(onHand(coke), 6);
  assert.throws(() => voidBill(sold.billId, "x", "u2", "staff", T0), /Only the owner/);
  assert.equal(onHand(coke), 6);
  voidBill(sold.billId, "wrong item", "u1", "owner", T0 + MIN);
  assert.equal(onHand(coke), 10);
  assert.throws(() => voidBill(sold.billId, "again", "u1", "owner", T0 + 2 * MIN), /already marked invalid/);
  assert.equal(onHand(coke), 10);
  assert.deepEqual(stockHistory(coke).map((m) => m.reason), ["void", "sale", "restock"]);
});

test("a bill with no menu items (free-text extras only) never touches stock", () => {
  const coke = item(cat());
  recordStock(coke, "restock", 3, "u1", "");
  const s = startSession({ stationId: station("pool"), staffId: "u1", plannedMinutes: 1, players: 1, now: T0 });
  run("INSERT INTO session_items (session_id, name, qty, unit_paise, created_at) VALUES (?,?,?,?,?)", s, "Coke", 1, 4000, T0);
  stopSession(s, T0 + 20 * MIN, "u1");
  const total = buildDraft(s, T0 + 20 * MIN).lines.reduce((a, l) => a + l.qty * l.unitPaise, 0);
  finalizeBill({ sessionId: s, staffId: "u1", role: "owner", discount: null, discountReason: "", payments: [{ method: "cash", amountPaise: total }], now: T0 + 21 * MIN });
  assert.equal(onHand(coke), 3);
});

test("menuIconFor: picks a picture from the item name, case-insensitively, and falls back to a box", () => {
  const cases: [string, string][] = [
    ["Coke", "soda"], ["PEPSI 500ml", "soda"], ["Cold coffee", "coffee"], ["Masala chai", "coffee"], ["Water", "water"], ["Soda water", "water"],
    ["Fresh lime juice", "juice"], ["Oreo shake", "juice"], ["Chips", "snack"], ["Kurkure", "snack"], ["Veg sandwich", "sandwich"],
    ["Cheese burger", "burger"], ["Margherita pizza", "pizza"], ["Maggi", "noodles"], ["Ice cream", "icecream"], ["Brownie", "cake"],
    ["Dairy Milk", "milk"], ["Boiled egg", "egg"], ["Thali", "meal"], ["Something odd", "other"], ["", "other"],
  ];
  for (const [name, icon] of cases) assert.equal(menuIconFor(name), icon, name);
});

test("putting more on a tab than the shop count holds gives a warning but still adds it; stock on other open tabs counts", () => {
  const cat = saveCategory(null, "Drinks", "u1");
  const coke = saveItem(null, { categoryId: cat, name: "Coke", pricePaise: 4000 }, "u1");
  recordStock(coke, "restock", 3, "u1", "delivery");
  const a = startSession({ stationId: station("ps5"), staffId: "u1", plannedMinutes: 60, players: 1, now: T0 });
  const b = startSession({ stationId: station("pc"), staffId: "u1", plannedMinutes: 60, players: 1, now: T0 });
  assert.equal(addMenuItem(a, coke, 2, T0), null, "2 of 3: fine");
  assert.match(addMenuItem(b, coke, 2, T0)!, /Only 3 Coke in stock, 4 are now on open tabs/);
  assert.equal(listItems(b).length, 1, "it is still added: staff know best");
  recordStock(coke, "adjust", 0, "u1", "none left");
  assert.match(addMenuItem(b, coke, 1, T0)!, /out of stock/);
});
