import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth.ts";
import type { Role } from "./auth-core.ts";
import { UserError } from "./errors.ts";

export type Me = { id: string; name: string; username: string; role: Role };

export async function currentUser(): Promise<Me | null> {
  const h = await headers(); // first: it makes the page dynamic before anything touches the database
  const s = await getAuth().auth.api.getSession({ headers: h });
  if (!s) return null;
  const u = s.user as typeof s.user & { role?: string; username?: string };
  return { id: u.id, name: u.name, username: u.username ?? u.name, role: u.role === "owner" ? "owner" : "staff" };
}

/** For pages and layouts: send signed-out visitors to the login screen. */
export async function requireUser(): Promise<Me> {
  const me = await currentUser();
  if (!me) redirect("/login");
  return me;
}

export async function requireOwnerPage(): Promise<Me> {
  const me = await requireUser();
  if (me.role !== "owner") redirect("/");
  return me;
}

/** For server actions: throw a message the screen can show instead of redirecting mid-action. */
export async function actor(): Promise<Me> {
  const me = await currentUser();
  if (!me) throw new UserError("Your session expired. Please sign in again.");
  return me;
}

export async function ownerActor(): Promise<Me> {
  const me = await actor();
  if (me.role !== "owner") throw new UserError("Only the owner can do that");
  return me;
}
