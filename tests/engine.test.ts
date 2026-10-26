import { test } from "node:test";
import assert from "node:assert/strict";
import { billableMs, chargedMinutes, sessionChargePaise, sessionStatus } from "../lib/engine/pricing.ts";
import type { RateSnapshot, SessionTimes } from "../lib/engine/pricing.ts";
import { pickRate } from "../lib/engine/rates.ts";
import type { RateRow } from "../lib/engine/rates.ts";
import { computeBill, validatePayments } from "../lib/engine/bill.ts";
import { upiLink } from "../lib/engine/upi.ts";

const MIN = 60000;
const rate: RateSnapshot = {
  rateId: 1, name: "PS5", hourlyPaise: 15000, extraControllerPaise: 0,
  incrementMin: 1,
};
const t0 = 1_700_000_000_000;
const times = (over: Partial<SessionTimes> = {}): SessionTimes => ({
  startedAt: t0, endedAt: null, pausedAt: null, pausedTotalMs: 0, ...over,
});

test("billableMs subtracts closed and open pauses", () => {
  assert.equal(billableMs(times({ pausedTotalMs: 10 * MIN }), t0 + 60 * MIN), 50 * MIN);
  assert.equal(billableMs(times({ pausedAt: t0 + 30 * MIN }), t0 + 60 * MIN), 30 * MIN);
  assert.equal(billableMs(times({ endedAt: t0 + 20 * MIN }), t0 + 999 * MIN), 20 * MIN);
});

test("billableMs never goes negative (clock moved back)", () => {
  assert.equal(billableMs(times({ pausedTotalMs: 99 * MIN }), t0 + MIN), 0);
  assert.equal(billableMs(times(), t0 - 5 * MIN), 0);
});

test("with no planned time (old sessions) the time played is what is charged, rounded up to the minute", () => {
  assert.equal(chargedMinutes(2 * MIN, rate, null), 2);
  assert.equal(chargedMinutes(20 * MIN + 1, rate, null), 21);
  assert.equal(chargedMinutes(20 * MIN, rate, null), 20);
  assert.equal(chargedMinutes(0, rate, null), 0);
});

test("increment rounding", () => {
  assert.equal(chargedMinutes(31 * MIN, { ...rate, incrementMin: 15 }, null), 45);
});

test("a planned session is charged its whole planned time from the start, however early it stops", () => {
  assert.equal(chargedMinutes(0, rate, 60), 60);
  assert.equal(chargedMinutes(2 * MIN, rate, 30), 30);
  assert.equal(chargedMinutes(40 * MIN, rate, 60), 60);
  assert.equal(chargedMinutes(60 * MIN, rate, 60), 60);
});

test("time past the planned time is added minute by minute (or by the step)", () => {
  assert.equal(chargedMinutes(60 * MIN + 1, rate, 60), 61);
  assert.equal(chargedMinutes(75 * MIN, rate, 60), 75);
  assert.equal(chargedMinutes(61 * MIN, { ...rate, incrementMin: 15 }, 60), 75);
});

test("charge is minutes * hourly / 60, rounded once", () => {
  assert.equal(sessionChargePaise(60 * MIN, rate, 1, null), 15000);
  assert.equal(sessionChargePaise(20 * MIN, rate, 1, null), 5000);
  assert.equal(sessionChargePaise(17 * MIN, { ...rate, hourlyPaise: 13000 }, 1, null), 3683); // 3683.33
});

test("the planned price shows the moment a session starts, and grows only after the time is up", () => {
  assert.equal(sessionChargePaise(0, { ...rate, hourlyPaise: 16900 }, 1, 60), 16900);
  assert.equal(sessionChargePaise(0, { ...rate, hourlyPaise: 16900 }, 1, 30), 8450);
  assert.equal(sessionChargePaise(59 * MIN, { ...rate, hourlyPaise: 16900 }, 1, 60), 16900);
  assert.equal(sessionChargePaise(90 * MIN, { ...rate, hourlyPaise: 16900 }, 1, 60), 25350);
});

test("extra controllers add pro rata", () => {
  const r = { ...rate, extraControllerPaise: 5000 };
  assert.equal(sessionChargePaise(60 * MIN, r, 3, null), 15000 + 2 * 5000);
  assert.equal(sessionChargePaise(60 * MIN, rate, 4, null), 15000); // zone without extras ignores players
  assert.equal(sessionChargePaise(0, r, 2, 60), 20000, "and a planned session includes them from the start");
});

test("status: running, ending, time up, paused", () => {
  const T = times();
  assert.equal(sessionStatus(T, null, 10, t0 + 500 * MIN), "running");
  assert.equal(sessionStatus(T, 60, 10, t0 + 30 * MIN), "running");
  assert.equal(sessionStatus(T, 60, 10, t0 + 50 * MIN), "ending");
  assert.equal(sessionStatus(T, 60, 10, t0 + 60 * MIN), "timeup");
  assert.equal(sessionStatus(times({ pausedAt: t0 + 5 * MIN }), 60, 10, t0 + 55 * MIN), "paused");
});

test("pause pushes the end out", () => {
  const T = times({ pausedTotalMs: 20 * MIN });
  assert.equal(sessionStatus(T, 60, 10, t0 + 70 * MIN), "ending"); // 50 played of 60
});

const base: RateRow = {
  id: 1, zoneId: 1, name: "Std", hourlyPaise: 15000, extraControllerPaise: 0,
  incrementMin: 1, daysMask: 127, fromMin: 0, toMin: 1440, priority: 0,
};

test("pickRate: priority, window, zone, none", () => {
  const happy: RateRow = { ...base, id: 2, name: "Happy", hourlyPaise: 10000, fromMin: 14 * 60, toMin: 17 * 60, priority: 5 };
  const rows = [base, happy, { ...base, id: 3, zoneId: 2 }];
  const at = (h: number) => new Date(2026, 9, 7, h, 0);
  assert.equal(pickRate(rows, 1, at(15))!.id, 2);
  assert.equal(pickRate(rows, 1, at(18))!.id, 1);
  assert.equal(pickRate(rows, 9, at(15)), null);
});

test("pickRate: day mask and overnight window", () => {
  const weekend: RateRow = { ...base, id: 4, daysMask: (1 << 0) | (1 << 6), priority: 3 };
  const sunday = new Date(2026, 9, 4, 12, 0);
  const monday = new Date(2026, 9, 5, 12, 0);
  assert.equal(pickRate([base, weekend], 1, sunday)!.id, 4);
  assert.equal(pickRate([base, weekend], 1, monday)!.id, 1);
  const night: RateRow = { ...base, id: 5, fromMin: 22 * 60, toMin: 2 * 60, priority: 9 };
  assert.equal(pickRate([base, night], 1, new Date(2026, 9, 5, 23, 30))!.id, 5);
  assert.equal(pickRate([base, night], 1, new Date(2026, 9, 5, 1, 0))!.id, 5);
  assert.equal(pickRate([base, night], 1, new Date(2026, 9, 5, 12, 0))!.id, 1);
});

test("computeBill: flat and percent discount, clamped", () => {
  const lines = [
    { kind: "session" as const, name: "PS5", qty: 1, unitPaise: 15000, taxPct: 0 },
    { kind: "item" as const, name: "Coke", qty: 2, unitPaise: 4000, taxPct: 0 },
  ];
  assert.equal(computeBill(lines, null).totalPaise, 23000);
  assert.equal(computeBill(lines, { type: "flat", value: 3000 }).totalPaise, 20000);
  assert.equal(computeBill(lines, { type: "percent", value: 10 }).totalPaise, 20700);
  assert.equal(computeBill(lines, { type: "flat", value: 999999 }).totalPaise, 0);
  assert.equal(computeBill(lines, { type: "percent", value: 150 }).totalPaise, 0);
});

test("computeBill: inclusive tax breakup after discount", () => {
  const lines = [{ kind: "session" as const, name: "PC", qty: 1, unitPaise: 11800, taxPct: 18 }];
  const b = computeBill(lines, null);
  assert.equal(b.taxPaise, 1800);
  assert.equal(b.totalPaise, 11800);
  assert.equal(computeBill(lines, { type: "flat", value: 1180 }).taxPaise, 1620);
});

test("computeBill: empty bill is zero", () => {
  assert.deepEqual(computeBill([], null), { subtotalPaise: 0, discountPaise: 0, taxPaise: 0, totalPaise: 0 });
});

test("validatePayments", () => {
  assert.equal(validatePayments(1000, [{ method: "cash", amountPaise: 1000 }]), null);
  assert.equal(validatePayments(1000, [{ method: "cash", amountPaise: 400 }, { method: "upi", amountPaise: 600 }]), null);
  assert.match(validatePayments(1000, [{ method: "cash", amountPaise: 999 }])!, /add up/);
  assert.match(validatePayments(1000, [])!, /at least one/);
  assert.match(validatePayments(1000, [{ method: "cash", amountPaise: -5 }, { method: "upi", amountPaise: 1005 }])!, /positive/);
  assert.match(validatePayments(1000, [{ method: "wallet" as never, amountPaise: 1000 }])!, /Unknown/);
  assert.equal(validatePayments(0, []), null);
});

test("upiLink carries exact amount and encodes hostile names", () => {
  const url = upiLink({ upiId: "level9@okhdfc", name: "Level 9 Gaming Lounge", amountPaise: 20050, note: "INV-12" });
  assert.match(url, /^upi:\/\/pay\?/);
  assert.match(url, /am=200\.50/);
  assert.match(url, /pa=level9%40okhdfc/);
  const nasty = upiLink({ upiId: "level9@okhdfc", name: "Tom & Jerry's #1", amountPaise: 100, note: "a&am=1" });
  assert.equal(new URL(nasty).searchParams.get("am"), "1.00"); // injected "&am=1" can't override the amount
  assert.throws(() => upiLink({ upiId: "bad id", name: "x", amountPaise: 100, note: "n" }));
  assert.throws(() => upiLink({ upiId: "a@b", name: "x", amountPaise: 0, note: "n" }));
  assert.throws(() => upiLink({ upiId: "level9@okhdfc", name: "x", amountPaise: 10.5, note: "n" }));
});

test("pickRate: after midnight an overnight window belongs to the day it started on", () => {
  const FRI = 1 << 5, SAT = 1 << 6, SUN = 1 << 0;
  const weekendNight: RateRow = { ...base, id: 7, daysMask: FRI | SAT | SUN, fromMin: 18 * 60, toMin: 2 * 60, priority: 9 };
  const at = (day: number, h: number) => new Date(2026, 9, day, h, 0); // Oct 4 = Sunday ... Oct 10 = Saturday
  const id = (d: Date) => pickRate([base, weekendNight], 1, d)!.id;
  assert.equal(id(at(5, 1)), 7, "Monday 01:00 is still Sunday night");
  assert.equal(id(at(10, 1)), 7, "Saturday 01:00 is still Friday night");
  assert.equal(id(at(11, 1)), 7, "Sunday 01:00 is still Saturday night");
  assert.equal(id(at(9, 1)), 1, "Friday 01:00 is Thursday night: no weekend rate");
  assert.equal(id(at(4, 19)), 7, "Sunday 19:00");
  assert.equal(id(at(5, 19)), 1, "Monday 19:00");
});

test("percent discounts round once, half up, in whole paise (decimals included)", () => {
  const line = (paise: number) => [{ kind: "session" as const, name: "x", qty: 1, unitPaise: paise, taxPct: 0 }];
  const d = (sub: number, value: number) => computeBill(line(sub), { type: "percent", value }).discountPaise;
  assert.equal(d(1001, 7.5), 75, "75.075 rounds down");
  assert.equal(d(200, 12.25), 25, "24.5 rounds half up");
  assert.equal(d(6717, 10), 672, "671.7 rounds up");
  assert.equal(d(1, 50), 1, "0.5 rounds up to 1");
  assert.equal(d(99, 0.01), 0);
  assert.equal(d(100000, 33.33), 33330);
  assert.equal(d(5, 100), 5);
  // for whole percentages the answer is exactly the plain formula, for any amount
  for (let sub = 0; sub <= 3000; sub += 7) for (const pct of [1, 5, 10, 15, 18, 25, 50, 99]) assert.equal(d(sub, pct), Math.round((sub * pct) / 100), `${sub} at ${pct}%`);
  // and the bill still adds up
  const b = computeBill(line(6717), { type: "percent", value: 7.5 });
  assert.equal(b.subtotalPaise - b.discountPaise, b.totalPaise);
});

test("upiLink writes spaces as %20", () => {
  const url = upiLink({ upiId: "level9@okhdfc", name: "Level 9 Gaming Lounge & Cafe", amountPaise: 1005, note: "INV 1" });
  assert.ok(!url.includes("+"), url);
  assert.match(url, /pn=Level%209%20Gaming%20Lounge%20%26%20Cafe/);
  assert.equal(new URL(url).searchParams.get("pn"), "Level 9 Gaming Lounge & Cafe");
  assert.equal(new URL(url).searchParams.get("am"), "10.05");
});
