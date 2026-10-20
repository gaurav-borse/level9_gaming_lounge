import type { ReactNode } from "react";
import { rupeesExact } from "@/lib/format";
import { cardCls } from "@/lib/ui";

export function Panel({ title, note, children, className = "" }: { title: string; note?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`${cardCls} p-5 ${className}`}>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-mute">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export type Row = { label: string; paise: number; count?: number; sub?: string };

/**
 * A table whose rows add up to `total` (shown on the last line, so what you see reconciles).
 * "Share" is each row's part of `total`, to one decimal; rounding can make the shares add to 99.9 or 100.1.
 */
export function Breakdown({ rows, total, countLabel, empty = "Nothing in this period." }: { rows: Row[]; total: number; countLabel?: string; empty?: string }) {
  if (rows.length === 0) return <p className="text-sm text-mute">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wider text-mute">
          <tr className="border-b border-line">
            <th className="py-2 pr-3 font-medium">Name</th>
            {countLabel && <th className="px-3 py-2 text-right font-medium">{countLabel}</th>}
            <th className="px-3 py-2 text-right font-medium">Amount</th>
            <th className="w-28 py-2 pl-3 font-medium">Share</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => {
            const share = total > 0 ? r.paise / total : 0;
            return (
              <tr key={`${r.label}-${i}`}>
                <td className="max-w-56 truncate py-2.5 pr-3">{r.label}{r.sub && <span className="ml-2 text-xs text-mute">{r.sub}</span>}</td>
                {countLabel && <td className="tnum px-3 py-2.5 text-right text-silver">{r.count ?? ""}</td>}
                <td className="tnum px-3 py-2.5 text-right font-semibold">{rupeesExact(r.paise)}</td>
                <td className="py-2.5 pl-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, share * 100)}%` }} /></div>
                    <span className="tnum w-12 text-right text-xs text-mute">{(share * 100).toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line font-semibold">
            <td className="py-2.5 pr-3">Total</td>
            {countLabel && <td className="tnum px-3 py-2.5 text-right">{rows.reduce((s, r) => s + (r.count ?? 0), 0) || ""}</td>}
            <td className="tnum px-3 py-2.5 text-right">{rupeesExact(total)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const hourLabel = (h: number) => (h === 0 ? "12 am" : h < 12 ? `${h} am` : h === 12 ? "12 pm" : `${h - 12} pm`);

/** Busy hours: weekday rows, hour columns, darker = more sessions started. */
export function Heatmap({ heat, max }: { heat: number[][]; max: number }) {
  const short = (h: number) => hourLabel(h).replace(" ", "");
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[40rem] space-y-1">
        <div className="grid grid-cols-[2.5rem_repeat(24,minmax(0,1fr))] gap-1 text-[10px] text-mute">
          <span />
          {Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center">{h % 3 === 0 ? short(h) : ""}</span>)}
        </div>
        {heat.map((row, d) => (
          <div key={WEEKDAYS[d]} className="grid grid-cols-[2.5rem_repeat(24,minmax(0,1fr))] gap-1">
            <span className="self-center text-xs text-mute">{WEEKDAYS[d]}</span>
            {row.map((n, h) => (
              <span
                key={h}
                title={`${WEEKDAYS[d]} ${hourLabel(h)}: ${n} ${n === 1 ? "session" : "sessions"} started`}
                className="grid h-8 place-items-center rounded-md bg-ink/5 text-[10px] font-semibold text-ink"
                style={n && max ? { background: `color-mix(in oklab, var(--color-brand) ${Math.round(25 + 75 * (n / max))}%, transparent)` } : undefined}
              >
                {n || ""}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
