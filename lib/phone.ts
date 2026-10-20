/** Digits-only phone with country code, or null when it can't be a real number. */
export function normalizePhone(raw: string, defaultCc = "91"): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = defaultCc + d;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

/** "919876543210" -> "+91 98765 43210"; other countries just get a plus sign. */
export function displayPhone(p: string): string {
  return p.length === 12 && p.startsWith("91") ? `+91 ${p.slice(2, 7)} ${p.slice(7)}` : `+${p}`;
}
