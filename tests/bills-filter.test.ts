import { test } from "node:test";
import assert from "node:assert/strict";
import { dayStart, hasFilter, invoiceNumberFrom, parseBillFilter } from "../lib/bills-filter.ts";

test("invoiceNumberFrom understands the ways people type an invoice number", () => {
  for (const q of ["INV-000012", "inv-12", "inv 12", "INV12", "#12", "12", " 000012 "]) assert.equal(invoiceNumberFrom(q), 12, q);
  for (const q of ["", "PC 1", "Rahul", "12a", "INV-", "1234567890"]) assert.equal(invoiceNumberFrom(q), null, q);
});

test("dayStart: a real date is local midnight, anything else is nothing", () => {
  assert.equal(dayStart("2026-10-06"), new Date(2026, 9, 6).getTime());
  for (const v of [undefined, "", "06-10-2026", "2026-13-01", "2026-02-30", "yesterday"]) assert.equal(dayStart(v), undefined, String(v));
});

test("parseBillFilter keeps valid values, makes 'to' inclusive of that whole day, and ignores junk", () => {
  const f = parseBillFilter({ q: "  PC 1 ", method: "upi", status: "void", from: "2026-10-01", to: "2026-10-06" });
  assert.deepEqual(f, { q: "PC 1", method: "upi", status: "void", from: new Date(2026, 9, 1).getTime(), to: new Date(2026, 9, 7).getTime() });
  assert.deepEqual(parseBillFilter({ method: "bitcoin", status: "maybe", from: "nope", q: "   " }), {});
  assert.deepEqual(parseBillFilter({ method: ["card", "cash"] }), { method: "card" }, "a repeated parameter uses the first value");
  assert.equal(parseBillFilter({ q: "x".repeat(500) }).q!.length, 60);
  assert.equal(hasFilter({}), false);
  assert.equal(hasFilter({ method: "cash" }), true);
});
