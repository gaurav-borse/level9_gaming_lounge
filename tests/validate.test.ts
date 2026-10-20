import { test } from "node:test";
import assert from "node:assert/strict";
import { str, int, parsePercent, rupeesToPaise, oneOf, bool } from "../lib/validate.ts";
import { normalizePhone } from "../lib/phone.ts";
import { UserError } from "../lib/errors.ts";

test("str trims, requires and caps length", () => {
  assert.equal(str("  Ali  ", "Name"), "Ali");
  assert.throws(() => str("   ", "Name"), UserError);
  assert.throws(() => str("x".repeat(201), "Name"), /too long/);
  assert.equal(str(undefined, "Notes", { required: false }), "");
  assert.equal(str("<script>alert(1)</script>", "Name"), "<script>alert(1)</script>"); // stored raw, React escapes on render
});

test("int rejects floats, NaN, blanks and out-of-range", () => {
  assert.equal(int("15", "Minutes"), 15);
  assert.throws(() => int("1.5", "Minutes"), /whole number/);
  assert.throws(() => int("", "Minutes"), /whole number/);
  assert.throws(() => int("abc", "Minutes"), /whole number/);
  assert.throws(() => int(NaN, "Minutes"), /whole number/);
  assert.throws(() => int(-1, "Minutes"), /between/);
  assert.throws(() => int(5, "Minutes", { max: 4 }), /between/);
});

test("rupeesToPaise handles rupees and paise, rejects junk", () => {
  assert.equal(rupeesToPaise("150", "Rate"), 15000);
  assert.equal(rupeesToPaise("150.5", "Rate"), 15050);
  assert.equal(rupeesToPaise("0.07", "Rate"), 7);
  for (const bad of ["-5", "1e3", "1,000", "12.345", "", "abc", "NaN", "Infinity"]) {
    assert.throws(() => rupeesToPaise(bad, "Rate"), UserError, bad);
  }
  assert.throws(() => rupeesToPaise("99999999", "Rate"), /out of range/);
});

test("oneOf and bool", () => {
  assert.equal(oneOf("cash", ["cash", "upi"] as const, "Method"), "cash");
  assert.throws(() => oneOf("wallet", ["cash", "upi"] as const, "Method"), UserError);
  assert.equal(bool("on"), true);
  assert.equal(bool(undefined), false);
});

test("normalizePhone", () => {
  assert.equal(normalizePhone("98765 43210"), "919876543210");
  assert.equal(normalizePhone("+91 98765-43210"), "919876543210");
  assert.equal(normalizePhone("09876543210"), "919876543210");
  assert.equal(normalizePhone("0091 9876543210"), "919876543210");
  assert.equal(normalizePhone("+1 415 555 2671"), "14155552671");
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizePhone("abc"), null);
  assert.equal(normalizePhone(""), null);
});

test("int takes plain digits only: no exponent, hex, binary or trailing .0", () => {
  for (const bad of ["1e3", "0x10", "0b11", "5.0", "1_000", "+5", "5 6", "--1"]) assert.throws(() => int(bad, "Minutes", { max: 100000 }), /whole number/, bad);
  assert.equal(int(" 60 ", "Minutes"), 60);
  assert.equal(int("007", "Minutes"), 7);
  assert.equal(int("-3", "Offset", { min: -5 }), -3);
});

test("parsePercent: 0 to 100 with at most two decimals", () => {
  assert.equal(parsePercent("10"), 10);
  assert.equal(parsePercent(" 7.5 "), 7.5);
  assert.equal(parsePercent("12.25"), 12.25);
  assert.equal(parsePercent("100"), 100);
  assert.equal(parsePercent("0"), 0);
  for (const bad of ["100.01", "101", "-1", "7.123", "1e1", ".5", "", "abc", "5%", "1000", undefined, 7]) assert.equal(parsePercent(bad), null, String(bad));
});
