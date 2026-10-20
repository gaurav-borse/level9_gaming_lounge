import type { ReactNode } from "react";
import { rupeesExact, rupeesShort } from "@/lib/format";
import type { DayRow } from "@/lib/db/reports";

// Plain SVG and CSS, drawn on the server: no chart library. Amounts in labels are rounded (rupeesShort); every shape also carries the exact figure in its tooltip.

export const PALETTE = ["var(--color-brand)", "#f59e0b", "#38bdf8", "#a78bfa", "#fb7185", "#34d399", "#94a3b8"];
const OVER = "var(--color-over)";
const FREE = "var(--color-free)";

/** The slices of a donut: biggest first, at most `keep` of them, the rest folded into "Other" so nothing is dropped from the total. */
export function foldSlices<T extends { label: string; value: number }>(rows: T[], keep = 6): { label: string; value: number }[] {
  const sorted = [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= keep) return sorted.map(({ label, value }) => ({ label, value }));
  const head = sorted.slice(0, keep - 1).map(({ label, value }) => ({ label, value }));
  return [...head, { label: "Other", value: sorted.slice(keep - 1).reduce((s, r) => s + r.value, 0) }];
}

export type Slice = { label: string; value: number; text?: string };

/** A ring split into parts, with a legend (name, amount, share). `center` is the big number inside. */
export function Donut({ slices, center, centerLabel, format = (v) => rupeesExact(v), name }: {
  slices: Slice[];
  center: string;
  centerLabel: string;
  format?: (value: number) => string;
  name: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return <p className="text-sm text-mute">Nothing in this period.</p>;
  const R = 46;
  const C = 2 * Math.PI * R;
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
      <svg viewBox="0 0 120 120" className="size-40 shrink-0" role="img" aria-label={`${name}: ${slices.map((s) => `${s.label} ${format(s.value)}`).join(", ")}`}>
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--color-ink)" strokeOpacity="0.08" strokeWidth="14" />
        {slices.map((s, i) => {
          const used = (slices.slice(0, i).reduce((sum, x) => sum + x.value, 0) / total) * C;
          const len = (s.value / total) * C;
          const gap = slices.length > 1 ? Math.min(1.2, len / 2) : 0;
          return (
            <circle
              key={s.label}
              cx="60" cy="60" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="14"
              strokeDasharray={`${Math.max(0, len - gap)} ${C - Math.max(0, len - gap)}`} strokeDashoffset={-used}
              transform="rotate(-90 60 60)"
            >
              <title>{`${s.label}: ${format(s.value)} (${((s.value / total) * 100).toFixed(1)}%)`}</title>
            </circle>
          );
        })}
        <text x="60" y="58" textAnchor="middle" className="fill-ink font-display" fontSize="13" fontWeight="600">{center}</text>
        <text x="60" y="73" textAnchor="middle" className="fill-mute" fontSize="7.5">{centerLabel}</text>
      </svg>
      <ul className="min-w-44 flex-1 space-y-2 text-sm">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2.5">
            <span className="size-3 shrink-0 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            <span className="tnum font-semibold">{s.text ?? format(s.value)}</span>
            <span className="tnum w-12 text-right text-xs text-mute">{((s.value / total) * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A tiny trend line for a KPI card. Flat when there is nothing to compare. */
export function Sparkline({ values, tone = "var(--color-brand)" }: { values: number[]; tone?: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, max === min ? 16 : 28 - ((v - min) / (max - min)) * 24] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <polygon points={`0,32 ${line} 100,32`} fill={tone} fillOpacity="0.12" />
      <polyline points={line} fill="none" stroke={tone} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** 1 / 2 / 5 x 10^k at or above `v`: a tidy top for an axis. */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

const fmtDay = (day: string) => new Date(`${day}T00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** Takings (and expenses) for every day: columns on a labelled scale. */
export function DayChart({ days, withExpenses = true }: { days: DayRow[]; withExpenses?: boolean }) {
  const W = 800;
  const H = 250;
  const L = 62;
  const B = 30;
  const T = 10;
  const top = niceMax(Math.max(0, ...days.flatMap((d) => [d.paise, withExpenses ? d.expensesPaise : 0])));
  const plotW = W - L - 8;
  const plotH = H - B - T;
  const slot = plotW / Math.max(1, days.length);
  const both = withExpenses && days.some((d) => d.expensesPaise > 0);
  const bw = Math.max(1, (slot * 0.74) / (both ? 2 : 1));
  const y = (v: number) => T + plotH - (v / top) * plotH;
  const every = Math.max(1, Math.ceil(days.length / 8));
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Takings${both ? " and expenses" : ""} for each of ${days.length} days`}>
        {[0, 1, 2, 3, 4].map((i) => {
          const v = (top / 4) * i;
          return (
            <g key={i}>
              <line x1={L} x2={W - 8} y1={y(v)} y2={y(v)} stroke="var(--color-ink)" strokeOpacity={i === 0 ? 0.3 : 0.1} />
              <text x={L - 8} y={y(v) + 4} textAnchor="end" className="fill-mute" fontSize="14">{rupeesShort(v)}</text>
            </g>
          );
        })}
        {days.map((d, i) => {
          const x = L + i * slot + (slot - bw * (both ? 2 : 1)) / 2;
          return (
            <g key={d.day}>
              <rect x={x} y={y(d.paise)} width={bw} height={Math.max(0, d.paise ? plotH + T - y(d.paise) : 0)} rx={Math.min(3, bw / 2)} fill="var(--color-brand)">
                <title>{`${fmtDay(d.day)}: takings ${rupeesExact(d.paise)} from ${d.bills} ${d.bills === 1 ? "bill" : "bills"}${d.expensesPaise ? `, expenses ${rupeesExact(d.expensesPaise)}` : ""}`}</title>
              </rect>
              {both && d.expensesPaise > 0 && (
                <rect x={x + bw} y={y(d.expensesPaise)} width={bw} height={plotH + T - y(d.expensesPaise)} rx={Math.min(3, bw / 2)} fill="#f59e0b">
                  <title>{`${fmtDay(d.day)}: expenses ${rupeesExact(d.expensesPaise)}`}</title>
                </rect>
              )}
              {i % every === 0 && <text x={L + i * slot + slot / 2} y={H - 8} textAnchor="middle" className="fill-mute" fontSize="14">{fmtDay(d.day)}</text>}
            </g>
          );
        })}
      </svg>
      {both && (
        <figcaption className="mt-1 flex gap-4 text-xs text-mute">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand" aria-hidden />Takings</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: "#f59e0b" }} aria-hidden />Expenses</span>
        </figcaption>
      )}
    </figure>
  );
}

export type Step = { label: string; value: number; kind: "total" | "up" | "down" };

/** From the lines of the bills to net profit: each bar starts where the last one stopped (green adds, red takes away, solid ones are totals). */
export function Waterfall({ steps }: { steps: Step[] }) {
  const W = 760;
  const H = 250;
  const T = 26;
  const B = 36;
  const bars = steps.reduce<(Step & { start: number; end: number })[]>((acc, s) => {
    const run = acc.length ? acc[acc.length - 1].end : 0;
    const start = s.kind === "total" ? 0 : run;
    const end = s.kind === "total" ? s.value : s.kind === "up" ? run + s.value : run - s.value;
    return [...acc, { ...s, start, end }];
  }, []);
  const lo = Math.min(0, ...bars.flatMap((b) => [b.start, b.end]));
  const hi = Math.max(1, ...bars.flatMap((b) => [b.start, b.end]));
  const plotH = H - T - B;
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * plotH;
  const slot = W / bars.length;
  const bw = slot * 0.6;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`From sales to net profit: ${bars.map((b) => `${b.label} ${rupeesExact(b.kind === "down" ? -b.value : b.value)}`).join(", ")}`}>
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--color-ink)" strokeOpacity="0.3" />
      {bars.map((b, i) => {
        const x = i * slot + (slot - bw) / 2;
        const yTop = y(Math.max(b.start, b.end));
        const h = Math.max(2, Math.abs(y(b.start) - y(b.end)));
        const fill = b.kind === "total" ? (b.end < 0 ? OVER : "var(--color-brand)") : b.kind === "up" ? FREE : OVER;
        const next = bars[i + 1];
        return (
          <g key={b.label}>
            {next && <line x1={x + bw} x2={x + slot} y1={y(b.end)} y2={y(b.end)} stroke="var(--color-ink)" strokeOpacity="0.25" strokeDasharray="3 3" />}
            <rect x={x} y={yTop} width={bw} height={h} rx="4" fill={fill}>
              <title>{`${b.label}: ${b.kind === "down" ? "−" : ""}${rupeesExact(b.value)}`}</title>
            </rect>
            <text x={x + bw / 2} y={yTop - 6} textAnchor="middle" className="fill-ink" fontSize="12" fontWeight="600">{b.kind === "down" && b.value > 0 ? "−" : ""}{rupeesShort(b.value)}</text>
            <text x={x + bw / 2} y={H - 14} textAnchor="middle" className="fill-mute" fontSize="12">{b.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Horizontal bars with a value on each row (stations, items, staff). */
export function HBars({ rows, empty = "Nothing in this period." }: { rows: { label: string; value: number; text: string; sub?: string }[]; empty?: string }) {
  if (rows.length === 0) return <p className="text-sm text-mute">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`} title={`${r.label}: ${r.text}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{r.label}{r.sub && <span className="ml-2 text-xs text-mute">{r.sub}</span>}</span>
            <span className="tnum shrink-0 font-semibold">{r.text}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

/** Vertical columns for a handful of counts (sessions per weekday or per hour). */
export function Columns({ rows, unit }: { rows: { label: string; n: number }[]; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="flex h-44 items-end gap-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${r.label}: ${r.n} ${unit}`}>
          <span className="tnum text-[11px] font-semibold text-silver">{r.n || ""}</span>
          <div className="w-full max-w-9 rounded-t-md bg-brand" style={{ height: `${r.n ? Math.max(3, (r.n / max) * 78) : 0}%` }} />
          <span className="w-full truncate text-center text-[10px] text-mute">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Numbers behind a chart, tucked away until asked for. The details element works without JavaScript. */
export function ShowNumbers({ children, label = "Show the exact numbers", open = false }: { children: ReactNode; label?: string; open?: boolean }) {
  return (
    <details open={open} className="group mt-4 border-t border-line pt-3">
      <summary className="cursor-pointer text-sm font-medium text-mute hover:text-ink">{label}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/** A progress ring: how much of something is done (0 to 100; more than 100 shows as full). */
export function Ring({ pct, label, tone = "var(--color-brand)" }: { pct: number; label: string; tone?: string }) {
  const R = 44;
  const C = 2 * Math.PI * R;
  const shown = Math.min(100, Math.max(0, pct));
  return (
    <svg viewBox="0 0 120 120" className="size-32 shrink-0" role="img" aria-label={`${label}: ${pct.toFixed(1)}%`}>
      <circle cx="60" cy="60" r={R} fill="none" stroke="var(--color-ink)" strokeOpacity="0.1" strokeWidth="12" />
      <circle cx="60" cy="60" r={R} fill="none" stroke={tone} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(shown / 100) * C} ${C}`} transform="rotate(-90 60 60)" />
      <text x="60" y="62" textAnchor="middle" className="fill-ink font-display" fontSize="20" fontWeight="700">{pct >= 100 ? "100%" : `${pct.toFixed(pct < 10 ? 1 : 0)}%`}</text>
      <text x="60" y="79" textAnchor="middle" className="fill-mute" fontSize="8.5">{label}</text>
    </svg>
  );
}

/** The running total of earnings against the amount invested: the line crossing the dashed one is the day it paid back. */
export function LineChart({ series, target, targetLabel, paybackIndex }: { series: { day: string; cumulativePaise: number }[]; target: number; targetLabel: string; paybackIndex: number | null }) {
  if (series.length === 0) return <p className="text-sm text-mute">Nothing to draw yet: the purchase date is still ahead.</p>;
  const W = 800;
  const H = 250;
  const L = 62;
  const R = 14;
  const T = 14;
  const B = 30;
  const values = series.map((p) => p.cumulativePaise);
  const hi = niceMax(Math.max(target, ...values));
  const low = Math.min(0, ...values);
  const lo = low < 0 ? -niceMax(-low) : 0;
  const plotW = W - L - R;
  const plotH = H - T - B;
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * plotH;
  const x = (i: number) => L + (series.length === 1 ? plotW / 2 : (i / (series.length - 1)) * plotW);
  const line = series.map((p, i) => `${x(i).toFixed(1)},${y(p.cumulativePaise).toFixed(1)}`).join(" ");
  const ticks = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) / 4) * i);
  const xs = [...new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Running total of earnings after costs, ${rupeesExact(values[values.length - 1])} so far, against ${rupeesExact(target)} invested`}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--color-ink)" strokeOpacity={v === 0 ? 0.3 : 0.1} />
          <text x={L - 8} y={y(v) + 4} textAnchor="end" className="fill-mute" fontSize="14">{rupeesShort(v)}</text>
        </g>
      ))}
      <line x1={L} x2={W - R} y1={y(target)} y2={y(target)} stroke="#f59e0b" strokeWidth="2" strokeDasharray="6 5" />
      <text x={W - R} y={y(target) - 6} textAnchor="end" fontSize="13" fill="#f59e0b" fontWeight="600">{targetLabel}</text>
      {series.length > 1 ? <polyline points={line} fill="none" stroke="var(--color-brand)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /> : null}
      {series.length === 1 && <circle cx={x(0)} cy={y(values[0])} r="4" fill="var(--color-brand)" />}
      {paybackIndex !== null && (
        <g>
          <circle cx={x(paybackIndex)} cy={y(series[paybackIndex].cumulativePaise)} r="6" fill="var(--color-free)" stroke="var(--color-panel)" strokeWidth="2">
            <title>{`Paid back on ${fmtDay(series[paybackIndex].day)}`}</title>
          </circle>
        </g>
      )}
      {xs.map((i) => <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"} className="fill-mute" fontSize="14">{fmtDay(series[i].day)}</text>)}
    </svg>
  );
}
