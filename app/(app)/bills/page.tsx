import Link from "next/link";
import { Banknote, CreditCard, Search, Smartphone, type LucideIcon } from "lucide-react";
import { requireUser } from "@/lib/session";
import { ActionForm } from "@/components/action-form";
import { DialogButton } from "@/components/dialog-button";
import { listStations, listZones } from "@/lib/db/catalog";
import { searchCustomers } from "@/lib/db/customers";
import { addPastBillAction } from "./actions";
import { countBills, listBills } from "@/lib/db/bills";
import { Pagination } from "@/components/pagination";
import { LiveFilters } from "@/components/live-filters";
import { clampPage, parsePageSize } from "@/lib/pagination";
import { hasFilter, parseBillFilter } from "@/lib/bills-filter";
import type { PaymentMethod } from "@/lib/engine/bill";
import { dateTime, invoiceNo, rupees } from "@/lib/format";
import { btnCls, btnPrimaryCls, cardCls, inputCls, labelCls } from "@/lib/ui";

const METHOD: Record<PaymentMethod, { label: string; icon: LucideIcon }> = {
  cash: { label: "Cash", icon: Banknote },
  upi: { label: "UPI", icon: Smartphone },
  card: { label: "Card", icon: CreditCard },
};

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function BillsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const me = await requireUser();
  const params = await searchParams;
  const filter = parseBillFilter(params);
  const size = parsePageSize(one(params.size));
  const total = countBills(filter); // the search always looks through every bill; only the list is cut into pages
  const page = clampPage(one(params.page), total, size);
  const bills = listBills(size, (page - 1) * size, filter);

  // Paging keeps whatever the person searched for.
  const keep = new URLSearchParams();
  for (const k of ["q", "method", "status", "from", "to"]) if (one(params[k])) keep.set(k, one(params[k]));
  const href = (p: number, s: number) => `/bills?${new URLSearchParams([...keep, ["size", String(s)], ["page", String(p)]]).toString()}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold tracking-wide">Bills</h1>
        {me.role === "owner" && <PastBill />}
      </div>

      <LiveFilters action="/bills" className={`${cardCls} flex flex-wrap items-end gap-x-4 gap-y-3 p-4`}>
        <input type="hidden" name="size" value={size} />
        <div className="min-w-60 flex-1">
          <label className={labelCls} htmlFor="q">Search</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-mute" aria-hidden />
            <input id="q" name="q" type="search" defaultValue={one(params.q)} placeholder="Invoice no., station or customer, e.g. 12 or PS5 1" className={`${inputCls} pl-9`} />
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="method">Paid by</label>
          <select id="method" name="method" defaultValue={filter.method ?? ""} className={`${inputCls} !w-36`}>
            <option value="">Any method</option>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={filter.status ?? ""} className={`${inputCls} !w-32`}>
            <option value="">All</option>
            <option value="paid">Paid</option>
            <option value="void">Invalid</option>
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="from">From date</label>
          <input id="from" name="from" type="date" defaultValue={one(params.from)} className={`${inputCls} !w-40`} />
        </div>
        <div>
          <label className={labelCls} htmlFor="to">To date</label>
          <input id="to" name="to" type="date" defaultValue={one(params.to)} className={`${inputCls} !w-40`} />
        </div>
        <div className="flex gap-2">
          {hasFilter(filter) && <Link href={`/bills?size=${size}`} className={btnCls}>Clear</Link>}
        </div>
      </LiveFilters>

      {bills.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-10 text-center text-mute">
          {hasFilter(filter) ? "No bills match this search. Try fewer filters." : "No bills yet. They appear here once a session is paid."}
        </p>
      ) : (
        <div className={`${cardCls} overflow-x-auto`}>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-mute">
              <tr className="border-b border-line">
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Station</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Paid by</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {bills.map((b) => (
                <tr key={b.id} className="hover:bg-raised/60">
                  <td className="px-4 py-3 font-semibold"><Link className="text-brand-text hover:underline" href={`/bills/${b.id}`}>{invoiceNo(b.invoiceNo)}</Link>{b.byHand && <span className="ml-2 rounded-full bg-raised px-2 py-0.5 text-[11px] font-medium text-mute">Added by hand</span>}</td>
                  <td className="px-4 py-3 text-silver">{dateTime(b.createdAt)}</td>
                  <td className="px-4 py-3">{b.stationName ?? "Counter sale"}</td>
                  <td className="px-4 py-3">{b.customerName ?? "Walk-in"}</td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap gap-1.5">
                      {b.methods.map((m) => {
                        const { label, icon: Icon } = METHOD[m];
                        return (
                          <span key={m} className="inline-flex items-center gap-1 rounded-full bg-raised px-2.5 py-0.5 text-xs font-medium text-silver">
                            <Icon className="size-3.5" aria-hidden />{label}
                          </span>
                        );
                      })}
                    </span>
                  </td>
                  <td className="tnum px-4 py-3 text-right font-semibold">{rupees(b.totalPaise)}</td>
                  <td className="px-4 py-3">{b.status === "void" ? <span className="rounded-full bg-over/15 px-2 py-0.5 text-xs text-over">Invalid</span> : <span className="rounded-full bg-free/15 px-2 py-0.5 text-xs text-free">Paid</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageSize={size} total={total} href={href} />
    </div>
  );
}

/** Owner only: type in a bill for a visit that was paid before the app was used. */
function PastBill() {
  const zones = new Map(listZones().map((z) => [z.id, z.name]));
  const stations = listStations();
  const customers = searchCustomers("", 500);
  const now = new Date();
  const max = `${now.toLocaleDateString("en-CA")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`; // "yyyy-mm-ddThh:mm", the latest a visit can start
  return (
    <DialogButton label="Add past bill" title="Add a bill from before the app">
      <ActionForm action={addPastBillAction} success="Bill added" resetOnSuccess className="flex flex-col gap-4">
        <p className="text-sm text-mute">
          For a visit that was already paid before you started using the app. It becomes a normal paid bill in your records, reports and the station&apos;s hours, and shows as &quot;Added by hand&quot;. If you make a mistake, mark it invalid from its invoice page.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="pbWhen">When did they start?</label>
            <input id="pbWhen" name="startedAt" type="datetime-local" required max={max} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="pbMin">Minutes played</label>
            <input id="pbMin" name="minutes" required inputMode="numeric" placeholder="e.g. 90" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="pbStation">Station</label>
            <select id="pbStation" name="station" required defaultValue="" className={inputCls}>
              <option value="" disabled>Choose a station</option>
              {stations.map((s) => <option key={s.id} value={s.id}>{s.name} ({zones.get(s.zoneId) ?? ""})</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="pbMethod">Paid by</label>
            <select id="pbMethod" name="method" defaultValue="cash" className={inputCls}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="pbTime">Paid for playing time (₹)</label>
            <input id="pbTime" name="timeAmount" inputMode="decimal" placeholder="e.g. 225" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="pbExtras">Paid for food and extras (₹)</label>
            <input id="pbExtras" name="extrasAmount" inputMode="decimal" placeholder="optional, e.g. 80" className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="pbCust">Customer (optional)</label>
          <select id="pbCust" name="customer" defaultValue="" className={inputCls}>
            <option value="">Walk-in</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="pbNote">Note (optional)</label>
          <input id="pbNote" name="note" maxLength={500} placeholder="e.g. from the paper register" className={inputCls} />
        </div>
        <button className={`${btnPrimaryCls} w-fit`}>Add bill</button>
      </ActionForm>
    </DialogButton>
  );
}
