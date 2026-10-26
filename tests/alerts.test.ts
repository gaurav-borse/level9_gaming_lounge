import { test } from "node:test";
import assert from "node:assert/strict";
import { alertPattern, armAudioUnlock, audioReady, beep, nextAlert, unlockAudio, type AlertMemo } from "../lib/alerts.ts";

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
  assert.doesNotThrow(() => beep("timeup")); // before unlock: silent, never throws

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
  const length = (kind: "ending" | "timeup") => Math.max(...alertPattern(kind).map((n) => n.at + n.dur));
  assert.ok(length("ending") >= 3, "at least 3 seconds");
  assert.ok(length("timeup") >= 3.5, "at least 3.5 seconds");
  for (const kind of ["ending", "timeup"] as const) {
    const notes = alertPattern(kind);
    assert.ok(notes.length >= 6, `${kind}: repeated, not a single beep`);
    assert.ok(notes.every((n) => n.peak > 0.4 && n.peak <= 1), `${kind}: loud but not clipping`);
    assert.ok(notes.every((n, i) => i === 0 || n.at >= notes[i - 1].at), `${kind}: notes are in time order`);
  }
  const first = (k: "ending" | "timeup") => alertPattern(k)[0];
  assert.notEqual(first("ending").type, first("timeup").type);
  assert.notEqual(first("ending").freq, first("timeup").freq);
});

// Runs a session through a list of statuses (one per second) and returns which ticks rang.
function run(statuses: string[]): (string | null)[] {
  let memo: AlertMemo | undefined;
  return statuses.map((st) => {
    const r = nextAlert(memo, st);
    memo = r.memo;
    return r.ring;
  });
}

test("nextAlert: the warning rings once when the warn time is reached and the siren once when time runs out, never in between", () => {
  const rings = run(["running", "running", "ending", ...Array(200).fill("ending"), "timeup", ...Array(200).fill("timeup")]);
  assert.deepEqual(rings.filter(Boolean), ["ending", "timeup"]);
  assert.equal(rings[2], "ending");
  assert.equal(rings[2 + 201], "timeup");
});

test("nextAlert: a session already past its warning when the page opens does not ring again", () => {
  assert.deepEqual(run(["ending", "ending", "ending"]), [null, null, null]);
  assert.deepEqual(run(["timeup", "timeup"]), [null, null]);
  assert.deepEqual(run(["ending", "timeup"]), [null, "timeup"], "but the siren still rings when it runs out");
});

test("nextAlert: pausing and resuming does not repeat an alert; extending the session arms both alerts again", () => {
  assert.deepEqual(run(["running", "ending", "paused", "ending", "paused", "ending"]).filter(Boolean), ["ending"]);
  assert.deepEqual(run(["ending", "timeup", "paused", "timeup"]).filter(Boolean), ["timeup"]);
  // extended after the warning, then runs low again
  assert.deepEqual(run(["running", "ending", "running", "running", "ending", "timeup"]).filter(Boolean), ["ending", "ending", "timeup"]);
  // extended out of overtime straight into the warning window, then runs out again: no new warning chime, but the siren again
  assert.deepEqual(run(["running", "ending", "timeup", "ending", "ending", "timeup"]).filter(Boolean), ["ending", "timeup", "timeup"]);
});

test("nextAlert: a clock that jumps from running straight to overtime (sleep, throttled tab) still sounds the siren once", () => {
  assert.deepEqual(run(["running", "timeup", "timeup"]), [null, "timeup", null]);
});
