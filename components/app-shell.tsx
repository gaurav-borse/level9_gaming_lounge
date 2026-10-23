"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Boxes, ChartColumn, ChevronsLeft, LayoutGrid, LogOut, Power, Receipt, Settings, Users } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { quitAppAction } from "@/app/(app)/quit-actions";
import { Modal } from "@/components/modal";
import { btnCls, btnDangerCls } from "@/lib/ui";
import { setSidebarAction } from "@/app/(app)/theme-actions";
import { BrandIcon, BrandWide } from "@/components/brand";
import type { LogoSources } from "@/lib/logo";

const LINKS = [
  { href: "/", label: "Floor", icon: LayoutGrid, owner: false },
  { href: "/bills", label: "Bills", icon: Receipt, owner: false },
  { href: "/customers", label: "Customers", icon: Users, owner: false },
  { href: "/menu", label: "Menu & stock", icon: Boxes, owner: false },
  { href: "/reports", label: "Reports", icon: ChartColumn, owner: true },
  { href: "/settings", label: "Settings", icon: Settings, owner: true },
];

// Same box for every sidebar entry. Below 1280px the sidebar is a top bar of icons; from 1280px it is a labelled column
// (or icon-only when collapsed: the .side-* rules in globals.css handle that).
const item =
  "side-link flex size-10 items-center justify-center gap-3 rounded-2xl transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:size-11 xl:size-auto xl:justify-start xl:px-3.5 xl:py-2.5";

function Label({ children }: { children: ReactNode }) {
  return (
    <>
      <span className="side-label hidden text-sm font-medium xl:inline">{children}</span>
      <span className="sr-only xl:hidden">{children}</span>
    </>
  );
}

/** Page frame: rounded sidebar (collapsible on desktop) plus the page. `tools` sits top right on every page. */
export function AppShell({ name, brand, role, initialCollapsed, lowStock, tools, children }: {
  name: string;
  brand: { name: string; logo: LogoSources };
  role: "owner" | "staff";
  initialCollapsed: boolean;
  lowStock: number; // items that are low or out: shown as a badge on Menu & stock
  tools: ReactNode;
  children: ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [asking, setAsking] = useState(false);
  const [quit, setQuit] = useState<"no" | "busy" | "done">("no");
  const [quitError, setQuitError] = useState("");

  const stopApp = async () => {
    setQuit("busy");
    const r = await quitAppAction();
    if (!r.ok) {
      setQuit("no");
      setQuitError(r.error);
      return;
    }
    setAsking(false);
    setQuit("done");
    window.close(); // works for the app window; if the browser refuses, the message below stays
  };

  const toggle = () => {
    setCollapsed(!collapsed);
    void setSidebarAction(!collapsed);
  };

  return (
    <div
      data-collapsed={collapsed}
      className="shell mx-auto my-2 w-[calc(100%-1rem)] max-w-[110rem] rounded-4xl bg-bg p-3 sm:my-3 sm:w-[calc(100%-1.5rem)] sm:p-4 xl:grid xl:gap-6 print:m-0 print:block print:w-full print:max-w-none print:rounded-none print:bg-white print:p-0"
    >
      <nav
        aria-label="Main"
        className="side no-print mb-4 flex items-center justify-between gap-2 rounded-4xl bg-panel p-3 xl:sticky xl:top-3 xl:mb-0 xl:h-[calc(100dvh-2.5rem)] xl:flex-col xl:items-stretch xl:justify-start xl:gap-0 xl:overflow-y-auto xl:p-4"
      >
        <Link href="/" aria-label={`${brand.name}, floor`} className="side-logo-link shrink-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand xl:block xl:w-full">
          <BrandWide name={brand.name} logo={brand.logo} className="side-logo-wide hidden w-full xl:flex" />
          <BrandIcon name={brand.name} logo={brand.logo} className="side-logo-icon size-10 sm:size-12 xl:mx-auto" />
        </Link>

        <ul className="flex items-center gap-1 xl:mt-6 xl:flex-col xl:items-stretch xl:gap-1.5">
          {LINKS.filter((l) => !l.owner || role === "owner").map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`${item} relative ${active ? "bg-brand text-on-brand" : "text-silver hover:bg-raised hover:text-ink"}`}
                >
                  <Icon className="size-5 shrink-0" aria-hidden />
                  <Label>{label}</Label>
                  {href === "/menu" && lowStock > 0 && (
                    <span className="side-badge absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-warn px-1 text-[10px] font-bold leading-4 text-neutral-950 xl:right-3 xl:top-1/2 xl:-translate-y-1/2">
                      {lowStock}
                      <span className="sr-only"> items low or out of stock</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-1 xl:mt-auto xl:flex-col xl:items-stretch xl:gap-1.5">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="side-link hidden items-center gap-3 rounded-2xl px-3.5 py-2.5 text-silver transition hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand xl:flex"
          >
            <ChevronsLeft className="side-chevron size-5 shrink-0" aria-hidden />
            <span className="side-label text-sm font-medium">Collapse</span>
          </button>
          <div className="my-2 hidden border-t border-line xl:block" />
          <p className="side-user hidden px-3.5 xl:block">
            <span className="block truncate text-sm font-semibold">{name}</span>
            <span className="text-xs capitalize text-mute">{role}</span>
          </p>
          <button
            type="button"
            onClick={async () => {
              await logoutAction();
              router.push("/login");
              router.refresh();
            }}
            className={`${item} text-silver hover:bg-raised hover:text-ink`}
          >
            <LogOut className="size-5 shrink-0" aria-hidden />
            <Label>Sign out</Label>
          </button>
          {role === "owner" && (
            <button
              type="button"
              onClick={() => {
                setQuitError("");
                setAsking(true);
              }}
              className={`${item} text-silver hover:bg-raised hover:text-ink`}
            >
              <Power className="size-5 shrink-0" aria-hidden />
              <Label>Stop app</Label>
            </button>
          )}
        </div>
      </nav>

      <Modal open={asking} onClose={() => setAsking(false)} title="Stop the app?">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-silver">
            This switches the lounge app off and closes this window. Your data is safe, and running sessions keep their time, but timer alerts stay off until you start the app again from the Desktop icon.
          </p>
          {quitError && <p role="alert" className="text-sm text-over">{quitError}</p>}
          <div className="flex gap-2">
            <button type="button" className={btnDangerCls} disabled={quit === "busy"} onClick={stopApp}>
              <Power className="size-4" aria-hidden /> Stop the app
            </button>
            <button type="button" className={btnCls} onClick={() => setAsking(false)}>Keep it running</button>
          </div>
        </div>
      </Modal>
      {quit === "done" && (
        <div role="alert" className="fixed inset-0 z-50 grid place-items-center bg-bg p-6 text-center">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-wide">The app has been stopped</h1>
            <p className="mt-2 text-silver">You can close this window. To use it again, double-click the Gaming Lounge icon on the Desktop.</p>
          </div>
        </div>
      )}

      <main className="min-w-0">
        <div className="no-print mb-4 flex items-center justify-end gap-3">{tools}</div>
        {children}
      </main>
    </div>
  );
}
