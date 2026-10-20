import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { dataDir } from "./db/index.ts";
import { MIGRATIONS } from "./db/migrations.ts";
import { UserError } from "./errors.ts";

/** Names we write and will restore: automatic backups, the copy made before a database upgrade, and the copy made before a restore. */
export const BACKUP_NAME = /^lounge-(\d{8}-\d{6}|before-v\d+|before-restore-\d{8}-\d{6})\.db$/;
const AUTO_NAME = /^lounge-\d{8}-\d{6}\.db$/;
export const backupsDir = (): string => path.join(dataDir(), "backups");
export const KEEP = 14;
export const EVERY_MS = 6 * 60 * 60 * 1000;

const two = (n: number) => String(n).padStart(2, "0");
export function stamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
}

export type BackupFile = { name: string; size: number; at: number; kind: "auto" | "upgrade" | "restore" };

export function listBackups(dir: string): BackupFile[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((n) => BACKUP_NAME.test(n))
    .map((name) => {
      const st = fs.statSync(path.join(dir, name));
      return { name, size: st.size, at: st.mtimeMs, kind: AUTO_NAME.test(name) ? "auto" as const : name.startsWith("lounge-before-restore") ? "restore" as const : "upgrade" as const };
    })
    .sort((a, b) => b.at - a.at || b.name.localeCompare(a.name));
}

/** Only automatic backups are pruned; the safety copies stay until someone deletes them. */
function prune(dir: string) {
  for (const f of listBackups(dir).filter((b) => b.kind === "auto").slice(KEEP)) fs.rmSync(path.join(dir, f.name), { force: true });
}

const sqlQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * A consistent copy of the live database (VACUUM INTO), then the same file copied to the second folder when there is one.
 * A failed copy never loses the backup itself: it is reported in `copyError`.
 */
export function makeBackup(db: DatabaseSync, dir: string, o: { second?: string; now?: number; prefix?: "before-restore" } = {}): { name: string; copyError?: string } {
  const now = o.now ?? Date.now();
  fs.mkdirSync(dir, { recursive: true });
  const nameAt = (t: number) => `lounge-${o.prefix ? `${o.prefix}-` : ""}${stamp(t)}.db`;
  let t = now;
  while (fs.existsSync(path.join(dir, nameAt(t)))) t += 1000; // never overwrite a backup, even one made in the same second
  const name = nameAt(t);
  const target = path.join(dir, name);
  db.exec(`VACUUM INTO ${sqlQuote(target)}`);
  prune(dir);
  let copyError: string | undefined;
  if (o.second) {
    try {
      fs.mkdirSync(o.second, { recursive: true });
      fs.copyFileSync(target, path.join(o.second, name));
      prune(o.second);
    } catch (e) {
      copyError = (e as Error).message;
    }
  }
  return { name, copyError };
}

/** At startup and every hour: back up when the newest automatic backup is older than 6 hours. Returns whether one was made. */
export function ensureRecentBackup(db: DatabaseSync, dir: string, o: { second?: string; now?: number } = {}): boolean {
  const now = o.now ?? Date.now();
  const newest = listBackups(dir).find((b) => b.kind === "auto");
  if (newest && now - newest.at < EVERY_MS) return false;
  makeBackup(db, dir, { ...o, now });
  return true;
}

/** Throws a UserError that says what is wrong with a file offered for restore; returns its schema version. */
export function checkBackupFile(file: string): number {
  let src: DatabaseSync | undefined;
  try {
    src = new DatabaseSync(file, { readOnly: true });
    const ok = (src.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check;
    if (ok !== "ok") throw new UserError("That backup file is damaged");
    const version = (src.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    if (version > MIGRATIONS.length) throw new UserError("That backup comes from a newer version of the app");
    const tables = new Set((src.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name));
    for (const t of ["settings", "bills", "customers", "sessions", "user"]) if (!tables.has(t)) throw new UserError("That file is not a backup of this app");
    return version;
  } catch (e) {
    if (e instanceof UserError) throw e;
    throw new UserError("That file is not a usable backup");
  } finally {
    src?.close();
  }
}

/**
 * Put a backup's contents into the live database. The same connection is kept (the sign-in system holds it), so this copies
 * table by table inside one transaction: if anything fails, nothing changes. A safety backup of the current data is made first.
 * Tables or columns the backup doesn't have (it is from an older version) are left empty or at their defaults.
 */
export function restoreBackup(db: DatabaseSync, file: string, safetyDir: string, now = Date.now()): { safety: string } {
  checkBackupFile(file);
  const safety = makeBackup(db, safetyDir, { now, prefix: "before-restore" }).name;
  db.exec(`ATTACH DATABASE ${sqlQuote(file)} AS bk`);
  try {
    db.exec("PRAGMA foreign_keys = OFF"); // not possible inside a transaction
    db.exec("BEGIN IMMEDIATE");
    try {
      const names = (schema: string) =>
        (db.prepare(`SELECT name FROM ${schema}.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as { name: string }[]).map((r) => r.name);
      const theirs = new Set(names("bk"));
      for (const t of names("main")) {
        db.exec(`DELETE FROM main."${t}"`);
        if (!theirs.has(t)) continue;
        const cols = (s: string) => (db.prepare(`PRAGMA ${s}.table_info("${t}")`).all() as { name: string }[]).map((c) => c.name);
        const theirCols = new Set(cols("bk"));
        const shared = cols("main").filter((c) => theirCols.has(c)).map((c) => `"${c}"`).join(", ");
        if (shared) db.exec(`INSERT INTO main."${t}" (${shared}) SELECT ${shared} FROM bk."${t}"`);
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("DETACH DATABASE bk");
  }
  return { safety };
}
