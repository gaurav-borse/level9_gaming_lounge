import { ActionForm } from "@/components/action-form";
import { getSettings } from "@/lib/db/settings";
import type { SettingKey } from "@/lib/db/settings";
import { DEFAULT_TEMPLATES, MESSAGE_TYPES, PLACEHOLDERS, TYPE_LABEL } from "@/lib/whatsapp/compose";
import { btnPrimaryCls, cardCls, inputCls, labelCls } from "@/lib/ui";
import { saveWhatsAppAction } from "./actions";

const WHEN = {
  welcome: "When a customer starts a session (once per customer per day).",
  started: "When a session starts: station, zone, start time, rate, mode and end time.",
  ending: "When a session is about to end (see the warning minutes in Lounge).",
  invoice: "After a bill is paid: items and total.",
};

export function WhatsAppTab() {
  const s = getSettings();
  return (
    <ActionForm action={saveWhatsAppAction} success="Saved" className={`${cardCls} flex flex-col gap-5 p-6`}>
      <h2 className="font-display text-xl font-semibold">WhatsApp messages</h2>
      <p className="max-w-prose text-sm text-mute">
        Messages wait in the speech-bubble button at the top. Staff tap Send and WhatsApp opens with the text ready; nothing is sent by itself.
        Every customer with a phone number gets messages.
      </p>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="enabled" defaultChecked={s["wa.enabled"] === "1"} className="size-4 accent-brand" /> Send WhatsApp messages
      </label>
      {MESSAGE_TYPES.map((t) => (
        <div key={t} className="grid gap-2 border-t border-line pt-5">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name={t} defaultChecked={s[`wa.${t}` as SettingKey] === "1"} className="size-4 accent-brand" /> {TYPE_LABEL[t]}
          </label>
          <p className="text-sm text-mute">{WHEN[t]}</p>
          <label className={labelCls} htmlFor={`tpl-${t}`}>Wording (leave empty for the standard text)</label>
          <textarea
            id={`tpl-${t}`}
            name={`tpl-${t}`}
            rows={3}
            maxLength={1000}
            defaultValue={s[`wa.tpl.${t}` as SettingKey]}
            placeholder={DEFAULT_TEMPLATES[t]}
            className={inputCls}
          />
          <p className="text-xs text-mute">You can use {PLACEHOLDERS[t].map((p) => `{${p}}`).join(" ")}</p>
        </div>
      ))}
      <button className={`${btnPrimaryCls} self-start`}>Save changes</button>
    </ActionForm>
  );
}
