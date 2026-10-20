import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllTime, whenText } from "../lib/engine/rates.ts";

const r = (daysMask: number, fromMin: number, toMin: number) => ({ daysMask, fromMin, toMin });

test("isAllTime: only every day, all day counts as the normal price", () => {
  assert.equal(isAllTime(r(127, 0, 1440)), true);
  assert.equal(isAllTime(r(126, 0, 1440)), false, "missing a day");
  assert.equal(isAllTime(r(127, 840, 1440)), false, "starts late");
  assert.equal(isAllTime(r(127, 0, 1020)), false, "ends early");
});

test("whenText reads like a person would say it", () => {
  assert.equal(whenText(r(127, 0, 1440)), "Every day · all day");
  assert.equal(whenText(r(0b0111110, 840, 1020)), "Mon–Fri · 14:00–17:00");
  assert.equal(whenText(r(0b1000001, 0, 1440)), "Sat & Sun · all day");
  assert.equal(whenText(r(0b0010100, 1320, 120)), "Tue, Thu · 22:00–02:00", "overnight");
});
