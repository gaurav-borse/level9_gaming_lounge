import { Armchair } from "lucide-react";
import type { ZoneAvailability } from "@/lib/floor-view";

/** "PS5 2 frees up in 12 minutes", "PS5 2: time is up", "PS5 2 is waiting for payment". */
function nextLine(n: NonNullable<ZoneAvailability["next"]>): string {
  if (n.payment) return `${n.station} is waiting for payment`;
  if (n.ms === null) return `${n.station} has no end time set`;
  if (n.ms <= 0) return `${n.station}: time is up`;
  const min = Math.ceil(n.ms / 60_000);
  return `${n.station} frees up in ${min} ${min === 1 ? "minute" : "minutes"}`;
}

/** Which stations are free per zone, and when the next one frees up when none is. No money here: the floor screen can be seen by anyone. */
export function ZoneAvailability({ zones }: { zones: ZoneAvailability[] }) {
  const shown = zones.filter((z) => z.usable > 0);
  return (
    <section aria-labelledby="free-title" className="grid content-center gap-3 rounded-4xl border border-line bg-panel p-5 sm:p-6">
      <h2 id="free-title" className="font-display text-xl font-bold tracking-wide">Free stations</h2>
      {shown.length === 0 ? (
        <p className="text-sm text-mute">Every station is under maintenance.</p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((z) => (
            <li key={z.name} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className={`grid size-10 shrink-0 place-items-center rounded-2xl ${z.free > 0 ? "bg-free/15 text-free" : "bg-warn/15 text-warn"}`}><Armchair className="size-5" aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{z.name}</p>
                <p className="truncate text-xs text-mute">{z.free > 0 ? (z.free === z.usable ? "All free" : `${z.usable - z.free} in use`) : z.next ? nextLine(z.next) : ""}</p>
              </div>
              <p className="tnum shrink-0 text-right">
                <span className={`font-display text-2xl font-semibold ${z.free > 0 ? "text-free" : "text-warn"}`}>{z.free}</span>
                <span className="text-xs text-mute"> of {z.usable} free</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
