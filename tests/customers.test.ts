import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshDb, station, MIN, T0 } from "./helpers.ts";
import { createCustomer, getCustomer, listCustomers, updateCustomer } from "../lib/db/customers.ts";
import { buildDraft, finalizeBill, listBills, voidBill } from "../lib/db/bills.ts";
import { startSession, stopSession } from "../lib/db/sessions.ts";

beforeEach(freshDb);

function visit(customerId: number, kind: string, minutes: number, at: number) {
  const s = startSession({ stationId: station(kind), staffId: "u1", plannedMinutes: 1, players: 1, customerId, now: at });
  stopSession(s, at + minutes * MIN, "u1");
  const total = buildDraft(s, at + minutes * MIN).lines.reduce((a, l) => a + l.qty * l.unitPaise, 0);
  return finalizeBill({ sessionId: s, staffId: "u1", role: "owner", discount: null, discountReason: "", payments: [{ method: "cash", amountPaise: total }], now: at + minutes * MIN + MIN });
}

test("listCustomers: visits, spend and last visit count paid bills only; biggest spender first; search by name or phone", () => {
  const asha = createCustomer("Asha Rao", "98765 43210");
  const ravi = createCustomer("Ravi", "");
  createCustomer("Nobody", "99999 11111");
  const first = visit(asha, "ps5", 60, T0);
  const second = visit(asha, "pool", 30, T0 + 3 * 60 * MIN);
  const voided = visit(ravi, "pc", 60, T0);
  voidBill(voided.billId, "mistake", "u1", "owner", T0 + 200 * MIN);

  const rows = listCustomers();
  assert.deepEqual(rows.map((r) => r.name), ["Asha Rao", "Nobody", "Ravi"], "spender first, then by name");
  const a = rows[0];
  assert.equal(a.visits, 2);
  assert.equal(a.spentPaise, listBills(10, 0, { customerId: asha }).reduce((s, b) => s + b.totalPaise, 0));
  assert.equal(a.lastVisit, T0 + 3 * 60 * MIN + 30 * MIN + MIN);
  assert.deepEqual(rows.find((r) => r.name === "Ravi")!.visits, 0, "a void bill is not a visit");
  assert.equal(rows.find((r) => r.name === "Nobody")!.lastVisit, null);

  assert.deepEqual(listCustomers("asha").map((r) => r.name), ["Asha Rao"]);
  assert.deepEqual(listCustomers("98765").map((r) => r.name), ["Asha Rao"], "phone digits");
  assert.deepEqual(listCustomers("+91 98765 43210").map((r) => r.name), ["Asha Rao"], "a typed number with country code");
  assert.deepEqual(listCustomers("50%_").length, 0, "wildcards are plain characters");
  assert.equal(first.invoiceNo + 1, second.invoiceNo);
});

test("listBills by customer shows only that customer's bills", () => {
  const a = createCustomer("A", "");
  const b = createCustomer("B", "");
  visit(a, "ps5", 30, T0);
  visit(b, "pc", 30, T0 + 100 * MIN);
  assert.deepEqual(listBills(10, 0, { customerId: a }).map((x) => x.customerName), ["A"]);
  assert.deepEqual(listBills(10, 0, { customerId: b }).map((x) => x.customerName), ["B"]);
});

test("updateCustomer: edits everything, normalises the phone, and refuses bad input", () => {
  const id = createCustomer("Asha", "9876543210");
  assert.equal(getCustomer(id)!.phone, "919876543210");
  updateCustomer(id, " Asha Rao ", "098765 43211", " likes pool ", "u1");
  const c = getCustomer(id)!;
  assert.deepEqual([c.name, c.phone, c.notes], ["Asha Rao", "919876543211", "likes pool"]);
  updateCustomer(id, "Asha Rao", "", "", "u1");
  assert.equal(getCustomer(id)!.phone, null, "a blank phone clears it");
  assert.throws(() => updateCustomer(id, "", "", "", "u1"), /name is required/);
  assert.throws(() => updateCustomer(id, "A", "12", "", "u1"), /phone number/);
  assert.throws(() => updateCustomer(999, "A", "", "", "u1"), /not found/);
  assert.equal(getCustomer(999), undefined);
});

test("displayPhone groups Indian numbers and leaves other countries alone", async () => {
  const { displayPhone } = await import("../lib/phone.ts");
  assert.equal(displayPhone("919876543210"), "+91 98765 43210");
  assert.equal(displayPhone("447911123456"), "+447911123456");
});
