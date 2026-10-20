"use client";
import { useRef } from "react";
import { Send, X } from "lucide-react";
import { WhatsAppIcon } from "@/components/whatsapp-icon";
import type { TrayMessage } from "@/lib/db/messages";
import { TRAY_ACTION } from "@/lib/whatsapp/compose";
import { markMessageAction } from "@/app/(app)/whatsapp-actions";
import { useCall } from "@/lib/useCall";
import { useNow } from "@/lib/useNow";
import { useDismissableDetails } from "@/lib/useDismissableDetails";

/** WhatsApp messages waiting to be sent. Tapping Send opens WhatsApp with the text ready; the app never opens it by itself. */
export function MessageTray({ messages }: { messages: TrayMessage[] }) {
  const now = useNow(); // 0 until the page has loaded in the browser, so timed reminders appear only once the clock is known
  const menu = useRef<HTMLDetailsElement>(null);
  useDismissableDetails(menu);
  const { call, pending } = useCall();
  const due = messages.filter((m) => m.dueAt <= now);
  if (messages.length === 0) return null;

  return (
    <details ref={menu} className="relative">
      <summary
        aria-label={due.length ? `WhatsApp messages: ${due.length}` : "WhatsApp messages: none due"}
        title="WhatsApp messages"
        className="relative grid size-10 cursor-pointer list-none place-items-center rounded-full bg-panel text-silver transition hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden"
      >
        <WhatsAppIcon className="size-[1.15rem]" />
        {due.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-free px-1 text-[11px] font-bold leading-5 text-neutral-950 ring-2 ring-bg">{due.length}</span>
        )}
      </summary>
      <div className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-line bg-panel shadow-2xl">
        <p className="border-b border-line px-5 py-3.5 text-sm font-semibold">WhatsApp messages{due.length > 0 ? ` (${due.length})` : ""}</p>
        {due.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-mute">Nothing to send right now.</p>
        ) : (
          <ul className="max-h-96 divide-y divide-line overflow-y-auto">
            {due.map((m) => (
              <li key={m.key} className="flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{m.to}</span>
                  <span className="block text-xs leading-snug text-mute">{TRAY_ACTION[m.type]}</span>
                </span>
                <a
                  href={m.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => call(() => markMessageAction(m.key, "opened"))}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-free/15 px-3 py-1.5 text-sm font-semibold text-free transition hover:bg-free/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <Send className="size-3.5" aria-hidden /> Send
                </a>
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`Skip: ${TRAY_ACTION[m.type]} (${m.to})`}
                  title="Skip"
                  onClick={() => call(() => markMessageAction(m.key, "skipped"))}
                  className="grid size-8 place-items-center rounded-lg text-mute transition hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
