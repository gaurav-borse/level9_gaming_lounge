import { all, get, run, tx } from "./index.ts";

export const DEFAULTS = {
  "setup.done": "0",
  "cafe.name": "My Gaming Lounge",
  "cafe.logo": "builtin:level9", // "builtin:level9", "" for none, or an uploaded file name under data/uploads
  "cafe.loginImage": "", // sign-in page picture: "" = the built-in Level 9 artwork, or an uploaded file name under data/uploads
  "cafe.address": "",
  "cafe.phone": "",
  "cafe.gstin": "",
  "cafe.upiId": "",
  "cafe.hours": "",
  "gst.enabled": "0",
  "gst.pct": "18",
  "alert.leadMin": "10",
  "alert.enabled": "1", // the bell, the pop-up notices and the sounds
  "alert.sound": "1", // beeps when a session is ending or over time
  "staff.maxDiscountPct": "10",
  "backup.folder": "", // a second place (USB drive, cloud-synced folder) every backup is also copied to
  "wa.mode": "prompt", // "prompt" = staff tap each message; a "cloud" sender can take over later
  "wa.enabled": "1",
  "wa.welcome": "1",
  "wa.started": "1",
  "wa.ending": "1",
  "wa.invoice": "1",
  "wa.tpl.welcome": "", // empty = the standard wording (lib/whatsapp/compose.ts)
  "wa.tpl.started": "",
  "wa.tpl.ending": "",
  "wa.tpl.invoice": "",
} as const;

export type SettingKey = keyof typeof DEFAULTS;
export type Settings = Record<SettingKey, string>;

export function getSettings(): Settings {
  const out: Settings = { ...DEFAULTS };
  for (const r of all<{ key: string; value: string }>("SELECT key, value FROM settings")) {
    if (r.key in DEFAULTS) out[r.key as SettingKey] = r.value;
  }
  return out;
}

export function getSetting(key: SettingKey): string {
  return get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key)?.value ?? DEFAULTS[key];
}

export function setSettings(values: Partial<Settings>): void {
  tx(() => {
    for (const [k, v] of Object.entries(values)) {
      if (!(k in DEFAULTS) || v === undefined) continue;
      run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", k, v);
    }
  });
}

export const isSetupDone = (): boolean => getSetting("setup.done") === "1";
