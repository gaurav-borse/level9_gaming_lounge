// Shared Tailwind class strings so every form and button looks the same.
export const inputCls =
  "w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink placeholder:text-mute focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-50";

export const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wider text-mute";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50";

export const btnCls = `${btnBase} border border-line bg-raised text-ink hover:border-silver/40 hover:bg-line`;
export const btnPrimaryCls = `${btnBase} bg-brand text-on-brand shadow-[0_0_0_1px_rgb(255_255_255/0.06)_inset] hover:bg-brand-hi`;
export const btnDangerCls = `${btnBase} border border-over/50 bg-transparent text-over hover:bg-over/10`;

export const cardCls = "rounded-xl border border-line bg-panel";
