import { liveInfo } from "./live.ts";
import { stockStatus } from "./stock.ts";
import { invoiceNo, rupees } from "./format.ts";
import type { BoardSession } from "./db/sessions.ts";

export type AlertKind = "timeup" | "out" | "ending" | "payment" | "low" | "adjust" | "backup";
export type AppAlert = { id: string; kind: AlertKind; title: string; detail: string; href: string };

const ORDER: AlertKind[] = ["timeup", "out", "adjust", "backup", "ending", "payment", "low"];

/** Everything that needs a person right now: sessions out of time or nearly, stopped sessions waiting for payment, and stock that is low or out. Pure: pass in `now`. */
export function buildAlerts(i: {
  stations: { id: number; name: string; session: BoardSession }[];
  stock: { id: number; name: string; onHand: number }[];
  leadMin: number;
  now: number;
  backupProblem?: string; // the second-folder backup copy is not keeping up (owner only)
  adjusted?: { billId: number; invoiceNo: number; by: string; wasPaise: number; totalPaise: number; reason: string }[]; // amount changes the owner has not seen (owner only)
}): AppAlert[] {
  const out: AppAlert[] = [];
  for (const st of i.stations) {
    const info = liveInfo(st.session, i.leadMin, i.now);
    if (info.status === "timeup") {
      out.push({ id: `s${st.id}`, kind: "timeup", title: st.name, detail: "Time is up · add time or stop", href: "/" });
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
  for (const a of i.adjusted ?? []) {
    out.push({ id: `a${a.billId}`, kind: "adjust", title: `${invoiceNo(a.invoiceNo)} amount changed`, detail: `${a.by}: ${rupees(a.wasPaise)} to ${rupees(a.totalPaise)} · ${a.reason}`, href: `/bills/${a.billId}` });
  }
  if (i.backupProblem) out.push({ id: "backup", kind: "backup", title: "Backup copy is behind", detail: i.backupProblem, href: "/settings?tab=backups" });
  return out
    .map((a, idx) => ({ a, idx }))
    .sort((x, y) => ORDER.indexOf(x.a.kind) - ORDER.indexOf(y.a.kind) || x.idx - y.idx)
    .map(({ a }) => a);
}
