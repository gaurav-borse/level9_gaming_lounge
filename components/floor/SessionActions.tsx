"use client";
import { Pause, Play, Square } from "lucide-react";
import { useCall } from "@/lib/useCall";
import { extendAction, pauseAction, resumeAction, stopAction } from "@/app/(app)/actions";
import type { BoardSession } from "@/lib/db/sessions";

/**
 * Pause or resume, +15 min and Stop for a running session. Used on station cards and on the live-session card.
 * When the time is up the clock has stopped: Pause goes away and the choice is to add time or stop and take payment.
 */
export function SessionActions({ session: s, hero = false, timeUp = false }: { session: BoardSession; hero?: boolean; timeUp?: boolean }) {
  const { call, pending } = useCall();
  // Same rule as the drawer: only timed sessions can be extended.
  const canExtend = s.plannedMinutes !== null;
  const paused = s.pausedAt !== null;

  const base = "inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
  const cls = hero
    ? {
        main: `${base} bg-white text-neutral-900 hover:bg-white/85 focus-visible:outline-white`,
        soft: `${base} bg-black/30 text-white hover:bg-black/45 focus-visible:outline-white`,
        stop: `${base} border border-white/40 text-white hover:bg-white/10 focus-visible:outline-white`,
      }
    : {
        main: `${base} bg-brand text-on-brand hover:bg-brand-hi focus-visible:outline-brand`,
        soft: `${base} bg-ink/10 text-ink hover:bg-ink/15 focus-visible:outline-brand`,
        stop: `${base} border border-line text-ink hover:bg-raised focus-visible:outline-brand`,
      };
  const size = hero ? "" : "flex-1 !px-2 text-xs";

  return (
    <div className={hero ? "grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto" : "flex gap-2"}>
      {timeUp ? null : paused ? (
        <button type="button" disabled={pending} className={`${cls.main} ${size}`} onClick={() => call(() => resumeAction(s.id))}>
          <Play className="size-3.5" aria-hidden /> Resume
        </button>
      ) : (
        <button type="button" disabled={pending} className={`${hero ? cls.main : cls.soft} ${size}`} onClick={() => call(() => pauseAction(s.id))}>
          <Pause className="size-3.5" aria-hidden /> Pause
        </button>
      )}
      {canExtend && (timeUp ? [15, 30] : [15]).map((m) => (
        <button key={m} type="button" disabled={pending} className={`${timeUp ? cls.main : cls.soft} ${size}`} onClick={() => call(() => extendAction(s.id, m), { ok: `Added ${m} min` })}>
          +{m} min
        </button>
      ))}
      <button type="button" disabled={pending} className={`${cls.stop} ${size}`} onClick={() => call(() => stopAction(s.id))}>
        <Square className="size-3.5" aria-hidden /> {timeUp ? "Stop & bill" : "Stop"}
      </button>
    </div>
  );
}
