import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZES, clampPage, pageWindow } from "@/lib/pagination";
import { PageSizeSelect } from "./page-size-select";

const cell = "inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-3 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/**
 * Under a list: "Showing 1-10 of 340", how many rows to show per page (10 to 100), and numbered pages.
 * `href(page, size)` builds the address, keeping whatever search is active. Always shown when there is anything to list,
 * so the row count can be changed even when everything fits on one page.
 */
export function Pagination({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number, size: number) => string }) {
  if (total === 0) return null;
  const last = Math.max(1, Math.ceil(total / pageSize));
  const current = clampPage(page, total, pageSize);
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <p className="text-sm text-mute">Showing {from}–{to} of {total}</p>
        <PageSizeSelect current={pageSize} options={PAGE_SIZES.map((size) => ({ size, url: href(1, size) }))} />
      </div>
      {last > 1 && (
        <ul className="flex flex-wrap items-center gap-1">
          <li>
            {current > 1 ? (
              <Link href={href(current - 1, pageSize)} className={`${cell} bg-panel text-silver hover:bg-raised hover:text-ink`} aria-label="Previous page"><ChevronLeft className="size-4" aria-hidden /></Link>
            ) : (
              <span className={`${cell} text-mute/50`} aria-hidden><ChevronLeft className="size-4" /></span>
            )}
          </li>
          {pageWindow(current, last).map((n, i) =>
            n === "…" ? (
              <li key={`gap${i}`} className="px-1 text-mute" aria-hidden>…</li>
            ) : (
              <li key={n}>
                <Link
                  href={href(n, pageSize)}
                  aria-current={n === current ? "page" : undefined}
                  aria-label={`Page ${n}`}
                  className={`${cell} tnum ${n === current ? "bg-brand text-on-brand" : "bg-panel text-silver hover:bg-raised hover:text-ink"}`}
                >
                  {n}
                </Link>
              </li>
            ),
          )}
          <li>
            {current < last ? (
              <Link href={href(current + 1, pageSize)} className={`${cell} bg-panel text-silver hover:bg-raised hover:text-ink`} aria-label="Next page"><ChevronRight className="size-4" aria-hidden /></Link>
            ) : (
              <span className={`${cell} text-mute/50`} aria-hidden><ChevronRight className="size-4" /></span>
            )}
          </li>
        </ul>
      )}
    </nav>
  );
}
