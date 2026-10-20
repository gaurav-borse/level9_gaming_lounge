import { test } from "node:test";
import assert from "node:assert/strict";
import { BRAND } from "../lib/brand.ts";

test("brand name is Level 9 Gaming Lounge", () => {
  assert.equal(BRAND.name, "Level 9 Gaming Lounge");
});

test("brand address contains Lohegaon, Pune 47", () => {
  assert.ok(BRAND.address.includes("Lohegaon, Pune 47"), `got: ${BRAND.address}`);
});

test("brand email is configured address", () => {
  assert.equal(BRAND.email, "workwithashop@gmail.com");
});

test("brand hours start at 11:30", () => {
  assert.ok(BRAND.hours.startsWith("11:30"), `got: ${BRAND.hours}`);
});

test("accent colour is carbon red", () => {
  assert.equal(BRAND.colours.accent, "#d4121c");
});

test("logo paths are under /brand/", () => {
  assert.ok(BRAND.logo.banner.startsWith("/brand/"), `banner: ${BRAND.logo.banner}`);
  assert.ok(BRAND.logo.hero.startsWith("/brand/"), `hero: ${BRAND.logo.hero}`);
});
