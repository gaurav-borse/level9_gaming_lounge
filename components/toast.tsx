"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";

type Kind = "ok" | "err" | "info";
type Toast = { id: number; kind: Kind; text: string };

const Ctx = createContext<(kind: Kind, text: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

const STYLE: Record<Kind, string> = {
  ok: "border-free/40",
  err: "border-over/60",
  info: "border-warn/50",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Kind, text: string) => {
    const id = Date.now() + Math.random();
    setItems((l) => [...l.slice(-3), { id, kind, text }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), kind === "err" ? 8000 : 4500);
  }, []);
  return (
    <Ctx value={push}>
      {children}
      <div aria-live="polite" className="no-print fixed bottom-4 right-4 z-[100] flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} role={t.kind === "err" ? "alert" : "status"} className={`flex items-start gap-2.5 rounded-lg border bg-raised px-3.5 py-3 text-sm shadow-xl ${STYLE[t.kind]}`}>
            {t.kind === "ok" ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-free" /> : t.kind === "err" ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-over" /> : <Info className="mt-0.5 size-4 shrink-0 text-warn" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx>
  );
}
