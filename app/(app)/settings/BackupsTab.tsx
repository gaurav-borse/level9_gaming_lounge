import { DatabaseBackup } from "lucide-react";
import { DialogButton } from "@/components/dialog-button";
import { authSecret } from "@/lib/auth";
import { makeChallenge } from "@/lib/danger";
import { ActionForm } from "@/components/action-form";
import { DeleteButton } from "@/components/menu/DeleteButton";
import { backupsDir, KEEP, listBackups } from "@/lib/backup";
import type { BackupFile } from "@/lib/backup";
import { getSetting } from "@/lib/db/settings";
import { dateTime } from "@/lib/format";
import { btnCls, btnDangerCls, btnPrimaryCls, cardCls, inputCls, labelCls } from "@/lib/ui";
import { backupNowAction, clearAllDataAction, restoreBackupAction, saveBackupFolderAction } from "./actions";

const KIND = { auto: "Automatic", upgrade: "Before an app update", restore: "Before a restore", clear: "Before clearing all data" } as const;
const size = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function Row({ f, from }: { f: BackupFile; from: "main" | "second" }) {
  return (
    <tr>
      <td className="px-4 py-3">{dateTime(f.at)}</td>
      <td className="px-4 py-3 text-silver">{KIND[f.kind]}</td>
      <td className="px-4 py-3 text-silver">{from === "main" ? "This computer" : "Second folder"}</td>
      <td className="tnum px-4 py-3 text-right text-silver">{size(f.size)}</td>
      <td className="px-4 py-3 text-right">
        <ActionForm action={restoreBackupAction} success="Restored. Sign in again.">
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="name" value={f.name} />
          <DeleteButton
            label="Restore"
            confirmText={`Go back to the data as it was on ${dateTime(f.at)}?\n\nEverything entered since then (bills, customers, settings) will be replaced. A copy of today's data is saved first, so you can undo this. You will have to sign in again.`}
          />
        </ActionForm>
      </td>
    </tr>
  );
}

export function BackupsTab() {
  const second = getSetting("backup.folder");
  const main = listBackups(backupsDir());
  const other = second ? listBackups(second) : [];
  const last = main.find((b) => b.kind === "auto");
  const challenge = makeChallenge(authSecret());
  return (
    <div className="space-y-6">
      <section className={`${cardCls} space-y-4 p-6`}>
        <h2 className="font-display text-xl font-semibold">Backups</h2>
        <p className="max-w-prose text-sm text-mute">
          The app saves a copy of all your data on its own when it starts and every 6 hours, and keeps the newest {KEEP}.
          Logos and pictures you uploaded are not part of a backup; upload them again if you ever move to a new computer.
        </p>
        <p className="text-sm">{last ? <>Last backup: <b>{dateTime(last.at)}</b></> : <span className="text-warn">No backup yet.</span>}</p>
        <ActionForm action={backupNowAction} success="Backup saved">
          <button className={btnPrimaryCls}><DatabaseBackup className="size-4" aria-hidden /> Back up now</button>
        </ActionForm>
      </section>

      <ActionForm action={saveBackupFolderAction} success="Saved" className={`${cardCls} flex flex-col gap-3 p-6`}>
        <h2 className="font-display text-xl font-semibold">Second folder</h2>
        <p className="max-w-prose text-sm text-mute">
          A copy on the same computer is lost if the computer is. Type the folder of a USB drive or a cloud-synced folder (like OneDrive) and every backup is copied there too.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-72 flex-1">
            <label className={labelCls} htmlFor="bfolder">Folder</label>
            <input id="bfolder" name="folder" defaultValue={second} maxLength={260} placeholder="e.g. E:\LoungeBackups (empty = none)" className={inputCls} />
          </div>
          <button className={btnCls}>Save folder</button>
        </div>
      </ActionForm>

      <section className={`${cardCls} overflow-x-auto`}>
        <h2 className="px-6 pt-5 font-display text-xl font-semibold">Restore</h2>
        <p className="px-6 pb-3 pt-1 text-sm text-mute">Pick a backup to go back to. Newest first.</p>
        {main.length + other.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-mute">No backups yet. Press &quot;Back up now&quot;.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-mute">
              <tr className="border-y border-line">
                <th className="px-4 py-3 font-medium">Saved</th>
                <th className="px-4 py-3 font-medium">Kind</th>
                <th className="px-4 py-3 font-medium">Where</th>
                <th className="px-4 py-3 text-right font-medium">Size</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {main.map((f) => <Row key={`m-${f.name}`} f={f} from="main" />)}
              {other.filter((f) => !main.some((m) => m.name === f.name)).map((f) => <Row key={`s-${f.name}`} f={f} from="second" />)}
            </tbody>
          </table>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-over/40 bg-panel p-6">
        <h2 className="font-display text-xl font-semibold text-over">Clear all data</h2>
        <p className="max-w-prose text-sm text-mute">
          For when you have finished testing and want a clean start. This deletes all bills and sessions, customers, expenses, investments, the menu and stock, zones, stations, rates, every setting, the activity log and uploaded pictures.
          The logins (owner and staff) are kept. A safety copy of everything is saved first, so a mistake can be undone with Restore above.
        </p>
        <div>
          <DialogButton danger label="Clear all data…" title="Clear all data">
            <ActionForm action={clearAllDataAction} success="Everything is cleared. A safety copy is in the Restore list." className="flex flex-col gap-4">
              <p className="rounded-xl border border-over/40 bg-over/10 px-4 py-3 text-sm text-over">
                This deletes every bill, customer, expense, investment, menu item, zone, station, rate and setting. Logins are kept.
              </p>
              <input type="hidden" name="expires" value={challenge.expires} />
              <input type="hidden" name="mac" value={challenge.mac} />
              <div>
                <label className={labelCls} htmlFor="clearCode">To continue, type this code</label>
                <p aria-label={`Code: ${challenge.code.split("").join(" ")}`} className="mb-2 select-none rounded-xl bg-bg px-4 py-3 text-center font-mono text-3xl font-bold tracking-[0.4em]">{challenge.code}</p>
                <input id="clearCode" name="code" required autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="Type the code above" className={inputCls} />
              </div>
              <label className="flex items-start gap-2 text-sm text-silver">
                <input type="checkbox" name="deleteBackups" defaultChecked className="mt-0.5 size-4 accent-brand" />
                <span>Also delete the backups made so far (they hold the same test data). The safety copy made now is always kept.</span>
              </label>
              <label className="flex items-start gap-2 text-sm text-silver">
                <input type="checkbox" name="understand" required className="mt-0.5 size-4 accent-brand" />
                <span>I understand this deletes everything listed above.</span>
              </label>
              <button className={`${btnDangerCls} w-fit`}>Clear all data</button>
            </ActionForm>
          </DialogButton>
        </div>
      </section>
    </div>
  );
}
