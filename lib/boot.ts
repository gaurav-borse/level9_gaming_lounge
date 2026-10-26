import path from "node:path";
import { dataDir, getDb } from "./db/index.ts";
import { applyPinResetFile, migrateAuth } from "./auth-core.ts";
import { authOpts, getAuth } from "./auth.ts";
import { backupsDir, ensureRecentBackup } from "./backup.ts";
import { getSetting } from "./db/settings.ts";

/** Runs once when the server starts (via instrumentation.ts). Auth tables must exist before getAuth(). */
export async function bootServer(): Promise<void> {
  getDb();
  await migrateAuth(authOpts());
  // Nobody stays signed in across a restart (stop.bat, power cut, update): the app always opens on the sign-in page.
  getDb().prepare("DELETE FROM session").run();
  const reset = await applyPinResetFile(getAuth(), path.join(dataDir(), "reset-owner-pin.txt"));
  if (reset) console.log("Owner PIN was reset from data/reset-owner-pin.txt");

  // Automatic backups: now, then an hourly check that makes one whenever the newest is over 6 hours old.
  const g = globalThis as typeof globalThis & { __loungeBackupTimer?: boolean };
  if (g.__loungeBackupTimer) return;
  g.__loungeBackupTimer = true;
  const tick = () => {
    try {
      ensureRecentBackup(getDb(), backupsDir(), { second: getSetting("backup.folder") || undefined });
    } catch (e) {
      console.error("Automatic backup failed", e); // never stop the app over a backup
    }
  };
  tick();
  setInterval(tick, 60 * 60 * 1000).unref();
}
