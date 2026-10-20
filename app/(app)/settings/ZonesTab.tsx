import { ActionForm } from "@/components/action-form";
import { DeleteButton } from "@/components/menu/DeleteButton";
import { ZONE_ICON } from "@/components/floor/status";
import { ZONE_KINDS, listStations, listZones } from "@/lib/db/catalog";
import { btnCls, btnPrimaryCls, cardCls, inputCls, labelCls } from "@/lib/ui";
import { archiveStationAction, archiveZoneAction, createStationAction, createZoneAction, updateStationAction, updateZoneAction } from "./actions";

const KIND_LABEL: Record<string, string> = { pool: "Pool / snooker", ps5: "PS5 / console", pc: "PC gaming", sim: "Sim racing", vr: "VR", custom: "Other" };

function KindSelect({ value, id }: { value: string; id?: string }) {
  return (
    <select id={id} name="kind" aria-label="Zone type" defaultValue={value} className={`${inputCls} w-44!`}>
      {ZONE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
    </select>
  );
}

/** A zone is a group of stations that share a rate (Pool Tables, PS5 Zone…). Each zone is one card: rename it, then add or edit its stations. */
export function ZonesTab() {
  const zones = listZones();
  const stations = listStations();
  return (
    <div className="space-y-6">
      <p className="text-sm text-silver">
        A <b>zone</b> is a group of stations that are billed the same way, such as Pool Tables or PS5 Zone. Add the zone first, then add its stations inside it.
        Tick <b>Under maintenance</b> to stop a station from being started without removing it.
      </p>

      <ActionForm action={createZoneAction} success="Zone added" resetOnSuccess className={`${cardCls} flex flex-wrap items-end gap-3 p-4`}>
        <div>
          <label htmlFor="newzone" className={labelCls}>Add a zone</label>
          <input id="newzone" name="name" required maxLength={40} placeholder="Zone name, e.g. VR Corner" className={`${inputCls} w-64!`} />
        </div>
        <div>
          <label htmlFor="newzonekind" className={labelCls}>Type</label>
          <KindSelect value="custom" id="newzonekind" />
        </div>
        <button className={btnPrimaryCls}>Add zone</button>
      </ActionForm>

      <div className="grid items-start gap-6 xl:grid-cols-2">
      {zones.map((z) => {
        const Icon = ZONE_ICON[z.kind] ?? ZONE_ICON.custom;
        const mine = stations.filter((s) => s.zoneId === z.id);
        return (
          <section key={z.id} className={`${cardCls} overflow-hidden`}>
            <header className="flex flex-wrap items-center gap-3 border-b border-line bg-panel-deep px-5 py-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-bg text-brand-text"><Icon className="size-6" aria-hidden /></span>
              <ActionForm action={updateZoneAction} success="Zone saved" className="flex flex-1 flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={z.id} />
                <input name="name" required maxLength={40} aria-label="Zone name" placeholder="Zone name, e.g. Pool Tables" defaultValue={z.name} className={`${inputCls} w-56! font-semibold`} />
                <KindSelect value={z.kind} />
                <button className={btnCls}>Save</button>
                <span className="text-sm text-mute">{mine.length} {mine.length === 1 ? "station" : "stations"}</span>
              </ActionForm>
              <ActionForm action={archiveZoneAction} success="Zone deleted">
                <input type="hidden" name="id" value={z.id} />
                <DeleteButton label="Delete zone" confirmText={`Delete the zone "${z.name}" and its ${mine.length} ${mine.length === 1 ? "station" : "stations"}? Past bills keep their history.`} />
              </ActionForm>
            </header>

            <div className="space-y-4 p-5">
              {mine.length === 0 && <p className="text-sm text-mute">No stations in this zone yet. Add the first one below.</p>}
              <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {mine.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 rounded-xl border border-line bg-bg/40 p-3">
                    <ActionForm action={updateStationAction} success="Station saved" className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
                      <input type="hidden" name="id" value={s.id} />
                      <input name="name" required maxLength={40} aria-label="Station name" placeholder="Station name, e.g. Pool 1" defaultValue={s.name} className={`${inputCls} w-40!`} />
                      <label className="flex items-center gap-2 text-sm text-silver">
                        <input type="checkbox" name="maintenance" defaultChecked={s.maintenance} className="size-4 accent-brand" /> Under maintenance
                      </label>
                      <button className={btnCls}>Save</button>
                    </ActionForm>
                    <ActionForm action={archiveStationAction} success="Station deleted">
                      <input type="hidden" name="id" value={s.id} />
                      <DeleteButton icon label={`Delete ${s.name}`} confirmText={`Delete the station "${s.name}"? Past bills keep their history.`} />
                    </ActionForm>
                  </li>
                ))}
              </ul>

              <ActionForm action={createStationAction} success="Station added" resetOnSuccess className="flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-4">
                <input type="hidden" name="zoneId" value={z.id} />
                <input name="name" required maxLength={40} aria-label={`New station in ${z.name}`} placeholder="New station name, e.g. PS5 2" className={`${inputCls} w-60!`} />
                <button className={btnCls}>Add station</button>
              </ActionForm>
            </div>
          </section>
        );
      })}
      </div>
    </div>
  );
}
