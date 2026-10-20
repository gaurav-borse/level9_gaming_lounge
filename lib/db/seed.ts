import { get, run, tx } from "./index.ts";

/** Level 9's starting zones and rates (from its WhatsApp rate card). Only runs on an empty catalog. */
export function seedLevel9Starter(): void {
  tx(() => {
    if (get("SELECT 1 AS x FROM zones")) return;
    const starter = [
      { zone: "Pool Tables", kind: "pool", station: "Pool 1", rupees: 150 },
      { zone: "PS5 Zone", kind: "ps5", station: "PS5 1", rupees: 150 },
      { zone: "PC Gaming", kind: "pc", station: "PC 1", rupees: 130 },
      { zone: "Sim Racing", kind: "sim", station: "Sim 1", rupees: 150 },
    ];
    starter.forEach((s, i) => {
      const zoneId = Number(run("INSERT INTO zones (name, kind, sort) VALUES (?, ?, ?)", s.zone, s.kind, i + 1).lastInsertRowid);
      run("INSERT INTO stations (zone_id, name, sort) VALUES (?, ?, ?)", zoneId, s.station, i + 1);
      run("INSERT INTO rates (zone_id, name, hourly_paise) VALUES (?, 'Standard', ?)", zoneId, s.rupees * 100);
    });
  });
}
