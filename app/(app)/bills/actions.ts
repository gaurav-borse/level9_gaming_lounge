"use server";
import { act } from "@/lib/action";
import { ownerActor } from "@/lib/session";
import { UserError } from "@/lib/errors";
import { int, oneOf, rupeesToPaise, str } from "@/lib/validate";
import { PAYMENT_METHODS } from "@/lib/engine/bill";
import { addPastBill } from "@/lib/db/bills";

const field = (fd: FormData, k: string) => fd.get(k);
const blank = (v: FormDataEntryValue | null) => typeof v !== "string" || v.trim() === "";
const money = (fd: FormData, k: string, label: string) => (blank(field(fd, k)) ? 0 : rupeesToPaise(field(fd, k), label));

/** Owner only: a bill for a visit that was already paid before the app was used. */
export async function addPastBillAction(fd: FormData) {
  return act(async () => {
    const me = await ownerActor();
    const when = str(field(fd, "startedAt"), "Date and time", { max: 16 });
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when)) throw new UserError("Pick the date and time they started");
    addPastBill(
      {
        stationId: int(field(fd, "station"), "Station"),
        customerId: blank(field(fd, "customer")) ? null : int(field(fd, "customer"), "Customer"),
        startedAt: new Date(when).getTime(), // no zone in the text: read as the lounge's own local time
        minutes: int(field(fd, "minutes"), "Minutes played", { min: 1, max: 1440 }),
        timePaise: money(fd, "timeAmount", "Amount for playing time"),
        extrasPaise: money(fd, "extrasAmount", "Amount for food and extras"),
        method: oneOf(field(fd, "method"), PAYMENT_METHODS, "Payment method"),
        note: str(field(fd, "note"), "Note", { max: 500, required: false }),
        staffId: me.id,
      },
      Date.now(),
    );
  });
}
