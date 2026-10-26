"use client";
import { useMemo, useState } from "react";
import { Play, ShoppingBasket } from "lucide-react";
import type { BoardStation, BoardZone } from "@/lib/db/sessions";
import type { MenuItem } from "@/lib/db/menu";
import { liveInfo } from "@/lib/live";
import { audioReady } from "@/lib/alerts";
import { attentionRank, greetingFor, pickFeatured, summarize, zoneAvailability } from "@/lib/floor-view";
import { useNow } from "@/lib/useNow";
import { Modal } from "@/components/modal";
import { StationCard } from "./StationCard";
import { StartDialog } from "./StartDialog";
import { SessionDrawer } from "./SessionDrawer";
import { LiveHero } from "./LiveHero";
import { CounterSale } from "./CounterSale";
import { ZoneAvailability } from "./ZoneAvailability";
import { STATUS, ZONE_ICON, type StatusKey } from "./status";

type Entry = { station: BoardStation; zone: BoardZone };

export function Board({ zones, menu, leadMin, alerts, cafe, role, userName }: {
  zones: BoardZone[];
  menu: MenuItem[];
  leadMin: number;
  alerts: "sound" | "silent" | "off"; // from Settings: notices with beeps, notices only, or nothing
  cafe: { name: string; upiId: string };
  role: "owner" | "staff";
  userName: string;
}) {
  const now = useNow();
  const [starting, setStarting] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [counter, setCounter] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [zoneFilter, setZoneFilter] = useState<number | null>(null);

  // Sounds and notices come from <SessionAlerts> in the page frame, so they also work on the other pages.
  const soundOff = alerts === "sound" && now > 0 && !audioReady();

  const entries: Entry[] = useMemo(() => zones.flatMap((zone) => zone.stations.map((station) => ({ station, zone }))), [zones]);
  const statusOf = (e: Entry): StatusKey =>
    e.station.maintenance ? "maintenance" : !e.station.session ? "free" : now ? liveInfo(e.station.session, leadMin, now).status : "running";

  const summary = summarize(entries.map((e) => ({ maintenance: e.station.maintenance, busy: !!e.station.session, status: e.station.session && now ? liveInfo(e.station.session, leadMin, now).status : null })));
  const featured = now
    ? pickFeatured(
        entries
          .filter((e) => e.station.session)
          .map((e) => {
            const i = liveInfo(e.station.session!, leadMin, now);
            return { entry: e, status: i.status as string, remainingMs: i.remainingMs, playedMs: i.playedMs };
          }),
      )?.entry ?? null
    : null;

  const activeZone = zones.some((z) => z.id === zoneFilter) ? zoneFilter : null;
  const visible = entries
    .filter((e) => activeZone === null || e.zone.id === activeZone)
    .map((e, i) => ({ e, i, rank: attentionRank(statusOf(e)) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.e);

  const openEntry = open === null ? null : entries.find((e) => e.station.id === open) ?? null;
  const startEntry = starting === null ? null : entries.find((e) => e.station.id === starting) ?? null;
  const availability = zoneAvailability(
    zones.map((z) => ({
      name: z.name,
      stations: z.stations.map((s) => ({
        name: s.name,
        maintenance: s.maintenance,
        busy: !!s.session,
        payment: !!s.session && s.session.endedAt !== null,
        remainingMs: s.session && now ? liveInfo(s.session, leadMin, now).remainingMs : null,
      })),
    })),
  );
  const freeByZone = zones.map((z) => ({ zone: z, free: z.stations.filter((s) => !s.session && !s.maintenance) })).filter((x) => x.free.length > 0);

  if (zones.length === 0) {
    return <p className="rounded-xl border border-dashed border-line p-10 text-center text-mute">No stations yet. Add zones and stations in Settings.</p>;
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">
            {now ? greetingFor(new Date(now).getHours()) : "Hello"}, <span className="text-brand-text">{userName.split(" ")[0]}</span>
          </h1>
          <p className="mt-1 text-base text-mute">
            {cafe.name}
            {now > 0 && (
              <>
                {" · "}{new Date(now).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                {" · "}<span className="tnum">{new Date(now).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })}</span>
              </>
            )}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCounter(true)}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-panel px-5 text-sm font-semibold text-ink transition hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <ShoppingBasket className="size-4" aria-hidden /> Counter sale
          </button>
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-on-brand transition hover:bg-brand-hi focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <Play className="size-4" aria-hidden /> Start session
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <LiveHero
          station={featured?.station ?? null}
          zoneName={featured?.zone.name ?? ""}
          now={now}
          leadMin={leadMin}
          onOpen={() => featured && setOpen(featured.station.id)}
          onStart={() => setPicking(true)}
        />
        <ZoneAvailability zones={availability} />
      </div>

      {soundOff && (
        <p role="status" className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm text-warn">
          Alert sound is off. Click anywhere on the page to turn it on.
        </p>
      )}

      <section aria-labelledby="stations-title" className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 id="stations-title" className="font-display text-xl font-bold tracking-wide">
            Stations{" "}
            <span className="ml-1 font-sans text-base font-normal text-mute">
              {summary.inUse} of {summary.total} in use
              {summary.ending > 0 && <span className="text-warn"> · {summary.ending} {summary.ending === 1 ? "needs" : "need"} attention</span>}
            </span>
          </h2>
          {zones.length > 1 && (
            <div role="group" aria-label="Show zone" className="no-scrollbar ml-auto flex gap-2 overflow-x-auto text-sm">
              {[{ id: null, name: "All", kind: "" }, ...zones].map((z) => {
                const Icon = z.id === null ? null : (ZONE_ICON[z.kind] ?? ZONE_ICON.custom);
                const on = activeZone === z.id;
                return (
                  <button
                    key={z.id ?? "all"}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setZoneFilter(z.id)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${on ? "bg-brand text-on-brand" : "bg-panel text-silver hover:bg-raised hover:text-ink"}`}
                  >
                    {Icon && <Icon className="size-4" aria-hidden />}
                    {z.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <ul className="grid grid-cols-1 gap-5 min-[560px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {visible.map(({ station, zone }) => (
            <li key={station.id}>
              <StationCard station={station} zoneName={zone.name} zoneKind={zone.kind} now={now} leadMin={leadMin} onOpen={() => setOpen(station.id)} onStart={() => setStarting(station.id)} />
            </li>
          ))}
        </ul>
      </section>

      <Modal open={picking} onClose={() => setPicking(false)} title="Start a session">
        {freeByZone.length === 0 ? (
          <p className="text-mute">Every station is busy or under maintenance.</p>
        ) : (
          <div className="space-y-5">
            {freeByZone.map(({ zone, free }) => (
              <div key={zone.id}>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-mute">{zone.name}</h3>
                <div className="flex flex-wrap gap-2">
                  {free.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setPicking(false); setStarting(s.id); }}
                      className="inline-flex items-center gap-2 rounded-full border border-line bg-raised px-4 py-2 text-sm font-semibold transition hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      <span className={`size-2 rounded-full bg-free`} aria-hidden />
                      {s.name}
                      <span className="sr-only">, {STATUS.free.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {counter && <CounterSale items={menu} cafe={cafe} role={role} onClose={() => setCounter(false)} />}
      {startEntry && (
        <StartDialog stationId={startEntry.station.id} stationName={startEntry.station.name} onClose={() => setStarting(null)} />
      )}
      {openEntry?.station.session && now > 0 && (
        <SessionDrawer station={openEntry.station} zoneName={openEntry.zone.name} menu={menu} siblings={openEntry.zone.stations} now={now} leadMin={leadMin} cafe={cafe} role={role} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
