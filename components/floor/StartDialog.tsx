"use client";
import { useEffect, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { Modal } from "@/components/modal";
import { useCall } from "@/lib/useCall";
import { useToast } from "@/components/toast";
import { createCustomerAction, rateQuoteAction, searchCustomersAction, startSessionAction } from "@/app/(app)/actions";
import { btnCls, btnPrimaryCls, inputCls, labelCls } from "@/lib/ui";
import type { Customer } from "@/lib/db/customers";
import { rupees } from "@/lib/format";

type Pick = { id: number; name: string };

/** What the controllers cost, in words: the price per hour and per extra controller, and the total for the minutes chosen. */
function controllerNote(q: { hourlyPaise: number; extraControllerPaise: number }, players: number, minutes: number): string {
  const extra = Number.isInteger(players) && players > 1 ? players - 1 : 0;
  if (q.extraControllerPaise === 0) return extra > 0 ? "No extra-controller price is set for this zone, so extra controllers are free. The owner can set one in Settings, Rates." : `${rupees(q.hourlyPaise)}/hr. No extra-controller price is set, so extra controllers are free.`;
  const base = `${rupees(q.hourlyPaise)}/hr, plus ${rupees(q.extraControllerPaise)}/hr for each extra controller.`;
  if (extra === 0 || !Number.isInteger(minutes) || minutes < 1) return base;
  return `${base} ${extra} extra: ${rupees(Math.round((q.hourlyPaise + q.extraControllerPaise * extra) * minutes / 60))} for ${minutes} minutes.`;
}

export function StartDialog({ stationName, stationId, onClose }: {
  stationName: string;
  stationId: number;
  onClose: () => void;
}) {
  const { call, pending } = useCall();
  const toast = useToast();
  const [minutes, setMinutes] = useState("60");
  const [players, setPlayers] = useState("1");
  const [customer, setCustomer] = useState<Pick | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Customer[]>([]);
  const [adding, setAdding] = useState(false);
  const [nName, setNName] = useState("");
  const [nPhone, setNPhone] = useState("");
  const [quote, setQuote] = useState<{ hourlyPaise: number; extraControllerPaise: number } | null>(null);

  useEffect(() => {
    rateQuoteAction(stationId).then((r) => r.ok && setQuote(r.data));
  }, [stationId]);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => {
      const r = await searchCustomersAction(q);
      if (r.ok) setFound(r.data);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const shownFound = q.trim().length < 2 ? [] : found;

  async function addCustomer() {
    const r = await createCustomerAction(nName, nPhone);
    if (!r.ok) return toast("err", r.error);
    setCustomer(r.data);
    setAdding(false);
    setQ("");
  }

  return (
    <Modal open onClose={onClose} title={`Start · ${stationName}`}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          call(
            () => startSessionAction({ stationId, players, customerId: customer?.id ?? null, minutes }),
            { ok: `${stationName} started`, onOk: onClose },
          );
        }}
      >
        <div>
          <label className={labelCls} htmlFor="mins">How many minutes?</label>
          <div className="mb-2 flex flex-wrap gap-2">
            {[30, 60, 90, 120, 180].map((m) => (
              <button key={m} type="button" onClick={() => setMinutes(String(m))} className={`${btnCls} !px-3 !py-1.5 ${minutes === String(m) ? "border-brand" : ""}`}>
                {m}
              </button>
            ))}
          </div>
          <input id="mins" className={inputCls} inputMode="numeric" placeholder="Minutes, e.g. 60" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          <p className="mt-1.5 text-xs text-mute">The price for these minutes is charged from the start. When they are up the clock stops until you add time or stop the session, so the bill never grows on its own.</p>
        </div>

        <div>
          <label className={labelCls} htmlFor="players">Players / controllers</label>
          <input id="players" className={`${inputCls} max-w-28`} inputMode="numeric" placeholder="e.g. 2" value={players} onChange={(e) => setPlayers(e.target.value)} />
          {quote && <p className="mt-1.5 text-xs text-mute">{controllerNote(quote, Number(players), Number(minutes))}</p>}
        </div>

        <div>
          <span className={labelCls}>Customer</span>
          {customer ? (
            <div className="flex items-center justify-between rounded-lg border border-line bg-raised px-3 py-2 text-sm">
              {customer.name}
              <button type="button" aria-label="Remove customer" onClick={() => setCustomer(null)} className="text-mute hover:text-ink">
                <X className="size-4" />
              </button>
            </div>
          ) : adding ? (
            <div className="space-y-2 rounded-lg border border-line p-3">
              <input className={inputCls} placeholder="Customer name, e.g. Rahul Sharma" value={nName} onChange={(e) => setNName(e.target.value)} />
              <input className={inputCls} placeholder="Phone, e.g. 98765 43210 (optional)" inputMode="tel" value={nPhone} onChange={(e) => setNPhone(e.target.value)} />
              <div className="flex gap-2">
                <button type="button" className={btnPrimaryCls} onClick={addCustomer}>Save customer</button>
                <button type="button" className={btnCls} onClick={() => setAdding(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-mute" />
                <input className={`${inputCls} pl-9`} placeholder="Walk-in. Or type a name or phone to find a regular…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              {shownFound.length > 0 && (
                <ul className="mt-1 overflow-hidden rounded-lg border border-line">
                  {shownFound.map((c) => (
                    <li key={c.id}>
                      <button type="button" className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-raised" onClick={() => { setCustomer({ id: c.id, name: c.name }); setQ(""); }}>
                        {c.name}
                        <span className="text-mute">{c.phone ?? ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" onClick={() => setAdding(true)} className="mt-2 inline-flex items-center gap-1.5 text-sm text-silver hover:text-ink">
                <UserPlus className="size-4" /> New customer
              </button>
            </>
          )}
        </div>

        <button type="submit" disabled={pending} className={`${btnPrimaryCls} w-full !py-3 text-base`}>
          {pending ? "Starting…" : "Start session"}
        </button>
      </form>
    </Modal>
  );
}
