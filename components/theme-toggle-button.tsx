"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Monitor, Moon, Sun } from "lucide-react";
import { setThemeAction } from "@/app/(app)/theme-actions";

type Mode = "light" | "dark" | "system";
const NEXT: Record<Mode, Mode> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Mode, string> = { system: "Theme: follows your computer. Click for light.", light: "Theme: light. Click for dark.", dark: "Theme: dark. Click to follow your computer." };
const ICON = { system: Monitor, light: Sun, dark: Moon } as const;

export function ThemeToggleButton({ current }: { current: Mode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const Icon = ICON[current];
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={LABEL[current]}
      title={LABEL[current]}
      onClick={() => start(async () => { await setThemeAction(NEXT[current]); router.refresh(); })}
      className="grid size-10 place-items-center rounded-full bg-panel text-silver transition hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
