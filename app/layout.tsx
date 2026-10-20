import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { Chakra_Petch, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/toast";
import { BRAND } from "@/lib/brand";
import { onAccent, parseAccent } from "@/lib/accent";

const display = Chakra_Petch({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-chakra" });
const sans = Geist({ subsets: ["latin"], variable: "--font-geist" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = { title: BRAND.name, description: "Gaming lounge management" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection(); // per request, never at build time
  const jar = await cookies();
  const theme = jar.get("theme")?.value;
  const dataTheme = theme === "light" || theme === "dark" ? theme : undefined;
  const accent = parseAccent(jar.get("accent")?.value); // validated: it goes into a style attribute
  const style = { "--color-brand": accent, "--color-on-brand": onAccent(accent) } as CSSProperties;
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`} data-theme={dataTheme} style={style}>
      <body className="min-h-dvh antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
