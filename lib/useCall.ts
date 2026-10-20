"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Result } from "./action.ts";
import { useToast } from "@/components/toast";

/** Run a server action, show its error (or an optional success note), then refresh the page data. */
export function useCall() {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const call = <T,>(fn: () => Promise<Result<T>>, o: { ok?: string; onOk?: (data: T) => void } = {}) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        if (o.ok) toast("ok", o.ok);
        o.onOk?.(r.data);
        router.refresh();
      } else {
        toast("err", r.error);
      }
    });
  return { call, pending };
}
