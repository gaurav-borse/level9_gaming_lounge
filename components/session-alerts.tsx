"use client";
import { useEffect, useRef } from "react";
import type { BoardSession } from "@/lib/db/sessions";
import { liveInfo } from "@/lib/live";
import { armAudioUnlock, beep, nextAlert, type AlertMemo } from "@/lib/alerts";
import { useNow } from "@/lib/useNow";
import { useToast } from "@/components/toast";

/**
 * Sound and a notice when a session first reaches "warn when this many minutes are left" and when its time runs out.
 * Lives in the page frame, not on the Floor screen, so it still rings while someone is on Bills or Reports.
 */
export function SessionAlerts({ stations, leadMin, mode }: {
  stations: { id: number; name: string; session: BoardSession }[];
  leadMin: number;
  mode: "sound" | "silent";
}) {
  const now = useNow();
  const toast = useToast();
  const memo = useRef(new Map<number, AlertMemo>());

  // After a reload or restart the browser keeps sound off until the first touch of the page.
  useEffect(() => armAudioUnlock(window), []);

  useEffect(() => {
    if (!now) return;
    const live = new Set<number>();
    for (const st of stations) {
      const s = st.session;
      if (s.endedAt !== null) continue;
      live.add(s.id);
      const { ring, memo: next } = nextAlert(memo.current.get(s.id), liveInfo(s, leadMin, now).status);
      memo.current.set(s.id, next);
      if (!ring) continue;
      if (mode === "sound") beep(ring);
      toast("info", `${st.name}: ${ring === "ending" ? `${leadMin} minutes or less left` : "time is up"}`);
    }
    for (const id of memo.current.keys()) if (!live.has(id)) memo.current.delete(id);
  }, [now, stations, leadMin, mode, toast]);

  return null;
}
