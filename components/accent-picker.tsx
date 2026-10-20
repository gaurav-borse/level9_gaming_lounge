"use client";
import { useRef, useState } from "react";
import { Palette } from "lucide-react";
import { setAccentAction } from "@/app/(app)/theme-actions";
import { ACCENT_PRESETS, DEFAULT_ACCENT, onAccent } from "@/lib/accent";
import { useDismissableDetails } from "@/lib/useDismissableDetails";

/** Main-colour menu. The page recolours instantly (CSS variables on <html>); the choice is saved in a cookie so every page starts with it. */
export function AccentPicker({ current }: { current: string }) {
  const [hex, setHex] = useState(current);
  const menu = useRef<HTMLDetailsElement>(null);

  useDismissableDetails(menu);

  const preview = (h: string) => {
    setHex(h);
    document.documentElement.style.setProperty("--color-brand", h);
    document.documentElement.style.setProperty("--color-on-brand", onAccent(h));
  };
  const choose = (h: string) => {
    preview(h);
    void setAccentAction(h);
  };

  return (
    <details ref={menu} className="relative">
      <summary
        aria-label="Main colour"
        title="Main colour"
        className="grid size-10 cursor-pointer list-none place-items-center rounded-full bg-panel text-silver transition hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden"
      >
        <Palette className="size-[1.15rem]" aria-hidden />
      </summary>
      <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-3xl border border-line bg-panel p-5 shadow-2xl">
        <fieldset>
          <legend className="mb-3 text-sm font-semibold">Main colour</legend>
          <div className="grid grid-cols-4 gap-3">
            {ACCENT_PRESETS.map((p) => (
              <button
                key={p.hex}
                type="button"
                aria-label={p.name}
                title={p.name}
                aria-pressed={hex === p.hex}
                onClick={() => choose(p.hex)}
                style={{ background: p.hex }}
                className="aspect-square rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-panel transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-ink aria-pressed:ring-ink"
              />
            ))}
          </div>
        </fieldset>
        <label className="mt-5 flex items-center justify-between gap-3 text-sm">
          <span>Custom</span>
          <span className="flex items-center gap-2">
            <output className="font-mono text-xs text-mute">{hex.toUpperCase()}</output>
            <input
              type="color"
              value={hex}
              onChange={(e) => preview(e.target.value)}
              onBlur={() => void setAccentAction(hex)}
              className="size-9 cursor-pointer rounded-lg border border-line bg-transparent p-0.5"
            />
          </span>
        </label>
        <button
          type="button"
          onClick={() => choose(DEFAULT_ACCENT)}
          className="mt-5 w-full rounded-full border border-line py-2 text-sm font-medium transition hover:bg-raised focus-visible:outline-2 focus-visible:outline-brand"
        >
          Reset to default
        </button>
      </div>
    </details>
  );
}
