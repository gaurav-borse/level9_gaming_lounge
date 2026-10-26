export type RateRow = {
  id: number;
  zoneId: number;
  name: string;
  hourlyPaise: number;
  extraControllerPaise: number;
  incrementMin: number;
  daysMask: number; // bit 0 = Sunday ... bit 6 = Saturday
  fromMin: number; // minutes since midnight, inclusive
  toMin: number; // minutes since midnight, exclusive (1440 = end of day)
  priority: number;
};

/** Highest-priority rate for a zone at a moment; ties go to the lowest id. Null = no price set. */
export function pickRate(rates: RateRow[], zoneId: number, at: Date): RateRow | null {
  const today = at.getDay();
  const yesterday = (today + 6) % 7;
  const minute = at.getHours() * 60 + at.getMinutes();
  const matches = rates.filter((r) => {
    if (r.zoneId !== zoneId) return false;
    const has = (d: number) => (r.daysMask & (1 << d)) !== 0;
    if (r.fromMin <= r.toMin) return has(today) && minute >= r.fromMin && minute < r.toMin;
    // Overnight window: the evening part belongs to today, the after-midnight part to the day it started on.
    return (has(today) && minute >= r.fromMin) || (has(yesterday) && minute < r.toMin);
  });
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.priority - a.priority || a.id - b.id)[0];
}

/** A rate that applies every day, all day: the zone's normal price. Anything else is a special price (happy hour, weekends…). */
export const isAllTime = (r: Pick<RateRow, "daysMask" | "fromMin" | "toMin">): boolean => r.daysMask === 127 && r.fromMin === 0 && r.toMin === 1440;

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** "Every day · all day", "Mon–Fri · 14:00–17:00", "Sat & Sun · all day" */
export function whenText(r: Pick<RateRow, "daysMask" | "fromMin" | "toMin">): string {
  const days =
    r.daysMask === 127 ? "Every day"
    : r.daysMask === 0b0111110 ? "Mon–Fri"
    : r.daysMask === 0b1000001 ? "Sat & Sun"
    : DAY.filter((_, i) => r.daysMask & (1 << i)).join(", ");
  const time = r.fromMin === 0 && r.toMin === 1440 ? "all day" : `${clock(r.fromMin)}–${clock(r.toMin)}`;
  return `${days} · ${time}`;
}
