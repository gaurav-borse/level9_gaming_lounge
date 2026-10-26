import { all, get, run, tx, audit } from "./index.ts";
import { UserError } from "../errors.ts";
import { pickRate } from "../engine/rates.ts";
import { billableMs, excessMs, timeIsUp } from "../engine/pricing.ts";
import type { RateSnapshot } from "../engine/pricing.ts";
import { listRates } from "./catalog.ts";
import { getMenuItem } from "./menu.ts";

export type SessionRow = {
  id: number;
  stationId: number;
  customerId: number | null;
  staffId: string;
  startedAt: number;
  plannedMinutes: number | null; // null only for sessions from before every session had a set time
  players: number; // controllers paid for when the session started
  addedControllers: number; // controllers added later
  addedControllersPaise: number; // what those cost for the rest of the planned time (added to the session charge)
  pausedAt: number | null;
  pausedTotalMs: number;
  endedAt: number | null;
  notes: string;
  billed: boolean;
  rate: RateSnapshot;
};

const COLS = `s.id, s.station_id AS stationId, s.customer_id AS customerId, s.staff_id AS staffId,
  s.started_at AS startedAt, s.planned_minutes AS plannedMinutes, s.players, s.added_controllers AS addedControllers, s.added_controllers_paise AS addedControllersPaise, s.paused_at AS pausedAt, s.paused_total_ms AS pausedTotalMs,
  s.ended_at AS endedAt, s.notes, s.billed, s.rate_json AS rateJson`;

type Raw = Omit<SessionRow, "rate" | "billed"> & { billed: number; rateJson: string };
const toSession = ({ rateJson, billed, ...r }: Raw): SessionRow => ({ ...r, billed: billed === 1, rate: JSON.parse(rateJson) });

export function getSession(id: number): SessionRow {
  const r = get<Raw>(`SELECT ${COLS} FROM sessions s WHERE s.id = ?`, id);
  if (!r) throw new UserError("Session not found");
  return toSession(r);
}

/** Session that can still change: not ended, not billed. */
function live(id: number): SessionRow {
  const s = getSession(id);
  if (s.billed) throw new UserError("This session is already billed");
  if (s.endedAt !== null) throw new UserError("This session has already been stopped");
  return s;
}

export type StartInput = {
  stationId: number;
  staffId: string;
  plannedMinutes: number;
  players: number;
  customerId?: number | null;
  now: number;
};

export function startSession(i: StartInput): number {
  return tx(() => {
    const st = get<{ id: number; zoneId: number; name: string; maintenance: number; zoneName: string }>(
      `SELECT st.id, st.zone_id AS zoneId, st.name, st.maintenance, z.name AS zoneName
       FROM stations st JOIN zones z ON z.id = st.zone_id
       WHERE st.id = ? AND st.active = 1 AND z.active = 1`,
      i.stationId,
    );
    if (!st) throw new UserError("Station not found");
    if (st.maintenance) throw new UserError(`${st.name} is under maintenance`);
    if (get("SELECT 1 AS x FROM sessions WHERE station_id = ? AND billed = 0", st.id)) {
      throw new UserError(`${st.name} is already in use`);
    }
    if (!Number.isInteger(i.players) || i.players < 1 || i.players > 20) throw new UserError("Players must be between 1 and 20");
    if (i.customerId != null && !get("SELECT 1 AS x FROM customers WHERE id = ?", i.customerId)) {
      throw new UserError("Customer not found");
    }

    const rate = pickRate(listRates(), st.zoneId, new Date(i.now));
    if (!rate) throw new UserError(`No rate is set for ${st.zoneName} right now. Add one in Settings.`);

    const m = i.plannedMinutes;
    if (!Number.isInteger(m) || m < 1 || m > 1440) throw new UserError("Choose a duration between 1 and 1440 minutes");

    const snap: RateSnapshot = {
      rateId: rate.id,
      name: rate.name,
      hourlyPaise: rate.hourlyPaise,
      extraControllerPaise: rate.extraControllerPaise,
      incrementMin: rate.incrementMin,
    };
    const id = Number(
      run(
        `INSERT INTO sessions (station_id, customer_id, staff_id, mode, started_at, planned_minutes, players, rate_json)
         VALUES (?,?,?,'fixed',?,?,?,?)`,
        st.id, i.customerId ?? null, i.staffId, i.now, m, i.players, JSON.stringify(snap),
      ).lastInsertRowid,
    );
    audit(i.staffId, "session.start", `${st.name} ${m} min`, i.now);
    return id;
  });
}

export function pauseSession(id: number, now: number): void {
  const s = live(id);
  if (s.pausedAt !== null) return;
  if (timeIsUp(s, s.plannedMinutes, now)) throw new UserError("Time is up. Add time or stop the session.");
  run("UPDATE sessions SET paused_at = ? WHERE id = ?", Math.max(now, s.startedAt), id);
}

export function resumeSession(id: number, now: number): void {
  const s = live(id);
  if (s.pausedAt === null) return;
  run("UPDATE sessions SET paused_total_ms = paused_total_ms + ?, paused_at = NULL WHERE id = ?", Math.max(0, now - s.pausedAt), id);
}

export function extendSession(id: number, minutes: number, staffId: string, now: number): void {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new UserError("Add 1 to 1440 minutes");
  tx(() => {
    const s = live(id);
    if (s.plannedMinutes === null) throw new UserError("Open sessions have no end time to extend");
    // The clock stopped when the time was up, so the wait for someone to decide is not played time: the new minutes start from that moment.
    const waited = excessMs(s, s.plannedMinutes, now);
    // Controllers added earlier are charged for the new minutes too.
    const more = Math.round((s.addedControllers * s.rate.extraControllerPaise * minutes) / 60);
    run(
      "UPDATE sessions SET planned_minutes = ?, paused_total_ms = paused_total_ms + ?, added_controllers_paise = added_controllers_paise + ? WHERE id = ?",
      s.plannedMinutes + minutes, waited, more, id,
    );
    audit(staffId, "session.extend", `session ${id} +${minutes} min`, now);
  });
}

/** One more controller on a running session. It is charged for the rest of the planned time only (and for any time added later). */
export function addController(id: number, staffId: string, now: number): void {
  tx(() => {
    const s = live(id);
    if (s.players + s.addedControllers >= 20) throw new UserError("Players must be between 1 and 20");
    const playedMin = Math.ceil(billableMs(s, now) / 60000);
    const left = s.plannedMinutes === null ? 0 : Math.max(0, s.plannedMinutes - playedMin);
    const cost = Math.round((s.rate.extraControllerPaise * left) / 60);
    run("UPDATE sessions SET added_controllers = added_controllers + 1, added_controllers_paise = added_controllers_paise + ? WHERE id = ?", cost, id);
    audit(staffId, "session.controller", `session ${id} +1 controller, ${cost} paise`, now);
  });
}

export function transferSession(id: number, toStationId: number, staffId: string, now: number): void {
  tx(() => {
    const s = live(id);
    const from = get<{ zoneId: number; name: string }>("SELECT zone_id AS zoneId, name FROM stations WHERE id = ?", s.stationId);
    const to = get<{ zoneId: number; name: string; maintenance: number }>(
      "SELECT zone_id AS zoneId, name, maintenance FROM stations WHERE id = ? AND active = 1",
      toStationId,
    );
    if (!from || !to) throw new UserError("Station not found");
    if (from.zoneId !== to.zoneId) throw new UserError("Sessions can only move to a station in the same zone");
    if (to.maintenance) throw new UserError(`${to.name} is under maintenance`);
    if (get("SELECT 1 AS x FROM sessions WHERE station_id = ? AND billed = 0", toStationId)) {
      throw new UserError(`${to.name} is already in use`);
    }
    run("UPDATE sessions SET station_id = ? WHERE id = ?", toStationId, id);
    audit(staffId, "session.transfer", `${from.name} -> ${to.name}`, now);
  });
}

export function stopSession(id: number, now: number, staffId: string): void {
  tx(() => {
    const s = getSession(id);
    if (s.billed) throw new UserError("This session is already billed");
    if (s.endedAt !== null) return; // double-click safe
    // Time played after the planned time was up is not billed: it is booked as a pause, so the bill is exactly the plan.
    const pausedTotal = s.pausedTotalMs + (s.pausedAt !== null ? Math.max(0, now - s.pausedAt) : 0) + excessMs(s, s.plannedMinutes, now);
    run("UPDATE sessions SET ended_at = ?, paused_at = NULL, paused_total_ms = ? WHERE id = ?", Math.max(now, s.startedAt), pausedTotal, id);
    audit(staffId, "session.stop", `session ${id}`, now);
  });
}

/**
 * Owner only: close a session that was started by mistake. Nothing is billed and no stock moves; the station is free at once.
 * The session stays in the database (cancelled, with the reason) and is listed on the Reports page, but counts nowhere.
 */
export function cancelSession(id: number, reason: string, userId: string, role: "owner" | "staff", now: number): void {
  if (role !== "owner") throw new UserError("Only the owner can cancel a session");
  if (!reason.trim()) throw new UserError("Give a reason for cancelling this session");
  tx(() => {
    const s = getSession(id);
    if (s.billed) throw new UserError(get("SELECT 1 AS x FROM sessions WHERE id = ? AND cancelled = 1", id) ? "This session is already cancelled" : "This session is already billed. Mark its bill invalid instead.");
    const name = get<{ name: string }>("SELECT name FROM stations WHERE id = ?", s.stationId)?.name ?? "Station";
    run(
      `UPDATE sessions SET billed = 1, cancelled = 1, cancel_reason = ?, cancelled_by = ?, cancelled_at = ?,
         ended_at = COALESCE(ended_at, ?), paused_at = NULL WHERE id = ?`,
      reason.trim(), userId, now, Math.max(now, s.startedAt), id,
    );
    audit(userId, "session.cancel", `${name}: ${reason.trim()}`, now);
  });
}

/** Undo a mistaken Stop before the bill is paid. The gap counts as a pause, so it isn't billed. */
export function reopenSession(id: number, now: number, staffId: string): void {
  tx(() => {
    const s = getSession(id);
    if (s.billed) throw new UserError("This session is already billed");
    if (s.endedAt === null) return;
    const gap = Math.max(0, now - s.endedAt);
    run("UPDATE sessions SET paused_total_ms = paused_total_ms + ?, ended_at = NULL WHERE id = ?", gap, id);
    audit(staffId, "session.reopen", `session ${id}, ${Math.round(gap / 1000)}s not billed`, now);
  });
}

export function setNotes(id: number, notes: string): void {
  const s = getSession(id);
  if (s.billed) throw new UserError("This session is already billed");
  run("UPDATE sessions SET notes = ? WHERE id = ?", notes, id);
}

// ---- items (food and extras on the tab) ----
export type SessionItem = { id: number; name: string; qty: number; unitPaise: number; itemId: number | null };

export const listItems = (sessionId: number): SessionItem[] =>
  all<SessionItem>("SELECT id, name, qty, unit_paise AS unitPaise, item_id AS itemId FROM session_items WHERE session_id = ? ORDER BY id", sessionId);

export function addItem(sessionId: number, name: string, qty: number, unitPaise: number, now: number, staffId?: string): void {
  const s = getSession(sessionId);
  if (s.billed) throw new UserError("This session is already billed");
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new UserError("Quantity must be between 1 and 99");
  if (!Number.isInteger(unitPaise) || unitPaise < 0) throw new UserError("Price is not valid");
  run("INSERT INTO session_items (session_id, name, qty, unit_paise, created_at) VALUES (?,?,?,?,?)", sessionId, name, qty, unitPaise, now);
  if (staffId) audit(staffId, "item.add", `session ${sessionId}: ${qty} x ${name} @ ${unitPaise} paise (not on the menu)`, now);
}

/**
 * Put a menu item on the tab at today's price. Stock only leaves when the bill is paid.
 * Returns a warning when the shop count says there is not enough (counting what other open tabs already hold); the item is still added,
 * because counts are typed in by hand and drift, so staff know best.
 */
export function addMenuItem(sessionId: number, menuItemId: number, qty: number, now: number): string | null {
  const s = getSession(sessionId);
  if (s.billed) throw new UserError("This session is already billed");
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new UserError("Quantity must be between 1 and 99");
  const m = getMenuItem(menuItemId);
  if (!m || !m.active) throw new UserError("That item is not on the menu any more");
  run("INSERT INTO session_items (session_id, name, qty, unit_paise, created_at, item_id) VALUES (?,?,?,?,?,?)", sessionId, m.name, qty, m.pricePaise, now, m.id);
  if (!m.trackStock || m.onHand === null) return null;
  const onTabs = get<{ n: number }>("SELECT COALESCE(SUM(i.qty), 0) AS n FROM session_items i JOIN sessions s ON s.id = i.session_id WHERE i.item_id = ? AND s.billed = 0", m.id)?.n ?? 0;
  const left = m.onHand - onTabs;
  if (left >= 0) return null;
  return m.onHand <= 0 ? `${m.name} is out of stock. Added anyway.` : `Only ${m.onHand} ${m.name} in stock, ${onTabs} are now on open tabs. Added anyway.`;
}

export function removeItem(itemId: number, staffId: string, now: number): void {
  const it = get<{ sessionId: number; name: string; qty: number; unitPaise: number }>(
    "SELECT session_id AS sessionId, name, qty, unit_paise AS unitPaise FROM session_items WHERE id = ?",
    itemId,
  );
  if (!it) return;
  if (getSession(it.sessionId).billed) throw new UserError("This session is already billed");
  run("DELETE FROM session_items WHERE id = ?", itemId);
  audit(staffId, "item.remove", `session ${it.sessionId}: ${it.qty} x ${it.name} @ ${it.unitPaise} paise`, now);
}

// ---- floor board ----
export type BoardSession = SessionRow & { customerName: string | null; itemsPaise: number; items: SessionItem[] };
export type BoardStation = { id: number; name: string; maintenance: boolean; session: BoardSession | null };
export type BoardZone = { id: number; name: string; kind: string; stations: BoardStation[] };

export function listBoard(): BoardZone[] {
  const zones = all<{ id: number; name: string; kind: string }>("SELECT id, name, kind FROM zones WHERE active = 1 ORDER BY sort, id");
  const stations = all<{ id: number; zoneId: number; name: string; maintenance: number }>(
    "SELECT id, zone_id AS zoneId, name, maintenance FROM stations WHERE active = 1 ORDER BY sort, id",
  );
  const sessions = all<Raw & { customerName: string | null }>(
    `SELECT ${COLS}, c.name AS customerName
     FROM sessions s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.billed = 0`,
  );
  const items = all<SessionItem & { sessionId: number }>(
    `SELECT i.id, i.session_id AS sessionId, i.name, i.qty, i.unit_paise AS unitPaise, i.item_id AS itemId
     FROM session_items i JOIN sessions s ON s.id = i.session_id WHERE s.billed = 0 ORDER BY i.id`,
  );
  const byStation = new Map<number, BoardSession>();
  for (const r of sessions) {
    const { customerName, ...raw } = r;
    const mine = items.filter((i) => i.sessionId === r.id).map(({ id, name, qty, unitPaise, itemId }) => ({ id, name, qty, unitPaise, itemId }));
    byStation.set(r.stationId, {
      ...toSession(raw),
      customerName,
      items: mine,
      itemsPaise: mine.reduce((sum, i) => sum + i.qty * i.unitPaise, 0),
    });
  }
  return zones.map((z) => ({
    ...z,
    stations: stations
      .filter((s) => s.zoneId === z.id)
      .map((s) => ({ id: s.id, name: s.name, maintenance: s.maintenance === 1, session: byStation.get(s.id) ?? null })),
  }));
}
