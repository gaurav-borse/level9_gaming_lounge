import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Clock, Gamepad2, MapPin } from "lucide-react";
import { hasAnyUser } from "@/lib/auth-core";
import { currentUser } from "@/lib/session";
import { BRAND } from "@/lib/brand";
import { getSettings } from "@/lib/db/settings";
import { loginImageSrc } from "@/lib/logo";
import { LoginForm } from "./LoginForm";

const CHIP = "inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-xs font-medium text-white";

export default async function LoginPage() {
  await connection();
  if (!hasAnyUser()) redirect("/setup");
  if (await currentUser()) redirect("/");
  const s = getSettings();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const facts = [
    { icon: Clock, text: s["cafe.hours"] },
    { icon: MapPin, text: s["cafe.address"] },
  ].filter((f) => f.text);

  // Same frame as the signed-in app: a rounded shell on the canvas, with a feature card and a panel inside it.
  // The gap around the shell is padding, not margin: a margin would add to the page height and make it scroll.
  return (
    <div className="grid min-h-dvh p-2 sm:p-3">
      <main className="mx-auto grid w-full max-w-[110rem] gap-3 rounded-4xl bg-bg p-3 sm:gap-4 sm:p-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:grid-rows-1">
        <section className="hero-bg relative isolate flex flex-col gap-6 overflow-hidden rounded-4xl p-6 sm:p-8 lg:justify-between lg:p-10">
          <Gamepad2 aria-hidden className="pointer-events-none absolute -right-8 -top-6 -z-10 size-72 rotate-12 text-white/10 sm:size-96" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={loginImageSrc(s["cafe.loginImage"])} alt={s["cafe.name"]} className="h-28 w-fit rounded-2xl bg-plate object-contain ring-1 ring-white/10 sm:h-36" />
          <div>
            {s["cafe.loginImage"] === "" && <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-white/70">{BRAND.tagline}</p>}
            <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">{greeting}</h1>
            <p className="mt-2 max-w-md text-base text-white/75">Sign in to run the floor, take payments and keep an eye on every station.</p>
          </div>
          {facts.length > 0 && (
            <ul className="hidden flex-wrap gap-2 lg:flex">
              {facts.map(({ icon: Icon, text }) => (
                <li key={text} className={CHIP}><Icon className="size-3.5 shrink-0" aria-hidden /> {text}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex items-center justify-center rounded-4xl border border-line bg-panel p-6 sm:p-10">
          <div className="w-full max-w-sm">
            <h2 className="font-display text-3xl font-semibold">Sign in</h2>
            <p className="mb-6 mt-1 text-sm text-mute">Use your username and PIN.</p>
            <LoginForm />
            <p className="mt-6 text-center text-xs text-mute">Forgot your PIN? Ask the owner to reset it in Settings.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
