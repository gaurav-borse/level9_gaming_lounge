import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDb, closeDb } from "../lib/db/index.ts";
import { seedLevel9Starter } from "../lib/db/seed.ts";
import { startSession, getSession, listBoard } from "../lib/db/sessions.ts";
import { station, T0 } from "./helpers.ts";

test("a running session survives closing and reopening the database file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lounge-"));
  process.env.LOUNGE_DB = path.join(dir, "lounge.db");
  try {
    closeDb();
    getDb();
    seedLevel9Starter();
    const id = startSession({ stationId: station("ps5"), staffId: "u1", plannedMinutes: 60, players: 2, now: T0 });
    closeDb(); // simulates the laptop being switched off
    getDb(); // simulates start.bat the next morning
    const s = getSession(id);
    assert.equal(s.startedAt, T0);
    assert.equal(s.plannedMinutes, 60);
    assert.equal(s.players, 2);
    assert.equal(listBoard().flatMap((z) => z.stations).filter((x) => x.session).length, 1);
  } finally {
    closeDb();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
