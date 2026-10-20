"use client";
import { X } from "lucide-react";
import { btnDangerCls } from "@/lib/ui";

/** A submit button that asks "are you sure?" first. Put it inside an ActionForm; cancelling stops the form from submitting.
 *  `icon` makes it a small round X (label is then only the accessible name). */
export function DeleteButton({ label = "Delete", confirmText, icon = false }: { label?: string; confirmText: string; icon?: boolean }) {
  const confirmFirst = (e: React.MouseEvent) => {
    if (!window.confirm(confirmText)) e.preventDefault();
  };
  if (icon) {
    return (
      <button
        type="submit"
        aria-label={label}
        title={label}
        onClick={confirmFirst}
        className="grid size-9 shrink-0 place-items-center rounded-full text-mute transition hover:bg-over/10 hover:text-over focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-over"
      >
        <X className="size-5" aria-hidden />
      </button>
    );
  }
  return (
    <button type="submit" className={btnDangerCls} onClick={confirmFirst}>
      {label}
    </button>
  );
}
