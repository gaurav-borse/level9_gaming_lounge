"use client";
import { useEffect, type RefObject } from "react";

/** Makes a <details> dropdown behave like a menu: it closes on a click elsewhere or on Esc (focus goes back to its button). */
export function useDismissableDetails(ref: RefObject<HTMLDetailsElement | null>): void {
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("click", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("click", away);
      document.removeEventListener("keydown", esc);
    };
  }, [ref]);
}
