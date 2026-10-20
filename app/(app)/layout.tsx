import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { hasAnyUser } from "@/lib/auth-core";
import { requireUser } from "@/lib/session";
import { isSetupDone } from "@/lib/db/settings";
import { parseAccent } from "@/lib/accent";
import { listStock, lowStockCount } from "@/lib/db/menu";
import { listBoard } from "@/lib/db/sessions";
import { getSetting } from "@/lib/db/settings";
import { logoSources } from "@/lib/logo";
import { AppShell } from "@/components/app-shell";
import { AccentPicker } from "@/components/accent-picker";
import { AlertBell } from "@/components/alert-bell";
import { MessageTray } from "@/components/message-tray";
import { pendingMessages } from "@/lib/db/messages";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await connection(); // always per request: never touch the database while building
  if (!hasAnyUser() || !isSetupDone()) redirect("/setup");
  const me = await requireUser();
  const jar = await cookies();
  // What the alert bell needs: live sessions (their timers are worked out in the browser) and items that may be low.
  const stations = listBoard().flatMap((z) => z.stations.flatMap((s) => (s.session ? [{ id: s.id, name: s.name, session: s.session }] : [])));
  const stock = listStock().map((m) => ({ id: m.id, name: m.name, onHand: m.onHand ?? 0 }));
  return (
    <AppShell
      name={me.name}
      brand={{ name: getSetting("cafe.name"), logo: logoSources(getSetting("cafe.logo")) }}
      role={me.role}
      initialCollapsed={jar.get("sidebar")?.value === "collapsed"}
      lowStock={lowStockCount()}
      tools={
        <>
          <MessageTray messages={pendingMessages()} />
          {getSetting("alert.enabled") === "1" && <AlertBell stations={stations} stock={stock} leadMin={Number(getSetting("alert.leadMin"))} />}
          <ThemeToggle />
          <AccentPicker current={parseAccent(jar.get("accent")?.value)} />
        </>
      }
    >
      {children}
    </AppShell>
  );
}
