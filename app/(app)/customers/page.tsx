import Link from "next/link";
import { Search } from "lucide-react";
import { requireUser } from "@/lib/session";
import { countCustomers, listCustomers } from "@/lib/db/customers";
import { Pagination } from "@/components/pagination";
import { LiveFilters } from "@/components/live-filters";
import { DialogButton } from "@/components/dialog-button";
import { clampPage, parsePageSize } from "@/lib/pagination";
import { ActionForm } from "@/components/action-form";
import { dateTime, rupees } from "@/lib/format";
import { displayPhone } from "@/lib/phone";
import { btnCls, btnPrimaryCls, cardCls, inputCls, labelCls } from "@/lib/ui";
import { addCustomerAction } from "./actions";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; size?: string }> }) {
  await requireUser();
  const params = await searchParams;
  const q = (params.q ?? "").slice(0, 60);
  const size = parsePageSize(params.size);
  const total = countCustomers(q); // a search looks through every customer, not just the ones on this page
  const page = clampPage(params.page, total, size);
  const rows = listCustomers(q, size, (page - 1) * size);
  const href = (p: number, s: number) => `/customers?${new URLSearchParams({ ...(q ? { q } : {}), size: String(s), page: String(p) }).toString()}`;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold tracking-wide">Customers</h1>
        <DialogButton label="Add customer" title="Add a customer">
          <ActionForm action={addCustomerAction} success="Customer added" resetOnSuccess className="flex flex-col gap-4">
            <div>
              <label className={labelCls} htmlFor="cn">Name</label>
              <input id="cn" name="name" required maxLength={80} placeholder="Name, e.g. Asha Rao" className={inputCls} autoFocus />
            </div>
            <div>
              <label className={labelCls} htmlFor="cp">Phone (optional)</label>
              <input id="cp" name="phone" maxLength={30} inputMode="tel" placeholder="Phone, e.g. 98765 43210" className={inputCls} />
            </div>
            <button className={btnPrimaryCls}>Add customer</button>
          </ActionForm>
        </DialogButton>
      </div>

      <LiveFilters action="/customers" className={`${cardCls} p-4`}>
        <input type="hidden" name="size" value={size} />
        <label className={labelCls} htmlFor="q">Find a customer</label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-mute" aria-hidden />
            <input id="q" name="q" type="search" defaultValue={q} placeholder="Name or phone, e.g. Asha or 98765" className={`${inputCls} pl-9`} />
          </div>
          {q && <Link href={`/customers?size=${size}`} className={btnCls}>Clear</Link>}
        </div>
      </LiveFilters>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-10 text-center text-mute">
          {q ? "Nobody matches this search." : "No customers yet. Add one above, or while starting a session."}
        </p>
      ) : (
        <div className={`${cardCls} overflow-x-auto`}>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-mute">
              <tr className="border-b border-line">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 text-right font-medium">Visits</th>
                <th className="px-4 py-3 text-right font-medium">Spent</th>
                <th className="px-4 py-3 font-medium">Last visit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-raised/60">
                  <td className="px-4 py-3 font-semibold"><Link className="text-brand-text hover:underline" href={`/customers/${c.id}`}>{c.name}</Link></td>
                  <td className="px-4 py-3 text-silver">{c.phone ? displayPhone(c.phone) : "—"}</td>
                  <td className="tnum px-4 py-3 text-right">{c.visits}</td>
                  <td className="tnum px-4 py-3 text-right font-semibold">{rupees(c.spentPaise)}</td>
                  <td className="px-4 py-3 text-silver">{c.lastVisit ? dateTime(c.lastVisit) : "Never"}</td>
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
