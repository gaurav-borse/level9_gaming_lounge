import { test } from "node:test";
import assert from "node:assert/strict";
import { alertPattern, armAudioUnlock, audioReady, beep, unlockAudio } from "../lib/alerts.ts";

// A stand-in for the browser's AudioContext: starts suspended, running once resume() is called.
class FakeAudioContext {
  state = "suspended";
  currentTime = 0;
  destination = {};
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  createOscillator() {
    return { frequency: { value: 0 }, type: "", connect: () => ({ connect() {} }), start() {}, stop() {} };
  }
  createGain() {
    return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: () => ({ connect() {} }) };
  }
}

test("sound stays off until a click or key press, then switches on without a login", () => {
  (globalThis as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  assert.equal(audioReady(), false);
  assert.doesNotThrow(() => beep("overtime")); // before unlock: silent, never throws

  const handlers = new Map<string, () => void>();
  const target = {
    addEventListener: (type: string, fn: () => void) => void handlers.set(type, fn),
    removeEventListener: (type: string) => void handlers.delete(type),
  };
  armAudioUnlock(target);
  assert.deepEqual([...handlers.keys()].sort(), ["keydown", "pointerdown"]);

  handlers.get("pointerdown")!(); // any click anywhere in the app
  assert.equal(audioReady(), true);
  assert.equal(handlers.size, 0, "listeners remove themselves after the first unlock");
  assert.doesNotThrow(() => beep("ending"));
  unlockAudio(); // calling it again is harmless
});

test("alert sounds are long and loud enough to notice, and overtime sounds different from ending", () => {
  const length = (kind: "ending" | "overtime") => Math.max(...alertPattern(kind).map((n) => n.at + n.dur));
  assert.ok(length("ending") >= 3, "at least 3 seconds");
  assert.ok(length("overtime") >= 3.5, "at least 3.5 seconds");
  for (const kind of ["ending", "overtime"] as const) {
    const notes = alertPattern(kind);
    assert.ok(notes.length >= 6, `${kind}: repeated, not a single beep`);
    assert.ok(notes.every((n) => n.peak > 0.4 && n.peak <= 1), `${kind}: loud but not clipping`);
    assert.ok(notes.every((n, i) => i === 0 || n.at >= notes[i - 1].at), `${kind}: notes are in time order`);
  }
  const first = (k: "ending" | "overtime") => alertPattern(k)[0];
  assert.notEqual(first("ending").type, first("overtime").type);
  assert.notEqual(first("ending").freq, first("overtime").freq);
});
