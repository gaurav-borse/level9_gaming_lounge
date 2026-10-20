import { Coins, Hash, Tags } from "lucide-react";
import type { Report } from "@/lib/db/reports";
import { EXPENSE_CATEGORIES } from "@/lib/db/expenses";
import { listStations } from "@/lib/db/catalog";
import { rupeesExact, rupeesShort } from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import { DialogButton } from "@/components/dialog-button";
import { DeleteButton } from "@/components/menu/DeleteButton";
import { Breakdown, Panel } from "@/components/reports/Charts";
import { Donut, ShowNumbers, foldSlices } from "@/components/reports/Visuals";
import { btnPrimaryCls, cardCls, inputCls, labelCls } from "@/lib/ui";
import { addExpenseAction, deleteExpenseAction } from "./actions";

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Coins; label: string; value: string; hint?: string }) {
  return (
    <div className={`${cardCls} flex items-start gap-4 p-5`}>
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-bg text-brand-text"><Icon className="size-5" aria-hidden /></span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-mute">{label}</p>
        <p className="tnum mt-0.5 truncate font-display text-2xl font-semibold">{value}</p>
        {hint && <p className="mt-1 truncate text-xs text-mute">{hint}</p>}
      </div>
    </div>
  );
}

export function ExpensesTab({ r }: { r: Report }) {
  const today = new Date().toLocaleDateString("en-CA"); // yyyy-mm-dd, the lounge's own date
  const top = r.expenseByCategory[0];
  const stations = listStations();
  return (
    <div className="space-y-6">
      <div className="no-print flex justify-end">
        <DialogButton label="Add expense" title="Add an expense">
          <ActionForm action={addExpenseAction} success="Expense added" resetOnSuccess className="flex flex-col gap-4">
            <p className="text-sm text-mute">Money you spent running the lounge. It is taken off the takings to give net profit.</p>
            <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="exd">Date</label>
              <input id="exd" name="day" type="date" required defaultValue={today} className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="exc">Category</label>
              <select id="exc" name="category" defaultValue="Rent" className={inputCls}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="exa">Amount (₹)</label>
              <input id="exa" name="amount" required inputMode="decimal" placeholder="e.g. 2500" className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="exs">Belongs to (optional)</label>
              <select id="exs" name="station" defaultValue="" className={inputCls}>
                <option value="">Shared: the whole lounge</option>
                {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="exn">Note (optional)</label>
              <input id="exn" name="note" maxLength={200} placeholder="e.g. October rent" className={inputCls} />
            </div>
          </div>
            <button className={btnPrimaryCls}>Add expense</button>
          </ActionForm>
        </DialogButton>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={Coins} label="Spent in this period" value={rupeesExact(r.expensesPaise)} hint={`Net profit ${rupeesExact(r.netPaise)}`} />
        <Stat icon={Hash} label="Entries" value={String(r.expenses.length)} hint={r.expenses.length ? `Average ${rupeesExact(Math.round(r.expensesPaise / r.expenses.length))}` : "None yet"} />
        <Stat icon={Tags} label="Biggest category" value={top ? top.category : "—"} hint={top ? rupeesExact(top.paise) : undefined} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[2fr_3fr]">
        <Panel title="By category" note="Where the money went">
          <Donut name="Expenses by category" center={rupeesShort(r.expensesPaise)} centerLabel="spent" slices={foldSlices(r.expenseByCategory.map((c) => ({ label: c.category, value: c.paise })))} />
          {r.expenseByCategory.length > 0 && (
            <ShowNumbers>
              <Breakdown countLabel="Entries" rows={r.expenseByCategory.map((c) => ({ label: c.category, paise: c.paise, count: c.count }))} total={r.expensesPaise} />
            </ShowNumbers>
          )}
        </Panel>
        <section className={`${cardCls} overflow-x-auto`}>
        <h2 className="px-5 pt-5 font-display text-lg font-semibold">Expenses in this period</h2>
        {r.expenses.length === 0 ? (
          <p className="px-5 pb-5 pt-2 text-sm text-mute">None. Add the first one above, or pick a longer period.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-mute">
              <tr className="border-y border-line">
                <th className="px-5 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Category</th><th className="px-4 py-3 font-medium">Belongs to</th><th className="px-4 py-3 font-medium">Note</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th><th className="no-print px-4 py-3"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.expenses.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-5 py-3 text-silver">{new Date(`${e.day}T00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-raised px-2.5 py-0.5 text-xs font-medium text-silver">{e.category}</span></td>
                  <td className="px-4 py-3 text-silver">{e.stationName ?? "Shared"}</td>
                  <td className="px-4 py-3 text-silver">{e.note}</td>
                  <td className="tnum px-4 py-3 text-right font-semibold">{rupeesExact(e.amountPaise)}</td>
                  <td className="no-print px-4 py-3 text-right">
                    <ActionForm action={deleteExpenseAction} success="Expense removed">
                      <input type="hidden" name="id" value={e.id} />
                      <DeleteButton icon label={`Remove ${e.category} expense of ${rupeesExact(e.amountPaise)}`} confirmText={`Remove this expense (${e.category}, ${rupeesExact(e.amountPaise)}, ${e.day})?`} />
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line font-semibold">
                <td className="px-5 py-3" colSpan={4}>Total</td>
                <td className="tnum px-4 py-3 text-right">{rupeesExact(r.expensesPaise)}</td><td className="no-print" />
              </tr>
            </tfoot>
          </table>
        )}
        </section>
      </div>

    </div>
  );
}
