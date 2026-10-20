import { ActionForm } from "@/components/action-form";
import { DeleteButton } from "@/components/menu/DeleteButton";
import { ItemIcon } from "@/components/menu/ItemIcon";
import { listCategories, listMenu } from "@/lib/db/menu";
import { btnCls, btnPrimaryCls, cardCls, inputCls, labelCls } from "@/lib/ui";
import { deleteCategoryAction, deleteItemAction, saveCategoryAction, saveItemAction } from "./actions";

/** Owner only. A category groups items (Drinks, Snacks…); each item has a name and a price. Everything added here is counted in Stock automatically. */
export function MenuTab() {
  const categories = listCategories();
  const items = listMenu();

  return (
    <div className="space-y-6">
      <p className="text-sm text-silver">
        Add a <b>category</b> (like Drinks or Snacks), then add <b>items</b> with their price inside it. Staff pick from this menu when adding food to a session or making a counter sale.
        Every item is counted in the Stock tab straight away.
      </p>

      <ActionForm action={saveCategoryAction} success="Category added" resetOnSuccess className={`${cardCls} flex flex-wrap items-end gap-3 p-4`}>
        <div>
          <label htmlFor="newcat" className={labelCls}>Add a category</label>
          <input id="newcat" name="name" required maxLength={60} placeholder="Category name, e.g. Drinks" className={`${inputCls} w-64!`} />
        </div>
        <button className={btnPrimaryCls}>Add category</button>
      </ActionForm>

      {categories.length === 0 && <p className="rounded-xl border border-dashed border-line p-8 text-center text-mute">No categories yet. Add your first one above.</p>}

      <div className="grid items-start gap-6 xl:grid-cols-2">
      {categories.map((c) => {
        const mine = items.filter((m) => m.categoryId === c.id);
        return (
          <section key={c.id} className={`${cardCls} overflow-hidden`}>
            <header className="flex flex-wrap items-center gap-3 border-b border-line bg-panel-deep px-5 py-4">
              <ActionForm action={saveCategoryAction} success="Category saved" className="flex flex-1 flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={c.id} />
                <input name="name" required maxLength={60} aria-label="Category name" placeholder="Category name, e.g. Drinks" defaultValue={c.name} className={`${inputCls} w-56! font-semibold`} />
                <button className={btnCls}>Save</button>
                <span className="text-sm text-mute">{mine.length} {mine.length === 1 ? "item" : "items"}</span>
              </ActionForm>
              <ActionForm action={deleteCategoryAction} success="Category deleted">
                <input type="hidden" name="id" value={c.id} />
                <DeleteButton label="Delete category" confirmText={`Delete "${c.name}"${mine.length ? ` and its ${mine.length} ${mine.length === 1 ? "item" : "items"}` : ""}? Past bills keep their history.`} />
              </ActionForm>
            </header>

            <div className="space-y-3 p-5">
              {mine.length > 0 && (
                <div className="grid grid-cols-[3rem_minmax(0,1fr)_9rem_auto] items-center gap-x-3 px-1 text-xs font-medium uppercase tracking-wider text-mute max-sm:hidden">
                  <span /><span>Item</span><span>Price (₹)</span><span className="w-32" />
                </div>
              )}
              <ul className="space-y-2">
                {mine.map((m) => (
                  <li key={m.id} className="flex items-center gap-2">
                    <ActionForm action={saveItemAction} success="Item saved" className="grid min-w-0 flex-1 grid-cols-[3rem_minmax(0,1fr)_9rem_auto] items-center gap-x-3 gap-y-2 max-sm:grid-cols-[3rem_minmax(0,1fr)_auto]">
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="categoryId" value={c.id} />
                      <span className="grid size-12 place-items-center rounded-xl bg-bg text-brand-text"><ItemIcon name={m.name} /></span>
                      <input name="name" required maxLength={60} aria-label="Item name" placeholder="Item name, e.g. Coke" defaultValue={m.name} className={inputCls} />
                      <input name="price" required inputMode="decimal" aria-label="Price in rupees" placeholder="Price in ₹, e.g. 40" defaultValue={(m.pricePaise / 100).toFixed(m.pricePaise % 100 === 0 ? 0 : 2)} className={`${inputCls} max-sm:col-start-2`} />
                      <button className={btnCls}>Save</button>
                    </ActionForm>
                    <ActionForm action={deleteItemAction} success="Item deleted">
                      <input type="hidden" name="id" value={m.id} />
                      <DeleteButton icon label={`Delete ${m.name}`} confirmText={`Delete "${m.name}"? Past bills keep their history.`} />
                    </ActionForm>
                  </li>
                ))}
              </ul>

              <ActionForm action={saveItemAction} success="Item added" resetOnSuccess className="flex flex-wrap items-center gap-3 border-t border-dashed border-line pt-4">
                <input type="hidden" name="categoryId" value={c.id} />
                <input name="name" required maxLength={60} aria-label={`New item in ${c.name}`} placeholder="New item name, e.g. Coke" className={`${inputCls} w-64!`} />
                <input name="price" required inputMode="decimal" aria-label="Price in rupees" placeholder="Price in ₹, e.g. 40" className={`${inputCls} w-44!`} />
                <button className={btnPrimaryCls}>Add item</button>
              </ActionForm>
            </div>
          </section>
        );
      })}
      </div>

      <p className="text-sm text-mute">
        New items start at zero stock: add stock in the Stock tab. You get a low-stock warning at 5 or fewer. GST is the lounge rate from Settings. A price change only affects items added afterwards.
      </p>
    </div>
  );
}
