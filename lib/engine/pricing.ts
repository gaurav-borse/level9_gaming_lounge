export type RateSnapshot = {
  rateId: number;
  name: string;
  hourlyPaise: number;
  extraControllerPaise: number;
  incrementMin: number;
  minMinutes: number;
  graceMin: number;
};

export type SessionTimes = {
  startedAt: number; // epoch ms
  endedAt: number | null;
  pausedAt: number | null;
  pausedTotalMs: number;
};

export type SessionStatus = "running" | "paused" | "ending" | "overtime";

/** Milliseconds actually played: wall time minus every pause (including a pause still open). */
export function billableMs(t: SessionTimes, now: number): number {
  const end = t.endedAt ?? now;
  const openPause = t.pausedAt !== null ? Math.max(0, end - t.pausedAt) : 0;
  return Math.max(0, end - t.startedAt - t.pausedTotalMs - openPause);
}

/** Minutes charged: grace -> free, else round up to the increment, then apply the minimum. */
export function chargedMinutes(ms: number, rate: RateSnapshot): number {
  const inc = Math.max(1, rate.incrementMin);
  if (ms <= rate.graceMin * 60000) return 0;
  const rounded = Math.ceil(ms / (inc * 60000)) * inc;
  return Math.max(rounded, rate.minMinutes);
}

/**
 * Session charge in paise. Rounds once, half up. `players` > 1 adds the extra-controller price.
 */
export function sessionChargePaise(ms: number, rate: RateSnapshot, players: number): number {
  const extras = Math.max(0, players - 1);
  const perHour = rate.hourlyPaise + rate.extraControllerPaise * extras;
  return Math.round((chargedMinutes(ms, rate) * perHour) / 60);
}

export function remainingMs(plannedMinutes: number | null, playedMs: number): number | null {
  return plannedMinutes === null ? null : plannedMinutes * 60000 - playedMs;
}

export function sessionStatus(
  t: SessionTimes,
  plannedMinutes: number | null,
  leadMin: number,
  now: number,
): SessionStatus {
  if (t.pausedAt !== null) return "paused";
  const left = remainingMs(plannedMinutes, billableMs(t, now));
  if (left === null) return "running";
  if (left <= 0) return "overtime";
  if (left <= leadMin * 60000) return "ending";
  return "running";
}

/** Minutes a prepaid amount buys at an hourly rate (whole minutes, rounded down). */
export function prepaidMinutes(advancePaise: number, hourlyPaise: number): number {
  if (hourlyPaise <= 0) return 0;
  return Math.floor((advancePaise * 60) / hourlyPaise);
}
