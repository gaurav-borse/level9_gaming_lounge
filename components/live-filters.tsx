"use client";
import { useRef, useEffect, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * A search/filter form with no Search button: every change opens the list again with the new filter (typing waits a moment so
 * it doesn't reload on every key). Empty fields are left out of the address. Page numbers are dropped, so a new filter starts on page 1.
 * `require` names fields that must all be filled in before anything happens (a date range needs both dates).
 */
export function LiveFilters({ action, children, className, require = [] }: { action: string; children: ReactNode; className?: string; require?: string[] }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [, start] = useTransition();
  useEffect(() => () => clearTimeout(timer.current), []);

  const go = () => {
    const fd = new FormData(form.current!);
    const qs = new URLSearchParams();
    for (const [k, v] of fd) if (typeof v === "string" && v.trim() !== "") qs.set(k, v.trim());
    if (require.some((k) => !qs.get(k))) return;
    start(() => router.replace(qs.size ? `${action}?${qs.toString()}` : action));
  };

  return (
    <form
      ref={form}
      method="get"
      action={action}
      className={className}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        clearTimeout(timer.current);
        go();
      }}
      onChange={(e) => {
        clearTimeout(timer.current);
        const t = e.target as unknown as HTMLInputElement;
        if (t.tagName === "INPUT" && (t.type === "search" || t.type === "text")) timer.current = setTimeout(go, 350);
        else go();
      }}
    >
      {children}
    </form>
  );
}
