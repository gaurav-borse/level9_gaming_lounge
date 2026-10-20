import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listStock, stockHistory } from "@/lib/db/menu";
import { sortByStockStatus, stockStatus } from "@/lib/stock";
import { StockRow } from "@/components/menu/StockRow";
import { MenuTab } from "./MenuTab";

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireUser();
  const tab = (await searchParams).tab === "menu" && me.role === "owner" ? "menu" : "stock";
  const tabs = [{ id: "stock", label: "Stock" }, ...(me.role === "owner" ? [{ id: "menu", label: "Menu" }] : [])];

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold tracking-wide">Menu &amp; stock</h1>
      {tabs.length > 1 && (
        <nav aria-label="Menu sections" className="flex gap-1 border-b border-line">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={`/menu?tab=${t.id}`}
              aria-current={tab === t.id ? "page" : undefined}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition ${tab === t.id ? "border-brand text-ink" : "border-transparent text-mute hover:text-ink"}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      )}
      {tab === "menu" ? <MenuTab /> : <StockTab role={me.role} />}
    </div>
  );
}

function StockTab({ role }: { role: "owner" | "staff" }) {
  const items = sortByStockStatus(listStock().map((m) => ({ ...m, status: stockStatus(m.trackStock, m.onHand) })));
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line p-10 text-center text-mute">
        There are no items yet. {role === "owner" ? "Open the Menu tab and add items: they show up here automatically." : "Ask the owner to add items to the menu."}
      </p>
    );
  }
  return (
    <ul className="grid items-start gap-3 xl:grid-cols-2">
      {items.map((m) => (
        <StockRow key={m.id} id={m.id} name={m.name} category={m.categoryName} onHand={m.onHand ?? 0} history={stockHistory(m.id, 10)} role={role} />
      ))}
    </ul>
  );
}
