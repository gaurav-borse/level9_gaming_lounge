import { redirect } from "next/navigation";
import { connection } from "next/server";
import { hasAnyUser } from "@/lib/auth-core";
import { BRAND } from "@/lib/brand";
import { SetupForm } from "./SetupForm";

export default async function SetupPage() {
  await connection();
  if (hasAnyUser()) redirect("/login");
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-xl">
        <div className="mb-6 inline-block rounded-xl bg-plate p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND.logo.banner} alt={BRAND.name} className="h-12 w-auto" />
        </div>
        <h1 className="font-display text-3xl font-bold tracking-wide">Create your owner account</h1>
        <p className="mb-6 mt-1 text-silver">Set a PIN to secure the app. Zones and rates are added automatically and you can change them later in Settings.</p>
        <SetupForm />
      </div>
    </main>
  );
}
