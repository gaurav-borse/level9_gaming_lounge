/**
 * Per-name brute-force guard for PIN logins. In memory: a restart clears it, which is fine for one laptop.
 * take() records the attempt BEFORE the (slow) PIN check starts, so a burst of parallel guesses is counted
 * as it arrives instead of all slipping through before the first failure is recorded.
 */
export function makeLockout(maxTries = 5, windowMs = 60_000, now: () => number = Date.now) {
  const tries = new Map<string, number[]>();
  return {
    /** 0 = go ahead (and this try is now counted); otherwise the seconds to wait. */
    take(key: string): number {
      const t = now();
      const recent = (tries.get(key) ?? []).filter((x) => t - x < windowMs);
      if (recent.length >= maxTries) {
        tries.set(key, recent);
        return Math.ceil((windowMs - (t - recent[0])) / 1000);
      }
      recent.push(t);
      tries.set(key, recent);
      return 0;
    },
    /** Call after a correct PIN. */
    clear(key: string): void {
      tries.delete(key);
    },
  };
}
