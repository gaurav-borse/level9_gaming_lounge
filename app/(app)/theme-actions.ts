"use server";
import { cookies } from "next/headers";
import { isAccent } from "@/lib/accent";

const YEAR = 60 * 60 * 24 * 365;
const opts = { path: "/", maxAge: YEAR, sameSite: "strict", httpOnly: true } as const;

/** "light" or "dark" pins the theme; anything else goes back to following the system. */
export async function setThemeAction(theme: string): Promise<void> {
  const jar = await cookies();
  if (theme === "light" || theme === "dark") jar.set("theme", theme, opts);
  else jar.delete("theme");
}

/** A valid #rrggbb becomes the main colour; anything else resets to the default. */
export async function setAccentAction(hex: string): Promise<void> {
  const jar = await cookies();
  if (isAccent(hex)) jar.set("accent", hex.toLowerCase(), opts);
  else jar.delete("accent");
}

/** Remember whether the sidebar is collapsed, so the first paint already has the right width. */
export async function setSidebarAction(collapsed: boolean): Promise<void> {
  (await cookies()).set("sidebar", collapsed ? "collapsed" : "open", opts);
}
