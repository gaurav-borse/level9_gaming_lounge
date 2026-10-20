import { ChevronDown } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { DeleteButton } from "@/components/menu/DeleteButton";
import { listRates, listZones } from "@/lib/db/catalog";
import { isAllTime, whenText } from "@/lib/engine/rates";
import type { RateRow } from "@/lib/engine/rates";
import { rupees } from "@/lib/format";
import { minToHHMM } from "@/lib/validate";
import { btnCls, btnPrimaryCls, cardCls, inputCls, labelCls } from "@/lib/ui";
import { archiveRateAction, saveRateAction } from "./actions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const paiseToInput = (p: number) => (p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2));

function Num({ id, name, label, value, hint, w = "w-28!" }: { id: string; name: string; label: string; value: string | number; hint: string; w?: string }) {
  return (
    <div>
      <label className={labelCls} htmlFor={id}>{label}</label>
      <input id={id} name={name} defaultValue={value} inputMode="decimal" placeholder={hint} className={`${inputCls} ${w}`} />
    </div>
  );
}

/**
 * One form for both kinds of price. The zone's normal price is just a price per hour (it applies every day, all day, so those fields stay hidden).
 * A special price also asks for a name, days and times. Priority is set for you: special prices beat the normal one.
 */
function RateForm({ zoneId, rate, special }: { zoneId: number; rate?: RateRow; special: boolean }) {
  const k = `${special ? "s" : "n"}-${rate?.id ?? "new"}-${zoneId}`;
  const mask = rate?.daysMask ?? 127;
  return (
    <ActionForm action={saveRateAction} success={rate ? "Price saved" : "Price added"} resetOnSuccess={!rate} className="flex flex-col gap-4">
      {rate && <input type="hidden" name="id" value={rate.id} />}
      <input type="hidden" name="zoneId" value={zoneId} />
      <input type="hidden" name="priority" value={rate?.priority ?? (special ? 10 : 0)} />
      {!special && (
        <>
          <input type="hidden" name="name" value={rate?.name ?? "Standard"} />
          <input type="hidden" name="from" value="00:00" />
          <input type="hidden" name="to" value="24:00" />
          {DAYS.map((d, i) => <input key={d} type="hidden" name={`d${i}`} value="on" />)}
        </>
      )}

      <div className="flex flex-wrap items-end gap-3">
        {special && (
          <div>
            <label className={labelCls} htmlFor={`name-${k}`}>Name</label>
            <input id={`name-${k}`} name="name" required maxLength={40} defaultValue={rate?.name ?? ""} placeholder="e.g. Happy hour" className={`${inputCls} w-44!`} />
          </div>
        )}
        <Num id={`hourly-${k}`} name="hourly" label="₹ per hour" value={rate ? paiseToInput(rate.hourlyPaise) : ""} hint="e.g. 150" />
        <Num id={`extra-${k}`} name="extra" label="₹ per extra controller" value={rate ? paiseToInput(rate.extraControllerPaise) : ""} hint="e.g. 50, or empty" w="w-44!" />
      </div>

      {special && (
        <div className="flex flex-wrap items-end gap-3">
          <p className="basis-full text-sm text-mute">Leave From and Until empty for all day.</p>
          <div>
            <span className={labelCls}>Days</span>
            <div className="flex gap-1">
              {DAYS.map((d, i) => (
                <label key={d} className="cursor-pointer">
                  <input type="checkbox" name={`d${i}`} defaultChecked={(mask & (1 << i)) !== 0} className="peer sr-only" />
                  <span className="inline-block rounded-md border border-line px-2 py-2 text-xs font-semibold text-mute peer-checked:border-brand peer-checked:bg-brand/15 peer-checked:text-ink peer-focus-visible:outline-2 peer-focus-visible:outline-brand">{d}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor={`from-${k}`}>From (optional)</label>
            <input id={`from-${k}`} name="from" placeholder="e.g. 14:00" defaultValue={rate && rate.fromMin > 0 ? minToHHMM(rate.fromMin) : ""} pattern="\d{1,2}:\d{2}" className={`${inputCls} w-28!`} />
          </div>
          <div>
            <label className={labelCls} htmlFor={`to-${k}`}>Until (optional)</label>
            <input id={`to-${k}`} name="to" placeholder="e.g. 17:00" defaultValue={rate && rate.toMin < 1440 ? minToHHMM(rate.toMin) : ""} pattern="\d{1,2}:\d{2}" className={`${inputCls} w-28!`} />
          </div>
        </div>
      )}

      <details className="text-sm">
        <summary className="w-fit cursor-pointer text-mute hover:text-ink">More options</summary>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Num id={`inc-${k}`} name="increment" label="Charge in steps of (min)" value={rate?.incrementMin ?? 1} hint="e.g. 1" w="w-44!" />
          <Num id={`min-${k}`} name="min" label="Minimum charge (min)" value={rate?.minMinutes ?? 15} hint="e.g. 15" w="w-44!" />
          <Num id={`grace-${k}`} name="grace" label="Free minutes at start" value={rate?.graceMin ?? 0} hint="e.g. 0" w="w-44!" />
        </div>
      </details>

      <button className={`${rate ? btnCls : btnPrimaryCls} w-fit`}>{rate ? "Save" : special ? "Add special price" : "Save price"}</button>
    </ActionForm>
  );
}

export function RatesTab() {
  const zones = listZones();
  const rates = listRates();
  return (
    <div className="space-y-6">
      <p className="max-w-prose text-sm text-silver">
        Every zone has a <b>normal price</b> per hour. Add a <b>special price</b> for a time that costs different, like happy hour or weekends: during those times it is used instead of the normal one.
        A session keeps the price it started with.
      </p>
      <div className="grid items-start gap-6 xl:grid-cols-2">
      {zones.map((z) => {
        const mine = rates.filter((r) => r.zoneId === z.id);
        const normal = mine.filter(isAllTime).sort((a, b) => a.priority - b.priority || a.id - b.id)[0];
        const specials = mine.filter((r) => r !== normal);
        return (
          <section key={z.id} className={`${cardCls} space-y-6 p-5 sm:p-6`}>
            <h2 className="font-display text-xl font-semibold">{z.name}</h2>

            <div className="space-y-3">
              <h3 className={labelCls}>Normal price</h3>
              {!normal && <p className="text-sm text-warn">No price yet. Stations in this zone can&apos;t be started until you set one.</p>}
              <RateForm zoneId={z.id} rate={normal} special={false} />
            </div>

            <div className="space-y-3 border-t border-line pt-5">
              <h3 className={labelCls}>Special prices</h3>
              {specials.length === 0 && <p className="text-sm text-mute">None. Add one for happy hour, weekends or late nights.</p>}
              <ul className="space-y-2">
                {specials.map((r) => (
                  <li key={r.id}>
                    <details className="group rounded-2xl border border-line bg-bg">
                      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{r.name} · {rupees(r.hourlyPaise)}/hr</span>
                          <span className="block text-sm text-mute">{whenText(r)}</span>
                        </span>
                        <ChevronDown className="size-4 shrink-0 text-mute transition group-open:rotate-180" aria-hidden />
                      </summary>
                      <div className="space-y-4 border-t border-line p-4">
                        <RateForm zoneId={z.id} rate={r} special />
                        <ActionForm action={archiveRateAction} success="Price removed">
                          <input type="hidden" name="id" value={r.id} />
                          <DeleteButton label="Remove this price" confirmText={`Remove the special price "${r.name}"?`} />
                        </ActionForm>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
              <details className="rounded-2xl border border-dashed border-line">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-silver hover:text-ink">+ Add a special price</summary>
                <div className="border-t border-dashed border-line p-4">
                  <RateForm zoneId={z.id} special />
                </div>
              </details>
            </div>

          </section>
        );
      })}
      </div>
    </div>
  );
}
