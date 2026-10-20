"use client";
import { useSyncExternalStore } from "react";

function subscribe(cb: () => void): () => void {
  const id = setInterval(cb, 1000);
  return () => clearInterval(id);
}

const snapshot = (): number => Math.floor(Date.now() / 1000) * 1000;

/** Current time, ticking every second. Returns 0 on the server and first paint, so check for 0 before showing times. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}
