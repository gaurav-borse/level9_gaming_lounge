import { billableMs, remainingMs, sessionChargePaise, sessionStatus } from "./engine/pricing.ts";
import type { SessionStatus } from "./engine/pricing.ts";
import type { BoardSession } from "./db/sessions.ts";

export type LiveStatus = SessionStatus | "awaiting"; // awaiting = stopped, bill not paid yet

/** Everything a card or drawer shows about a session at a given moment. Pure: pass in `now`. */
export function liveInfo(s: BoardSession, leadMin: number, now: number) {
  const stopped = s.endedAt !== null;
  const playedMs = billableMs(s, s.endedAt ?? now);
  const status: LiveStatus = stopped ? "awaiting" : sessionStatus(s, s.plannedMinutes, leadMin, now);
  const chargePaise = sessionChargePaise(playedMs, s.rate, s.players);
  return {
    stopped,
    status,
    playedMs,
    remainingMs: remainingMs(s.plannedMinutes, playedMs),
    chargePaise,
    totalPaise: chargePaise + s.itemsPaise,
  };
}
