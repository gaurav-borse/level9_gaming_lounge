export const MESSAGE_TYPES = ["welcome", "started", "ending", "invoice"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const TYPE_LABEL: Record<MessageType, string> = {
  welcome: "Welcome",
  started: "Session started",
  ending: "Ending reminder",
  invoice: "Invoice",
};

/** Used whenever a lounge hasn't written its own. {words} in braces are filled in per message. */
/** What the tray says staff are about to do, e.g. "Send session started notification on WhatsApp". */
export const TRAY_ACTION: Record<MessageType, string> = {
  welcome: "Send welcome message on WhatsApp",
  started: "Send session started notification on WhatsApp",
  ending: "Send session ending reminder on WhatsApp",
  invoice: "Send invoice on WhatsApp",
};

export const DEFAULT_TEMPLATES: Record<MessageType, string> = {
  welcome: "Hi {name}, welcome to {lounge}! Have a great time.",
  started: "Hi {name}, you're on {station} ({zone}) at {lounge}. Started {start} · {mode} · {rate} · {end}.",
  ending: "Hi {name}, your time on {station} at {lounge} ends in about {minutes} minutes. Tell us at the counter if you'd like to extend.",
  invoice: "Hi {name}, thanks for visiting {lounge}!\n{invoice}\n{items}\nTotal: {total}\nSee you again soon.",
};

export const PLACEHOLDERS: Record<MessageType, string[]> = {
  welcome: ["name", "lounge"],
  started: ["name", "lounge", "station", "zone", "start", "mode", "rate", "end"],
  ending: ["name", "lounge", "station", "minutes"],
  invoice: ["name", "lounge", "invoice", "items", "total"],
};

/** Replaces {word} with its value. A word that isn't known is left as typed, so a typo is visible. */
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (Object.hasOwn(vars, k) ? vars[k] : m));
}

/** An empty template means "use the standard one". */
export const compose = (type: MessageType, custom: string, vars: Record<string, string>): string =>
  fill(custom.trim() || DEFAULT_TEMPLATES[type], vars);

/** phone is digits with country code (as stored). */
export const waLink = (phone: string, text: string): string => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
