import { all, get } from "./index.ts";

export type AuditRow = { id: number; at: number; who: string; action: string; detail: string };

/** Newest first. `q` matches the action, the detail or the person's name. */
export function listAudit(q = "", limit = 100, offset = 0): { rows: AuditRow[]; total: number } {
  const like = `%${q.trim().replace(/[%_!]/g, (c) => `!${c}`)}%`;
  const where = q.trim() ? "WHERE a.action LIKE ? ESCAPE '!' OR a.detail LIKE ? ESCAPE '!' OR u.name LIKE ? ESCAPE '!'" : "";
  const args = q.trim() ? [like, like, like] : [];
  const from = "FROM audit_log a LEFT JOIN user u ON u.id = a.staff_id";
  return {
    rows: all<AuditRow>(
      `SELECT a.id, a.at, COALESCE(u.name, CASE WHEN a.staff_id = '-' THEN 'Not signed in' ELSE 'Removed staff' END) AS who, a.action, a.detail ${from} ${where} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
      ...args, limit, offset,
    ),
    total: get<{ n: number }>(`SELECT COUNT(*) AS n ${from} ${where}`, ...args)?.n ?? 0,
  };
}
