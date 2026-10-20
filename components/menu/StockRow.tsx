"use client";
import { useState } from "react";
import { CircleAlert, CircleCheck, ClipboardCheck, PackageX, Plus } from "lucide-react";
import { useCall } from "@/lib/useCall";
import { stockAction } from "@/app/(app)/menu/actions";
import { dateTime } from "@/lib/format";
import { stockStatus } from "@/lib/stock";
import { inputCls } from "@/lib/ui";
import { ItemIcon } from "./ItemIcon";

type Move = { id: number; delta: number; reason: string; note: string; at: number };

// The big number sits on a tinted tile, so how much is left reads at a glance without hunting for a tiny badge.
const LEVEL = {
  ok: { label: "in stock", icon: CircleCheck, tile: "bg-free/10 text-free" },
  low: { label: "running low", icon: CircleAlert, tile: "bg-warn/10 text-warn" },
  out: { label: "out of stock", icon: PackageX, tile: "bg-over/10 text-over" },
} as const;

const act = "inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50";

/** One counted item: its picture and level, then restock (any staff) and a stock-take (owner), plus recent history. */
export function StockRow({ id, name, category, onHand, history, role }: {
  id: number;
  name: string;
  category: string;
  onHand: number;
  history: Move[];
  role: "owner" | "staff";
}) {
  const { call, pending } = useCall();
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const status = stockStatus(true, onHand);
  const level = LEVEL[status === "untracked" ? "ok" : status];
  const StatusIcon = level.icon;

  const send = (kind: "restock" | "adjust") => {
    const fd = new FormData();
    fd.set("id", String(id));
    fd.set("kind", kind);
    fd.set("qty", qty);
    fd.set("note", note);
    call(() => stockAction(fd), { ok: kind === "restock" ? "Restocked" : "Count saved", onOk: () => { setQty(""); setNote(""); } });
  };

  return (
    <li className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
        <div className="flex min-w-48 flex-1 items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-bg text-brand-text"><ItemIcon name={name} /></span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{name}</p>
            <p className="truncate text-xs text-mute">{category}</p>
          </div>
        </div>

        <div className={`flex w-36 shrink-0 flex-col items-center rounded-2xl px-3 py-2 ${level.tile}`}>
          <span className="tnum font-display text-3xl font-bold leading-none">{onHand}</span>
          <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold"><StatusIcon className="size-3.5" aria-hidden />{level.label}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input aria-label={`Quantity for ${name}`} inputMode="numeric" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} className={`${inputCls} !w-20`} />
          <input aria-label={`Note for ${name}`} placeholder="Note, e.g. delivery (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} className={`${inputCls} !w-56`} />
          <button type="button" disabled={pending || !qty} className={`${act} bg-brand text-on-brand hover:bg-brand-hi`} onClick={() => send("restock")}><Plus className="size-4" aria-hidden />Add stock</button>
          {role === "owner" && (
            <button type="button" disabled={pending || !qty} className={`${act} border border-line text-silver hover:bg-raised hover:text-ink`} onClick={() => send("adjust")} title="Set the count to the number you typed">
              <ClipboardCheck className="size-4" aria-hidden />Set count
            </button>
          )}
        </div>
      </div>
      {history.length > 0 && (
        <details className="mt-3 border-t border-line pt-3 text-sm">
          <summary className="cursor-pointer text-mute hover:text-ink">Recent changes</summary>
          <ul className="mt-2 divide-y divide-line">
            {history.map((m) => (
              <li key={m.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span className="capitalize">{m.reason}{m.note ? ` · ${m.note}` : ""}</span>
                <span className="tnum text-mute">{m.delta > 0 ? "+" : ""}{m.delta} · {dateTime(m.at)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}
