import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { audit } from "./index.ts";
import { BACKUP_NAME, makeBackup } from "../backup.ts";

// Children before parents, so the foreign keys never complain.
const TABLES = [
  "payments", "bill_lines", "stock_moves", "bills", "session_items", "sessions", "expenses", "investments",
  "message_log", "audit_log", "customers", "menu_items", "menu_categories", "rates", "stations", "zones",
] as const;

/**
 * Wipe the app back to a clean start: every bill, customer, expense, investment, menu item, zone, station, rate, setting and
 * uploaded picture. Kept: the logins, and the one setting that says first-time setup is done (without it everyone would be
 * sent to the setup screen). A safety backup of everything is saved first, so a mistake can be undone from Settings > Backups.
 * With `deleteBackups` the older backups go too (they hold the same data); the new safety copy always stays.
 */
export function clearAllData(db: DatabaseSync, o: { dataDir: string; second?: string; deleteBackups: boolean; staffId: string; now?: number }): { safety: string } {
  const now = o.now ?? Date.now();
  const backups = path.join(o.dataDir, "backups");
  const { name: safety } = makeBackup(db, backups, { second: o.second, now, prefix: "before-clear" });

  db.exec("BEGIN IMMEDIATE");
  try {
    for (const t of TABLES) db.exec(`DELETE FROM ${t}`);
    db.exec("DELETE FROM settings WHERE key <> 'setup.done'");
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  const uploads = path.join(o.dataDir, "uploads");
  if (fs.existsSync(uploads)) for (const f of fs.readdirSync(uploads)) if (/^(logo|login)-[0-9a-f]{16}\.(png|jpg|webp)$/.test(f)) fs.rmSync(path.join(uploads, f), { force: true });

  if (o.deleteBackups) {
    for (const dir of [backups, o.second].filter((d): d is string => !!d)) {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) if (BACKUP_NAME.test(f) && f !== safety) fs.rmSync(path.join(dir, f), { force: true });
    }
  }
  audit(o.staffId, "data.clear", o.deleteBackups ? `everything cleared, older backups deleted (safety copy ${safety})` : `everything cleared (safety copy ${safety})`, now);
  return { safety };
}
