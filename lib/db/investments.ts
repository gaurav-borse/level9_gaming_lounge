import { all, get, run, audit } from "./index.ts";
import { UserError } from "../errors.ts";
import { dayStart } from "../bills-filter.ts";
import { dayKey } from "../reports-range.ts";
import { allocateDiscount, lineTaxPaise } from "../engine/bill.ts";
import { billableMs } from "../engine/pricing.ts";
import { summarize } from "../returns.ts";
import type { Daily, Summary } from "../returns.ts";

export type Investment = {
  id: number;
  name: string;
  amountPaise: number;
  boughtOn: string; // yyyy-mm-dd
  stationId: number | null; // null = the whole lounge (interiors, AC, furniture...)
  stationName: string | null;
  note: string;
};

export type InvestmentInput = { name: string; amountPaise: number; boughtOn: string; stationId: number | null; note: string };

const MAX_PAISE = 100_000_000_000; // ₹100 crore, far above anything real; stops typos from overflowing arithmetic

export const listInvestments = (): Investment[] =>
  all<Investment>(
    `SELECT i.id, i.name, i.amount_paise AS amountPaise, i.bought_on AS boughtOn, i.station_id AS stationId, st.name AS stationName, i.note
     FROM investments i LEFT JOIN stations st ON st.id = i.station_id ORDER BY i.bought_on DESC, i.id DESC`,
  );

function check(i: InvestmentInput): InvestmentInput {
  const name = i.name.trim();
  if (!name) throw new UserError("Give the investment a name, like Pool table 1");
  if (name.length > 80) throw new UserError("Name is too long (max 80 characters)");
  if (!Number.isInteger(i.amountPaise) || i.amountPaise <= 0 || i.amountPaise > MAX_PAISE) throw new UserError("Enter the amount you spent");
  if (dayStart(i.boughtOn) === undefined) throw new UserError("Pick the date you bought it");
  if (i.stationId !== null && !get("SELECT 1 AS x FROM stations WHERE id = ?", i.stationId)) throw new UserError("Station not found");
  if (i.note.trim().length > 200) throw new UserError("Note is too long (max 200 characters)");
  return { ...i, name, note: i.note.trim() };
}

export function saveInvestment(id: number | null, input: InvestmentInput, staffId: string, now = Date.now()): number {
  const i = check(input);
  if (id === null) {
    const newId = Number(
      run("INSERT INTO investments (name, amount_paise, bought_on, station_id, note, created_at) VALUES (?,?,?,?,?,?)", i.name, i.amountPaise, i.boughtOn, i.stationId, i.note, now).lastInsertRowid,
    );
    audit(staffId, "investment.add", `${i.name} ${i.amountPaise / 100}`, now);
    return newId;
  }
  if (!get("SELECT 1 AS x FROM investments WHERE id = ?", id)) throw new UserError("Investment not found");
  run("UPDATE investments SET name = ?, amount_paise = ?, bought_on = ?, station_id = ?, note = ? WHERE id = ?", i.name, i.amountPaise, i.boughtOn, i.stationId, i.note, id);
  audit(staffId, "investment.update", `${i.name} ${i.amountPaise / 100}`, now);
  return id;
}

export function deleteInvestment(id: number, staffId: string, now = Date.now()): void {
  const row = get<{ name: string }>("SELECT name FROM investments WHERE id = ?", id);
  if (!row) throw new UserError("Investment not found");
  run("DELETE FROM investments WHERE id = ?", id);
  audit(staffId, "investment.delete", row.name, now);
}

export type ReturnCard = Summary & {
  key: string;
  title: string;
  subtitle: string;
  stationId: number | null;
  investments: Investment[];
  sessions: number; // paid sessions since the purchase date
  playedMs: number;
};
export type Returns = { cards: ReturnCard[]; portfolio: (Summary & { count: number }) | null };

const add = (m: Daily, day: string, paise: number) => m.set(day, (m.get(day) ?? 0) + paise);

/**
 * What each investment has earned back. A station's earnings are what its time charges really brought in: the line amount
 * minus its share of the bill's discount (Reports spread discounts the same way) minus the GST inside it. Food is not counted.
 * Costs are the expenses tagged to that station. The whole-lounge card counts all earnings (time and food) and ALL expenses,
 * which is the shop's net profit; the portfolio line compares the total invested with that.
 */
export function buildReturns(now = Date.now()): Returns {
  const invs = listInvestments();
  if (invs.length === 0) return { cards: [], portfolio: null };
  const today = dayKey(now);
  const first = invs.reduce((m, i) => (i.boughtOn < m ? i.boughtOn : m), invs[0].boughtOn);
  const fromMs = dayStart(first)!;

  const loungeEarned: Daily = new Map();
  const stationEarned = new Map<number, Daily>();
  const rows = all<{ billId: number; at: number; disc: number; stationId: number | null; kind: string; qty: number; unit: number; pct: number }>(
    `SELECT b.id AS billId, b.created_at AS at, b.discount_paise AS disc, s.station_id AS stationId, bl.kind, bl.qty, bl.unit_paise AS unit, bl.tax_pct AS pct
     FROM bills b JOIN bill_lines bl ON bl.bill_id = b.id LEFT JOIN sessions s ON s.id = b.session_id
     WHERE b.status = 'paid' AND b.created_at >= ? ORDER BY b.id, bl.id`, fromMs,
  );
  for (let a = 0; a < rows.length; ) {
    let b = a;
    while (b < rows.length && rows[b].billId === rows[a].billId) b++;
    const lines = rows.slice(a, b);
    const totals = lines.map((l) => l.qty * l.unit);
    const shares = allocateDiscount(totals, lines[0].disc);
    const day = dayKey(lines[0].at);
    lines.forEach((l, i) => {
      const after = totals[i] - shares[i];
      const net = after - lineTaxPaise(after, l.pct);
      add(loungeEarned, day, net);
      if (l.kind === "session" && l.stationId !== null) {
        if (!stationEarned.has(l.stationId)) stationEarned.set(l.stationId, new Map());
        add(stationEarned.get(l.stationId)!, day, net);
      }
    });
    a = b;
  }

  const loungeCosts: Daily = new Map();
  const stationCosts = new Map<number, Daily>();
  for (const e of all<{ day: string; paise: number; stationId: number | null }>("SELECT day, amount_paise AS paise, station_id AS stationId FROM expenses WHERE day >= ?", first)) {
    add(loungeCosts, e.day, e.paise);
    if (e.stationId !== null) {
      if (!stationCosts.has(e.stationId)) stationCosts.set(e.stationId, new Map());
      add(stationCosts.get(e.stationId)!, e.day, e.paise);
    }
  }

  const played = all<{ stationId: number; at: number; startedAt: number; endedAt: number; pausedAt: number | null; pausedTotalMs: number }>(
    `SELECT s.station_id AS stationId, b.created_at AS at, s.started_at AS startedAt, s.ended_at AS endedAt, s.paused_at AS pausedAt, s.paused_total_ms AS pausedTotalMs
     FROM sessions s JOIN bills b ON b.session_id = s.id WHERE b.status = 'paid' AND b.created_at >= ? AND s.ended_at IS NOT NULL`, fromMs,
  );

  const cards: ReturnCard[] = [];
  const byStation = new Map<number, Investment[]>();
  for (const i of invs.filter((x) => x.stationId !== null)) byStation.set(i.stationId!, [...(byStation.get(i.stationId!) ?? []), i]);
  for (const [stationId, list] of byStation) {
    const since = list.reduce((m, i) => (i.boughtOn < m ? i.boughtOn : m), list[0].boughtOn);
    const sinceMs = dayStart(since)!;
    const mine = played.filter((p) => p.stationId === stationId && p.at >= sinceMs);
    const info = get<{ name: string; zone: string }>("SELECT st.name AS name, z.name AS zone FROM stations st JOIN zones z ON z.id = st.zone_id WHERE st.id = ?", stationId);
    cards.push({
      ...summarize({ investedPaise: list.reduce((s, i) => s + i.amountPaise, 0), since, today, earned: stationEarned.get(stationId) ?? new Map(), costs: stationCosts.get(stationId) ?? new Map() }),
      key: `s${stationId}`,
      title: info?.name ?? list[0].stationName ?? "Station",
      subtitle: info ? `${info.zone}: time charges only, minus costs tagged to this station` : "",
      stationId,
      investments: list,
      sessions: mine.length,
      playedMs: mine.reduce((s, p) => s + billableMs({ startedAt: p.startedAt, endedAt: p.endedAt, pausedAt: p.pausedAt, pausedTotalMs: p.pausedTotalMs }, p.endedAt), 0),
    });
  }
  cards.sort((a, b) => b.investedPaise - a.investedPaise || a.title.localeCompare(b.title));

  const general = invs.filter((i) => i.stationId === null);
  if (general.length) {
    const since = general.reduce((m, i) => (i.boughtOn < m ? i.boughtOn : m), general[0].boughtOn);
    const sinceMs = dayStart(since)!;
    const mine = played.filter((p) => p.at >= sinceMs);
    cards.push({
      ...summarize({ investedPaise: general.reduce((s, i) => s + i.amountPaise, 0), since, today, earned: loungeEarned, costs: loungeCosts }),
      key: "lounge",
      title: "Whole lounge",
      subtitle: "Interiors, furniture, AC and the like: all earnings (time and food) minus all expenses, which is your net profit",
      stationId: null,
      investments: general,
      sessions: mine.length,
      playedMs: mine.reduce((s, p) => s + billableMs({ startedAt: p.startedAt, endedAt: p.endedAt, pausedAt: p.pausedAt, pausedTotalMs: p.pausedTotalMs }, p.endedAt), 0),
    });
  }

  const portfolio = { ...summarize({ investedPaise: invs.reduce((s, i) => s + i.amountPaise, 0), since: first, today, earned: loungeEarned, costs: loungeCosts }), count: invs.length };
  return { cards, portfolio };
}
