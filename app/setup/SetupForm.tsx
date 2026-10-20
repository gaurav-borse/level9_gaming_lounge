"use client";
import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { btnPrimaryCls, inputCls, labelCls } from "@/lib/ui";
import { setupAction } from "./actions";

export function SetupForm() {
  const router = useRouter();
  return (
    <ActionForm action={setupAction} success="All set. Please sign in." onSuccess={() => router.push("/login")} className="flex flex-col gap-6 rounded-2xl border border-line bg-panel p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ownerName" className={labelCls}>Your name</label>
          <input id="ownerName" name="ownerName" required maxLength={60} placeholder="e.g. Gabor Sharma" className={inputCls} />
        </div>
        <div>
          <label htmlFor="username" className={labelCls}>Username</label>
          <input id="username" name="username" required autoCapitalize="none" autoComplete="off" className={inputCls} placeholder="owner" />
        </div>
        <div>
          <label htmlFor="pin" className={labelCls}>PIN (4 to 8 digits)</label>
          <input id="pin" name="pin" type="password" inputMode="numeric" required autoComplete="new-password" placeholder="4 to 8 digits" className={inputCls} />
        </div>
        <div>
          <label htmlFor="pin2" className={labelCls}>Repeat PIN</label>
          <input id="pin2" name="pin2" type="password" inputMode="numeric" required autoComplete="new-password" placeholder="Type the same PIN again" className={inputCls} />
        </div>
      </div>
      <p className="text-xs text-mute">Forgot the PIN later? Put a new one in a file called <code>reset-owner-pin.txt</code> inside the <code>data</code> folder and restart the app.</p>
      <button className={`${btnPrimaryCls} w-full py-3! text-base`}>Create owner account</button>
    </ActionForm>
  );
}
