import { getDb, closeDb, get } from "../lib/db/index.ts";
import { seedLevel9Starter } from "../lib/db/seed.ts";
import { listStations, listZones } from "../lib/db/catalog.ts";

export const MIN = 60000;
export const T0 = new Date(2026, 9, 7, 15, 0).getTime(); // Wed 15:00 local

/** Brand-new in-memory database with Level 9's starter zones, stations and rates. */
export function freshDb(): void {
  process.env.LOUNGE_DB = ":memory:";
  closeDb();
  getDb();
  seedLevel9Starter();
}

export function station(zoneKind: string): number {
  const zone = listZones().find((z) => z.kind === zoneKind)!;
  return listStations().find((s) => s.zoneId === zone.id)!.id;
}

export function zoneOf(stationId: number): number {
  return get<{ zoneId: number }>("SELECT zone_id AS zoneId FROM stations WHERE id = ?", stationId)!.zoneId;
}
