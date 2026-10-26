import { billableMs, remainingMs, sessionChargePaise, sessionStatus } from "./engine/pricing.ts";
import type { SessionStatus } from "./engine/pricing.ts";
import type { BoardSession } from "./db/sessions.ts";

export type LiveStatus = SessionStatus | "awaiting"; // awaiting = stopped, bill not paid yet

/** Controllers on the table now: the ones paid for at the start plus any added during the session. */
export const playerCount = (s: Pick<BoardSession, "players" | "addedControllers">): number => s.players + s.addedControllers;

/**
 * Everything a card or drawer shows about a session at a given moment. Pure: pass in `now`.
 * The clock stops when the planned time is up: played time never goes past the plan until someone adds time or stops the session.
 */
export function liveInfo(s: BoardSession, leadMin: number, now: number) {
  const stopped = s.endedAt !== null;
  const raw = billableMs(s, s.endedAt ?? now);
  const playedMs = !stopped && s.plannedMinutes !== null ? Math.min(raw, s.plannedMinutes * 60000) : raw;
  const status: LiveStatus = stopped ? "awaiting" : sessionStatus(s, s.plannedMinutes, leadMin, now);
  const chargePaise = sessionChargePaise(playedMs, s.rate, s.players, s.plannedMinutes) + s.addedControllersPaise;
  return {
    stopped,
    status,
    playedMs,
    remainingMs: remainingMs(s.plannedMinutes, playedMs),
    chargePaise,
    totalPaise: chargePaise + s.itemsPaise,
  };
}
