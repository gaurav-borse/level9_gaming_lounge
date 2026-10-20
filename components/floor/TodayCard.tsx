import Link from "next/link";
import type { TodaySummary } from "@/lib/db/bills";
import { radarPoint } from "@/lib/floor-view";
import { rupees } from "@/lib/format";

const CX = 100;
const CY = 100;
const RADIUS = 80;

const corner = (i: number, n: number, f: number) => radarPoint(i, n, f, RADIUS, CX, CY);
const ring = (n: number, f: number) => Array.from({ length: n }, (_, i) => corner(i, n, f).map((v) => v.toFixed(1)).join(",")).join(" ");
const METHOD = { cash: "Cash", upi: "UPI", card: "Card" } as const;

/** Takings today plus how busy each zone is right now (radar for three or more zones, plain bars otherwise). */
export function TodayCard({ today, usage }: { today: TodaySummary; usage: { name: string; value: number }[] }) {
  const n = usage.length;
  const split = (["cash", "upi", "card"] as const).filter((m) => today.byMethod[m] > 0).map((m) => `${METHOD[m]} ${rupees(today.byMethod[m])}`);
  const summary = usage.map((u) => `${u.name} ${Math.round(u.value * 100)}%`).join(", ");

  return (
    <section aria-labelledby="today-title" className="grid items-center gap-4 rounded-4xl border border-line bg-panel p-5 sm:grid-cols-[1fr_auto] sm:gap-x-8 sm:p-6">
      <div>
        <p className="text-sm font-medium text-mute">Today</p>
        <h2 id="today-title" className="tnum font-display text-3xl font-semibold">{rupees(today.totalPaise)}</h2>
        <p className="mt-1 text-sm text-mute">
          {today.bills === 0 ? "No bills yet today" : `${today.bills} ${today.bills === 1 ? "bill" : "bills"} · ${split.join(" · ")}`}
        </p>
      </div>

      {n > 0 && (
        <figure className="sm:col-start-2 sm:row-span-2 sm:row-start-1">
          {n >= 3 ? (
            <svg viewBox="-100 -10 400 220" className="mx-auto w-full max-w-60" role="img" aria-label={`Zone usage now: ${summary}`}>
              <g fill="none" stroke="var(--color-line)">
                {[1 / 3, 2 / 3, 1].map((f) => <polygon key={f} points={ring(n, f)} />)}
                {usage.map((u, i) => <line key={i} x1={CX} y1={CY} x2={corner(i, n, 1)[0]} y2={corner(i, n, 1)[1]} />)}
              </g>
              <polygon points={usage.map((u, i) => corner(i, n, Math.max(0.04, u.value)).map((v) => v.toFixed(1)).join(",")).join(" ")} fill="var(--color-brand)" fillOpacity=".25" stroke="var(--color-brand)" strokeWidth="2" strokeLinejoin="round" />
              <g fill="var(--color-silver)" fontSize="17">
                {usage.map((u, i) => {
                  const [x, y] = corner(i, n, 1.2);
                  return <text key={i} x={x} y={y + 4} textAnchor={x < CX - 6 ? "end" : x > CX + 6 ? "start" : "middle"}>{u.name}</text>;
                })}
              </g>
            </svg>
          ) : (
            <ul className="mx-auto w-full max-w-60 space-y-3" aria-label={`Zone usage now: ${summary}`}>
              {usage.map((u) => (
                <li key={u.name + usage.indexOf(u)}>
                  <div className="mb-1 flex justify-between text-xs"><span>{u.name}</span><span className="tnum">{Math.round(u.value * 100)}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-brand" style={{ width: `${u.value * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
          <figcaption className="mt-1 text-center text-xs text-mute">Zone usage now</figcaption>
        </figure>
      )}

      <Link href="/bills" className="mx-auto inline-flex h-11 items-center gap-2 rounded-full bg-raised px-6 text-sm font-semibold text-ink transition hover:bg-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:mx-0 sm:self-start sm:justify-self-start">
        See bills
      </Link>
    </section>
  );
}
