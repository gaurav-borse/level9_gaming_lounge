"use server";
import { headers } from "next/headers";
import { act } from "@/lib/action";
import { getAuth } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import { makeLockout } from "@/lib/lockout";
import { str } from "@/lib/validate";
import { audit } from "@/lib/db";

type G = typeof globalThis & { __loungeLockout?: ReturnType<typeof makeLockout> };
const lockout = () => ((globalThis as G).__loungeLockout ??= makeLockout());

export async function loginAction(username: string, pin: string) {
  return act(async () => {
    const name = str(username, "Username", { max: 30 }).toLowerCase();
    const wait = lockout().take(name); // counted now, before the slow PIN check
    if (wait > 0) throw new UserError(`Too many wrong tries. Wait ${wait} seconds and try again.`);
    const a = getAuth();
    try {
      await a.auth.api.signInUsername({ body: { username: name, password: String(pin) }, headers: a.internalHeaders(await headers()) });
    } catch {
      audit("-", "login.fail", `username: ${name}`); // nobody is signed in: "-" shows as "Not signed in" in the activity log
      throw new UserError("Wrong username or PIN");
    }
    lockout().clear(name);
  });
}

export async function logoutAction() {
  await getAuth().auth.api.signOut({ headers: await headers() });
}
