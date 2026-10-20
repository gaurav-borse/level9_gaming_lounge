"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, CircleAlert, Eye, EyeOff, Lock, User } from "lucide-react";
import { loginAction } from "./actions";
import { unlockAudio } from "@/lib/alerts";
import { inputCls, labelCls } from "@/lib/ui";

const icon = "pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-mute";

export function LoginForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        unlockAudio(); // this click is what lets the timer alerts make sound later
        const fd = new FormData(e.currentTarget);
        setError("");
        start(async () => {
          const r = await loginAction(String(fd.get("username") ?? ""), String(fd.get("pin") ?? ""));
          if (r.ok) {
            router.push("/");
            router.refresh();
          } else setError(r.error);
        });
      }}
    >
      <div>
        <label htmlFor="username" className={labelCls}>Username</label>
        <div className="relative">
          <User className={icon} aria-hidden />
          <input id="username" name="username" autoComplete="username" autoCapitalize="none" autoFocus required placeholder="Your username, e.g. owner" className={`${inputCls} py-2.5 pl-10`} />
        </div>
      </div>
      <div>
        <label htmlFor="pin" className={labelCls}>PIN</label>
        <div className="relative">
          <Lock className={icon} aria-hidden />
          <input id="pin" name="pin" type={show ? "text" : "password"} inputMode="numeric" autoComplete="current-password" required placeholder="Your PIN" className={`${inputCls} py-2.5 pl-10 pr-11`} />
          <button
            type="button"
            onClick={() => setShow(!show)}
            aria-label={show ? "Hide PIN" : "Show PIN"}
            aria-pressed={show}
            className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-mute transition hover:bg-line hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
          >
            {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-2xl border border-over/40 bg-over/10 px-4 py-3 text-sm text-over">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
        </p>
      )}
      <button
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand px-6 text-sm font-semibold text-on-brand transition hover:bg-brand-hi focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Signing in…" : <>Sign in <ArrowRight className="size-4" aria-hidden /></>}
      </button>
    </form>
  );
}
