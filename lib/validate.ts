import { UserError } from "./errors.ts";

export function str(v: unknown, label: string, o: { max?: number; required?: boolean } = {}): string {
  const { max = 200, required = true } = o;
  const s = typeof v === "string" ? v.trim() : "";
  if (required && !s) throw new UserError(`${label} is required`);
  if (s.length > max) throw new UserError(`${label} is too long (max ${max} characters)`);
  return s;
}

export function int(v: unknown, label: string, o: { min?: number; max?: number } = {}): number {
  const { min = 0, max = 1_000_000_000 } = o;
  const n = typeof v === "number" ? v : typeof v === "string" && /^-?\d+$/.test(v.trim()) ? Number(v) : NaN; // digits only: no "1e3", "0x10" or "5.0"
  if (!Number.isInteger(n)) throw new UserError(`${label} must be a whole number`);
  if (n < min || n > max) throw new UserError(`${label} must be between ${min} and ${max}`);
  return n;
}

/** Rupees typed by a person ("150", "150.5") -> whole paise. */
export function rupeesToPaise(v: unknown, label: string, o: { min?: number; max?: number } = {}): number {
  const { min = 0, max = 10_000_000 } = o;
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new UserError(`${label} must be an amount like 150 or 150.50`);
  const paise = Math.round(Number(s) * 100);
  if (paise < min * 100 || paise > max * 100) throw new UserError(`${label} is out of range`);
  return paise;
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], label: string): T {
  if (typeof v === "string" && (allowed as readonly string[]).includes(v)) return v as T;
  throw new UserError(`${label} is not valid`);
}

/** A percentage typed by a person: "7", "7.5" or "12.25" (at most two decimals), from 0 to 100. Anything else gives null. */
export function parsePercent(v: unknown): number | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n <= 100 ? n : null;
}

export function bool(v: unknown): boolean {
  return v === true || v === "on" || v === "1" || v === "true";
}

/** "14:30" -> 870 minutes since midnight. "24:00" is allowed (as 1440) when `allow24` is set, for "until end of day". */
export function hhmm(v: unknown, label: string, allow24 = false): number {
  const m = typeof v === "string" ? /^(\d{1,2}):(\d{2})$/.exec(v.trim()) : null;
  const minutes = m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  if (!m || Number(m[2]) > 59 || minutes > (allow24 ? 1440 : 1439)) throw new UserError(`${label} must be a time like 14:30`);
  return minutes;
}

export const minToHHMM = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
