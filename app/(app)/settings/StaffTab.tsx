import { ActionForm } from "@/components/action-form";
import { listStaff } from "@/lib/auth-core";
import { btnCls, btnDangerCls, btnPrimaryCls, cardCls, inputCls, labelCls } from "@/lib/ui";
import { createStaffAction, removeStaffAction, renameStaffAction, resetPinAction } from "./actions";

export function StaffTab({ meId }: { meId: string }) {
  const staff = listStaff();
  return (
    <div className="space-y-6">
      <ActionForm action={createStaffAction} success="Staff login created" resetOnSuccess className={`${cardCls} flex flex-wrap items-end gap-3 p-5`}>
        <div>
          <label className={labelCls} htmlFor="sn">Name</label>
          <input id="sn" name="name" required maxLength={60} placeholder="e.g. Rahul Sharma" className={`${inputCls} !w-44`} />
        </div>
        <div>
          <label className={labelCls} htmlFor="su">Username</label>
          <input id="su" name="username" required autoCapitalize="none" autoComplete="off" placeholder="e.g. rahul (used to sign in)" className={`${inputCls} !w-40`} />
        </div>
        <div>
          <label className={labelCls} htmlFor="sp">PIN (4 to 8 digits)</label>
          <input id="sp" name="pin" type="password" inputMode="numeric" autoComplete="new-password" required placeholder="4 to 8 digits" className={`${inputCls} !w-40`} />
        </div>
        <button className={btnPrimaryCls}>Add staff</button>
      </ActionForm>

      <ul className={`${cardCls} divide-y divide-line`}>
        {staff.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1 space-y-1.5">
              <ActionForm action={renameStaffAction} success="Name changed" className="flex items-center gap-2">
                <input type="hidden" name="id" value={p.id} />
                <input name="name" required maxLength={60} defaultValue={p.name} aria-label={`Name of @${p.username}`} placeholder="e.g. Rahul Sharma" className={`${inputCls} !w-52 font-semibold`} />
                <button className={btnCls}>Rename</button>
                {p.id === meId && <span className="text-sm text-mute">(you)</span>}
              </ActionForm>
              <div className="text-sm text-mute">@{p.username} · <span className="capitalize">{p.role}</span></div>
            </div>
            <ActionForm action={resetPinAction} success="PIN changed" resetOnSuccess className="flex items-center gap-2">
              <input type="hidden" name="id" value={p.id} />
              <input name="pin" type="password" inputMode="numeric" autoComplete="new-password" required aria-label={`New PIN for ${p.name}`} placeholder="New PIN" className={`${inputCls} !w-28`} />
              <button className={btnCls}>Change PIN</button>
            </ActionForm>
            {p.role !== "owner" && (
              <ActionForm action={removeStaffAction} success="Removed">
                <input type="hidden" name="id" value={p.id} />
                <button className={btnDangerCls}>Remove</button>
              </ActionForm>
            )}
          </li>
        ))}
      </ul>
      <p className="text-sm text-mute">Staff can run the floor and take payments. Only you can void bills, give large discounts, or open Settings.</p>
    </div>
  );
}
