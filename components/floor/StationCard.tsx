"use client";
import { Play } from "lucide-react";
import type { BoardStation } from "@/lib/db/sessions";
import { liveInfo, playerCount } from "@/lib/live";
import { hms, rupees } from "@/lib/format";
import { initials, progressFraction } from "@/lib/floor-view";
import { STATUS, ZONE_ICON, type StatusKey } from "./status";
import { SessionActions } from "./SessionActions";

const bar: Partial<Record<StatusKey, string>> = { timeup: "bg-over", ending: "bg-warn", paused: "bg-paused" };

export function StationCard({ station, zoneName, zoneKind, now, leadMin, onOpen, onStart }: {
  station: BoardStation;
  zoneName: string;
  zoneKind: string;
  now: number;
  leadMin: number;
  onOpen: () => void;
  onStart: () => void;
}) {
  const s = station.session;
  const info = s && now ? liveInfo(s, leadMin, now) : null;
  const key: StatusKey = station.maintenance ? "maintenance" : !s ? "free" : (info?.status ?? "running");
  const st = STATUS[key];
  const ChipIcon = st.icon;
  const ZoneIcon = ZONE_ICON[zoneKind] ?? ZONE_ICON.custom;
  const countdown = info && info.remainingMs !== null && !info.stopped;
  const big = !info ? "-:--:--" : countdown ? hms(info.remainingMs!) : hms(info.playedMs);
  const caption = !s || !info ? "" : countdown ? (info.status === "timeup" ? "time's up" : "time left") : info.stopped ? "played" : "elapsed";
  const fraction = s && info ? progressFraction(info.playedMs, s.plannedMinutes) : null;
  const plan = !s ? "" : s.plannedMinutes ? `${s.plannedMinutes} min` : "open";

  const head = (
    <span className="flex w-full items-start justify-between gap-3">
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-bg text-brand-text"><ZoneIcon className="size-6" aria-hidden /></span>
        <span className="min-w-0">
          <span className="block truncate font-display text-lg font-bold leading-tight tracking-wide">{station.name}</span>
          <span className="block truncate text-xs text-mute">{zoneName}</span>
        </span>
      </span>
      <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${st.chip}`}>
        <ChipIcon className="size-3.5" aria-hidden />
        {st.label}
      </span>
    </span>
  );

  return (
    <article
      style={{ "--glow": st.glow } as React.CSSProperties}
      className={`card-glow relative flex h-full min-h-72 flex-col overflow-hidden rounded-3xl border border-line p-5 ${key === "free" || key === "maintenance" ? "bg-panel-deep" : "bg-panel"} ${key === "maintenance" ? "opacity-70" : ""}`}
    >
      <ZoneIcon aria-hidden className="pointer-events-none absolute -bottom-6 -right-6 size-36 text-ink/5" />

      {s ? (
        <>
          <button type="button" onClick={onOpen} className="relative flex flex-1 flex-col items-stretch text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand" aria-label={`${station.name}: open session details`}>
            {head}
            <span className="mt-5 block">
              <span className="tnum block font-display text-4xl font-semibold leading-none">{big}</span>
              <span className="mt-1 block text-xs text-mute">{caption} · {plan} · {rupees(s.rate.hourlyPaise)}/hr</span>
            </span>
            <span aria-hidden className="mt-3 block h-1.5 overflow-hidden rounded-full bg-ink/10">
              <span className={`block h-full rounded-full transition-[width] duration-1000 ease-linear motion-reduce:transition-none ${bar[key] ?? "bg-brand"}`} style={{ width: `${(key === "timeup" ? 1 : (fraction ?? 0)) * 100}%` }} />
            </span>
            <span className="mt-4 flex items-center gap-3 border-t border-line pt-4 text-sm">
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-ink/10 text-xs font-bold">{initials(s.customerName)}</span>
              <span className="min-w-0 flex-1 leading-snug text-silver">
                {s.customerName ?? "Walk-in"} · {playerCount(s)} {playerCount(s) === 1 ? "player" : "players"}
                {s.items.length > 0 ? ` · ${s.items.length} ${s.items.length === 1 ? "item" : "items"}` : ""}
              </span>
              <span className="tnum font-display text-lg font-semibold">{info ? rupees(info.totalPaise) : ""}</span>
            </span>
          </button>
          <div className="relative mt-4">
            {!info ? null : info.stopped ? (
              <button type="button" onClick={onOpen} className="inline-flex h-10 w-full items-center justify-center rounded-full bg-brand text-sm font-semibold text-on-brand transition hover:bg-brand-hi focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                Take payment
              </button>
            ) : (
              <SessionActions session={s} timeUp={info.status === "timeup"} />
            )}
          </div>
        </>
      ) : (
        <div className="relative flex flex-1 flex-col">
          {head}
          <span className="mt-5 block">
            <span className="tnum block font-display text-4xl font-semibold leading-none text-mute/60">0:00:00</span>
            <span className="mt-1 block text-xs text-mute">{station.maintenance ? "Out of service" : "Ready"}</span>
          </span>
          <span aria-hidden className="mt-3 block h-1.5 rounded-full bg-ink/10" />
          {station.maintenance ? (
            <span className="mt-auto inline-flex h-11 items-center justify-center rounded-full border border-line text-sm font-medium text-mute">Under maintenance</span>
          ) : (
            <button type="button" onClick={onStart} className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand text-sm font-semibold text-on-brand transition hover:bg-brand-hi focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              <Play className="size-4" aria-hidden /> Start session
            </button>
          )}
        </div>
      )}
    </article>
  );
}
