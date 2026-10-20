import Link from "next/link";
import { requireOwnerPage } from "@/lib/session";
import { CafeTab } from "./CafeTab";
import { ZonesTab } from "./ZonesTab";
import { RatesTab } from "./RatesTab";
import { StaffTab } from "./StaffTab";
import { WhatsAppTab } from "./WhatsAppTab";
import { ExportTab } from "./ExportTab";
import { BackupsTab } from "./BackupsTab";
import { ActivityTab } from "./ActivityTab";

const TABS = [
  { id: "cafe", label: "Lounge" },
  { id: "zones", label: "Zones & stations" },
  { id: "rates", label: "Rates" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "staff", label: "Staff" },
  { id: "export", label: "Export" },
  { id: "backups", label: "Backups" },
  { id: "activity", label: "Activity" },
] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; page?: string; size?: string }> }) {
  const me = await requireOwnerPage();
  const { tab: wanted, q, page, size } = await searchParams;
  const tab = TABS.find((t) => t.id === wanted)?.id ?? "cafe";
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold tracking-wide">Settings</h1>
      <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/settings?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition ${tab === t.id ? "border-brand text-ink" : "border-transparent text-mute hover:text-ink"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "cafe" && <CafeTab />}
      {tab === "zones" && <ZonesTab />}
      {tab === "rates" && <RatesTab />}
      {tab === "whatsapp" && <WhatsAppTab />}
      {tab === "staff" && <StaffTab meId={me.id} />}
      {tab === "export" && <ExportTab />}
      {tab === "backups" && <BackupsTab />}
      {tab === "activity" && <ActivityTab q={(q ?? "").slice(0, 60)} page={Math.max(1, Math.floor(Number(page)) || 1)} size={size} />}
    </div>
  );
}
