import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { MIGRATIONS } from "./migrations.ts";

type Param = string | number | bigint | null;
type G = typeof globalThis & { __loungeDb?: DatabaseSync };

export function dataDir(): string {
  const dir = process.env.LOUNGE_DATA_DIR ?? path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function migrate(db: DatabaseSync): void {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = row.user_version; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}

/** Before a database that already holds data is upgraded, keep a consistent copy next to it (backups/lounge-before-vN.db). */
export function backupBeforeUpgrade(db: DatabaseSync, file: string): void {
  if (file === ":memory:") return;
  const v = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  if (v === 0 || v >= MIGRATIONS.length) return; // brand new, or already current
  const dir = path.join(path.dirname(file), "backups");
  const target = path.join(dir, `lounge-before-v${v + 1}.db`);
  if (fs.existsSync(target)) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  } catch (e) {
    console.error("Could not make the safety copy before upgrading the database", e); // upgrade anyway: refusing to start is worse
  }
}

/** One shared connection per process (cached on globalThis so Next's separate bundles reuse it). */
export function getDb(): DatabaseSync {
  const g = globalThis as G;
  if (g.__loungeDb) return g.__loungeDb;
  const file = process.env.LOUNGE_DB ?? path.join(dataDir(), "lounge.db");
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  backupBeforeUpgrade(db, file);
  migrate(db);
  g.__loungeDb = db;
  return db;
}

/** Test helper: drop the cached connection so the next getDb() reopens the file. */
export function closeDb(): void {
  const g = globalThis as G;
  g.__loungeDb?.close();
  g.__loungeDb = undefined;
}

// node:sqlite returns null-prototype rows, which Next refuses to pass to client components.
export function all<T>(sql: string, ...p: Param[]): T[] {
  return getDb().prepare(sql).all(...p).map((r) => ({ ...r }) as T);
}

export function get<T>(sql: string, ...p: Param[]): T | undefined {
  const r = getDb().prepare(sql).get(...p);
  return r ? ({ ...r } as T) : undefined;
}

export function run(sql: string, ...p: Param[]) {
  return getDb().prepare(sql).run(...p);
}

/** All-or-nothing. Safe to nest: an inner call just joins the outer transaction. */
export function tx<T>(fn: () => T): T {
  const db = getDb();
  if (db.isTransaction) return fn();
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function audit(staffId: string, action: string, detail = "", at = Date.now()): void {
  run("INSERT INTO audit_log (at, staff_id, action, detail) VALUES (?, ?, ?, ?)", at, staffId, action, detail);
}
