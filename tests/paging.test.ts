import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshDb, station, MIN, T0 } from "./helpers.ts";
import { createCustomer, countCustomers, listCustomers } from "../lib/db/customers.ts";
import { buildDraft, countBills, finalizeBill, listBills } from "../lib/db/bills.ts";
import { startSession, stopSession } from "../lib/db/sessions.ts";

beforeEach(freshDb);

test("customers: pages cover everyone exactly once, and the count follows the search", () => {
  for (let i = 0; i < 7; i++) createCustomer(`Cust ${i}`, i < 4 ? `98765 4321${i}` : "");
  createCustomer("Other Person", "");
  assert.equal(countCustomers(), 8);
  const pages = [0, 3, 6].map((off) => listCustomers("", 3, off).map((c) => c.name));
  assert.deepEqual(pages.map((p) => p.length), [3, 3, 2]);
  assert.equal(new Set(pages.flat()).size, 8, "no customer is skipped or repeated");
  assert.equal(countCustomers("cust"), 7);
  assert.equal(listCustomers("cust", 5, 5).length, 2, "the last page of a search");
  assert.equal(countCustomers("98765"), 4, "phone digits count too");
  assert.equal(countCustomers("50%"), 0);
});

test("bills: the count and the pages always use the same filter", () => {
  const ids: number[] = [];
  for (let i = 0; i < 9; i++) {
    const at = T0 + i * 3 * 60 * MIN;
    const s = startSession({ stationId: station(i % 2 ? "ps5" : "pc"), staffId: "u1", mode: "open", players: 1, customerId: null, now: at });
    stopSession(s, at + 30 * MIN, "u1");
    const total = buildDraft(s, at + 30 * MIN).lines.reduce((a, l) => a + l.qty * l.unitPaise, 0);
    ids.push(finalizeBill({ sessionId: s, staffId: "u1", role: "owner", discount: null, discountReason: "", payments: [{ method: i % 3 ? "cash" : "upi", amountPaise: total }], now: at + 31 * MIN }).billId);
  }
  assert.equal(countBills(), 9);
  const seen = [0, 4, 8].flatMap((off) => listBills(4, off).map((b) => b.id));
  assert.deepEqual(seen, [...ids].reverse(), "newest first, nothing skipped or repeated across pages");
  for (const f of [{ method: "upi" as const }, { q: "PS5" }, { status: "void" as const }, { from: T0 + 6 * 60 * MIN, to: T0 + 15 * 60 * MIN }]) {
    assert.equal(countBills(f), listBills(1000, 0, f).length, `count matches the list for ${JSON.stringify(f)}`);
  }
  assert.equal(countBills({ status: "void" }), 0);
  assert.equal(countBills({ method: "upi" }), 3);
});
