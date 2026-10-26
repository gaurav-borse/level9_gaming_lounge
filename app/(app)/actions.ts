"use server";
import { act } from "@/lib/action";
import { actor } from "@/lib/session";
import { UserError } from "@/lib/errors";
import { int, oneOf, parsePercent, rupeesToPaise, str } from "@/lib/validate";
import { PAYMENT_METHODS } from "@/lib/engine/bill";
import type { Discount } from "@/lib/engine/bill";
import {
  addController, addItem, addMenuItem, cancelSession, extendSession, pauseSession, removeItem, reopenSession, resumeSession, setNotes, startSession, stopSession, transferSession,
} from "@/lib/db/sessions";
import { buildDraft, counterLines, finalizeBill, finalizeCounterSale, markAdjustmentsSeen, voidBill } from "@/lib/db/bills";
import { listRates, listStations } from "@/lib/db/catalog";
import { pickRate } from "@/lib/engine/rates";
import { createCustomer, searchCustomers } from "@/lib/db/customers";
import { getSetting } from "@/lib/db/settings";

export type StartForm = {
  stationId: number;
  players: number | string;
  customerId: number | null;
  minutes?: number | string;
};

export async function startSessionAction(f: StartForm) {
  return act(async () => {
    const me = await actor();
    return startSession({
      stationId: int(f.stationId, "Station"),
      staffId: me.id,
      plannedMinutes: int(f.minutes, "Minutes", { min: 1, max: 1440 }),
      players: int(f.players, "Players", { min: 1, max: 20 }),
      customerId: f.customerId == null ? null : int(f.customerId, "Customer"),
      now: Date.now(),
    });
  });
}

export const pauseAction = async (id: number) => act(async () => { await actor(); pauseSession(int(id, "Session"), Date.now()); });
export const resumeAction = async (id: number) => act(async () => { await actor(); resumeSession(int(id, "Session"), Date.now()); });
export const stopAction = async (id: number) => act(async () => { const me = await actor(); stopSession(int(id, "Session"), Date.now(), me.id); });
export const reopenAction = async (id: number) => act(async () => { const me = await actor(); reopenSession(int(id, "Session"), Date.now(), me.id); });
export const extendAction = async (id: number, minutes: number) =>
  act(async () => {
    const me = await actor();
    extendSession(int(id, "Session"), int(minutes, "Minutes", { min: 1, max: 1440 }), me.id, Date.now());
  });

/** One more controller on a running session. */
export const addControllerAction = async (id: number) => act(async () => { const me = await actor(); addController(int(id, "Session"), me.id, Date.now()); });

/** What the Start dialog shows: the price per hour and per extra controller that would apply to this station right now. */
export async function rateQuoteAction(stationId: number) {
  return act(async () => {
    await actor();
    const id = int(stationId, "Station");
    const st = listStations().find((x) => x.id === id);
    const r = st && pickRate(listRates(), st.zoneId, new Date());
    return r ? { hourlyPaise: r.hourlyPaise, extraControllerPaise: r.extraControllerPaise } : null;
  });
}

export async function transferAction(id: number, toStationId: number) {
  return act(async () => {
    const me = await actor();
    transferSession(int(id, "Session"), int(toStationId, "Station"), me.id, Date.now());
  });
}

export async function notesAction(id: number, notes: string) {
  return act(async () => {
    await actor();
    setNotes(int(id, "Session"), str(notes, "Notes", { max: 500, required: false }));
  });
}

export async function addItemAction(id: number, name: string, qty: number | string, rupees: string) {
  return act(async () => {
    const me = await actor();
    addItem(int(id, "Session"), str(name, "Item name", { max: 80 }), int(qty, "Quantity", { min: 1, max: 99 }), rupeesToPaise(rupees, "Price"), Date.now(), me.id);
  });
}

/** Owner only: close a session that was started by mistake, with no bill. */
export async function cancelSessionAction(id: number, reason: string) {
  return act(async () => {
    const me = await actor();
    cancelSession(int(id, "Session"), str(reason, "Reason", { max: 200, required: false }), me.id, me.role, Date.now());
  });
}

export const removeItemAction = async (itemId: number) => act(async () => { const me = await actor(); removeItem(int(itemId, "Item"), me.id, Date.now()); });

export async function searchCustomersAction(q: string) {
  return act(async () => {
    await actor();
    return searchCustomers(str(q, "Search", { max: 60, required: false }));
  });
}

export async function createCustomerAction(name: string, phone: string) {
  return act(async () => {
    await actor();
    const n = str(name, "Customer name", { max: 80 });
    const p = str(phone, "Phone", { max: 30, required: false });
    const id = createCustomer(n, p);
    return { id, name: n };
  });
}

export async function getDraftAction(sessionId: number) {
  return act(async () => {
    await actor();
    const d = buildDraft(int(sessionId, "Session"), Date.now());
    return {
      lines: d.lines,
      maxStaffDiscountPct: Number(getSetting("staff.maxDiscountPct")),
    };
  });
}

export type PayForm = {
  sessionId: number;
  discountType: "none" | "flat" | "percent";
  discountValue: string;
  reason: string;
  payments: { method: string; rupees: string }[];
  finalAmount?: string; // what was really taken, when it is not the total shown
  adjustReason?: string;
};

const fail = (msg: string): never => {
  throw new UserError(msg);
};

/** What staff typed in the discount and payment boxes, checked and turned into paise. */
function parsePay(f: Pick<PayForm, "discountType" | "discountValue" | "reason" | "payments" | "finalAmount" | "adjustReason">) {
  let discount: Discount = null;
  if (f.discountType !== "none" && f.discountValue.trim() !== "") {
    discount =
      f.discountType === "flat"
        ? { type: "flat", value: rupeesToPaise(f.discountValue, "Discount") }
        : { type: "percent", value: parsePercent(f.discountValue) ?? fail("Discount % must be a number from 0 to 100, like 10 or 7.5") };
  }
  if (!Array.isArray(f.payments)) throw new UserError("Payments are not valid");
  const payments = f.payments
    .filter((p) => typeof p?.rupees === "string" && p.rupees.trim() !== "")
    .map((p) => ({ method: oneOf(p.method, PAYMENT_METHODS, "Payment method"), amountPaise: rupeesToPaise(p.rupees, "Payment") }));
  const finalPaise = typeof f.finalAmount === "string" && f.finalAmount.trim() !== "" ? rupeesToPaise(f.finalAmount, "Amount") : null;
  return { discount, payments, discountReason: str(f.reason, "Reason", { max: 200, required: false }), finalPaise, adjustReason: str(f.adjustReason ?? "", "Reason for changing the amount", { max: 200, required: false }) };
}

export async function finalizeBillAction(f: PayForm) {
  return act(async () => {
    const me = await actor();
    return finalizeBill({ sessionId: int(f.sessionId, "Session"), staffId: me.id, role: me.role, ...parsePay(f), now: Date.now() });
  });
}

// ---- menu items and counter sales ----
export async function addMenuItemAction(sessionId: number, menuItemId: number, qty: number | string) {
  return act(async () => {
    await actor();
    return { warning: addMenuItem(int(sessionId, "Session"), int(menuItemId, "Item"), int(qty, "Quantity", { min: 1, max: 99 }), Date.now()) };
  });
}

export type CounterForm = { lines: { itemId: number; qty: number }[] } & Pick<PayForm, "discountType" | "discountValue" | "reason" | "payments" | "finalAmount" | "adjustReason">;

const cleanLines = (lines: CounterForm["lines"]) => {
  if (!Array.isArray(lines)) throw new UserError("Add at least one item");
  return lines.map((l) => ({ itemId: int(l?.itemId, "Item"), qty: int(l?.qty, "Quantity", { min: 1, max: 99 }) }));
};

/** The bill the cart would produce right now, for the payment panel. Prices and tax come from the server. */
export async function getCounterDraftAction(lines: CounterForm["lines"]) {
  return act(async () => {
    await actor();
    return { lines: counterLines(cleanLines(lines)), maxStaffDiscountPct: Number(getSetting("staff.maxDiscountPct")) };
  });
}

export async function counterSaleAction(f: CounterForm) {
  return act(async () => {
    const me = await actor();
    return finalizeCounterSale({ lines: cleanLines(f.lines), staffId: me.id, role: me.role, ...parsePay(f), now: Date.now() });
  });
}

/** The owner has looked at the amount changes listed in the bell. */
export const markAdjustmentsSeenAction = async () => act(async () => { const me = await actor(); if (me.role !== "owner") throw new UserError("Only the owner can do this"); markAdjustmentsSeen(); });

export async function voidBillAction(billId: number, reason: string) {
  return act(async () => {
    const me = await actor();
    voidBill(int(billId, "Bill"), str(reason, "Reason", { max: 200, required: false }), me.id, me.role, Date.now());
  });
}
