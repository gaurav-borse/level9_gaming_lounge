const UPI_ID = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

export const isValidUpiId = (id: string): boolean => UPI_ID.test(id);

/** Standard UPI deep link carrying the exact amount. Throws on an invalid payee. */
export function upiLink(o: { upiId: string; name: string; amountPaise: number; note: string }): string {
  if (!isValidUpiId(o.upiId)) throw new Error("Invalid UPI ID");
  if (!Number.isInteger(o.amountPaise) || o.amountPaise <= 0) throw new Error("Invalid amount");
  const q = new URLSearchParams({
    pa: o.upiId,
    pn: o.name,
    am: (o.amountPaise / 100).toFixed(2),
    cu: "INR",
    tn: o.note,
  });
  return `upi://pay?${q.toString().replace(/\+/g, "%20")}`; // %20, not +, for spaces: every UPI app reads that
}
