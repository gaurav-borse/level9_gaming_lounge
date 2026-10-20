/** How many rows a list can show per page; the first is the default. */
export const PAGE_SIZES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;
export const DEFAULT_PAGE_SIZE = PAGE_SIZES[0];

/** The page size from the address bar: one of the offered sizes, otherwise 10. */
export function parsePageSize(raw: unknown): number {
  const n = Number(raw);
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
}

/** Page numbers to show: always the first and last, the ones around the current page, and "…" for the gaps. pageWindow(5, 12) -> 1 … 4 5 6 … 12 */
export function pageWindow(page: number, last: number): (number | "…")[] {
  const wanted = new Set([1, last, page - 1, page, page + 1].filter((n) => n >= 1 && n <= last));
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const n of [...wanted].sort((a, b) => a - b)) {
    if (n - prev === 2) out.push(prev + 1); // a gap of one page is just shown
    else if (n - prev > 2) out.push("…");
    out.push(n);
    prev = n;
  }
  return out;
}

/** Which page a person is on, kept inside what exists: "?page=abc", 0 and 9999 all land somewhere sensible. */
export function clampPage(raw: unknown, total: number, pageSize: number): number {
  const last = Math.max(1, Math.ceil(total / pageSize));
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? Math.min(last, Math.max(1, n)) : 1;
}
