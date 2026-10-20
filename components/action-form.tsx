"use client";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import type { Result } from "@/lib/action";
import { useToast } from "./toast";
import { useCloseDialog } from "./dialog-button";

/** A normal <form> that runs a server action, shows its error or success note, then refreshes the page data. */
export function ActionForm({ action, children, className, success, resetOnSuccess = false, onSuccess }: {
  action: (fd: FormData) => Promise<Result<unknown>>;
  children: ReactNode;
  className?: string;
  success?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (data: unknown) => void;
}) {
  const toast = useToast();
  const closeDialog = useCloseDialog(); // set when this form sits in a pop-up
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        start(async () => {
          const r = await action(fd);
          if (r.ok) {
            if (success) toast("ok", success);
            if (resetOnSuccess) form.reset();
            onSuccess?.(r.data);
            closeDialog?.();
            router.refresh();
          } else {
            toast("err", r.error);
          }
        });
      }}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
    </form>
  );
}
