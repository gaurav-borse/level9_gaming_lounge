import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCENT_PRESETS, DEFAULT_ACCENT, isAccent, onAccent, parseAccent } from "../lib/accent.ts";

test("parseAccent keeps a valid hex (lowercased) and falls back to the default for anything else", () => {
  assert.equal(parseAccent("#D4121C"), "#d4121c");
  assert.equal(parseAccent("#3dbda7"), "#3dbda7");
  for (const bad of [undefined, null, "", "red", "#fff", "#12345", "#1234567", "3dbda7", '#aaaaaa"onload="x', "#ggg000", 42]) {
    assert.equal(parseAccent(bad), DEFAULT_ACCENT, String(bad));
  }
});

test("isAccent only accepts #rrggbb", () => {
  assert.equal(isAccent("#a1B2c3"), true);
  assert.equal(isAccent("#a1b2c"), false);
  assert.equal(isAccent(undefined), false);
});

test("onAccent: dark text on light accents, white text on dark ones", () => {
  assert.equal(onAccent("#3dbda7"), "#06100e"); // teal
  assert.equal(onAccent("#f59e0b"), "#06100e"); // amber
  assert.equal(onAccent("#84cc16"), "#06100e"); // lime
  assert.equal(onAccent("#d4121c"), "#ffffff"); // Level 9 red
  assert.equal(onAccent("#8b5cf6"), "#06100e"); // violet is just light enough: black has the better contrast
  assert.equal(onAccent("#1d4ed8"), "#ffffff"); // deep blue
  assert.equal(onAccent("#000000"), "#ffffff");
  assert.equal(onAccent("#ffffff"), "#06100e");
});

test("every preset is a valid accent and the default is the first one", () => {
  assert.equal(ACCENT_PRESETS[0].hex, DEFAULT_ACCENT);
  for (const p of ACCENT_PRESETS) assert.ok(isAccent(p.hex), p.name);
});
