"use client";
import { useMemo, useState } from "react";
import { ArrowLeft, Minus, Plus, X } from "lucide-react";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import type { MenuItem } from "@/lib/db/menu";
import { rupees } from "@/lib/format";
import { btnCls, btnPrimaryCls } from "@/lib/ui";
import { MenuPicker } from "./MenuPicker";
import { BillPanel } from "./BillPanel";

/** A sale with no session: pick items, then pay with the same panel as a session bill. */
export function CounterSale({ items, cafe, role, onClose }: {
  items: MenuItem[];
  cafe: { name: string; upiId: string };
  role: "owner" | "staff";
  onClose: () => void;
}) {
  const toast = useToast();
  const [cart, setCart] = useState<Map<number, number>>(new Map());
  const [paying, setPaying] = useState(false);
  const byId = useMemo(() => new Map(items.map((m) => [m.id, m])), [items]);
  const lines = useMemo(() => [...cart].map(([itemId, qty]) => ({ itemId, qty })), [cart]);
  const total = lines.reduce((sum, l) => sum + l.qty * (byId.get(l.itemId)?.pricePaise ?? 0), 0);

  const change = (id: number, by: number) =>
    setCart((c) => {
      const next = new Map(c);
      const qty = Math.min(99, (next.get(id) ?? 0) + by);
      if (qty <= 0) next.delete(id);
      else next.set(id, qty);
      return next;
    });

  return (
    <Modal open onClose={onClose} title="Counter sale">
      {paying ? (
        <div className="space-y-4">
          <button type="button" className="inline-flex items-center gap-1.5 text-sm text-silver hover:text-ink" onClick={() => setPaying(false)}>
            <ArrowLeft className="size-4" aria-hidden /> Change items
          </button>
          <BillPanel
            counterLines={lines}
            cafeName={cafe.name}
            upiId={cafe.upiId}
            role={role}
            onPaid={() => {
              toast("ok", "Sale recorded");
              onClose();
            }}
          />
        </div>
      ) : (
        <div className="space-y-5">
          <MenuPicker items={items} onPick={(m) => change(m.id, 1)} />

          <section aria-label="Items in this sale">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-mute">This sale</h3>
            {lines.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line p-4 text-center text-sm text-mute">Tap items above to add them.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line text-sm">
                {lines.map((l) => {
                  const m = byId.get(l.itemId);
                  return (
                    <li key={l.itemId} className="flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate">{m?.name}</span>
                      <button type="button" aria-label={`One less ${m?.name}`} className={`${btnCls} !p-1.5`} onClick={() => change(l.itemId, -1)}><Minus className="size-4" /></button>
                      <span className="tnum w-6 text-center">{l.qty}</span>
                      <button type="button" aria-label={`One more ${m?.name}`} className={`${btnCls} !p-1.5`} onClick={() => change(l.itemId, 1)}><Plus className="size-4" /></button>
                      <span className="tnum w-20 text-right">{rupees(l.qty * (m?.pricePaise ?? 0))}</span>
                      <button type="button" aria-label={`Remove ${m?.name}`} className="text-mute hover:text-over" onClick={() => change(l.itemId, -l.qty)}><X className="size-4" /></button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <button type="button" disabled={lines.length === 0} className={`${btnPrimaryCls} w-full !py-3 text-base`} onClick={() => setPaying(true)}>
            {lines.length === 0 ? "Take payment" : `Take payment · ${rupees(total)}`}
          </button>
          <p className="text-center text-xs text-mute">Discount and payment come next. Prices already include GST.</p>
        </div>
      )}
    </Modal>
  );
}
