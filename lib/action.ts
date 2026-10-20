import { UserError } from "./errors.ts";

export type Result<T = void> = { ok: true; data: T } | { ok: false; error: string };

/** Wrap a server action body: expected problems become messages, anything else is logged and made generic. */
export async function act<T>(fn: () => Promise<T> | T): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong and nothing was saved. Please try again." };
  }
}
