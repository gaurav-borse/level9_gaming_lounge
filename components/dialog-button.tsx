"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "./modal";
import { btnCls, btnDangerCls, btnPrimaryCls } from "@/lib/ui";

const CloseDialog = createContext<(() => void) | null>(null);

/** Inside a DialogButton: a function that closes the pop-up. An ActionForm calls it once its action has worked. Null elsewhere. */
export const useCloseDialog = () => useContext(CloseDialog);

/** A button that opens a pop-up holding `children` (usually an ActionForm); the pop-up closes itself when the form succeeds. `edit` makes it a quiet "Edit" button, `danger` a red one, instead of the green "Add" one. */
export function DialogButton({ label, title, children, edit = false, danger = false }: { label: string; title: string; children: ReactNode; edit?: boolean; danger?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={danger ? btnDangerCls : edit ? btnCls : btnPrimaryCls} onClick={() => setOpen(true)}>
        {danger ? <Trash2 className="size-4" aria-hidden /> : edit ? <Pencil className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />} {label}
      </button>
      <CloseDialog.Provider value={() => setOpen(false)}>
        <Modal open={open} onClose={() => setOpen(false)} title={title}>{children}</Modal>
      </CloseDialog.Provider>
    </>
  );
}
