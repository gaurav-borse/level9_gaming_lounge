import { test } from "node:test";
import assert from "node:assert/strict";
import { PAGE_SIZES, clampPage, pageWindow, parsePageSize } from "../lib/pagination.ts";

test("pageWindow: first, last and the pages around the current one, with gaps marked", () => {
  assert.deepEqual(pageWindow(1, 1), [1]);
  assert.deepEqual(pageWindow(1, 3), [1, 2, 3]);
  assert.deepEqual(pageWindow(1, 10), [1, 2, "…", 10]);
  assert.deepEqual(pageWindow(5, 12), [1, "…", 4, 5, 6, "…", 12]);
  assert.deepEqual(pageWindow(4, 12), [1, 2, 3, 4, 5, "…", 12], "a gap of exactly one page is shown, not hidden");
  assert.deepEqual(pageWindow(12, 12), [1, "…", 11, 12]);
  assert.deepEqual(pageWindow(6, 6), [1, "…", 5, 6]);
});

test("clampPage keeps any address-bar value on a page that exists", () => {
  assert.equal(clampPage("2", 100, 25), 2);
  assert.equal(clampPage("9999", 100, 25), 4, "past the end: the last page");
  assert.equal(clampPage("0", 100, 25), 1);
  assert.equal(clampPage("-3", 100, 25), 1);
  assert.equal(clampPage("abc", 100, 25), 1);
  assert.equal(clampPage(undefined, 100, 25), 1);
  assert.equal(clampPage("2.9", 100, 25), 2);
  assert.equal(clampPage("3", 0, 25), 1, "nothing to show: page 1");
  assert.equal(clampPage("4", 100, 25), 4, "exactly full last page");
  assert.equal(clampPage("5", 101, 25), 5, "one over makes another page");
});

test("parsePageSize: only the offered sizes, 10 by default", () => {
  assert.deepEqual([...PAGE_SIZES], [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  assert.equal(parsePageSize(undefined), 10);
  assert.equal(parsePageSize("10"), 10);
  assert.equal(parsePageSize("50"), 50);
  assert.equal(parsePageSize("100"), 100);
  for (const bad of ["0", "15", "101", "1000", "-10", "abc", "", "1e1", null]) assert.equal(parsePageSize(bad), 10, String(bad));
});
