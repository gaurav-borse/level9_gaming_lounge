"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Pencil, Plus } from "lucide-react";
import { Modal } from "./modal";
import { btnCls, btnPrimaryCls } from "@/lib/ui";

const CloseDialog = createContext<(() => void) | null>(null);

/** Inside a DialogButton: a function that closes the pop-up. An ActionForm calls it once its action has worked. Null elsewhere. */
export const useCloseDialog = () => useContext(CloseDialog);

/** A button that opens a pop-up holding `children` (usually an ActionForm); the pop-up closes itself when the form succeeds. `edit` makes it a quiet "Edit" button instead of the green "Add" one. */
export function DialogButton({ label, title, children, edit = false }: { label: string; title: string; children: ReactNode; edit?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={edit ? btnCls : btnPrimaryCls} onClick={() => setOpen(true)}>
        {edit ? <Pencil className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />} {label}
      </button>
      <CloseDialog.Provider value={() => setOpen(false)}>
        <Modal open={open} onClose={() => setOpen(false)} title={title}>{children}</Modal>
      </CloseDialog.Provider>
    </>
  );
}
