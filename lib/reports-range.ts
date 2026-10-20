import { dayStart } from "./bills-filter.ts";

/** "2026-10-07" for the lounge's local calendar day of a moment. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The longest period a report covers (10 years). Every day of it is a table row, so it has to stop somewhere. */
export const MAX_DAYS = 3660;

export const RANGE_KEYS = ["today", "yesterday", "week", "month", "lastmonth", "custom"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];
export const RANGE_LABEL: Record<RangeKey, string> = {
  today: "Today", yesterday: "Yesterday", week: "This week", month: "This month", lastmonth: "Last month", custom: "Pick dates",
};

/** `from` is the first moment included, `to` the first moment after the period. `fromDay` / `toDay` are the first and last calendar days, inclusive. */
export type Range = { key: RangeKey; label: string; from: number; to: number; fromDay: string; toDay: string };

const addDays = (ms: number, n: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
};

/** The period a report covers. Weeks start on Monday. A bad or missing choice falls back to this month. */
export function resolveRange(key: string | undefined, fromStr?: string, toStr?: string, now = Date.now()): Range {
  const today = dayStart(dayKey(now))!;
  const d = new Date(today);
  const make = (k: RangeKey, from: number, to: number, label = RANGE_LABEL[k]): Range => ({ key: k, label, from, to, fromDay: dayKey(from), toDay: dayKey(to - 1) });
  switch (key) {
    case "today": return make("today", today, addDays(today, 1));
    case "yesterday": return make("yesterday", addDays(today, -1), today);
    case "week": return make("week", addDays(today, -((d.getDay() + 6) % 7)), addDays(today, 1));
    case "lastmonth": return make("lastmonth", new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(), new Date(d.getFullYear(), d.getMonth(), 1).getTime());
    case "custom": {
      const a = dayStart(fromStr);
      const b = dayStart(toStr);
      if (a !== undefined && b !== undefined && b >= a && (b - a) / 86_400_000 < MAX_DAYS) return make("custom", a, addDays(b, 1), "Chosen dates");
      break;
    }
  }
  return make("month", new Date(d.getFullYear(), d.getMonth(), 1).getTime(), addDays(today, 1));
}
