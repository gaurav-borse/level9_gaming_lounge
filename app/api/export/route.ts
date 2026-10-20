import { connection } from "next/server";
import { currentUser } from "@/lib/session";
import { audit } from "@/lib/db/index";
import { getSetting } from "@/lib/db/settings";
import { exportFileName, exportSheets } from "@/lib/export/tables";
import { workbook } from "@/lib/export/xlsx";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** One Excel file with bills, bill items, customers and stock. Owner only: it holds takings and customers' phone numbers. */
export async function GET(req: Request) {
  await connection();
  const me = await currentUser();
  if (!me) return new Response("Sign in first", { status: 401 });
  if (me.role !== "owner") return new Response("Only the owner can export", { status: 403 });

  const now = Date.now();
  const lounge = getSetting("cafe.name");
  const query = Object.fromEntries(new URL(req.url).searchParams) as Record<string, string | undefined>;
  const file = await workbook(exportSheets(query, { lounge, by: me.name, at: now }));
  audit(me.id, "export", [query.from, query.to].filter(Boolean).join(" to ") || "everything", now);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="${exportFileName(lounge, now)}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
