import { test } from "node:test";
import assert from "node:assert/strict";
import { rupees, rupeesExact, rupeesShort, hms, invoiceNo } from "../lib/format.ts";
import { hhmm, minToHHMM } from "../lib/validate.ts";
import { liveInfo } from "../lib/live.ts";
import type { BoardSession } from "../lib/db/sessions.ts";

test("rupees: whole amounts have no decimals, Indian grouping", () => {
  assert.equal(rupees(15000), "₹150");
  assert.equal(rupees(15050), "₹150.50");
  assert.equal(rupees(12345600), "₹1,23,456");
  assert.equal(rupees(0), "₹0");
  assert.equal(rupees(7), "₹0.07");
});

test("hms and invoiceNo", () => {
  assert.equal(hms(3_909_000), "1:05:09");
  assert.equal(hms(-5000), "0:00:00");
  assert.equal(hms(0), "0:00:00");
  assert.equal(invoiceNo(42), "INV-000042");
});

test("hhmm parses times and rejects junk", () => {
  assert.equal(hhmm("14:30", "From"), 870);
  assert.equal(hhmm("00:00", "From"), 0);
  assert.equal(hhmm("24:00", "To", true), 1440);
  for (const bad of ["24:00", "25:00", "9", "12:60", "ab:cd", "", "12:5"]) assert.throws(() => hhmm(bad, "T"), /like 14:30/, bad);
  assert.equal(minToHHMM(870), "14:30");
  assert.equal(minToHHMM(1440), "24:00");
});

const MIN = 60000;
const session = (over: Partial<BoardSession> = {}): BoardSession => ({
  id: 1, stationId: 1, customerId: null, staffId: "u", startedAt: 0, plannedMinutes: 60,
  players: 1, addedControllers: 0, addedControllersPaise: 0, pausedAt: null, pausedTotalMs: 0, endedAt: null, notes: "",
  billed: false, customerName: null, itemsPaise: 4000, items: [],
  rate: { rateId: 1, name: "S", hourlyPaise: 15000, extraControllerPaise: 0, incrementMin: 1 },
  ...over,
});

test("liveInfo: running, ending, time up (the clock stops), awaiting payment", () => {
  const a = liveInfo(session(), 10, 30 * MIN);
  assert.equal(a.status, "running");
  assert.equal(a.chargePaise, 15000, "the planned hour is charged from the start");
  assert.equal(a.totalPaise, 19000); // + items
  assert.equal(a.remainingMs, 30 * MIN);
  assert.equal(liveInfo(session(), 10, 55 * MIN).status, "ending");
  const over = liveInfo(session(), 10, 70 * MIN);
  assert.equal(over.status, "timeup");
  assert.equal(over.remainingMs, 0, "the clock stops at the planned time");
  assert.equal(over.playedMs, 60 * MIN);
  assert.equal(over.chargePaise, 15000, "and nothing more is charged");
  const done = liveInfo(session({ endedAt: 40 * MIN }), 10, 999 * MIN);
  assert.equal(done.status, "awaiting");
  assert.equal(done.playedMs, 40 * MIN); // frozen at stop, doesn't keep growing
});

test("rupeesExact always shows two decimals", () => {
  assert.equal(rupeesExact(24000), "₹240.00");
  assert.equal(rupeesExact(3750), "₹37.50");
  assert.equal(rupeesExact(5), "₹0.05");
  assert.equal(rupeesExact(123456789), "₹12,34,567.89");
  assert.equal(rupeesExact(-1999), "-₹19.99");
});

test("rupeesShort keeps chart labels short and never inflates a figure", () => {
  assert.equal(rupeesShort(0), "₹0");
  assert.equal(rupeesShort(45000), "₹450");
  assert.equal(rupeesShort(99949), "₹999");
  assert.equal(rupeesShort(100000), "₹1k");
  assert.equal(rupeesShort(1234500), "₹12.3k");
  assert.equal(rupeesShort(12345600), "₹1.2L");
  assert.equal(rupeesShort(340000000), "₹34L");
  assert.equal(rupeesShort(12340000000), "₹12.3Cr");
  assert.equal(rupeesShort(-250000), "-₹2.5k");
});
