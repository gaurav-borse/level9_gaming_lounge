// Browsers only allow sound after a click, so call unlockAudio() from any button press (login does).
let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    /* no audio available: alerts stay visual */
  }
}

/** True once the browser has allowed sound. */
export const audioReady = (): boolean => ctx !== null && ctx.state === "running";

type Target = Pick<EventTarget, "addEventListener" | "removeEventListener">;

/**
 * Browsers keep sound off after a reload until the person touches the page. Call once on the floor screen:
 * the first click or key press anywhere switches alerts on, so a restart no longer silences them.
 */
export function armAudioUnlock(target: Target): void {
  unlockAudio(); // allowed straight away when the browser was started with autoplay on (see start.bat); otherwise it waits for the first touch below
  const events = ["pointerdown", "keydown"];
  const unlock = () => {
    unlockAudio();
    for (const e of events) target.removeEventListener(e, unlock);
  };
  for (const e of events) target.addEventListener(e, unlock);
}

export type AlertMemo = { warned: boolean; over: boolean }; // what has already been announced for one session

/**
 * What to sound for one session on this tick. Each alert is given once: the warning when the time left first drops to the
 * "warn when" setting, the siren when the time runs out. A session seen for the first time (page just opened) is only noted,
 * since its alert has already gone off. Extending the session re-arms both.
 */
export function nextAlert(prev: AlertMemo | undefined, status: string): { ring: "ending" | "timeup" | null; memo: AlertMemo } {
  const ending = status === "ending";
  const over = status === "timeup";
  if (!prev) return { ring: null, memo: { warned: ending || over, over } };
  if (status === "running") return { ring: null, memo: { warned: false, over: false } };
  if (over && !prev.over) return { ring: "timeup", memo: { warned: true, over: true } };
  if (ending && prev.over) return { ring: null, memo: { warned: true, over: false } }; // extended after the time was up: the siren is armed again
  if (ending && !prev.warned) return { ring: "ending", memo: { warned: true, over: false } };
  return { ring: null, memo: prev }; // includes paused: nothing changes while the clock is stopped
}

export type Note = { freq: number; at: number; dur: number; type: "sine" | "triangle" | "square"; peak: number }; // seconds from the start

/**
 * What each alert sounds like. Long and loud on purpose: a single beep is easy to miss across a busy room.
 * "ending" = a three-time two-note chime (about 3.5 s); "timeup" = a siren swinging between two pitches (about 4 s), harsher so it can't be mistaken for "ending".
 */
export function alertPattern(kind: "ending" | "timeup"): Note[] {
  if (kind === "ending") {
    return [0, 1.2, 2.4].flatMap((t) => [
      { freq: 784, at: t, dur: 0.3, type: "triangle" as const, peak: 0.7 },
      { freq: 1047, at: t + 0.3, dur: 0.6, type: "triangle" as const, peak: 0.7 },
    ]);
  }
  return Array.from({ length: 14 }, (_, i) => ({ freq: i % 2 ? 740 : 988, at: i * 0.29, dur: 0.27, type: "square" as const, peak: 0.45 }));
}

export function beep(kind: "ending" | "timeup"): void {
  if (!ctx || ctx.state !== "running") return;
  for (const n of alertPattern(kind)) {
    const t = ctx.currentTime + n.at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = n.freq;
    osc.type = n.type;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(n.peak, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + n.dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + n.dur + 0.03);
  }
}
