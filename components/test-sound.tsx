"use client";
import { Volume2 } from "lucide-react";
import { beep, unlockAudio } from "@/lib/alerts";
import { btnCls } from "@/lib/ui";

/** Plays the real alert sounds so the owner can check the volume. The click itself is what lets the browser play sound. */
export function TestSound() {
  const play = (kind: "ending" | "timeup") => {
    unlockAudio();
    setTimeout(() => beep(kind), 50); // the audio context needs a moment to start running after the first click
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-mute">Hear them:</span>
      <button type="button" className={btnCls} onClick={() => play("ending")}><Volume2 className="size-4" aria-hidden /> About to end</button>
      <button type="button" className={btnCls} onClick={() => play("timeup")}><Volume2 className="size-4" aria-hidden /> Time&apos;s up</button>
    </div>
  );
}
