"use server";
import { act } from "@/lib/action";
import { UserError } from "@/lib/errors";
import { ownerActor } from "@/lib/session";
import { audit } from "@/lib/db";

/** Owner only: stops the whole app (what stop.bat does), so a lounge that closes for the night can switch it off from the screen. */
export async function quitAppAction() {
  return act(async () => {
    const me = await ownerActor();
    if (process.env.NODE_ENV !== "production") throw new UserError("Only the installed app can be stopped from here");
    audit(me.id, "app.quit", "stopped from the screen");
    setTimeout(() => process.exit(0), 600); // after this reply has gone out
  });
}
