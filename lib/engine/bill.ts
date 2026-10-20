export type BillLineInput = {
  kind: "session" | "item";
  name: string;
  qty: number;
  unitPaise: number;
  taxPct: number; // 0 when GST is off
  itemId?: number; // the menu item this line came from, if any
};

export type Discount = { type: "flat" | "percent"; value: number } | null;

export type BillTotals = {
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number; // included in total (prices are tax-inclusive)
  totalPaise: number;
};

export const PAYMENT_METHODS = ["cash", "upi", "card"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type PaymentInput = { method: PaymentMethod; amountPaise: number };

/**
 * How a bill-level discount is spread over its lines: in proportion to each line, the last line takes the rounding remainder.
 * Used for the tax on a bill and for what each line really earned (Reports, Investments), so the two can never disagree.
 */
export function allocateDiscount(lineTotals: number[], discountPaise: number): number[] {
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);
  let allocated = 0;
  return lineTotals.map((t, i) => {
    const share = i === lineTotals.length - 1 ? discountPaise - allocated : subtotal === 0 ? 0 : Math.round((discountPaise * t) / subtotal);
    allocated += share;
    return share;
  });
}

/** The GST inside an amount that already includes it. */
export const lineTaxPaise = (afterDiscountPaise: number, taxPct: number): number => Math.round((afterDiscountPaise * taxPct) / (100 + taxPct));

export function computeBill(lines: BillLineInput[], discount: Discount): BillTotals {
  const lineTotals = lines.map((l) => l.qty * l.unitPaise);
  const subtotalPaise = lineTotals.reduce((a, b) => a + b, 0);

  let discountPaise = 0;
  if (discount && subtotalPaise > 0) {
    discountPaise =
      discount.type === "flat"
        ? Math.min(Math.max(0, Math.round(discount.value)), subtotalPaise)
        : Math.round((subtotalPaise * Math.round(Math.min(100, Math.max(0, discount.value)) * 100)) / 10000); // hundredths of a percent: whole numbers, so no float surprises
  }

  const shares = allocateDiscount(lineTotals, discountPaise);
  const taxPaise = lines.reduce((sum, l, i) => sum + lineTaxPaise(lineTotals[i] - shares[i], l.taxPct), 0);

  return { subtotalPaise, discountPaise, taxPaise, totalPaise: subtotalPaise - discountPaise };
}

/** Returns an error message, or null when payments are valid and cover the total exactly. */
export function validatePayments(totalPaise: number, payments: PaymentInput[]): string | null {
  if (totalPaise === 0 && payments.length === 0) return null;
  if (payments.length === 0) return "Add at least one payment";
  for (const p of payments) {
    if (!PAYMENT_METHODS.includes(p.method)) return "Unknown payment method";
    if (!Number.isInteger(p.amountPaise) || p.amountPaise <= 0) return "Payment amounts must be positive";
  }
  const sum = payments.reduce((a, p) => a + p.amountPaise, 0);
  return sum === totalPaise ? null : "Payments must add up to the bill total";
}
