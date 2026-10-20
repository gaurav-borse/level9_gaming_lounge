import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getBill } from "@/lib/db/bills";
import { getSettings } from "@/lib/db/settings";
import { dateTime, invoiceNo, rupees } from "@/lib/format";
import { btnCls } from "@/lib/ui";
import { InvoiceActions } from "./InvoiceActions";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const bill = /^\d+$/.test(id) ? getBill(Number(id)) : undefined;
  if (!bill) notFound();
  const cafe = getSettings();
  const gst = bill.lines.some((l) => l.taxPct > 0);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="no-print flex items-center justify-between">
        <Link href="/bills" className={btnCls}><ArrowLeft className="size-4" /> Bills</Link>
        <InvoiceActions billId={bill.id} canVoid={me.role === "owner" && bill.status === "paid"} />
      </div>

      <article className="rounded-2xl border border-line bg-panel p-8 print:border-0 print:p-0">
        {bill.status === "void" && (
          <div className="mb-5 rounded-lg border border-over/50 bg-over/10 px-4 py-3 text-sm text-over">
            <b>VOID</b> · {bill.voidReason}
          </div>
        )}
        <header className="flex items-start justify-between gap-6 border-b border-line pb-5">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-wide">{cafe["cafe.name"]}</h1>
            {cafe["cafe.address"] && <p className="mt-1 max-w-xs text-sm text-silver">{cafe["cafe.address"]}</p>}
            {cafe["cafe.phone"] && <p className="text-sm text-silver">{cafe["cafe.phone"]}</p>}
            {gst && cafe["cafe.gstin"] && <p className="text-sm text-silver">GSTIN {cafe["cafe.gstin"]}</p>}
          </div>
          <div className="text-right text-sm">
            <div className="font-display text-xl font-bold">{invoiceNo(bill.invoiceNo)}</div>
            <div className="text-silver">{dateTime(bill.createdAt)}</div>
            <div className="text-silver">{bill.customerName ?? "Walk-in"}</div>
          </div>
        </header>

        <table className="mt-5 w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-mute">
            <tr><th className="pb-2 font-medium">Item</th><th className="pb-2 text-right font-medium">Qty</th><th className="pb-2 text-right font-medium">Price</th><th className="pb-2 text-right font-medium">Amount</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {bill.lines.map((l, i) => (
              <tr key={i}>
                <td className="py-2">{l.name}</td>
                <td className="tnum py-2 text-right">{l.qty}</td>
                <td className="tnum py-2 text-right">{rupees(l.unitPaise)}</td>
                <td className="tnum py-2 text-right">{rupees(l.qty * l.unitPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ml-auto mt-5 w-64 space-y-1 text-sm">
          <div className="flex justify-between text-silver"><dt>Subtotal</dt><dd className="tnum">{rupees(bill.subtotalPaise)}</dd></div>
          {bill.discountPaise > 0 && <div className="flex justify-between text-silver"><dt>Discount ({bill.discountReason})</dt><dd className="tnum">−{rupees(bill.discountPaise)}</dd></div>}
          {bill.taxPaise > 0 && <div className="flex justify-between text-silver"><dt>Includes GST</dt><dd className="tnum">{rupees(bill.taxPaise)}</dd></div>}
          <div className="flex justify-between border-t border-line pt-2 font-display text-2xl font-bold"><dt>Total</dt><dd className="tnum">{rupees(bill.totalPaise)}</dd></div>
        </dl>

        <p className="mt-6 text-xs uppercase tracking-wider text-mute">Paid by {bill.payments.map((p) => `${p.method.toUpperCase()} ${rupees(p.amountPaise)}`).join(" · ") || "—"}</p>
        <p className="mt-6 text-center text-sm text-silver">Thank you for playing at {cafe["cafe.name"]}!</p>
      </article>
    </div>
  );
}
