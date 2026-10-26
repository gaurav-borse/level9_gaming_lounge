import { all, get, run, tx } from "./index.ts";
import { UserError } from "../errors.ts";
import type { RateRow } from "../engine/rates.ts";

export type Zone = { id: number; name: string; kind: string };
export type Station = { id: number; zoneId: number; name: string; maintenance: boolean };

export const ZONE_KINDS = ["pool", "ps5", "pc", "sim", "vr", "custom"] as const;

const dupe = (e: unknown, msg: string): never => {
  if (e instanceof Error && /UNIQUE/.test(e.message)) throw new UserError(msg);
  throw e;
};

// ---- zones ----
export const listZones = (): Zone[] => all<Zone>("SELECT id, name, kind FROM zones WHERE active = 1 ORDER BY sort, id");

export function createZone(name: string, kind: string): number {
  try {
    return Number(run("INSERT INTO zones (name, kind, sort) VALUES (?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM zones))", name, kind).lastInsertRowid);
  } catch (e) {
    return dupe(e, `A zone called "${name}" already exists`);
  }
}

export function renameZone(id: number, name: string, kind: string): void {
  try {
    run("UPDATE zones SET name = ?, kind = ? WHERE id = ? AND active = 1", name, kind, id);
  } catch (e) {
    dupe(e, `A zone called "${name}" already exists`);
  }
}

export function archiveZone(id: number): void {
  tx(() => {
    if (get("SELECT 1 AS x FROM stations WHERE zone_id = ? AND active = 1", id)) {
      throw new UserError("Remove this zone's stations first");
    }
    run("UPDATE zones SET active = 0 WHERE id = ?", id);
    run("UPDATE rates SET active = 0 WHERE zone_id = ?", id);
  });
}

// ---- stations ----
type StationRaw = Omit<Station, "maintenance"> & { maintenance: number };
const toStation = (r: StationRaw): Station => ({ ...r, maintenance: r.maintenance === 1 });

export const listStations = (): Station[] =>
  all<StationRaw>("SELECT id, zone_id AS zoneId, name, maintenance FROM stations WHERE active = 1 ORDER BY sort, id").map(toStation);

export function createStation(zoneId: number, name: string): number {
  if (!get("SELECT 1 AS x FROM zones WHERE id = ? AND active = 1", zoneId)) throw new UserError("Zone not found");
  try {
    return Number(run("INSERT INTO stations (zone_id, name, sort) VALUES (?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM stations))", zoneId, name).lastInsertRowid);
  } catch (e) {
    return dupe(e, `A station called "${name}" already exists in this zone`);
  }
}

const inUse = (stationId: number): boolean => !!get("SELECT 1 AS x FROM sessions WHERE station_id = ? AND billed = 0", stationId);

export function updateStation(id: number, name: string, maintenance: boolean): void {
  tx(() => {
    if (maintenance && inUse(id)) throw new UserError("Finish and bill the running session before maintenance");
    try {
      run("UPDATE stations SET name = ?, maintenance = ? WHERE id = ? AND active = 1", name, maintenance ? 1 : 0, id);
    } catch (e) {
      dupe(e, `A station called "${name}" already exists in this zone`);
    }
  });
}

export function archiveStation(id: number): void {
  tx(() => {
    if (inUse(id)) throw new UserError("Finish and bill the running session first");
    run("UPDATE stations SET active = 0 WHERE id = ?", id);
  });
}

// ---- rates ----
export type RateInput = Omit<RateRow, "id"> & { id?: number };

export const listRates = (): RateRow[] =>
  all<RateRow>(
    `SELECT id, zone_id AS zoneId, name, hourly_paise AS hourlyPaise, extra_controller_paise AS extraControllerPaise,
            increment_min AS incrementMin, days_mask AS daysMask,
            from_min AS fromMin, to_min AS toMin, priority
     FROM rates WHERE active = 1 ORDER BY zone_id, priority DESC, id`,
  );

export function saveRate(r: RateInput): number {
  if (!get("SELECT 1 AS x FROM zones WHERE id = ? AND active = 1", r.zoneId)) throw new UserError("Zone not found");
  const v = [r.zoneId, r.name, r.hourlyPaise, r.extraControllerPaise, r.incrementMin, r.daysMask, r.fromMin, r.toMin, r.priority] as const;
  if (r.id === undefined) {
    return Number(run(
      `INSERT INTO rates (zone_id, name, hourly_paise, extra_controller_paise, increment_min, days_mask, from_min, to_min, priority)
       VALUES (?,?,?,?,?,?,?,?,?)`, ...v).lastInsertRowid);
  }
  run(
    `UPDATE rates SET zone_id=?, name=?, hourly_paise=?, extra_controller_paise=?, increment_min=?, days_mask=?, from_min=?, to_min=?, priority=?
     WHERE id=? AND active = 1`, ...v, r.id);
  return r.id;
}

export const archiveRate = (id: number): void => void run("UPDATE rates SET active = 0 WHERE id = ?", id);
