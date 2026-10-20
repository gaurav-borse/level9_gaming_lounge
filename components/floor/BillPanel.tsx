"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { counterSaleAction, finalizeBillAction, getCounterDraftAction, getDraftAction } from "@/app/(app)/actions";
import { useCall } from "@/lib/useCall";
import { useToast } from "@/components/toast";
import { UpiQr } from "@/components/upi-qr";
import { computeBill } from "@/lib/engine/bill";
import type { BillLineInput, Discount } from "@/lib/engine/bill";
import { upiLink } from "@/lib/engine/upi";
import { parsePercent, rupeesToPaise } from "@/lib/validate";
import { rupees } from "@/lib/format";
import { btnCls, btnPrimaryCls, inputCls, labelCls } from "@/lib/ui";

type Draft = { lines: BillLineInput[]; advancePaise: number; advanceMethod: string | null; maxStaffDiscountPct: number };
type Row = { method: string; rupees: string };

const safePaise = (v: string): number | null => {
  try {
    return rupeesToPaise(v, "Amount");
  } catch {
    return null;
  }
};

/** Pays a stopped session (sessionId) or a counter sale (counterLines: menu items picked with no session). */
export function BillPanel({ sessionId, counterLines, cafeName, upiId, role, onPaid }: {
  sessionId?: number;
  counterLines?: { itemId: number; qty: number }[];
  cafeName: string;
  upiId: string;
  role: "owner" | "staff";
  onPaid: (billId: number) => void;
}) {
  const toast = useToast();
  const { call, pending } = useCall();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dType, setDType] = useState<"none" | "flat" | "percent">("none");
  const [dValue, setDValue] = useState("");
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState<Row[]>([{ method: "cash", rupees: "" }]);
  const [touched, setTouched] = useState(false);
  const counterKey = counterLines ? JSON.stringify(counterLines) : null;

  useEffect(() => {
    let live = true;
    const load = counterKey ? getCounterDraftAction(JSON.parse(counterKey)) : getDraftAction(sessionId as number);
    load.then((r) => {
      if (!live) return;
      if (r.ok) setDraft(r.data as Draft);
      else toast("err", r.error);
    });
    return () => {
      live = false;
    };
  }, [sessionId, counterKey, toast]);

  const discount: Discount = useMemo(() => {
    if (dType === "none" || !dValue.trim()) return null;
    if (dType === "flat") {
      const p = safePaise(dValue);
      return p === null ? null : { type: "flat", value: p };
    }
    const n = parsePercent(dValue); // the same rule the server applies, so the preview is the bill that gets saved
    return n === null ? null : { type: "percent", value: n };
  }, [dType, dValue]);

  const totals = useMemo(() => (draft ? computeBill(draft.lines, discount) : null), [draft, discount]);
  if (!draft || !totals) return <p className="text-sm text-mute">Calculating bill…</p>;

  const advanceApplied = draft.advanceMethod ? Math.min(draft.advancePaise, totals.totalPaise) : 0;
  const refund = draft.advancePaise - advanceApplied;
  const due = totals.totalPaise - advanceApplied;

  // Until staff edit anything, a single payment row simply follows the amount due.
  const shown: Row[] = !touched && rows.length === 1 ? (due > 0 ? [{ method: rows[0].method, rupees: (due / 100).toFixed(2) }] : []) : rows;
  const paidNow = shown.reduce((a, r) => a + (safePaise(r.rupees) ?? 0), 0);
  const remaining = due - paidNow;

  const edit = (i: number, patch: Partial<Row>) => {
    const base = !touched && rows.length === 1 ? (shown.length ? shown : rows) : rows;
    setTouched(true);
    setRows(base.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  const upiRow = shown.find((r) => r.method === "upi" && (safePaise(r.rupees) ?? 0) > 0);
  let qr: string | null = null;
  if (upiRow && upiId) {
    try {
      qr = upiLink({ upiId, name: cafeName, amountPaise: safePaise(upiRow.rupees)!, note: counterKey ? "Counter sale" : "Gaming session" });
    } catch {
      qr = null;
    }
  }

  return (
    <div className="space-y-5">
      <ul className="divide-y divide-line rounded-lg border border-line text-sm">
        {draft.lines.map((l, i) => (
          <li key={i} className="flex justify-between gap-3 px-3 py-2">
            <span>{l.qty > 1 ? `${l.qty} × ` : ""}{l.name}</span>
            <span className="tnum">{rupees(l.qty * l.unitPaise)}</span>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2">
        <div>
          <label className={labelCls} htmlFor="dt">Discount</label>
          <select id="dt" className={inputCls} value={dType} onChange={(e) => setDType(e.target.value as typeof dType)}>
            <option value="none">None</option>
            <option value="flat">₹ off</option>
            <option value="percent">% off</option>
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="dv">Value</label>
          <input id="dv" className={inputCls} inputMode="decimal" placeholder={dType === "percent" ? "e.g. 10" : "e.g. 50"} disabled={dType === "none"} value={dValue} onChange={(e) => setDValue(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="dr">Reason</label>
          <input id="dr" className={inputCls} disabled={dType === "none"} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. regular" />
        </div>
      </div>
      {role === "staff" && dType !== "none" && <p className="-mt-3 text-xs text-mute">Staff can give up to {draft.maxStaffDiscountPct}%. More needs the owner.</p>}

      <dl className="space-y-1 text-sm">
        <div className="flex justify-between text-mute"><dt>Subtotal</dt><dd className="tnum">{rupees(totals.subtotalPaise)}</dd></div>
        {totals.discountPaise > 0 && <div className="flex justify-between text-mute"><dt>Discount</dt><dd className="tnum">−{rupees(totals.discountPaise)}</dd></div>}
        {totals.taxPaise > 0 && <div className="flex justify-between text-mute"><dt>Includes GST</dt><dd className="tnum">{rupees(totals.taxPaise)}</dd></div>}
        <div className="flex items-baseline justify-between border-t border-line pt-2 font-display text-3xl font-bold"><dt>Total</dt><dd className="tnum">{rupees(totals.totalPaise)}</dd></div>
        {advanceApplied > 0 && <div className="flex justify-between text-silver"><dt>Paid in advance ({draft.advanceMethod})</dt><dd className="tnum">−{rupees(advanceApplied)}</dd></div>}
        {refund > 0 && <div className="rounded-lg bg-warn/10 px-3 py-2 text-warn">Give back {rupees(refund)} to the customer.</div>}
      </dl>

      {due > 0 && (
        <div className="space-y-2">
          <span className={labelCls}>Payment</span>
          {shown.map((r, i) => (
            <div key={i} className="flex gap-2">
              <select aria-label="Method" className={`${inputCls} !w-28`} value={r.method} onChange={(e) => edit(i, { method: e.target.value })}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
              </select>
              <input aria-label="Amount" className={inputCls} inputMode="decimal" placeholder="Amount in ₹" value={r.rupees} onChange={(e) => edit(i, { rupees: e.target.value })} />
              {shown.length > 1 && (
                <button type="button" aria-label="Remove payment" className={btnCls} onClick={() => { setTouched(true); setRows(shown.filter((_, j) => j !== i)); }}>
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-silver hover:text-ink"
              onClick={() => {
                setTouched(true);
                setRows([...shown, { method: "upi", rupees: remaining > 0 ? (remaining / 100).toFixed(2) : "" }]);
              }}
            >
              <Plus className="size-4" /> Split across methods
            </button>
            <span className={`tnum ${remaining === 0 ? "text-free" : "text-warn"}`}>{remaining === 0 ? "Matches total" : remaining > 0 ? `${rupees(remaining)} still due` : `${rupees(-remaining)} too much`}</span>
          </div>
        </div>
      )}

      {upiRow && (
        <div className="flex items-center gap-4 rounded-lg border border-line p-3">
          {qr ? <UpiQr link={qr} size={150} /> : null}
          <p className="text-sm text-silver">
            {qr ? <>Scan to pay <b className="tnum">{rupees(safePaise(upiRow.rupees)!)}</b> to {cafeName}. Confirm the payment arrived on your phone before marking paid.</> : "Add your UPI ID in Settings → Cafe to show a payment QR here."}
          </p>
        </div>
      )}

      <button
        type="button"
        disabled={pending || remaining !== 0}
        className={`${btnPrimaryCls} w-full !py-3 text-base`}
        onClick={() =>
          call(
            () =>
              counterLines
                ? counterSaleAction({ lines: counterLines, discountType: dType, discountValue: dValue, reason, payments: shown })
                : finalizeBillAction({ sessionId: sessionId as number, discountType: dType, discountValue: dValue, reason, payments: shown }),
            { ok: "Bill paid", onOk: (r) => onPaid((r as { billId: number }).billId) },
          )
        }
      >
        {pending ? "Saving…" : `Mark paid · ${rupees(due)}`}
      </button>
    </div>
  );
}
