import { Landmark } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { DialogButton } from "@/components/dialog-button";
import { DeleteButton } from "@/components/menu/DeleteButton";
import { Panel } from "@/components/reports/Charts";
import { LineChart, Ring, ShowNumbers } from "@/components/reports/Visuals";
import { listStations, listZones } from "@/lib/db/catalog";
import { buildReturns, listInvestments } from "@/lib/db/investments";
import type { Investment, ReturnCard } from "@/lib/db/investments";
import { describeSpan } from "@/lib/returns";
import type { Projection, Summary } from "@/lib/returns";
import { rupeesExact, rupeesShort } from "@/lib/format";
import { btnPrimaryCls, cardCls, inputCls, labelCls } from "@/lib/ui";
import { deleteInvestmentAction, saveInvestmentAction } from "./actions";

const nice = (day: string) => new Date(`${day}T00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const pct = (n: number) => `${n.toFixed(1)}%`;
const hours = (ms: number) => (ms / 3_600_000).toFixed(1);

function InvestmentForm({ inv, stations }: { inv?: Investment; stations: { id: number; label: string }[] }) {
  const k = inv?.id ?? "new";
  const today = new Date().toLocaleDateString("en-CA"); // yyyy-mm-dd, the lounge's own date
  return (
    <ActionForm action={saveInvestmentAction} success={inv ? "Investment saved" : "Investment added"} resetOnSuccess={!inv} className="flex flex-col gap-4">
      {inv && <input type="hidden" name="id" value={inv.id} />}
      <div>
        <label className={labelCls} htmlFor={`in-${k}`}>What did you buy?</label>
        <input id={`in-${k}`} name="name" required maxLength={80} defaultValue={inv?.name ?? ""} placeholder="e.g. Pool table 1" className={inputCls} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor={`ia-${k}`}>Amount spent (₹)</label>
          <input id={`ia-${k}`} name="amount" required inputMode="decimal" defaultValue={inv ? String(inv.amountPaise / 100) : ""} placeholder="e.g. 150000" className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor={`id-${k}`}>Bought on</label>
          <input id={`id-${k}`} name="boughtOn" type="date" required defaultValue={inv?.boughtOn ?? today} className={inputCls} />
        </div>
      </div>
      <div>
        <label className={labelCls} htmlFor={`is-${k}`}>Which station does it earn from?</label>
        <select id={`is-${k}`} name="station" defaultValue={inv?.stationId ?? ""} className={inputCls}>
          <option value="">The whole lounge (interiors, furniture, AC…)</option>
          {stations.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls} htmlFor={`in2-${k}`}>Note (optional)</label>
        <input id={`in2-${k}`} name="note" maxLength={200} defaultValue={inv?.note ?? ""} placeholder="e.g. bought from…, includes cues and cloth" className={inputCls} />
      </div>
      <button className={`${btnPrimaryCls} w-fit`}>{inv ? "Save changes" : "Add investment"}</button>
    </ActionForm>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-mute">{label}</dt>
      <dd className={`tnum mt-0.5 whitespace-nowrap text-lg font-semibold ${tone ?? ""}`}>{value}</dd>
      {hint && <p className="text-[11px] text-mute">{hint}</p>}
    </div>
  );
}

const when = (p: Projection) => (p ? `${describeSpan(p.days)} (around ${nice(p.date)})` : null);

/** The payback estimate in words: already paid back, an estimate from the last 30 days and from the whole time, or why there is none. */
function Payback({ s }: { s: Summary }) {
  if (!s.started) return <p className="text-sm text-mute">Not started: the purchase date is still ahead.</p>;
  if (s.remainingPaise === 0 && s.paybackDate) {
    return <p className="text-sm"><b className="text-free">Paid back</b> on {nice(s.paybackDate)}. Everything since then is profit.</p>;
  }
  const recent = when(s.fromRecent);
  const overall = when(s.fromOverall);
  if (!recent && !overall) return <p className="text-sm text-mute">Not enough earnings yet to estimate a payback date.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {recent && <li><b>{recent}</b> <span className="text-mute">if the last {s.recentDays} days carry on</span></li>}
      {overall && <li><b>{overall}</b> <span className="text-mute">if the pace since {nice(s.since)} carries on</span></li>}
    </ul>
  );
}

function Numbers({ s }: { s: Summary }) {
  const ahead = s.afterCostsPaise - s.investedPaise;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
      <Stat label="Invested" value={rupeesExact(s.investedPaise)} />
      <Stat label="Earned" value={rupeesExact(s.earnedPaise)} hint="after discounts, without GST" />
      <Stat label="Costs" value={`−${rupeesExact(s.costsPaise)}`} />
      <Stat label="Earned after costs" value={rupeesExact(s.afterCostsPaise)} tone={s.afterCostsPaise < 0 ? "text-over" : ""} />
      <Stat label={s.remainingPaise > 0 ? "Still to earn back" : "Ahead by"} value={rupeesExact(s.remainingPaise > 0 ? s.remainingPaise : ahead)} tone={s.remainingPaise > 0 ? "" : "text-free"} />
      <Stat label="Return on investment" value={pct(s.roiPct)} tone={s.roiPct < 0 ? "text-over" : "text-free"} hint="negative until paid back" />
    </dl>
  );
}

function Pace({ s }: { s: Summary }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
      <Stat label={`Per day since ${nice(s.since)}`} value={rupeesExact(s.overallPerDayPaise)} hint={`${s.daysSince} ${s.daysSince === 1 ? "day" : "days"}, after costs`} />
      <Stat label={`Per day, last ${s.recentDays} ${s.recentDays === 1 ? "day" : "days"}`} value={rupeesExact(s.recentPerDayPaise)} hint="after costs" />
    </dl>
  );
}

function MonthTable({ s }: { s: Summary }) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-xs uppercase tracking-wider text-mute">
        <tr className="border-b border-line">
          <th className="py-2 pr-3 font-medium">Month</th><th className="px-3 py-2 text-right font-medium">Earned</th>
          <th className="px-3 py-2 text-right font-medium">Costs</th><th className="py-2 pl-3 text-right font-medium">After costs</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {s.months.map((m) => (
          <tr key={m.month}>
            <td className="py-2 pr-3">{new Date(`${m.month}-01T00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</td>
            <td className="tnum px-3 py-2 text-right">{rupeesExact(m.earnedPaise)}</td>
            <td className="tnum px-3 py-2 text-right">{rupeesExact(m.costsPaise)}</td>
            <td className="tnum py-2 pl-3 text-right font-semibold">{rupeesExact(m.earnedPaise - m.costsPaise)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-line font-semibold">
          <td className="py-2.5 pr-3">Total</td>
          <td className="tnum px-3 py-2.5 text-right">{rupeesExact(s.earnedPaise)}</td>
          <td className="tnum px-3 py-2.5 text-right">{rupeesExact(s.costsPaise)}</td>
          <td className="tnum py-2.5 pl-3 text-right">{rupeesExact(s.afterCostsPaise)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function Card({ c }: { c: ReturnCard }) {
  const paid = c.remainingPaise === 0 && c.paybackDate !== null;
  const idx = c.paybackDate ? c.series.findIndex((p) => p.day === c.paybackDate) : -1;
  return (
    <section className={`${cardCls} space-y-5 p-5 sm:p-6`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold">{c.title}</h2>
          <p className="mt-0.5 max-w-md text-xs text-mute">{c.subtitle}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${!c.started ? "bg-raised text-mute" : paid ? "bg-free/15 text-free" : "bg-brand/15 text-brand-text"}`}>
          {!c.started ? "Not started" : paid ? "Paid back" : "Earning it back"}
        </span>
      </header>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <Ring pct={c.recoveredPct} label="recovered" tone={paid ? "var(--color-free)" : "var(--color-brand)"} />
        <div className="min-w-64 flex-1 space-y-4"><Numbers s={c} /></div>
      </div>

      <div className="grid gap-5 border-t border-line pt-5 md:grid-cols-2">
        <div className="space-y-3">
          <h3 className={labelCls}>Payback</h3>
          <Payback s={c} />
          <p className="text-[11px] text-mute">Estimates only: quiet and busy weeks move them.</p>
        </div>
        <div className="space-y-3">
          <h3 className={labelCls}>Pace</h3>
          <Pace s={c} />
        </div>
      </div>

      <div className="space-y-2 border-t border-line pt-5">
        <h3 className={labelCls}>Earnings after costs, building up to the amount invested</h3>
        <LineChart series={c.series} target={c.investedPaise} targetLabel={`Invested ${rupeesShort(c.investedPaise)}`} paybackIndex={idx >= 0 ? idx : null} />
      </div>

      <dl className="grid grid-cols-3 gap-4 border-t border-line pt-5">
        <Stat label="Sessions paid" value={String(c.sessions)} />
        <Stat label="Hours played" value={hours(c.playedMs)} />
        <Stat label="Earned per hour played" value={c.playedMs > 0 ? rupeesExact(Math.round((c.earnedPaise * 3_600_000) / c.playedMs)) : "—"} hint={c.stationId === null ? "all earnings" : "time charges"} />
      </dl>

      <ShowNumbers label="Show the month-by-month numbers and what is counted">
        <div className="space-y-4">
          <MonthTable s={c} />
          <ul className="space-y-1 text-sm text-silver">
            {c.investments.map((i) => <li key={i.id}>{i.name}: {rupeesExact(i.amountPaise)}, bought {nice(i.boughtOn)}{i.note ? ` · ${i.note}` : ""}</li>)}
          </ul>
          <p className="text-xs text-mute">Earnings are counted from {nice(c.since)}{c.investments.length > 1 ? " (the earliest purchase here)" : ""}.</p>
        </div>
      </ShowNumbers>
    </section>
  );
}

/** Investments: what you spent on equipment and how much of it each station has earned back. Owner only. */
export function ReturnsTab() {
  const { cards, portfolio } = buildReturns();
  const investments = listInvestments();
  const zones = new Map(listZones().map((z) => [z.id, z.name]));
  const stations = listStations().map((s) => ({ id: s.id, label: `${s.name} (${zones.get(s.zoneId) ?? ""})` }));

  const add = (
    <div className="no-print flex justify-end">
      <DialogButton label="Add investment" title="Add an investment"><InvestmentForm stations={stations} /></DialogButton>
    </div>
  );

  if (!portfolio) {
    return (
      <div className="space-y-6">
        {add}
        <div className={`${cardCls} flex flex-col items-center gap-3 p-10 text-center`}>
          <span className="grid size-14 place-items-center rounded-2xl bg-bg text-brand-text"><Landmark className="size-7" aria-hidden /></span>
          <h2 className="font-display text-xl font-semibold">Track what your equipment earns back</h2>
          <p className="max-w-lg text-sm text-mute">
            Add what you bought, like a pool table for ₹1,50,000, and pick the station it earns from. This page then shows how much of it has been earned back, how long payback is likely to take, and how each station is doing.
          </p>
        </div>
      </div>
    );
  }

  const p = portfolio;
  const ahead = p.afterCostsPaise - p.investedPaise;
  return (
    <div className="space-y-6">
      {add}

      <Panel title="All investments together" note={`${p.count} ${p.count === 1 ? "investment" : "investments"}. Compared with the lounge's net profit since ${nice(p.since)}: takings, without GST, minus all expenses.`}>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
          <Ring pct={p.recoveredPct} label="recovered" tone={p.remainingPaise === 0 ? "var(--color-free)" : "var(--color-brand)"} />
          <div className="min-w-72 flex-1 space-y-5">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <Stat label="Total invested" value={rupeesExact(p.investedPaise)} />
              <Stat label="Net profit so far" value={rupeesExact(p.afterCostsPaise)} tone={p.afterCostsPaise < 0 ? "text-over" : ""} />
              <Stat label={p.remainingPaise > 0 ? "Still to earn back" : "Ahead by"} value={rupeesExact(p.remainingPaise > 0 ? p.remainingPaise : ahead)} tone={p.remainingPaise > 0 ? "" : "text-free"} />
              <Stat label="Return on investment" value={pct(p.roiPct)} tone={p.roiPct < 0 ? "text-over" : "text-free"} />
            </dl>
            <Payback s={p} />
          </div>
        </div>
        <ShowNumbers label="Show the month-by-month numbers"><MonthTable s={p} /></ShowNumbers>
      </Panel>

      <div className="grid items-start gap-6 xl:grid-cols-2">{cards.map((c) => <Card key={c.key} c={c} />)}</div>

      <section className={`${cardCls} overflow-x-auto`}>
        <h2 className="px-5 pt-5 font-display text-lg font-semibold">Your investments</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-mute">
            <tr className="border-y border-line">
              <th className="px-5 py-3 font-medium">What</th><th className="px-4 py-3 font-medium">Earns from</th><th className="px-4 py-3 font-medium">Bought</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th><th className="no-print px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {investments.map((i) => (
              <tr key={i.id}>
                <td className="px-5 py-3 font-semibold">{i.name}{i.note && <span className="block text-xs font-normal text-mute">{i.note}</span>}</td>
                <td className="px-4 py-3 text-silver">{i.stationName ?? "Whole lounge"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-silver">{nice(i.boughtOn)}</td>
                <td className="tnum px-4 py-3 text-right font-semibold">{rupeesExact(i.amountPaise)}</td>
                <td className="no-print px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <DialogButton edit label="Edit" title={`Edit ${i.name}`}><InvestmentForm inv={i} stations={stations} /></DialogButton>
                    <ActionForm action={deleteInvestmentAction} success="Investment removed">
                      <input type="hidden" name="id" value={i.id} />
                      <DeleteButton icon label={`Remove ${i.name}`} confirmText={`Remove "${i.name}" (${rupeesExact(i.amountPaise)})? Its bills and expenses are not affected.`} />
                    </ActionForm>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line font-semibold">
              <td className="px-5 py-3" colSpan={3}>Total</td>
              <td className="tnum px-4 py-3 text-right">{rupeesExact(p.investedPaise)}</td><td className="no-print" />
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}
