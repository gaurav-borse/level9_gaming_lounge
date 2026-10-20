"use client";
import { Printer } from "lucide-react";
import { btnCls } from "@/lib/ui";

/** Prints the whole report (every section is on the page, the others just hidden on screen). The "show the numbers" tables are opened for the printout and closed again after. */
export function PrintButton() {
  const print = () => {
    const closed = [...document.querySelectorAll<HTMLDetailsElement>("[data-report-body] details:not([open])")];
    for (const d of closed) d.open = true;
    window.addEventListener("afterprint", () => { for (const d of closed) d.open = false; }, { once: true });
    window.print();
  };
  return <button type="button" className={btnCls} onClick={print}><Printer className="size-4" aria-hidden /> Print all reports</button>;
}
