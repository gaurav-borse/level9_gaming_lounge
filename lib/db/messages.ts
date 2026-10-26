import { all, get, run } from "./index.ts";
import { getSettings } from "./settings.ts";
import type { SettingKey } from "./settings.ts";
import { listBoard } from "./sessions.ts";
import { getBill } from "./bills.ts";
import { UserError } from "../errors.ts";
import { clock, invoiceNo, rupees } from "../format.ts";
import { liveInfo } from "../live.ts";
import { compose, waLink } from "../whatsapp/compose.ts";
import type { MessageType } from "../whatsapp/compose.ts";

/** One message waiting in the tray. `dueAt` is when it should appear (epoch ms; 0 = now). `href` opens WhatsApp with the text filled in. */
export type TrayMessage = { key: string; type: MessageType; to: string; href: string; dueAt: number };

type Contact = { name: string; phone: string };

const DAY = 24 * 60 * 60 * 1000;
const dayKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Everyone with a phone number is messaged. */
function contact(customerId: number | null): Contact | undefined {
  if (customerId == null) return undefined;
  const c = get<{ name: string; phone: string }>(
    "SELECT name, phone FROM customers WHERE id = ? AND phone IS NOT NULL",
    customerId,
  );
  return c;
}

/**
 * Messages staff can send right now, worked out from live sessions and recent bills (nothing is queued ahead of time).
 * Anything already opened or skipped is left out. Prompt mode only: another sender would take over when `wa.mode` changes.
 */
export function pendingMessages(now = Date.now()): TrayMessage[] {
  const cfg = getSettings();
  if (cfg["wa.enabled"] !== "1" || cfg["wa.mode"] !== "prompt") return [];
  const on = (t: MessageType) => cfg[`wa.${t}` as SettingKey] === "1";
  const found = new Map<string, TrayMessage>();
  const add = (key: string, type: MessageType, c: Contact, vars: Record<string, string>, dueAt = 0) => {
    if (found.has(key)) return;
    const text = compose(type, cfg[`wa.tpl.${type}` as SettingKey], { name: c.name, lounge: cfg["cafe.name"], ...vars });
    found.set(key, { key, type, to: c.name, href: waLink(c.phone, text), dueAt });
  };

  const leadMin = Number(cfg["alert.leadMin"]);
  for (const z of listBoard()) {
    for (const st of z.stations) {
      const s = st.session;
      const c = s && s.endedAt === null ? contact(s.customerId) : undefined;
      if (!s || !c) continue;
      if (on("welcome")) add(`welcome:${s.customerId}:${dayKey(s.startedAt)}`, "welcome", c, {}); // once per customer per day
      if (on("started")) {
        const r = s.rate;
        add(`started:${s.id}`, "started", c, {
          station: st.name,
          zone: z.name,
          start: clock(s.startedAt),
          mode: s.plannedMinutes === null ? "Open session" : `Fixed ${s.plannedMinutes} min`,
          rate: `${rupees(r.hourlyPaise)}/hr`,
          end: s.plannedMinutes !== null ? `ends about ${clock(s.startedAt + s.plannedMinutes * 60_000)}` : "no fixed end time",
        });
      }
      // Paused time doesn't count down, so a paused session has no reminder until it resumes (the page refreshes then).
      if (on("ending") && s.plannedMinutes !== null && s.pausedAt === null) {
        const left = liveInfo(s, leadMin, now).remainingMs ?? 0;
        if (left > 0) add(`ending:${s.id}`, "ending", c, { station: st.name, minutes: String(leadMin) }, Math.round(now + left - leadMin * 60_000));
      }
    }
  }

  if (on("invoice")) {
    for (const b of all<{ id: number; customerId: number }>(
      "SELECT id, customer_id AS customerId FROM bills WHERE status = 'paid' AND entered_by_hand = 0 AND customer_id IS NOT NULL AND created_at >= ?",
      now - DAY,
    )) {
      const c = contact(b.customerId);
      const bill = c && getBill(b.id);
      if (!c || !bill) continue;
      add(`invoice:${b.id}`, "invoice", c, {
        invoice: invoiceNo(bill.invoiceNo),
        items: bill.lines.map((l) => `• ${l.name}${l.qty > 1 ? ` × ${l.qty}` : ""}: ${rupees(l.qty * l.unitPaise)}`).join("\n"),
        total: rupees(bill.totalPaise),
      });
    }
  }

  const done = new Set(all<{ key: string }>("SELECT key FROM message_log WHERE at >= ?", now - 7 * DAY).map((r) => r.key));
  return [...found.values()].filter((m) => !done.has(m.key));
}

const KEY = /^(welcome:\d+:\d{4}-\d{2}-\d{2}|(started|ending|invoice):\d+)$/;

/** "opened" = staff tapped Send (WhatsApp may still not have delivered it), "skipped" = staff dismissed it. Either way it is not offered again. */
export function markMessage(key: string, outcome: "opened" | "skipped", now = Date.now()): void {
  if (!KEY.test(key)) throw new UserError("That message is not valid");
  run("INSERT OR IGNORE INTO message_log (key, outcome, at) VALUES (?, ?, ?)", key, outcome, now);
}
