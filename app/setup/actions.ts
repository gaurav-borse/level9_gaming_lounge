"use server";
import { act } from "@/lib/action";
import { createUser, hasAnyUser } from "@/lib/auth-core";
import { getAuth } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import { str } from "@/lib/validate";
import { seedLevel9Starter } from "@/lib/db/seed";
import { setSettings } from "@/lib/db/settings";
import { BRAND } from "@/lib/brand";

export async function setupAction(fd: FormData) {
  return act(async () => {
    if (hasAnyUser()) throw new UserError("Setup is already done. Please sign in.");
    const name = str(fd.get("ownerName"), "Your name", { max: 60 });
    const username = str(fd.get("username"), "Username", { max: 20 }).toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) throw new UserError("Username can use letters, numbers and _ (3 to 20 characters)");
    const pin = String(fd.get("pin") ?? "");
    if (!/^\d{4,8}$/.test(pin)) throw new UserError("PIN must be 4 to 8 digits");
    if (pin !== String(fd.get("pin2") ?? "")) throw new UserError("The two PINs don't match");

    await createUser(getAuth(), { username, pin, name, role: "owner" });
    seedLevel9Starter();
    setSettings({
      "cafe.name": BRAND.name,
      "cafe.address": BRAND.address,
      "setup.done": "1",
    });
  });
}
