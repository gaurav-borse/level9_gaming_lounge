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
          <button type="button" className={btnDangerCls} onClick={() => setOpen(true)}><Ban className="size-4" /> Void bill</button>
          <Modal open={open} onClose={() => setOpen(false)} title="Void this bill?">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                call(() => voidBillAction(billId, reason), { ok: "Bill voided", onOk: () => setOpen(false) });
              }}
            >
              <p className="text-sm text-silver">The bill stays in your records marked void. This can&apos;t be undone.</p>
              <div>
                <label htmlFor="vr" className={labelCls}>Reason</label>
                <input id="vr" required placeholder="Why is this bill being voided? e.g. wrong item" className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <button disabled={pending} className={btnPrimaryCls}>Void bill</button>
            </form>
          </Modal>
        </>
      )}
    </div>
  );
}
