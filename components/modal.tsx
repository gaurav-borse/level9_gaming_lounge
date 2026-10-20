"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** Native <dialog>: focus trap, Esc to close and a backdrop for free. Children only mount while open. */
export function Modal({ open, onClose, title, children, side = false }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  side?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const shape = side
    ? "m-0 ml-auto h-dvh max-h-none w-full max-w-[30rem] rounded-none border-y-0 border-r-0"
    : "m-auto w-full max-w-xl rounded-2xl";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
      data-side={side || undefined}
      className={`border border-line bg-panel p-0 text-ink shadow-[0_24px_64px_-12px_rgb(0_0_0/0.5)] ${shape}`}
    >
      {open && (
        <div className="flex max-h-dvh flex-col">
          <header className="flex items-center justify-between border-b border-line border-t-2 border-t-brand px-5 py-3.5">
            <h2 className="font-display text-xl font-bold tracking-wide">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-mute hover:bg-raised hover:text-ink focus-visible:bg-raised focus-visible:text-ink focus-visible:outline-none">
              <X className="size-5" />
            </button>
          </header>
          <div className="overflow-y-auto p-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}
