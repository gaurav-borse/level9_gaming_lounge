"use client";
import { useState } from "react";
import { Pause, Play, Plus, Square, Undo2, X } from "lucide-react";
import { Modal } from "@/components/modal";
import { useCall } from "@/lib/useCall";
import { addItemAction, addMenuItemAction, extendAction, notesAction, pauseAction, removeItemAction, reopenAction, resumeAction, stopAction, transferAction } from "@/app/(app)/actions";
import { liveInfo } from "@/lib/live";
import { clock, hms, rupees } from "@/lib/format";
import { btnCls, btnDangerCls, btnPrimaryCls, inputCls, labelCls } from "@/lib/ui";
import type { BoardStation } from "@/lib/db/sessions";
import type { MenuItem } from "@/lib/db/menu";
import { STATUS } from "./status";
import { BillPanel } from "./BillPanel";
import { MenuPicker } from "./MenuPicker";

export function SessionDrawer({ station, zoneName, menu, siblings, now, leadMin, cafe, role, onClose }: {
  station: BoardStation;
  menu: MenuItem[];
  zoneName: string;
  siblings: BoardStation[]; // other stations in the same zone, for Transfer
  now: number;
  leadMin: number;
  cafe: { name: string; upiId: string };
  role: "owner" | "staff";
  onClose: () => void;
}) {
  const s = station.session!;
  const { call, pending } = useCall();
  const info = liveInfo(s, leadMin, now);
  const st = STATUS[info.status];
  const Icon = st.icon;
  const [item, setItem] = useState({ name: "", qty: "1", rupees: "" });
  const [other, setOther] = useState(false); // the "something not on the menu" form is closed until asked for
  const itemsKey = s.items.map((i) => `${i.id}x${i.qty}`).join(","); // the bill is recalculated when the tab changes
  const [notes, setNotes] = useState(s.notes);
  const free = siblings.filter((x) => x.id !== station.id && !x.session && !x.maintenance);
  const canExtend = s.plannedMinutes !== null && !info.stopped;

  return (
    <Modal open onClose={onClose} title={`${station.name} · ${zoneName}`} side>
      <div className="space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${st.chip}`}><Icon className="size-3.5" />{st.label}</span>
            <div className="tnum mt-2 font-display text-5xl font-bold leading-none">
              {info.remainingMs !== null && !info.stopped ? (info.remainingMs < 0 ? `+${hms(-info.remainingMs)}` : hms(info.remainingMs)) : hms(info.playedMs)}
            </div>
            <div className="mt-1 text-sm text-mute">
              Started {clock(s.startedAt)} · {s.customerName ?? "Walk-in"} · {s.players} {s.players === 1 ? "player" : "players"}
              {s.plannedMinutes ? ` · ${s.plannedMinutes} min` : ""}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-mute">So far</div>
            <div className="tnum font-display text-2xl font-bold">{rupees(info.totalPaise)}</div>
            <div className="text-xs text-mute">{rupees(s.rate.hourlyPaise)}/hr</div>
          </div>
        </div>

        {!info.stopped && (
          <>
            <div className="flex flex-wrap gap-2">
              {s.pausedAt === null ? (
                <button disabled={pending} className={btnCls} onClick={() => call(() => pauseAction(s.id))}><Pause className="size-4" /> Pause</button>
              ) : (
                <button disabled={pending} className={btnPrimaryCls} onClick={() => call(() => resumeAction(s.id))}><Play className="size-4" /> Resume</button>
              )}
              {canExtend && [15, 30, 60].map((m) => (
                <button key={m} disabled={pending} className={btnCls} onClick={() => call(() => extendAction(s.id, m), { ok: `Extended by ${m} min` })}>+{m} min</button>
              ))}
              <button disabled={pending} className={`${btnDangerCls} ml-auto`} onClick={() => call(() => stopAction(s.id))}><Square className="size-4" /> Stop</button>
            </div>

            {free.length > 0 && (
              <div>
                <label className={labelCls} htmlFor="mv">Move to another {zoneName} station</label>
                <select id="mv" className={inputCls} defaultValue="" onChange={(e) => e.target.value && call(() => transferAction(s.id, Number(e.target.value)), { ok: "Moved", onOk: onClose })}>
                  <option value="">Choose…</option>
                  {free.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </div>
            )}
          </>
        )}

        <section>
          <h3 className={labelCls}>Food and extras</h3>
          {s.items.length > 0 && (
            <ul className="mb-3 divide-y divide-line rounded-lg border border-line text-sm">
              {s.items.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span>{i.qty} × {i.name}</span>
                  <span className="flex items-center gap-2"><span className="tnum">{rupees(i.qty * i.unitPaise)}</span>
                    <button aria-label={`Remove ${i.name}`} className="text-mute hover:text-over" onClick={() => call(() => removeItemAction(i.id))}><X className="size-4" /></button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {menu.length > 0 && (
            <div className="mb-3">
              <MenuPicker items={menu} disabled={pending} onPick={(m) => call(() => addMenuItemAction(s.id, m.id, 1))} />
            </div>
          )}
          {menu.length > 0 && (
            <button type="button" aria-expanded={other} onClick={() => setOther(!other)} className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-dashed border-line px-3.5 py-1.5 text-sm font-medium text-silver transition hover:border-brand hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              <Plus className="size-4" aria-hidden /> Other item (not on the menu)
            </button>
          )}
          {(other || menu.length === 0) && (
            <form
              className="grid grid-cols-[1fr_4rem_6rem_auto] gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                call(() => addItemAction(s.id, item.name, item.qty, item.rupees), { onOk: () => setItem({ name: "", qty: "1", rupees: "" }) });
              }}
            >
              <input aria-label="Item name" className={inputCls} placeholder="Item name, e.g. Maggi" value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} />
              <input aria-label="Quantity" className={inputCls} inputMode="numeric" placeholder="Qty" value={item.qty} onChange={(e) => setItem({ ...item, qty: e.target.value })} />
              <input aria-label="Price each in rupees" className={inputCls} inputMode="decimal" placeholder="Price ₹" value={item.rupees} onChange={(e) => setItem({ ...item, rupees: e.target.value })} />
              <button className={btnCls} disabled={pending}>Add</button>
            </form>
          )}
        </section>

        <section>
          <label className={labelCls} htmlFor="nt">Notes</label>
          <textarea id="nt" rows={2} className={inputCls} placeholder="Notes about this session, e.g. birthday group" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== s.notes && call(() => notesAction(s.id, notes))} />
        </section>

        {info.stopped && (
          <section className="space-y-4 border-t border-line pt-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-bold">Bill</h3>
              <button disabled={pending} className={btnCls} onClick={() => call(() => reopenAction(s.id), { ok: "Session resumed. The time since Stop isn't billed." })}><Undo2 className="size-4" /> Undo stop</button>
            </div>
            <BillPanel key={itemsKey} sessionId={s.id} cafeName={cafe.name} upiId={cafe.upiId} role={role} onPaid={onClose} />
          </section>
        )}
      </div>
    </Modal>
  );
}
