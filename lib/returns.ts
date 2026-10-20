import { MAX_DAYS } from "./reports-range.ts";

/** Paise per calendar day, keyed "yyyy-mm-dd" (the lounge's local days). Days with nothing are simply missing. */
export type Daily = Map<string, number>;
export type Projection = { days: number; date: string } | null;

export type Summary = {
  since: string;
  started: boolean; // false while the purchase date is still in the future
  daysSince: number; // days from the purchase date to today, both counted
  investedPaise: number;
  earnedPaise: number; // what the money-making side brought in, before the costs below
  costsPaise: number;
  afterCostsPaise: number; // earned - costs: the figure that is compared with the investment
  recoveredPct: number; // afterCosts / invested, never below 0
  roiPct: number; // (afterCosts - invested) / invested: negative until the investment has paid back
  remainingPaise: number; // still to earn back; 0 once paid back
  paybackDate: string | null; // the day the running total first reached the investment
  overallPerDayPaise: number; // afterCosts / daysSince
  recentPerDayPaise: number; // afterCosts over the last `recentDays` days, per day
  recentDays: number;
  fromRecent: Projection; // when it pays back if the last 30 days carry on
  fromOverall: Projection; // ... if the whole time since purchase carries on
  series: { day: string; cumulativePaise: number }[]; // running total of afterCosts, one point a day
  months: { month: string; earnedPaise: number; costsPaise: number }[];
};

export const RECENT_DAYS = 30;

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

/** Every day from `from` to `to`, both included. Empty when `from` is after `to`. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < MAX_DAYS; d = addDays(d, 1)) out.push(d); // yyyy-mm-dd sorts as dates do
  return out;
}

const project = (remaining: number, total: number, days: number, today: string): Projection =>
  remaining <= 0 || total <= 0 ? null : (() => {
    const n = Math.ceil((remaining * days) / total); // whole days at that pace
    return { days: n, date: addDays(today, n) };
  })();

/**
 * Where an investment stands: what it has earned since it was bought, what is still to earn back, the day it paid back (if it has),
 * and when it will if the recent pace (or the overall pace) continues. All money is whole paise; nothing is rounded except per-day averages.
 */
export function summarize(o: { investedPaise: number; since: string; today: string; earned: Daily; costs: Daily }): Summary {
  const days = daysBetween(o.since, o.today);
  const started = days.length > 0;
  let cum = 0;
  let paybackDate: string | null = null;
  const series = days.map((day) => {
    cum += (o.earned.get(day) ?? 0) - (o.costs.get(day) ?? 0);
    if (paybackDate === null && cum >= o.investedPaise) paybackDate = day;
    return { day, cumulativePaise: cum };
  });
  const earnedPaise = days.reduce((s, d) => s + (o.earned.get(d) ?? 0), 0);
  const costsPaise = days.reduce((s, d) => s + (o.costs.get(d) ?? 0), 0);
  const afterCostsPaise = earnedPaise - costsPaise;

  const recent = days.slice(-RECENT_DAYS);
  const recentTotal = recent.reduce((s, d) => s + (o.earned.get(d) ?? 0) - (o.costs.get(d) ?? 0), 0);
  const remainingPaise = Math.max(0, o.investedPaise - afterCostsPaise);

  const months = new Map<string, { earnedPaise: number; costsPaise: number }>();
  for (const d of days) {
    const m = months.get(d.slice(0, 7)) ?? { earnedPaise: 0, costsPaise: 0 };
    m.earnedPaise += o.earned.get(d) ?? 0;
    m.costsPaise += o.costs.get(d) ?? 0;
    months.set(d.slice(0, 7), m);
  }

  return {
    since: o.since,
    started,
    daysSince: days.length,
    investedPaise: o.investedPaise,
    earnedPaise,
    costsPaise,
    afterCostsPaise,
    recoveredPct: o.investedPaise > 0 ? Math.max(0, (afterCostsPaise * 100) / o.investedPaise) : 0, // multiply first: whole numbers divide cleanly
    roiPct: o.investedPaise > 0 ? ((afterCostsPaise - o.investedPaise) * 100) / o.investedPaise : 0,
    remainingPaise,
    paybackDate,
    overallPerDayPaise: days.length ? Math.round(afterCostsPaise / days.length) : 0,
    recentPerDayPaise: recent.length ? Math.round(recentTotal / recent.length) : 0,
    recentDays: recent.length,
    fromRecent: project(remainingPaise, recentTotal, recent.length, o.today),
    fromOverall: project(remainingPaise, afterCostsPaise, days.length, o.today),
    series,
    months: [...months].map(([month, v]) => ({ month, ...v })),
  };
}

/** 12 -> "12 days", 120 -> "about 4 months", 900 -> "about 2.5 years": for a payback estimate, where precision would be false. */
export function describeSpan(days: number): string {
  if (days < 45) return `${days} ${days === 1 ? "day" : "days"}`;
  const months = days / 30.44;
  if (months < 24) return `about ${Math.round(months)} months`;
  return `about ${(Math.round((months / 12) * 2) / 2).toString()} years`;
}
