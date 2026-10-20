import { AlarmClock, CircleCheck, CircleDot, Car, Gamepad2, Glasses, LayoutGrid, Monitor, Pause, Play, Timer, Wallet, Wrench, type LucideIcon } from "lucide-react";
import type { LiveStatus } from "@/lib/live";

export type StatusKey = LiveStatus | "free" | "maintenance";

// Always colour + icon + label, so status never depends on colour alone. `glow` is the soft light in the card's corner.
export const STATUS: Record<StatusKey, { label: string; icon: LucideIcon; chip: string; glow: string }> = {
  free: { label: "Free", icon: CircleCheck, chip: "bg-free/15 text-free", glow: "var(--color-free)" },
  running: { label: "Running", icon: Play, chip: "bg-brand/20 text-brand-text", glow: "var(--color-brand)" },
  ending: { label: "Ending soon", icon: Timer, chip: "bg-warn/15 text-warn", glow: "var(--color-warn)" },
  overtime: { label: "Overtime", icon: AlarmClock, chip: "bg-over/15 text-over", glow: "var(--color-over)" },
  paused: { label: "Paused", icon: Pause, chip: "bg-paused/20 text-paused", glow: "var(--color-paused)" },
  awaiting: { label: "Awaiting payment", icon: Wallet, chip: "bg-silver/15 text-silver", glow: "var(--color-silver)" },
  maintenance: { label: "Maintenance", icon: Wrench, chip: "bg-ink/10 text-mute", glow: "var(--color-mute)" },
};

export const ZONE_ICON: Record<string, LucideIcon> = {
  pool: CircleDot,
  ps5: Gamepad2,
  pc: Monitor,
  sim: Car,
  vr: Glasses,
  custom: LayoutGrid,
};
