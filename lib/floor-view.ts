/** "Asha Rao" -> "AR", "Asha" -> "A", walk-in -> "W". */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "W";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Share of a planned session already played, 0 to 1. null when the session has no planned length. */
export function progressFraction(playedMs: number, plannedMinutes: number | null): number | null {
  if (!plannedMinutes || plannedMinutes <= 0) return null;
  return Math.min(1, Math.max(0, playedMs / (plannedMinutes * 60_000)));
}

export type FloorSummary = { total: number; inUse: number; free: number; ending: number };

/** Counts for the strip above the floor. "Ending soon" includes sessions already in overtime. */
export function summarize(cards: { maintenance: boolean; busy: boolean; status: string | null }[]): FloorSummary {
  return {
    total: cards.length,
    inUse: cards.filter((c) => c.busy).length,
    free: cards.filter((c) => !c.busy && !c.maintenance).length,
    ending: cards.filter((c) => c.busy && (c.status === "ending" || c.status === "overtime")).length,
  };
}

/** Card order on the floor: things that need a person first, idle stations last. */
const STATUS_ORDER = ["overtime", "ending", "awaiting", "running", "paused", "free", "maintenance"];
export const attentionRank = (status: string): number => {
  const i = STATUS_ORDER.indexOf(status);
  return i === -1 ? STATUS_ORDER.length : i;
};

/** The session the big "live now" card shows: the most urgent running or paused one. Sessions already stopped (awaiting payment) are never featured. */
export function pickFeatured<T extends { status: string; remainingMs: number | null; playedMs: number }>(items: T[]): T | null {
  const live = items.filter((i) => i.status !== "awaiting" && i.status !== "free" && i.status !== "maintenance");
  live.sort(
    (a, b) =>
      attentionRank(a.status) - attentionRank(b.status) ||
      (a.remainingMs ?? Infinity) - (b.remainingMs ?? Infinity) ||
      b.playedMs - a.playedMs,
  );
  return live[0] ?? null;
}

/** Share of each zone's working stations in use right now, 0 to 1. A zone with every station in maintenance counts as 0. */
export function zoneUsage(zones: { name: string; stations: { busy: boolean; maintenance: boolean }[] }[]): { name: string; value: number }[] {
  return zones.map((z) => {
    const usable = z.stations.filter((s) => !s.maintenance);
    return { name: z.name, value: usable.length === 0 ? 0 : usable.filter((s) => s.busy).length / usable.length };
  });
}

/** Corner `i` of a regular `count`-sided shape, starting at the top and going clockwise. `fraction` is the distance from the centre (0 to 1). */
export function radarPoint(i: number, count: number, fraction: number, radius: number, cx: number, cy: number): [number, number] {
  const angle = -Math.PI / 2 + (2 * Math.PI * i) / count;
  return [cx + Math.cos(angle) * radius * fraction, cy + Math.sin(angle) * radius * fraction];
}

/** "Good morning" until noon, "Good afternoon" until 5 pm, then "Good evening" (also used after midnight: the lounge closes late). */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}
