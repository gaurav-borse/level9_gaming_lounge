import { test } from "node:test";
import assert from "node:assert/strict";
import { attentionRank, greetingFor, initials, pickFeatured, progressFraction, summarize, zoneAvailability } from "../lib/floor-view.ts";

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
    { maintenance: false, busy: true, status: "timeup" },
    { maintenance: false, busy: true, status: "paused" },
    { maintenance: true, busy: false, status: null },
  ]);
  assert.deepEqual(s, { total: 6, inUse: 4, free: 1, ending: 2 });
});

test("summarize on an empty floor", () => {
  assert.deepEqual(summarize([]), { total: 0, inUse: 0, free: 0, ending: 0 });
});

test("attentionRank orders overtime, ending, awaiting payment, running, paused, free, maintenance", () => {
  const order = ["timeup", "ending", "awaiting", "running", "paused", "free", "maintenance"];
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
  assert.equal(pickFeatured([s(1, "running", 1_000, 1), s(2, "timeup", -5_000, 1)])!.id, 2);
});

test("zoneAvailability: free count per zone, maintenance left out, next station to free up (overtime and payment first)", () => {
  const st = (name: string, o: { maintenance?: boolean; busy?: boolean; payment?: boolean; remainingMs?: number | null } = {}) => ({ name, maintenance: false, busy: false, payment: false, remainingMs: null, ...o });
  const u = zoneAvailability([
    { name: "Pool", stations: [st("Pool 1"), st("Pool 2", { busy: true, remainingMs: 600_000 })] },
    { name: "Sim", stations: [st("Sim 1", { maintenance: true })] },
    { name: "PS5", stations: [st("PS5 1", { busy: true, remainingMs: 900_000 }), st("PS5 2", { busy: true, remainingMs: 300_000 }), st("PS5 3", { maintenance: true })] },
    { name: "PC", stations: [st("PC 1", { busy: true, remainingMs: -60_000 }), st("PC 2", { busy: true, payment: true, remainingMs: 1 }), st("PC 3", { busy: true, remainingMs: null })] },
    { name: "Old", stations: [st("Old 1", { busy: true, remainingMs: null })] },
  ]);
  assert.deepEqual(u[0], { name: "Pool", usable: 2, free: 1, next: { station: "Pool 2", ms: 600_000, payment: false } });
  assert.deepEqual(u[1], { name: "Sim", usable: 0, free: 0, next: null });
  assert.deepEqual(u[2], { name: "PS5", usable: 2, free: 0, next: { station: "PS5 2", ms: 300_000, payment: false } });
  assert.equal(u[3].free, 0);
  assert.deepEqual(u[3].next, { station: "PC 1", ms: -60_000, payment: false }, "overtime is the soonest");
  assert.deepEqual(u[4].next, { station: "Old 1", ms: null, payment: false }, "a session without an end time is still reported");
  const pay = zoneAvailability([{ name: "X", stations: [st("X 1", { busy: true, payment: true, remainingMs: 5 }), st("X 2", { busy: true, remainingMs: 100_000 })] }]);
  assert.deepEqual(pay[0].next, { station: "X 1", ms: 0, payment: true });
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
