import { ActionForm } from "@/components/action-form";
import { TestSound } from "@/components/test-sound";
import { BrandWide } from "@/components/brand";
import { getSettings } from "@/lib/db/settings";
import { MAX_LOGIN_BYTES, MAX_LOGO_BYTES, loginImageSrc, logoSources } from "@/lib/logo";
import { btnCls, btnPrimaryCls, cardCls, inputCls, labelCls } from "@/lib/ui";
import { resetLoginImageAction, resetLogoAction, saveCafeAction, uploadLoginImageAction, uploadLogoAction } from "./actions";

export function CafeTab() {
  const s = getSettings();
  const logo = logoSources(s["cafe.logo"]);
  return (
    <div className="grid gap-6">
      <section className={`${cardCls} space-y-4 p-6`}>
        <h2 className="font-display text-xl font-semibold">Logo</h2>
        <div className="flex flex-wrap items-center gap-5">
          <BrandWide name={s["cafe.name"]} logo={logo} className="w-64" />
          <div className="flex flex-1 flex-wrap items-end gap-3">
            <ActionForm action={uploadLogoAction} success="Logo updated" resetOnSuccess className="flex flex-wrap items-end gap-3">
              <div>
                <label className={labelCls} htmlFor="logo">Upload a new logo (PNG, JPG or WebP, up to {Math.round(MAX_LOGO_BYTES / 1024)} KB)</label>
                <input id="logo" name="logo" type="file" required accept="image/png,image/jpeg,image/webp" className={`${inputCls} w-80! file:mr-3 file:rounded-md file:border-0 file:bg-raised file:px-3 file:py-1 file:text-sm file:font-semibold file:text-ink`} />
              </div>
              <button className={btnPrimaryCls}>Upload</button>
            </ActionForm>
            <ActionForm action={resetLogoAction} success="Logo changed">
              <input type="hidden" name="to" value="builtin" />
              <button className={btnCls}>Use the Level 9 logo</button>
            </ActionForm>
            <ActionForm action={resetLogoAction} success="Logo removed">
              <input type="hidden" name="to" value="none" />
              <button className={btnCls}>No logo, show the name</button>
            </ActionForm>
          </div>
        </div>
        <p className="text-sm text-mute">A wide logo on a dark background looks best. It appears in the sidebar and on the sign-in page.</p>
      </section>

      <section className={`${cardCls} space-y-4 p-6`}>
        <h2 className="font-display text-xl font-semibold">Sign-in page picture</h2>
        <div className="flex flex-wrap items-center gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={loginImageSrc(s["cafe.loginImage"])} alt="Current sign-in page picture" className="h-32 w-auto rounded-2xl bg-plate object-contain ring-1 ring-line" />
          <div className="flex flex-1 flex-wrap items-end gap-3">
            <ActionForm action={uploadLoginImageAction} success="Sign-in picture updated" resetOnSuccess className="flex flex-wrap items-end gap-3">
              <div>
                <label className={labelCls} htmlFor="loginImage">Upload a new picture (PNG, JPG or WebP, up to {Math.round(MAX_LOGIN_BYTES / 1024 / 1024 * 10) / 10} MB)</label>
                <input id="loginImage" name="image" type="file" required accept="image/png,image/jpeg,image/webp" className={`${inputCls} w-80! file:mr-3 file:rounded-md file:border-0 file:bg-raised file:px-3 file:py-1 file:text-sm file:font-semibold file:text-ink`} />
              </div>
              <button className={btnPrimaryCls}>Upload</button>
            </ActionForm>
            <ActionForm action={resetLoginImageAction} success="Sign-in picture reset">
              <button className={btnCls}>Use the Level 9 picture</button>
            </ActionForm>
          </div>
        </div>
        <p className="text-sm text-mute">Shown on the sign-in page. A picture on a dark background looks best.</p>
      </section>

      <ActionForm action={saveCafeAction} success="Saved" className={`${cardCls} flex flex-col gap-5 p-6`}>
        <h2 className="font-display text-xl font-semibold">Lounge</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="cafeName">Lounge name (shown on screens and invoices)</label>
            <input id="cafeName" name="cafeName" required maxLength={60} defaultValue={s["cafe.name"]} placeholder="e.g. Level 9 Gaming Lounge" className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="address">Address (shown on invoices)</label>
            <input id="address" name="address" maxLength={200} defaultValue={s["cafe.address"]} placeholder="e.g. Aurum Elemento, Lohegaon, Pune 47" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="phone">Phone</label>
            <input id="phone" name="phone" maxLength={30} defaultValue={s["cafe.phone"]} placeholder="e.g. 98765 43210" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="upiId">UPI ID (for payment QR codes)</label>
            <input id="upiId" name="upiId" defaultValue={s["cafe.upiId"]} placeholder="e.g. yourname@bank" className={inputCls} />
          </div>
        </div>

        <h2 className="pt-2 font-display text-xl font-semibold">Tax</h2>
        <div className="grid items-end gap-4 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm text-silver sm:col-span-1">
            <input type="checkbox" name="gst" defaultChecked={s["gst.enabled"] === "1"} className="size-4 accent-brand" /> Show GST on invoices
          </label>
          <div>
            <label className={labelCls} htmlFor="gstPct">GST % (included in your prices)</label>
            <input id="gstPct" name="gstPct" inputMode="numeric" defaultValue={s["gst.pct"]} placeholder="e.g. 18" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="gstin">GSTIN</label>
            <input id="gstin" name="gstin" maxLength={20} defaultValue={s["cafe.gstin"]} placeholder="e.g. 27ABCDE1234F1Z5" className={inputCls} />
          </div>
        </div>

        <h2 className="pt-2 font-display text-xl font-semibold">Alerts</h2>
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm text-silver">
            <input type="checkbox" name="alerts" defaultChecked={s["alert.enabled"] === "1"} className="size-4 accent-brand" /> Show alerts: the bell icon, and a pop-up message when a session is about to end or its time is up
          </label>
          <label className="flex items-center gap-2 text-sm text-silver">
            <input type="checkbox" name="alertSound" defaultChecked={s["alert.sound"] === "1"} className="size-4 accent-brand" /> Beep as well: a loud alarm sound when a session is about to end or its time is up
          </label>
          <TestSound />
        </div>

        <h2 className="pt-2 font-display text-xl font-semibold">Floor rules</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="leadMin">Warn when this many minutes are left</label>
            <input id="leadMin" name="leadMin" inputMode="numeric" defaultValue={s["alert.leadMin"]} placeholder="e.g. 10" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="maxDiscount">Most discount staff can give (%)</label>
            <input id="maxDiscount" name="maxDiscount" inputMode="numeric" defaultValue={s["staff.maxDiscountPct"]} placeholder="e.g. 10" className={inputCls} />
          </div>
        </div>
        <button className={`${btnPrimaryCls} self-start`}>Save changes</button>
      </ActionForm>
    </div>
  );
}
