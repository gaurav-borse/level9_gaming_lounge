import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getCustomer } from "@/lib/db/customers";
import { countBills, listBills } from "@/lib/db/bills";
import { Pagination } from "@/components/pagination";
import { clampPage, parsePageSize } from "@/lib/pagination";
import { ActionForm } from "@/components/action-form";
import { dateTime, invoiceNo, rupees } from "@/lib/format";
import { displayPhone } from "@/lib/phone";
import { btnCls, btnPrimaryCls, cardCls, inputCls, labelCls } from "@/lib/ui";
import { updateCustomerAction } from "../actions";

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className={`${cardCls} px-5 py-4`}>
    <p className="text-xs uppercase tracking-wider text-mute">{label}</p>
    <p className="tnum mt-1 font-display text-2xl font-semibold">{value}</p>
  </div>
);

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string; size?: string }> }) {
  await requireUser();
  const c = getCustomer(Number((await params).id));
  if (!c) notFound();
  const total = countBills({ customerId: c.id });
  const query = await searchParams;
  const size = parsePageSize(query.size);
  const page = clampPage(query.page, total, size);
  const bills = listBills(size, (page - 1) * size, { customerId: c.id });
  return (
    <div className="space-y-6">
      <Link href="/customers" className={`${btnCls} w-fit`}><ArrowLeft className="size-4" aria-hidden /> All customers</Link>
      <div>
        <h1 className="font-display text-3xl font-bold tracking-wide">{c.name}</h1>
        <p className="mt-1 text-sm text-mute">{c.phone ? displayPhone(c.phone) : "No phone saved"} · customer since {dateTime(c.createdAt)}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Visits" value={String(c.visits)} />
        <Stat label="Total spent" value={rupees(c.spentPaise)} />
        <Stat label="Last visit" value={c.lastVisit ? dateTime(c.lastVisit) : "Never"} />
      </div>

      <ActionForm action={updateCustomerAction} success="Customer saved" className={`${cardCls} grid gap-4 p-5 sm:grid-cols-2`}>
        <input type="hidden" name="id" value={c.id} />
        <div>
          <label className={labelCls} htmlFor="n">Name</label>
          <input id="n" name="name" required maxLength={80} defaultValue={c.name} placeholder="Name, e.g. Asha Rao" className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="p">Phone</label>
          <input id="p" name="phone" maxLength={30} inputMode="tel" defaultValue={c.phone ? displayPhone(c.phone) : ""} placeholder="Phone, e.g. 98765 43210" className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="nt">Notes</label>
          <textarea id="nt" name="notes" rows={3} maxLength={500} defaultValue={c.notes} placeholder="Anything worth remembering, e.g. prefers PS5, birthday in March" className={inputCls} />
        </div>
        <button className={`${btnPrimaryCls} w-fit`}>Save changes</button>
      </ActionForm>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Bills</h2>
        {bills.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-8 text-center text-mute">No bills for this customer yet.</p>
        ) : (
          <div className={`${cardCls} overflow-x-auto`}>
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-mute">
                <tr className="border-b border-line">
                  <th className="px-4 py-3 font-medium">Invoice</th><th className="px-4 py-3 font-medium">When</th><th className="px-4 py-3 font-medium">Station</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th><th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {bills.map((b) => (
                  <tr key={b.id} className="hover:bg-raised/60">
                    <td className="px-4 py-3 font-semibold"><Link className="text-brand-text hover:underline" href={`/bills/${b.id}`}>{invoiceNo(b.invoiceNo)}</Link></td>
                    <td className="px-4 py-3 text-silver">{dateTime(b.createdAt)}</td>
                    <td className="px-4 py-3">{b.stationName ?? "Counter sale"}</td>
                    <td className="tnum px-4 py-3 text-right font-semibold">{rupees(b.totalPaise)}</td>
                    <td className="px-4 py-3">{b.status === "void" ? <span className="rounded-full bg-over/15 px-2 py-0.5 text-xs text-over">Void</span> : <span className="rounded-full bg-free/15 px-2 py-0.5 text-xs text-free">Paid</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={size} total={total} href={(p, s) => `/customers/${c.id}?size=${s}&page=${p}`} />
      </section>
    </div>
  );
}
