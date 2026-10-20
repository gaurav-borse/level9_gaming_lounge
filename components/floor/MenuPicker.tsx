"use client";
import { useMemo, useState } from "react";
import type { MenuItem } from "@/lib/db/menu";
import { rupees } from "@/lib/format";
import { stockStatus } from "@/lib/stock";

/** Category chips and a grid of tap-to-add menu items. Out-of-stock items stay tappable: counts drift, staff know best. */
export function MenuPicker({ items, onPick, disabled = false }: { items: MenuItem[]; onPick: (item: MenuItem) => void; disabled?: boolean }) {
  const categories = useMemo(() => [...new Map(items.map((m) => [m.categoryId, m.categoryName])).entries()], [items]);
  const [cat, setCat] = useState<number | null>(null);
  const active = categories.some(([id]) => id === cat) ? cat : null;
  const shown = active === null ? items : items.filter((m) => m.categoryId === active);

  if (items.length === 0) return <p className="text-sm text-mute">The menu is empty. The owner can add items under Menu &amp; stock.</p>;

  return (
    <div className="space-y-3">
      {categories.length > 1 && (
        <div role="group" aria-label="Menu category" className="no-scrollbar flex gap-2 overflow-x-auto text-sm">
          {[[null, "All"] as const, ...categories].map(([id, name]) => (
            <button
              key={id ?? "all"}
              type="button"
              aria-pressed={active === id}
              onClick={() => setCat(id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${active === id ? "bg-brand text-on-brand" : "bg-raised text-silver hover:text-ink"}`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {shown.map((m) => {
          const st = stockStatus(m.trackStock, m.onHand);
          return (
            <li key={m.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(m)}
                className="flex h-full w-full flex-col items-start gap-0.5 rounded-xl border border-line bg-raised p-3 text-left transition hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
              >
                <span className="text-sm font-semibold leading-tight">{m.name}</span>
                <span className="tnum text-sm text-silver">{rupees(m.pricePaise)}</span>
                {st !== "untracked" && (
                  <span className={`text-xs ${st === "out" ? "text-over" : st === "low" ? "text-warn" : "text-mute"}`}>
                    {st === "out" ? "Out of stock" : `${m.onHand} left`}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
