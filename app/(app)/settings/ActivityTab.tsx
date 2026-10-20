import Link from "next/link";
import { Search } from "lucide-react";
import { listAudit } from "@/lib/db/audit";
import { describeAction } from "@/lib/audit-labels";
import { dateTime } from "@/lib/format";
import { Pagination } from "@/components/pagination";
import { LiveFilters } from "@/components/live-filters";
import { clampPage, parsePageSize } from "@/lib/pagination";
import { btnCls, cardCls, inputCls, labelCls } from "@/lib/ui";

/** Who did what and when: voids, price changes, PIN resets, backups and so on. */
export function ActivityTab({ q, page: wanted, size: wantedSize }: { q: string; page: number; size: string | undefined }) {
  const size = parsePageSize(wantedSize);
  const total = listAudit(q, 1, 0).total; // the search covers the whole log
  const page = clampPage(wanted, total, size);
  const { rows } = listAudit(q, size, (page - 1) * size);
  const href = (p: number, s: number) => `/settings?tab=activity${q ? `&q=${encodeURIComponent(q)}` : ""}&size=${s}&page=${p}`;
  return (
    <div className="space-y-5">
      <LiveFilters action="/settings" className={`${cardCls} flex flex-wrap items-end gap-3 p-4`}>
        <input type="hidden" name="tab" value="activity" />
        <input type="hidden" name="size" value={size} />
        <div className="min-w-60 flex-1">
          <label className={labelCls} htmlFor="aq">Search the activity log</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-mute" aria-hidden />
            <input id="aq" name="q" type="search" defaultValue={q} placeholder="A person, or something like void or price" className={`${inputCls} pl-9`} />
          </div>
        </div>
        {q && <Link href={`/settings?tab=activity&size=${size}`} className={btnCls}>Clear</Link>}
      </LiveFilters>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-10 text-center text-mute">{q ? "Nothing matches this search." : "Nothing has been recorded yet."}</p>
      ) : (
        <div className={`${cardCls} overflow-x-auto`}>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-mute">
              <tr className="border-b border-line">
                <th className="px-4 py-3 font-medium">When</th><th className="px-4 py-3 font-medium">Who</th>
                <th className="px-4 py-3 font-medium">What</th><th className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-silver">{dateTime(r.at)}</td>
                  <td className="whitespace-nowrap px-4 py-3">{r.who}</td>
                  <td className="px-4 py-3 font-semibold">{describeAction(r.action)}</td>
                  <td className="px-4 py-3 text-silver">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageSize={size} total={total} href={href} />
    </div>
  );
}
