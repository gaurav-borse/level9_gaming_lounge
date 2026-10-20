import { FileSpreadsheet } from "lucide-react";
import { btnPrimaryCls, cardCls, inputCls, labelCls } from "@/lib/ui";

/** One download with everything: a plain GET form, so the browser saves the file without leaving the page. */
export function ExportTab() {
  return (
    <form method="get" action="/api/export" className={`${cardCls} flex flex-col gap-5 p-6`}>
      <div>
        <h2 className="font-display text-xl font-semibold">Export everything to Excel</h2>
        <p className="mt-2 max-w-prose text-sm text-mute">
          One Excel file with these sheets: <b>Bills</b>, <b>Items</b> (what each bill contained), <b>Customers</b>, <b>Stock</b> and <b>Expenses</b> (plus <b>Investments</b> and <b>Returns</b> once you have added investments).
          Customers and stock are always complete. Pick dates to limit the bills and expenses; leave them empty for everything.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={labelCls} htmlFor="exFrom">From date</label>
          <input id="exFrom" name="from" type="date" className={`${inputCls} w-40!`} />
        </div>
        <div>
          <label className={labelCls} htmlFor="exTo">Until date</label>
          <input id="exTo" name="to" type="date" className={`${inputCls} w-40!`} />
        </div>
        <button className={btnPrimaryCls}><FileSpreadsheet className="size-4" aria-hidden /> Export to Excel</button>
      </div>
    </form>
  );
}
