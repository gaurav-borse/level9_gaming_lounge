const whole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const exact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 15000 -> "₹150", 15050 -> "₹150.50", 12345600 -> "₹1,23,456" */
export function rupees(paise: number): string {
  return (paise % 100 === 0 ? whole : exact).format(paise / 100);
}

/** Always two decimals ("₹37.50", "₹240.00"), so a column of amounts lines up and every paisa is visible. Used in reports. */
export const rupeesExact = (paise: number): string => exact.format(paise / 100);

/** For chart labels where space is tight: ₹450, ₹12.3k, ₹1.2L, ₹3.4Cr. Rounded, so exact amounts stay in tooltips and tables. */
export function rupeesShort(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const r = Math.abs(paise) / 100;
  const trim = (n: number) => String(Math.round(n * 10) / 10);
  if (r >= 1e7) return `${sign}₹${trim(r / 1e7)}Cr`;
  if (r >= 1e5) return `${sign}₹${trim(r / 1e5)}L`;
  if (r >= 1e3) return `${sign}₹${trim(r / 1e3)}k`;
  return `${sign}₹${Math.round(r)}`;
}

/** Milliseconds -> "1:05:09". Negative values show as zero. */
export function hms(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export const clock = (ms: number): string =>
  new Date(ms).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });

export const dateTime = (ms: number): string =>
  new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

export const invoiceNo = (n: number): string => `INV-${String(n).padStart(6, "0")}`;
