export type StockStatus = "untracked" | "ok" | "low" | "out";

/** Every item warns when 5 or fewer are left. */
export const LOW_STOCK_AT = 5;

/** "out" at zero or below (counts drift, so negative is possible), "low" at 5 or fewer. */
export function stockStatus(trackStock: boolean, onHand: number | null): StockStatus {
  if (!trackStock || onHand === null) return "untracked";
  if (onHand <= 0) return "out";
  if (onHand <= LOW_STOCK_AT) return "low";
  return "ok";
}

const ORDER: StockStatus[] = ["out", "low", "ok", "untracked"];

/** Items that need restocking first; within a status the original order is kept. */
export function sortByStockStatus<T extends { status: StockStatus }>(items: T[]): T[] {
  return items.map((x, i) => ({ x, i })).sort((a, b) => ORDER.indexOf(a.x.status) - ORDER.indexOf(b.x.status) || a.i - b.i).map(({ x }) => x);
}
