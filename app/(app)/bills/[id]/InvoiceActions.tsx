"use client";
import { useState } from "react";
import { FileDown, Ban } from "lucide-react";
import { Modal } from "@/components/modal";
import { useCall } from "@/lib/useCall";
import { voidBillAction } from "@/app/(app)/actions";
import { btnCls, btnDangerCls, btnPrimaryCls, inputCls, labelCls } from "@/lib/ui";

export function InvoiceActions({ billId, canVoid }: { billId: number; canVoid: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { call, pending } = useCall();
  return (
    <div className="flex gap-2">
      <button type="button" className={btnCls} onClick={() => window.print()}><FileDown className="size-4" /> Save as PDF</button>
      {canVoid && (
        <>
          <button type="button" className={btnDangerCls} onClick={() => setOpen(true)}><Ban className="size-4" /> Mark as invalid</button>
          <Modal open={open} onClose={() => setOpen(false)} title="Mark this bill as invalid?">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                call(() => voidBillAction(billId, reason), { ok: "Bill marked invalid", onOk: () => setOpen(false) });
              }}
            >
              <p className="text-sm text-silver">The bill stays in your records, marked invalid, and is left out of every report and total. Stock it used is put back. This can&apos;t be undone.</p>
              <div>
                <label htmlFor="vr" className={labelCls}>Reason</label>
                <input id="vr" required placeholder="Why is it invalid? e.g. session started by mistake" className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <button disabled={pending} className={btnPrimaryCls}>Mark as invalid</button>
            </form>
          </Modal>
        </>
      )}
    </div>
  );
}
