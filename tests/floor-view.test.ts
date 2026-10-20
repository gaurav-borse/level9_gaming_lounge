import { test } from "node:test";
import assert from "node:assert/strict";
import { attentionRank, greetingFor, initials, pickFeatured, progressFraction, radarPoint, summarize, zoneUsage } from "../lib/floor-view.ts";

test("initials: two names, one name, walk-in, extra spaces, lowercase", () => {
  assert.equal(initials("Asha Rao"), "AR");
  assert.equal(initials("Asha Devi Rao"), "AR");
  assert.equal(initials("asha"), "A");
  assert.equal(initials("  rohit   sharma "), "RS");
  assert.equal(initials(null), "W");
  assert.equal(initials(undefined), "W");
  assert.equal(initials("   "), "W");
});

test("progressFraction: empty at the start, half way, full and clamped at overtime", () => {
  assert.equal(progressFraction(0, 60), 0);
  assert.equal(progressFraction(30 * 60_000, 60), 0.5);
  assert.equal(progressFraction(60 * 60_000, 60), 1);
  assert.equal(progressFraction(90 * 60_000, 60), 1);
  assert.equal(progressFraction(-5, 60), 0);
});

test("progressFraction: no ring for open sessions or a zero length plan", () => {
  assert.equal(progressFraction(10_000, null), null);
  assert.equal(progressFraction(10_000, 0), null);
});

test("summarize counts in use, free, ending soon (including overtime) and skips maintenance from free", () => {
  const s = summarize([
    { maintenance: false, busy: false, status: null },
    { maintenance: false, busy: true, status: "running" },
    { maintenance: false, busy: true, status: "ending" },
    { maintenance: false, busy: true, status: "overtime" },
    { maintenance: false, busy: true, status: "paused" },
    { maintenance: true, busy: false, status: null },
  ]);
  assert.deepEqual(s, { total: 6, inUse: 4, free: 1, ending: 2 });
});

test("summarize on an empty floor", () => {
  assert.deepEqual(summarize([]), { total: 0, inUse: 0, free: 0, ending: 0 });
});

test("attentionRank orders overtime, ending, awaiting payment, running, paused, free, maintenance", () => {
  const order = ["overtime", "ending", "awaiting", "running", "paused", "free", "maintenance"];
  const ranks = order.map(attentionRank);
  assert.deepEqual([...ranks].sort((a, b) => a - b), ranks);
  assert.equal(new Set(ranks).size, order.length);
  assert.ok(attentionRank("something-new") > attentionRank("maintenance"));
});

test("pickFeatured: most urgent status wins, then least time left, then longest played; stopped and idle are never featured", () => {
  const s = (id: number, status: string, remainingMs: number | null, playedMs: number) => ({ id, status, remainingMs, playedMs });
  assert.equal(pickFeatured([]), null);
  assert.equal(pickFeatured([s(1, "awaiting", 0, 5), s(2, "free", null, 0), s(3, "maintenance", null, 0)]), null);
  assert.equal(pickFeatured([s(1, "running", 600_000, 1), s(2, "ending", 300_000, 1)])!.id, 2);
  assert.equal(pickFeatured([s(1, "running", 900_000, 1), s(2, "running", 600_000, 1)])!.id, 2);
  assert.equal(pickFeatured([s(1, "running", null, 10), s(2, "running", null, 99)])!.id, 2); // open sessions: longest played
  assert.equal(pickFeatured([s(1, "running", 1_000, 1), s(2, "overtime", -5_000, 1)])!.id, 2);
});

test("zoneUsage: share of working stations in use; maintenance stations are left out of the count", () => {
  const u = zoneUsage([
    { name: "Pool", stations: [{ busy: true, maintenance: false }, { busy: false, maintenance: false }] },
    { name: "Sim", stations: [{ busy: false, maintenance: true }] },
    { name: "PC", stations: [{ busy: true, maintenance: false }, { busy: false, maintenance: true }] },
  ]);
  assert.deepEqual(u, [{ name: "Pool", value: 0.5 }, { name: "Sim", value: 0 }, { name: "PC", value: 1 }]);
});

test("radarPoint: first corner is straight up, then clockwise; fraction 0 is the centre", () => {
  const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  const [x0, y0] = radarPoint(0, 4, 1, 80, 100, 100);
  near(x0, 100); near(y0, 20);
  const [x1, y1] = radarPoint(1, 4, 1, 80, 100, 100); // right
  near(x1, 180); near(y1, 100);
  const [x2, y2] = radarPoint(2, 4, 0.5, 80, 100, 100); // down, half way
  near(x2, 100); near(y2, 140);
  assert.deepEqual(radarPoint(3, 5, 0, 80, 100, 100), [100, 100]);
});

test("greetingFor: morning from 5, afternoon from noon, evening from 5 pm and through the night", () => {
  assert.equal(greetingFor(5), "Good morning");
  assert.equal(greetingFor(11), "Good morning");
  assert.equal(greetingFor(12), "Good afternoon");
  assert.equal(greetingFor(16), "Good afternoon");
  assert.equal(greetingFor(17), "Good evening");
  assert.equal(greetingFor(23), "Good evening");
  assert.equal(greetingFor(0), "Good evening");
  assert.equal(greetingFor(4), "Good evening");
});
