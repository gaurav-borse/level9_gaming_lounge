export type RateSnapshot = {
  rateId: number;
  name: string;
  hourlyPaise: number;
  extraControllerPaise: number;
  incrementMin: number;
};

export type SessionTimes = {
  startedAt: number; // epoch ms
  endedAt: number | null;
  pausedAt: number | null;
  pausedTotalMs: number;
};

export type SessionStatus = "running" | "paused" | "ending" | "timeup";

/** Milliseconds actually played: wall time minus every pause (including a pause still open). */
export function billableMs(t: SessionTimes, now: number): number {
  const end = t.endedAt ?? now;
  const openPause = t.pausedAt !== null ? Math.max(0, end - t.pausedAt) : 0;
  return Math.max(0, end - t.startedAt - t.pausedTotalMs - openPause);
}

/** True once the planned time has been played. Open sessions (no planned time) never run out. */
export const timeIsUp = (t: SessionTimes, plannedMinutes: number | null, now: number): boolean =>
  plannedMinutes !== null && billableMs(t, now) >= plannedMinutes * 60000;

/** Milliseconds of play past the planned time: the clock stops there, so this is time that is never billed. */
export function excessMs(t: SessionTimes, plannedMinutes: number | null, now: number): number {
  return plannedMinutes === null ? 0 : Math.max(0, billableMs(t, now) - plannedMinutes * 60000);
}

/**
 * Minutes charged: the time played rounded up to the increment, but never less than the planned time (it is paid for up front).
 * A session that stays within its plan pays exactly the plan, whatever the increment.
 */
export function chargedMinutes(ms: number, rate: RateSnapshot, plannedMinutes: number | null): number {
  if (plannedMinutes !== null && ms <= plannedMinutes * 60000) return plannedMinutes;
  const inc = Math.max(1, rate.incrementMin);
  return Math.max(Math.ceil(ms / (inc * 60000)) * inc, plannedMinutes ?? 0);
}

/**
 * Session charge in paise. Rounds once, half up. `players` > 1 adds the extra-controller price.
 */
export function sessionChargePaise(ms: number, rate: RateSnapshot, players: number, plannedMinutes: number | null): number {
  const extras = Math.max(0, players - 1);
  const perHour = rate.hourlyPaise + rate.extraControllerPaise * extras;
  return Math.round((chargedMinutes(ms, rate, plannedMinutes) * perHour) / 60);
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
  if (left <= 0) return "timeup";
  if (left <= leadMin * 60000) return "ending";
  return "running";
}
