import Link from "next/link";
import { Coins, ReceiptText, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { requireOwnerPage } from "@/lib/session";
import { buildReport } from "@/lib/db/reports";
import type { Report } from "@/lib/db/reports";
import { RANGE_KEYS, RANGE_LABEL, resolveRange } from "@/lib/reports-range";
import { rupeesExact, rupeesShort } from "@/lib/format";
import { Breakdown, Heatmap, Panel, WEEKDAYS, hourLabel } from "@/components/reports/Charts";
import { Columns, DayChart, Donut, HBars, ShowNumbers, Sparkline, Waterfall, foldSlices } from "@/components/reports/Visuals";
import { PrintButton } from "@/components/reports/PrintButton";
import { LiveFilters } from "@/components/live-filters";
import { cardCls, inputCls, labelCls } from "@/lib/ui";
import { ExpensesTab } from "./ExpensesTab";
import { ReturnsTab } from "./ReturnsTab";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const METHOD = { cash: "Cash", upi: "UPI", card: "Card" } as const;

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "sales", label: "Sales" },
  { id: "daily", label: "Day by day" },
  { id: "hours", label: "Busy hours" },
  { id: "expenses", label: "Expenses" },
  { id: "investments", label: "Investments" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function Kpi({ label, value, hint, icon: Icon, tone = "text-ink", spark }: { label: string; value: string; hint?: string; icon: LucideIcon; tone?: string; spark?: number[] }) {
  const line = tone === "text-over" ? "var(--color-over)" : tone === "text-free" ? "var(--color-free)" : "var(--color-brand)";
  return (
    <div className={`${cardCls} p-5`}>
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-bg text-brand-text"><Icon className="size-5" aria-hidden /></span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-mute">{label}</p>
          <p className={`tnum mt-0.5 truncate font-display text-2xl font-semibold ${tone}`}>{value}</p>
        </div>
      </div>
      {spark && <div className="mt-3"><Sparkline values={spark} tone={line} /></div>}
      {hint && <p className="mt-1.5 text-xs text-mute">{hint}</p>}
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireOwnerPage();
  const p = await searchParams;
  const range = resolveRange(one(p.range), one(p.from), one(p.to));
  const tab: Tab = TABS.find((t) => t.id === one(p.tab))?.id ?? "overview";
  const r = buildReport(range);
  const link = (key: string, t: Tab = tab) =>
    `/reports?range=${key}&tab=${t}${key === "custom" ? `&from=${range.fromDay}&to=${range.toDay}` : ""}`;
  const period = range.fromDay === range.toDay ? range.fromDay : `${range.fromDay} to ${range.toDay}`;

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide">Reports</h1>
          <p className="mt-1 text-sm text-mute">{tab === "investments" ? "Counted from each purchase date until today" : `${range.label}: ${period}`}</p>
        </div>
        <PrintButton />
      </div>
      <h1 className="hidden font-display text-2xl font-bold print:block">Report · {range.label} · {period}</h1>

      {tab !== "investments" && (
      <div className="no-print flex flex-wrap items-end gap-2">
        {RANGE_KEYS.filter((k) => k !== "custom").map((k) => (
          <Link
            key={k}
            href={link(k)}
            aria-current={range.key === k ? "true" : undefined}
            className={`inline-flex rounded-full px-4 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${range.key === k ? "bg-brand text-on-brand" : "bg-panel text-silver hover:bg-raised hover:text-ink"}`}
          >
            {RANGE_LABEL[k]}
          </Link>
        ))}
        <LiveFilters action="/reports" className="flex flex-wrap items-end gap-2" require={["from", "to"]}>
          <input type="hidden" name="range" value="custom" />
          <input type="hidden" name="tab" value={tab} />
          <div>
            <label className={labelCls} htmlFor="rf">From</label>
            <input id="rf" name="from" type="date" required defaultValue={range.fromDay} className={`${inputCls} w-40!`} />
          </div>
          <div>
            <label className={labelCls} htmlFor="rt">Until</label>
            <input id="rt" name="to" type="date" required defaultValue={range.toDay} className={`${inputCls} w-40!`} />
          </div>
        </LiveFilters>
      </div>
      )}

      <nav aria-label="Report sections" className="no-print flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={link(range.key, t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition ${tab === t.id ? "border-brand text-ink" : "border-transparent text-mute hover:text-ink"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {/* All five are in the page so "Print" gives the whole report; on screen only the chosen one shows. */}
      <div data-report-body>
      {([["overview", "Overview", <Overview key="o" r={r} />], ["sales", "Sales", <Sales key="s" r={r} />], ["daily", "Day by day", <Daily key="d" r={r} />], ["hours", "Busy hours", <Hours key="h" r={r} />], ["expenses", "Expenses", <ExpensesTab key="e" r={r} />], ["investments", "Investments", <ReturnsTab key="i" />]] as const).map(([id, title, body], i) => (
        <section key={id} aria-label={title} className={`${tab === id ? "" : "hidden print:block"} ${i > 0 ? "print:break-before-page" : ""}`}>
          <h2 className="mb-4 hidden font-display text-2xl font-bold print:block">{title}</h2>
          {body}
        </section>
      ))}
      </div>
    </div>
  );
}

function Line({ label, value, strong, sign, hint }: { label: string; value: number; strong?: boolean; sign?: "-"; hint?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-2 ${strong ? "border-t border-line font-semibold" : "text-silver"}`}>
      <dt>{label}{hint && <span className="ml-2 text-xs font-normal text-mute">{hint}</span>}</dt>
      <dd className="tnum">{sign === "-" && value > 0 ? "−" : ""}{rupeesExact(value)}</dd>
    </div>
  );
}

function Overview({ r }: { r: Report }) {
  const hasGst = r.taxPaise > 0;
  const steps = [
    { label: "Time", value: r.timePaise, kind: "up" as const },
    { label: "Food", value: r.foodPaise, kind: "up" as const },
    { label: "Sales", value: r.subtotalPaise, kind: "total" as const },
    { label: "Discounts", value: r.discountPaise, kind: "down" as const },
    { label: "Takings", value: r.takingsPaise, kind: "total" as const },
    ...(hasGst ? [{ label: "GST", value: r.taxPaise, kind: "down" as const }] : []),
    { label: "Expenses", value: r.expensesPaise, kind: "down" as const },
    { label: "Net profit", value: r.netPaise, kind: "total" as const },
  ];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Wallet} label="Takings" value={rupeesExact(r.takingsPaise)} spark={r.days.map((d) => d.paise)} hint={`Paid by customers${hasGst ? ", GST included" : ""}`} />
        <Kpi icon={Coins} label="Expenses" value={rupeesExact(r.expensesPaise)} spark={r.days.map((d) => d.expensesPaise)} hint={r.expenses.length ? `${r.expenses.length} ${r.expenses.length === 1 ? "entry" : "entries"}` : "None entered"} />
        <Kpi icon={r.netPaise < 0 ? TrendingDown : TrendingUp} label="Net profit" value={rupeesExact(r.netPaise)} tone={r.netPaise < 0 ? "text-over" : "text-free"} spark={r.days.map((d) => d.netPaise)} hint={`Takings${hasGst ? " − GST" : ""} − expenses`} />
        <Kpi icon={ReceiptText} label="Bills" value={String(r.bills)} spark={r.days.map((d) => d.bills)} hint={r.bills ? `Average ${rupeesExact(r.avgPaise)} per bill` : "No paid bills"} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[3fr_2fr]">
        <Panel title="Takings by day" note="By the day each bill was paid. Hover a column for the exact figure.">
          {r.bills === 0 && r.expensesPaise === 0 ? <p className="text-sm text-mute">No paid bills in this period.</p> : <DayChart days={r.days} />}
        </Panel>
        <Panel title="How it was paid">
          <Donut name="Paid by" center={rupeesShort(r.takingsPaise)} centerLabel="takings" slices={r.byMethod.map((m) => ({ label: METHOD[m.method], value: m.paise }))} />
        </Panel>
      </div>

      <Panel title="From sales to net profit" note="Green adds, red takes away. Every bar is a total of the bills and expenses in this period.">
        <Waterfall steps={steps} />
        <ShowNumbers>
          <dl className="max-w-lg text-sm">
            <Line label="Time on stations" value={r.timePaise} />
            <Line label="Food, drinks and extras" value={r.foodPaise} />
            <Line label="Sales before discounts" value={r.subtotalPaise} strong />
            <Line label="Discounts given" value={r.discountPaise} sign="-" />
            <Line label="Takings" value={r.takingsPaise} strong />
            {hasGst && <Line label="GST included in takings" value={r.taxPaise} sign="-" hint="not your income" />}
            <Line label="Expenses" value={r.expensesPaise} sign="-" />
            <Line label="Net profit" value={r.netPaise} strong />
          </dl>
        </ShowNumbers>
      </Panel>
    </div>
  );
}

function Sales({ r }: { r: Report }) {
  const itemRows = [
    ...r.byItem.map((i) => ({ label: i.name, paise: i.paise, count: i.qty })),
    ...(r.otherItems ? [{ label: `${r.otherItems.kinds} other ${r.otherItems.kinds === 1 ? "item" : "items"}`, paise: r.otherItems.paise, count: r.otherItems.qty }] : []),
  ];
  return (
    <div className="space-y-6">
      <p className="max-w-prose text-sm text-mute">
        These charts show what the bills add up to <b>before discounts</b> ({rupeesExact(r.discountPaise)} were taken off whole bills, not off one zone or item). Hover a shape for the exact amount; the tables at the bottom have every figure and their totals.
      </p>
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Panel title="Time or food?" note="What the bills were made of">
          <Donut name="Sales mix" center={rupeesShort(r.subtotalPaise)} centerLabel="before discounts" slices={[{ label: "Time on stations", value: r.timePaise }, { label: "Food, drinks and extras", value: r.foodPaise }]} />
        </Panel>
        <Panel title="By zone" note="Time charges">
          <Donut name="By zone" center={rupeesShort(r.timePaise)} centerLabel="time charges" slices={foldSlices(r.byZone.map((z) => ({ label: z.name, value: z.paise })))} />
        </Panel>
        <Panel title="By station" note="Time charges, highest first">
          <HBars rows={r.byStation.map((s) => ({ label: s.name, value: s.paise, text: rupeesExact(s.paise), sub: `${s.count} ${s.count === 1 ? "bill" : "bills"}` }))} />
        </Panel>
        <Panel title="Best sellers" note="Food, drinks and extras">
          <HBars empty="No items sold in this period." rows={itemRows.map((i) => ({ label: i.label, value: i.paise, text: rupeesExact(i.paise), sub: `${i.count} sold` }))} />
        </Panel>
        <Panel title="By staff" note="Bills each person took payment for, after discounts" className="xl:col-span-2">
          <Donut name="By staff" center={rupeesShort(r.takingsPaise)} centerLabel="takings" slices={foldSlices(r.byStaff.map((s) => ({ label: s.name, value: s.paise })))} />
        </Panel>
      </div>

      <section className={`${cardCls} px-5 pb-5`}>
        <ShowNumbers label="Show every figure, with totals">
          <div className="grid items-start gap-6 xl:grid-cols-2">
            <div><h3 className="mb-2 text-sm font-semibold">By zone</h3><Breakdown countLabel="Bills" rows={r.byZone.map((z) => ({ label: z.name, paise: z.paise, count: z.count }))} total={r.timePaise} /></div>
            <div><h3 className="mb-2 text-sm font-semibold">By station</h3><Breakdown countLabel="Bills" rows={r.byStation.map((s) => ({ label: s.name, paise: s.paise, count: s.count }))} total={r.timePaise} /></div>
            <div><h3 className="mb-2 text-sm font-semibold">Food, drinks and extras</h3><Breakdown countLabel="Sold" rows={itemRows} total={r.foodPaise} empty="No items sold in this period." /></div>
            <div><h3 className="mb-2 text-sm font-semibold">By staff</h3><Breakdown countLabel="Bills" rows={r.byStaff.map((s) => ({ label: s.name, paise: s.paise, count: s.count }))} total={r.takingsPaise} /></div>
          </div>
        </ShowNumbers>
      </section>
    </div>
  );
}

function Daily({ r }: { r: Report }) {
  const hasGst = r.taxPaise > 0;
  const fmt = (day: string) => new Date(`${day}T00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  const best = r.days.reduce((b, d) => (d.paise > b.paise ? d : b), r.days[0]);
  return (
    <Panel title="Every day" note={r.bills ? `Best day: ${fmt(best.day)}, ${rupeesExact(best.paise)} from ${best.bills} ${best.bills === 1 ? "bill" : "bills"}` : "No paid bills in this period"}>
      <DayChart days={r.days} />
      <ShowNumbers label="Show the table, day by day">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-mute">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-medium">Day</th>
                <th className="px-3 py-2 text-right font-medium">Bills</th>
                <th className="px-3 py-2 text-right font-medium">Takings</th>
                {hasGst && <th className="px-3 py-2 text-right font-medium">GST included</th>}
                <th className="px-3 py-2 text-right font-medium">Expenses</th>
                <th className="py-2 pl-3 text-right font-medium">Net profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.days.map((d) => (
                <tr key={d.day} className={d.bills === 0 && d.expensesPaise === 0 ? "text-mute" : ""}>
                  <td className="py-2 pr-3">{fmt(d.day)}</td>
                  <td className="tnum px-3 py-2 text-right">{d.bills}</td>
                  <td className="tnum px-3 py-2 text-right font-semibold">{rupeesExact(d.paise)}</td>
                  {hasGst && <td className="tnum px-3 py-2 text-right">{rupeesExact(d.taxPaise)}</td>}
                  <td className="tnum px-3 py-2 text-right">{rupeesExact(d.expensesPaise)}</td>
                  <td className={`tnum py-2 pl-3 text-right font-semibold ${d.netPaise < 0 ? "text-over" : ""}`}>{rupeesExact(d.netPaise)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line font-semibold">
                <td className="py-2.5 pr-3">Total</td>
                <td className="tnum px-3 py-2.5 text-right">{r.bills}</td>
                <td className="tnum px-3 py-2.5 text-right">{rupeesExact(r.takingsPaise)}</td>
                {hasGst && <td className="tnum px-3 py-2.5 text-right">{rupeesExact(r.taxPaise)}</td>}
                <td className="tnum px-3 py-2.5 text-right">{rupeesExact(r.expensesPaise)}</td>
                <td className={`tnum py-2.5 pl-3 text-right ${r.netPaise < 0 ? "text-over" : ""}`}>{rupeesExact(r.netPaise)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </ShowNumbers>
    </Panel>
  );
}

const hourShort = (h: number) => `${h % 12 || 12}${h < 12 ? "a" : "p"}`;

function Hours({ r }: { r: Report }) {
  if (r.sessionsStarted === 0) return <p className="rounded-xl border border-dashed border-line p-10 text-center text-mute">No sessions were started in this period.</p>;
  let best = { d: 0, h: 0, n: 0 };
  r.heat.forEach((row, d) => row.forEach((n, h) => { if (n > best.n) best = { d, h, n }; }));
  const perDay = r.heat.map((row, d) => ({ label: WEEKDAYS[d], n: row.reduce((s, n) => s + n, 0) }));
  const perHour = Array.from({ length: 24 }, (_, h) => ({ label: hourShort(h), n: r.heat.reduce((s, row) => s + row[h], 0) }));
  return (
    <div className="space-y-6">
      <Panel title="When sessions start" note={`${r.sessionsStarted} ${r.sessionsStarted === 1 ? "session" : "sessions"} started. Each square is a weekday and an hour; darker is busier and the number is how many started. Busiest: ${WEEKDAYS[best.d]} ${hourLabel(best.h)} (${best.n}).`}>
        <Heatmap heat={r.heat} max={r.heatMax} />
      </Panel>
      <div className="grid items-start gap-4 xl:grid-cols-[2fr_3fr]">
        <Panel title="By weekday" note="Sessions started"><Columns rows={perDay} unit="sessions started" /></Panel>
        <Panel title="By hour of the day" note="Sessions started"><Columns rows={perHour} unit="sessions started" /></Panel>
      </div>
    </div>
  );
}
