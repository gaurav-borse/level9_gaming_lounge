"use client";
import { useMemo, useRef } from "react";
import Link from "next/link";
import { AlarmClock, Bell, CircleAlert, PackageX, DatabaseBackup, PencilLine, Timer, Wallet, type LucideIcon } from "lucide-react";
import type { BoardSession } from "@/lib/db/sessions";
import { buildAlerts, type AlertKind } from "@/lib/notifications";
import { markAdjustmentsSeenAction } from "@/app/(app)/actions";
import { useCall } from "@/lib/useCall";
import { useNow } from "@/lib/useNow";
import { useDismissableDetails } from "@/lib/useDismissableDetails";

const LOOK: Record<AlertKind, { icon: LucideIcon; tone: string }> = {
  timeup: { icon: AlarmClock, tone: "bg-over/15 text-over" },
  adjust: { icon: PencilLine, tone: "bg-warn/15 text-warn" },
  backup: { icon: DatabaseBackup, tone: "bg-warn/15 text-warn" },
  out: { icon: PackageX, tone: "bg-over/15 text-over" },
  ending: { icon: Timer, tone: "bg-warn/15 text-warn" },
  payment: { icon: Wallet, tone: "bg-brand/20 text-brand-text" },
  low: { icon: CircleAlert, tone: "bg-warn/15 text-warn" },
};

/** The bell in the top corner: a count, and a list of everything that needs attention (sessions, payments, stock). Timed alerts follow the clock. */
export function AlertBell({ stations, stock, leadMin, adjusted = [], backupProblem }: {
  stations: { id: number; name: string; session: BoardSession }[];
  stock: { id: number; name: string; onHand: number }[];
  leadMin: number;
  adjusted?: Parameters<typeof buildAlerts>[0]["adjusted"]; // owner only: amount changes not seen yet
  backupProblem?: string; // owner only: the second-folder backup copy is behind
}) {
  const { call, pending } = useCall();
  const now = useNow(); // 0 until the page has loaded in the browser
  const menu = useRef<HTMLDetailsElement>(null);
  useDismissableDetails(menu);
  const alerts = useMemo(
    () => buildAlerts({ stations: now ? stations : [], stock, leadMin, now, adjusted, backupProblem }),
    [stations, stock, leadMin, now, adjusted, backupProblem],
  );
  const urgent = alerts.some((a) => a.kind === "timeup" || a.kind === "out" || a.kind === "adjust" || a.kind === "backup");

  return (
    <details ref={menu} className="relative">
      <summary
        aria-label={alerts.length ? `Alerts: ${alerts.length}` : "Alerts: none"}
        title="Alerts"
        className="relative grid size-10 cursor-pointer list-none place-items-center rounded-full bg-panel text-silver transition hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden"
      >
        <Bell className="size-[1.15rem]" aria-hidden />
        {alerts.length > 0 && (
          <span className={`absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold leading-5 ring-2 ring-bg ${urgent ? "bg-over text-neutral-950" : "bg-warn text-neutral-950"}`}>
            {alerts.length}
          </span>
        )}
      </summary>
      <div className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-line bg-panel shadow-2xl">
        <p className="border-b border-line px-5 py-3.5 text-sm font-semibold">Alerts{alerts.length > 0 ? ` (${alerts.length})` : ""}</p>
        {alerts.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-mute">Nothing needs attention right now.</p>
        ) : (
          <ul className="max-h-96 divide-y divide-line overflow-y-auto">
            {alerts.map((a) => {
              const { icon: Icon, tone } = LOOK[a.kind];
              return (
                <li key={a.id}>
                  <Link href={a.href} onClick={() => { if (menu.current) menu.current.open = false; }} className="flex items-center gap-3 px-5 py-3 transition hover:bg-raised focus-visible:bg-raised focus-visible:outline-none">
                    <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="size-[1.1rem]" aria-hidden /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{a.title}</span>
                      <span className="block truncate text-xs text-mute">{a.detail}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {alerts.some((a) => a.kind === "adjust") && (
          <button type="button" disabled={pending} onClick={() => call(() => markAdjustmentsSeenAction())} className="w-full border-t border-line px-5 py-3 text-left text-sm font-medium text-silver transition hover:bg-raised hover:text-ink">
            Mark amount changes as seen
          </button>
        )}
      </div>
    </details>
  );
}
