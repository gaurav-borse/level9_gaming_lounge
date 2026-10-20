import { liveInfo } from "./live.ts";
import { stockStatus } from "./stock.ts";
import { hms } from "./format.ts";
import type { BoardSession } from "./db/sessions.ts";

export type AlertKind = "overtime" | "out" | "ending" | "payment" | "low";
export type AppAlert = { id: string; kind: AlertKind; title: string; detail: string; href: string };

const ORDER: AlertKind[] = ["overtime", "out", "ending", "payment", "low"];

/** Everything that needs a person right now: sessions out of time or nearly, stopped sessions waiting for payment, and stock that is low or out. Pure: pass in `now`. */
export function buildAlerts(i: {
  stations: { id: number; name: string; session: BoardSession }[];
  stock: { id: number; name: string; onHand: number }[];
  leadMin: number;
  now: number;
}): AppAlert[] {
  const out: AppAlert[] = [];
  for (const st of i.stations) {
    const info = liveInfo(st.session, i.leadMin, i.now);
    if (info.status === "overtime") {
      out.push({ id: `s${st.id}`, kind: "overtime", title: st.name, detail: `Time is up · ${hms(-(info.remainingMs ?? 0))} over`, href: "/" });
    } else if (info.status === "ending") {
      const min = Math.max(1, Math.ceil((info.remainingMs ?? 0) / 60_000));
      out.push({ id: `s${st.id}`, kind: "ending", title: st.name, detail: `${min} ${min === 1 ? "minute" : "minutes"} left`, href: "/" });
    } else if (info.status === "awaiting") {
      out.push({ id: `s${st.id}`, kind: "payment", title: st.name, detail: "Stopped, payment not taken yet", href: "/" });
    }
  }
  for (const m of i.stock) {
    const status = stockStatus(true, m.onHand);
    if (status === "out") out.push({ id: `m${m.id}`, kind: "out", title: m.name, detail: "Out of stock", href: "/menu" });
    else if (status === "low") out.push({ id: `m${m.id}`, kind: "low", title: m.name, detail: `Only ${m.onHand} left`, href: "/menu" });
  }
  return out
    .map((a, idx) => ({ a, idx }))
    .sort((x, y) => ORDER.indexOf(x.a.kind) - ORDER.indexOf(y.a.kind) || x.idx - y.idx)
    .map(({ a }) => a);
}
