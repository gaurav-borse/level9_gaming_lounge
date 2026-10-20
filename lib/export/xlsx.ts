import writeExcelFile from "write-excel-file/node";
import type { Cell, Sheet } from "write-excel-file/node";
import { dateTime } from "../format.ts";

/** One column of a report. `value` gives the cell for a row; `total` (optional) fills the totals row at the bottom. */
export type Col<T> = {
  header: string;
  width: number; // in characters
  kind?: "text" | "money" | "int" | "datetime" | "percent"; // percent: the value is in percent (45.5 shows as 45.5%)
  value: (row: T) => string | number | null; // money in rupees, datetime in epoch ms
  total?: (rows: T[]) => number;
};

export type Table<T> = { sheet: string; title: string; note?: string; totalLabel?: string; cols: Col<T>[]; rows: T[] };
export type Meta = { lounge: string; by: string; at: number };

// The template: a title block, a dark header row that stays put while scrolling, light grid lines, banded rows, a bold totals row.
const HEAD = "#1f2933";
const GRID = "#d9d3ca";
const BAND = "#f5f2ef";
const MUTE = "#5c6169";
const FORMAT = { money: "[$₹-4009]#,##0.00", int: "#,##0", datetime: "dd mmm yyyy hh:mm", percent: "0.0%" } as const;

/** Excel keeps a date as a plain number with no time zone, and the library reads the UTC clock. Shift it so the sheet shows the lounge's own local time. */
export const wall = (ms: number): Date => new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);

function cell<T>(c: Col<T>, v: string | number | null, style: object): Cell {
  const align = c.kind && c.kind !== "text" ? "right" : "left";
  if (v === null || v === "") return { type: String, value: "", align, ...style };
  if (c.kind === "datetime") return { type: Date, value: wall(Number(v)), format: FORMAT.datetime, align, ...style };
  if (c.kind === "money" || c.kind === "int") return { type: Number, value: Number(v), format: FORMAT[c.kind], align, ...style };
  if (c.kind === "percent") return { type: Number, value: Number(v) / 100, format: FORMAT.percent, align, ...style };
  return { type: String, value: String(v), align, ...style };
}

export function sheetOf<T>(meta: Meta, t: Table<T>): Sheet<never> {
  const lines: Cell[][] = [
    [{ value: meta.lounge, fontWeight: "bold", fontSize: 16 }],
    [{ value: t.title, fontWeight: "bold", fontSize: 12 }],
    ...(t.note ? [[{ value: t.note, textColor: MUTE }]] : []),
    [{ value: `Generated ${dateTime(meta.at)} by ${meta.by}`, textColor: MUTE }],
    [],
  ];
  const header: Cell[] = t.cols.map((c) => ({
    value: c.header, fontWeight: "bold", textColor: "#ffffff", backgroundColor: HEAD,
    align: c.kind && c.kind !== "text" ? "right" : "left", alignVertical: "center", wrap: true, height: 26,
  }));
  const body = t.rows.map((r, i) =>
    t.cols.map((c) => cell(c, c.value(r), { borderColor: GRID, borderStyle: "thin", alignVertical: "center", ...(i % 2 ? { backgroundColor: BAND } : {}) })),
  );
  const totals: Cell[][] = t.cols.some((c) => c.total)
    ? [t.cols.map((c, i) => {
        const style = { fontWeight: "bold" as const, topBorderColor: HEAD, topBorderStyle: "medium" as const };
        if (c.total) return cell(c, c.total(t.rows), style);
        return { type: String, value: i === 0 ? (t.totalLabel ?? "Total") : "", ...style };
      })]
    : [];
  return {
    sheet: t.sheet,
    data: [...lines, header, ...body, ...totals],
    columns: t.cols.map((c) => ({ width: c.width })),
    stickyRowsCount: lines.length + 1,
    ...(t.cols.length > 8 ? { orientation: "landscape" as const } : {}),
  } as Sheet<never>;
}

/** The finished .xlsx file. */
export const workbook = (sheets: Sheet<never>[]): Promise<Buffer> => writeExcelFile(sheets).toBuffer();
