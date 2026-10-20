"use server";
import { act } from "@/lib/action";
import { actor } from "@/lib/session";
import { oneOf, str } from "@/lib/validate";
import { markMessage } from "@/lib/db/messages";

export async function markMessageAction(key: string, outcome: string) {
  return act(async () => {
    await actor();
    markMessage(str(key, "Message", { max: 60 }), oneOf(outcome, ["opened", "skipped"] as const, "Outcome"));
  });
}
