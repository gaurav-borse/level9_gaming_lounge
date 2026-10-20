"use client";
import { Gamepad2, Play } from "lucide-react";
import type { BoardStation } from "@/lib/db/sessions";
import { liveInfo } from "@/lib/live";
import { clock, hms, rupees } from "@/lib/format";
import { progressFraction } from "@/lib/floor-view";
import { SessionActions } from "./SessionActions";

const R = 42;
const C = 2 * Math.PI * R;

function planLabel(s: NonNullable<BoardStation["session"]>): string {
  if (s.mode === "open") return "Open session";
  return `${s.mode === "prepaid" ? "Prepaid" : "Fixed"} · ${s.plannedMinutes} min`;
}

/** The big card: the most urgent live session, with its timer and controls. Shows a prompt to start one when the floor is idle. */
export function LiveHero({ station, zoneName, now, leadMin, onOpen, onStart }: {
  station: BoardStation | null;
  zoneName: string;
  now: number;
  leadMin: number;
  onOpen: () => void;
  onStart: () => void;
}) {
  const s = station?.session;
  if (!station || !s || !now) {
    return (
      <section aria-label="Live session" className="hero-bg relative isolate flex flex-col justify-center overflow-hidden rounded-4xl p-5 sm:px-8 sm:py-6">
        <Gamepad2 aria-hidden className="pointer-events-none absolute -right-6 -top-4 -z-10 size-72 rotate-12 text-white/10 sm:size-80" />
        <h2 className="font-display text-2xl font-semibold sm:text-3xl">{now ? "Nothing running" : "Loading…"}</h2>
        {now > 0 && (
          <>
            <p className="mt-1 text-sm text-white/75">Start a session on a free station and it shows up here with its timer.</p>
            <button type="button" onClick={onStart} className="mt-4 inline-flex h-11 w-fit items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-neutral-900 transition hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              <Play className="size-4" aria-hidden /> Start session
            </button>
          </>
        )}
      </section>
    );
  }

  const info = liveInfo(s, leadMin, now);
  const countdown = info.remainingMs !== null;
  const big = countdown ? (info.remainingMs! < 0 ? `+${hms(-info.remainingMs!)}` : hms(info.remainingMs!)) : hms(info.playedMs);
  const label = countdown ? (info.remainingMs! < 0 ? "Over time" : "Time left") : "Elapsed";
  const fraction = info.remainingMs !== null && info.remainingMs < 0 ? 1 : (progressFraction(info.playedMs, s.plannedMinutes) ?? 0);
  const first = s.items[0];
  const status = info.status === "overtime" ? "Overtime" : info.status === "ending" ? "Ending soon" : info.status === "paused" ? "Paused" : "Live now";

  return (
    <section aria-labelledby="hero-title" className="hero-bg relative isolate flex overflow-hidden rounded-4xl p-5 sm:p-8">
      <Gamepad2 aria-hidden className="pointer-events-none absolute -right-6 -top-4 -z-10 size-72 rotate-12 text-white/10 sm:size-80" />
      <div className="flex flex-1 flex-col lg:justify-center">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 text-on-brand">
            {info.status === "running" && <span className="live-dot size-1.5 rounded-full bg-current" aria-hidden />}
            {status}
          </span>
          <span className="rounded-full bg-black/25 px-3 py-1">{zoneName}</span>
          <span className="rounded-full bg-black/25 px-3 py-1">{planLabel(s)}</span>
          {first && <span className="rounded-full bg-black/25 px-3 py-1">{first.qty} × {first.name}{s.items.length > 1 ? ` +${s.items.length - 1} more` : ""}</span>}
        </div>
        <h2 id="hero-title" className="mt-4 font-display text-3xl font-bold tracking-wide sm:text-4xl">{station.name}</h2>
        <p className="mt-1 text-sm text-white/75">
          {s.customerName ?? "Walk-in"} · {s.players} {s.players === 1 ? "player" : "players"} · {rupees(s.rate.hourlyPaise)}/hr · started {clock(s.startedAt)}
        </p>

        <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
          <div className="flex w-full flex-wrap items-end gap-x-10 gap-y-2">
            <div>
              <p className="text-xs uppercase tracking-widest text-white/65">{label}</p>
              <p className="tnum font-display text-5xl font-semibold sm:text-6xl">{big}</p>
            </div>
            <div className="pb-1.5">
              <p className="text-xs uppercase tracking-widest text-white/65">So far</p>
              <p className="tnum font-display text-3xl font-semibold">{rupees(info.totalPaise)}</p>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-x-5 gap-y-3">
            <SessionActions session={s} hero />
            <button type="button" onClick={onOpen} className="text-sm font-medium text-white/80 underline-offset-4 hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-white">
              Details, food and notes
            </button>
          </div>
        </div>
      </div>
      <div className="relative ml-4 hidden shrink-0 sm:block" aria-hidden>
        <svg viewBox="0 0 100 100" className="size-24 -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" stroke="rgb(255 255 255 / .18)" strokeWidth="8" />
          <circle cx="50" cy="50" r={R} fill="none" stroke="white" strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - fraction)} className="transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none" />
        </svg>
      </div>
    </section>
  );
}
