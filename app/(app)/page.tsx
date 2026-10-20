import { requireUser } from "@/lib/session";
import { listBoard } from "@/lib/db/sessions";
import { listMenu } from "@/lib/db/menu";
import { todaySummary } from "@/lib/db/bills";
import { getSettings } from "@/lib/db/settings";
import { Board } from "@/components/floor/Board";

export default async function FloorPage() {
  const me = await requireUser();
  const cafe = getSettings();
  const startOfToday = new Date().setHours(0, 0, 0, 0); // the lounge's own local midnight
  return (
    <Board
      zones={listBoard()}
      menu={listMenu()}
      leadMin={Number(cafe["alert.leadMin"])}
      alerts={cafe["alert.enabled"] === "1" ? (cafe["alert.sound"] === "1" ? "sound" : "silent") : "off"}
      cafe={{ name: cafe["cafe.name"], upiId: cafe["cafe.upiId"] }}
      role={me.role}
      userName={me.name}
      today={todaySummary(startOfToday)}
    />
  );
}
