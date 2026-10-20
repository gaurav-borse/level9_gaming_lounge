import { BRAND } from "./brand.ts";

/** The colour the whole interface is built from. One hex value; every panel, gradient and hover shade is derived from it in CSS. */
export const DEFAULT_ACCENT = "#3dbda7";

export const ACCENT_PRESETS = [
  { name: "Teal", hex: DEFAULT_ACCENT },
  { name: "Level 9 red", hex: BRAND.colours.accent },
  { name: "Violet", hex: "#8b5cf6" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Amber", hex: "#f59e0b" },
  { name: "Lime", hex: "#84cc16" },
  { name: "Pink", hex: "#ec4899" },
  { name: "Orange", hex: "#f97316" },
] as const;

const HEX = /^#[0-9a-f]{6}$/i;

export const isAccent = (v: unknown): v is string => typeof v === "string" && HEX.test(v);

/** A stored or submitted value becomes a safe lowercase hex, or the default. Never trust the cookie: it ends up inside a style attribute. */
export const parseAccent = (v: unknown): string => (isAccent(v) ? v.toLowerCase() : DEFAULT_ACCENT);

/** Text colour that stays readable on top of the accent: near-black or white, whichever contrasts more (WCAG relative luminance). */
export function onAccent(hex: string): "#06100e" | "#ffffff" {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? "#06100e" : "#ffffff";
}
