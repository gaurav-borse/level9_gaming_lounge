# Level 9 UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the app to Level 9 only (remove setup choice, logo upload, accent picker, editable name), add light/dark theme with a cookie toggle, and apply a premium visual redesign (Chakra Petch + Geist fonts, SVG progress rings, summary strip, zone chips, hover lift, carbon-fibre login).

**Architecture:** `lib/brand.ts` holds Level 9 constants; `app/globals.css` defines semantic CSS tokens for both themes (light default, dark via media query or `data-theme="dark"` on `<html>`); `app/layout.tsx` reads a `theme` cookie server-side so there is no flash; visual changes are isolated to the components listed below.

**Tech Stack:** Next.js 16.3, Tailwind v4, `node:sqlite`, Better Auth, `next/font/google` (Chakra Petch, Geist, Geist Mono), lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-05-gaming-lounge-management-design.md`

## Global Constraints

- Money stays as integer paise; no floating-point.
- `await connection()` before any DB call in Server Components.
- `npm test`, `npx tsc --noEmit`, `npx eslint`, `npm run build`, `npm run release`, smoke test must all stay green.
- No new npm packages — all fonts are from `next/font/google`.
- Use `rem` not `px` for font sizes; respect `prefers-reduced-motion`.
- Screenshots via headless Chrome: `"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1440,900 --virtual-time-budget=5000 --screenshot=OUT.png URL`

## Review Focus

- **Theme flash on hard reload:** if the cookie is missing and the browser prefers dark, the CSS media query handles it without JS — verify by reading the HTML source (should have no `data-theme`) and confirming the page is dark from the initial paint.
- **Staff tries saveCafeAction with old fields:** the action no longer accepts `cafeName` or `accent` — any extra form fields are silently ignored; the name stays "Level 9 Gaming Lounge" from the setup action. Tested in Task 7 smoke update.
- **Setup run twice:** `hasAnyUser()` guard must still refuse a second setup call. Tested in smoke (line kept from old test).
- **SVG progress ring at 0% and 100%:** `strokeDashoffset = circumference` hides the ring at 0%; at 100% it is fully visible. Verify with `info.playedMs = 0` and `info.playedMs = plannedMinutes * 60000`.
- **Carbon-fibre login in light system theme:** `.texture-carbon` hardcodes `background-color: #0b0d0f`, so the login page is always dark regardless of system preference — by design (logo plate needs a dark backdrop). Add a comment in the CSS.

---

## Task 1: `ui-redesign` branch + `lib/brand.ts` + simplified first-run setup

**Files:**
- Create: `lib/brand.ts`
- Create: `tests/brand.test.ts`
- Modify: `app/setup/SetupForm.tsx`
- Modify: `app/setup/actions.ts`
- Modify: `app/setup/page.tsx`

**Interfaces:**
- Produces: `BRAND` constant (used by Tasks 2–6)

- [ ] **Step 1: Create the branch**

```bash
git checkout -b ui-redesign
```

- [ ] **Step 2: Write the failing test**

Create `tests/brand.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { BRAND } from "../lib/brand.ts";

test("brand name is Level 9 Gaming Lounge", () => {
  assert.equal(BRAND.name, "Level 9 Gaming Lounge");
});

test("brand address contains Lohegaon, Pune 47", () => {
  assert.ok(BRAND.address.includes("Lohegaon, Pune 47"), `got: ${BRAND.address}`);
});

test("brand email is configured address", () => {
  assert.equal(BRAND.email, "workwithashop@gmail.com");
});

test("brand hours start at 11:30", () => {
  assert.ok(BRAND.hours.startsWith("11:30"), `got: ${BRAND.hours}`);
});

test("accent colour is carbon red", () => {
  assert.equal(BRAND.colours.accent, "#d4121c");
});

test("logo paths are under /brand/", () => {
  assert.ok(BRAND.logo.banner.startsWith("/brand/"), `banner: ${BRAND.logo.banner}`);
  assert.ok(BRAND.logo.hero.startsWith("/brand/"), `hero: ${BRAND.logo.hero}`);
});
```

- [ ] **Step 3: Run to verify fail**

```bash
npm test
```

Expected: `ERR_MODULE_NOT_FOUND` — `lib/brand.ts` does not exist yet.

- [ ] **Step 4: Create `lib/brand.ts`**

```typescript
export const BRAND = {
  name:    "Level 9 Gaming Lounge",
  tagline: "Game On",
  address: "Aurum Elemento, opposite the Salt, near Porwal Road, Sathe Wasti, Lohegaon, Pune 47",
  email:   "workwithashop@gmail.com",
  hours:   "11:30 AM – 10:00 PM",
  logo: {
    banner: "/brand/logo-banner.png",
    hero:   "/brand/logo-hero.png",
  },
  colours: {
    accent: "#d4121c",
  },
} as const;
```

- [ ] **Step 5: Run to verify pass**

```bash
npm test
```

Expected: all 6 brand tests pass, other existing tests still pass.

- [ ] **Step 6: Rewrite `app/setup/SetupForm.tsx`**

Remove the "Your lounge" fieldset entirely. Keep only the owner-login fields:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { btnPrimaryCls, inputCls, labelCls } from "@/lib/ui";
import { setupAction } from "./actions";

export function SetupForm() {
  const router = useRouter();
  return (
    <ActionForm
      action={setupAction}
      success="All set. Please sign in."
      onSuccess={() => router.push("/login")}
      className="space-y-6 rounded-2xl border border-line bg-panel p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ownerName" className={labelCls}>Your name</label>
          <input id="ownerName" name="ownerName" required maxLength={60} className={inputCls} />
        </div>
        <div>
          <label htmlFor="username" className={labelCls}>Username</label>
          <input id="username" name="username" required autoCapitalize="none" autoComplete="off" className={inputCls} placeholder="owner" />
        </div>
        <div>
          <label htmlFor="pin" className={labelCls}>PIN (4 to 8 digits)</label>
          <input id="pin" name="pin" type="password" inputMode="numeric" required autoComplete="new-password" className={inputCls} />
        </div>
        <div>
          <label htmlFor="pin2" className={labelCls}>Repeat PIN</label>
          <input id="pin2" name="pin2" type="password" inputMode="numeric" required autoComplete="new-password" className={inputCls} />
        </div>
      </div>
      <p className="text-xs text-mute">
        Forgot the PIN? Put a new one in <code>reset-owner-pin.txt</code> inside the <code>data</code> folder and restart.
      </p>
      <button className={`${btnPrimaryCls} w-full py-3! text-base`}>Create owner account</button>
    </ActionForm>
  );
}
```

- [ ] **Step 7: Rewrite `app/setup/actions.ts`**

Remove `cafeName`, `upiId`, `gst`, `starter`; always seed Level 9 and set settings from `BRAND`:

```typescript
"use server";
import { act } from "@/lib/action";
import { createUser, hasAnyUser } from "@/lib/auth-core";
import { getAuth } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import { str } from "@/lib/validate";
import { seedLevel9Starter } from "@/lib/db/seed";
import { setSettings } from "@/lib/db/settings";
import { BRAND } from "@/lib/brand";

export async function setupAction(fd: FormData) {
  return act(async () => {
    if (hasAnyUser()) throw new UserError("Setup is already done. Please sign in.");
    const name     = str(fd.get("ownerName"), "Your name", { max: 60 });
    const username = str(fd.get("username"), "Username", { max: 20 }).toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(username))
      throw new UserError("Username can use letters, numbers and _ (3 to 20 characters)");
    const pin = String(fd.get("pin") ?? "");
    if (!/^\d{4,8}$/.test(pin)) throw new UserError("PIN must be 4 to 8 digits");
    if (pin !== String(fd.get("pin2") ?? "")) throw new UserError("The two PINs don't match");

    await createUser(getAuth(), { username, pin, name, role: "owner" });
    seedLevel9Starter();
    setSettings({
      "cafe.name":   BRAND.name,
      "cafe.logo":   "builtin:level9",
      "cafe.accent": BRAND.colours.accent,
      "setup.done":  "1",
    });
  });
}
```

- [ ] **Step 8: Update `app/setup/page.tsx`**

Show the Level 9 banner logo and a tighter greeting:

```tsx
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BRAND.logo.banner} alt={BRAND.name} className="mb-6 h-12 w-auto" />
        <h1 className="font-display text-3xl font-bold tracking-wide">Create your owner account</h1>
        <p className="mb-6 mt-1 text-silver">
          Set a PIN to secure access. Zones and rates are seeded automatically.
        </p>
        <SetupForm />
      </div>
    </main>
  );
}
```

- [ ] **Step 9: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add lib/brand.ts tests/brand.test.ts app/setup/SetupForm.tsx app/setup/actions.ts app/setup/page.tsx
git commit -m "feat: add lib/brand.ts, simplify first-run setup to PIN-only, auto-seed Level 9

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Theme system — CSS tokens, fonts, ThemeToggle

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Create: `app/(app)/theme-actions.ts`
- Create: `components/ThemeToggle.tsx`
- Create: `components/ThemeToggleButton.tsx`
- Modify: `app/(app)/layout.tsx`

**Interfaces:**
- Produces: `setThemeAction(theme)` server action; `<ThemeToggle>` server component; `data-theme` attribute on `<html>`; CSS variables `--font-chakra`, `--font-geist`, `--font-geist-mono`; utility class `.texture-carbon`

- [ ] **Step 1: Rewrite `app/globals.css`**

Light tokens are the Tailwind default. Dark tokens override via media query and forced `data-theme`. New font variables replace Rajdhani/Inter.

```css
@import "tailwindcss";

/* Light theme (default). Dark overrides follow.
   --font-* variables come from Next.js font loader on <html>. */
@theme {
  --color-bg:       #f5f2ef;
  --color-panel:    #ede9e4;
  --color-raised:   #e4e0d9;
  --color-line:     #d4cdc4;
  --color-ink:      #1a1c1e;
  --color-silver:   #3d4045;
  --color-mute:     #6b7280;
  --color-brand:    #d4121c;
  --color-brand-hi: color-mix(in srgb, var(--color-brand) 78%, white);
  --color-free:     #1da85a;
  --color-warn:     #d97706;
  --color-paused:   #6b7280;
  --font-display:   var(--font-chakra), ui-sans-serif, system-ui, sans-serif;
  --font-sans:      var(--font-geist), ui-sans-serif, system-ui, sans-serif;
  --font-mono:      var(--font-geist-mono), ui-monospace, "Cascadia Code", monospace;
}

/* Dark via system preference (ignored when data-theme="light" is forced) */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --color-bg:     #0b0d0f;
    --color-panel:  #12161a;
    --color-raised: #1a1f25;
    --color-line:   #262d35;
    --color-ink:    #e8ebef;
    --color-silver: #c9ced6;
    --color-mute:   #8a929c;
    --color-free:   #2fbf71;
    --color-warn:   #f5a524;
    --color-paused: #7b8da6;
    color-scheme: dark;
  }
}

/* Dark forced via cookie (data-theme="dark" on <html>) */
:root[data-theme="dark"] {
  --color-bg:     #0b0d0f;
  --color-panel:  #12161a;
  --color-raised: #1a1f25;
  --color-line:   #262d35;
  --color-ink:    #e8ebef;
  --color-silver: #c9ced6;
  --color-mute:   #8a929c;
  --color-free:   #2fbf71;
  --color-warn:   #f5a524;
  --color-paused: #7b8da6;
  color-scheme: dark;
}

:root {
  color-scheme: light;
}

body {
  background: var(--color-bg);
  color: var(--color-ink);
  font-family: var(--font-sans);
}

/* Force dark palette for elements that are always on a dark background (login page).
   Apply class="force-dark" to the wrapping element. */
.force-dark {
  --color-bg:     #0b0d0f;
  --color-panel:  #12161a;
  --color-raised: #1a1f25;
  --color-line:   #262d35;
  --color-ink:    #e8ebef;
  --color-silver: #c9ced6;
  --color-mute:   #8a929c;
  color-scheme: dark;
}

/* Carbon-fibre texture for login hero — always dark regardless of system theme (by design). */
.texture-carbon {
  background-image:
    repeating-linear-gradient(
      -45deg,
      transparent 0, transparent 3px,
      rgba(255, 255, 255, 0.025) 3px, rgba(255, 255, 255, 0.025) 4px
    ),
    repeating-linear-gradient(
      45deg,
      transparent 0, transparent 3px,
      rgba(255, 255, 255, 0.025) 3px, rgba(255, 255, 255, 0.025) 4px
    );
  background-color: #0b0d0f;
  background-size: 8px 8px;
}

.tnum { font-variant-numeric: tabular-nums; }

@keyframes ring {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-brand) 65%, transparent); }
  50%       { box-shadow: 0 0 0 7px transparent; }
}

.overtime { animation: ring 1.2s ease-in-out infinite; }

@media (prefers-reduced-motion: reduce) {
  .overtime { animation: none; }
}

dialog { color: inherit; }
dialog::backdrop { background: rgb(0 0 0 / 0.65); }

@media print {
  body { background: white; color: black; }
  .no-print { display: none !important; }
}
```

- [ ] **Step 2: Rewrite `app/layout.tsx`**

Switch to Chakra Petch + Geist + Geist Mono. Read `theme` cookie and set `data-theme`. Remove accent injection (colour is hardcoded from `BRAND`).

```typescript
import type { Metadata } from "next";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { Chakra_Petch, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/toast";
import { BRAND } from "@/lib/brand";

const display = Chakra_Petch({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-chakra",
});
const sans = Geist({ subsets: ["latin"], variable: "--font-geist" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: BRAND.name,
  description: "Gaming lounge management",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const theme = (await cookies()).get("theme")?.value as "light" | "dark" | undefined;
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
      {...(theme ? { "data-theme": theme } : {})}
    >
      <body className="min-h-dvh antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Create `app/(app)/theme-actions.ts`**

```typescript
"use server";
import { cookies } from "next/headers";

export async function setThemeAction(theme: "light" | "dark" | undefined) {
  const jar = await cookies();
  if (theme) {
    jar.set("theme", theme, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: true,
      sameSite: "strict",
    });
  } else {
    jar.delete("theme");
  }
}
```

- [ ] **Step 4: Create `components/ThemeToggle.tsx`** (server wrapper — reads cookie, passes to client button)

```tsx
import { cookies } from "next/headers";
import { ThemeToggleButton } from "./ThemeToggleButton";

export async function ThemeToggle() {
  const theme = (await cookies()).get("theme")?.value as "light" | "dark" | undefined;
  return <ThemeToggleButton current={theme} />;
}
```

- [ ] **Step 5: Create `components/ThemeToggleButton.tsx`** (client — calls server action)

```tsx
"use client";
import { startTransition } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { setThemeAction } from "@/app/(app)/theme-actions";

export function ThemeToggleButton({ current }: { current?: "light" | "dark" }) {
  const next =
    current === "light" ? "dark" : current === "dark" ? undefined : "light";
  const Icon =
    current === "light" ? Moon : current === "dark" ? Monitor : Sun;
  const label =
    current === "light"
      ? "Switch to dark theme"
      : current === "dark"
        ? "Follow system theme"
        : "Switch to light theme";

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => startTransition(() => setThemeAction(next))}
      className="grid size-8 place-items-center rounded-lg text-mute transition hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
```

- [ ] **Step 6: Add ThemeToggle to the app header in `app/(app)/layout.tsx`**

Import `ThemeToggle` and add it to the header before `<Clock>`:

```tsx
import { ThemeToggle } from "@/components/ThemeToggle";
// (existing imports unchanged)

// In the JSX, replace:
//   <header className="no-print flex h-14 items-center justify-end border-b border-line px-6">
//     <Clock />
// with:
<header className="no-print flex h-14 items-center justify-end gap-3 border-b border-line px-6">
  <ThemeToggle />
  <Clock />
</header>
```

- [ ] **Step 7: Type-check and build**

```bash
npx tsc --noEmit
npm run build
```

Expected: no errors. If `Geist` or `Geist_Mono` is not exported from `next/font/google` in this version, check `node_modules/next/dist/docs/` for the font API and use the correct import name (may be `GeistSans` / `GeistMono` or require `next/font/local` with the `geist` npm package).

- [ ] **Step 8: Screenshot both themes**

Start dev server: `npm run dev` (port 3000, against an existing data folder or fresh one after smoke).

Light (no cookie / system light):
```
"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1440,900 --virtual-time-budget=3000 --screenshot=C:/Temp/login-light.png http://127.0.0.1:3000/login
```

Read `C:/Temp/login-light.png` to verify warm off-white background visible on login page.

Dark (manually pass `data-theme` via `--force-dark-mode` or by verifying the media query path):
```
"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1440,900 --virtual-time-budget=3000 --force-dark-mode --screenshot=C:/Temp/login-dark.png http://127.0.0.1:3000/login
```

Read `C:/Temp/login-dark.png` to verify dark charcoal background.

- [ ] **Step 9: Commit**

```bash
git add app/globals.css app/layout.tsx "app/(app)/theme-actions.ts" components/ThemeToggle.tsx components/ThemeToggleButton.tsx "app/(app)/layout.tsx"
git commit -m "feat: light/dark theme with cookie toggle, Chakra Petch + Geist fonts

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Brand component + Login page redesign

**Files:**
- Modify: `components/brand.tsx`
- Modify: `app/login/page.tsx`

**Interfaces:**
- Consumes: `BRAND.logo.banner`, `BRAND.logo.hero`, `BRAND.name`, `BRAND.tagline`
- Produces: `<Brand>` with no props (drops `name` and `logo` — callers updated)

- [ ] **Step 1: Rewrite `components/brand.tsx`**

Always shows Level 9 banner logo on a dark plate. Remove `name` and `logo` props.

```tsx
import { BRAND } from "@/lib/brand";

/** Level 9 logo on a dark rounded plate — correct in both light and dark themes. */
export function Brand({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-xl bg-[#0b0d0f] p-2 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={BRAND.logo.banner} alt={BRAND.name} className="h-auto w-full object-contain" />
    </div>
  );
}
```

- [ ] **Step 2: Fix the one caller that passes props**

In `app/(app)/layout.tsx`, change:

```tsx
// BEFORE:
<Brand name={cafe["cafe.name"]} logo={cafe["cafe.logo"]} />

// AFTER:
<Brand />
```

Remove the `cafe["cafe.name"]` and `cafe["cafe.logo"]` references from the Brand call (they are still used elsewhere in the layout, e.g. passed to Board — leave those untouched).

- [ ] **Step 3: Rewrite `app/login/page.tsx`**

Carbon-fibre background, Level 9 hero logo on a dark plate, tagline:

```tsx
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { hasAnyUser } from "@/lib/auth-core";
import { currentUser } from "@/lib/session";
import { BRAND } from "@/lib/brand";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  await connection();
  if (!hasAnyUser()) redirect("/setup");
  if (await currentUser()) redirect("/");
  return (
    <main className="force-dark texture-carbon grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 inline-block rounded-2xl bg-[#0b0d0f] p-5 shadow-2xl ring-1 ring-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BRAND.logo.hero} alt={BRAND.name} className="h-44 w-auto" />
          </div>
          <p className="font-display text-xs font-semibold tracking-[0.25em] uppercase text-silver">
            {BRAND.tagline}
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors (Brand now takes no props, callers updated).

- [ ] **Step 5: Screenshot login in both themes**

The login page uses `.texture-carbon` (always `#0b0d0f` bg) so both screenshots should show a dark carbon texture with the hero logo centered. Verify the logo plate (rounded-2xl, inner glow ring) is visible.

```
"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1440,900 --virtual-time-budget=3000 --screenshot=C:/Temp/login-v2.png http://127.0.0.1:3000/login
```

Read `C:/Temp/login-v2.png` and verify: dark carbon texture background, centered logo plate, "GAME ON" tagline below.

- [ ] **Step 6: Commit**

```bash
git add components/brand.tsx "app/(app)/layout.tsx" app/login/page.tsx
git commit -m "feat: brand component always Level 9 logo; polished login with carbon-fibre hero

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Settings cleanup — remove logo upload, accent picker, editable name

**Files:**
- Modify: `app/(app)/settings/CafeTab.tsx`
- Modify: `app/(app)/settings/actions.ts`
- Delete: `lib/logo.ts`, `tests/logo.test.ts`, `app/api/brand/logo/route.ts`

**Interfaces:**
- Consumes: `BRAND.name`, `BRAND.address`, `BRAND.logo.banner` (for read-only banner)
- Produces: `saveCafeAction` without `cafeName`/`accent`/logo fields

- [ ] **Step 1: Rewrite `app/(app)/settings/CafeTab.tsx`**

Remove logo section, accent picker, editable lounge name. Add a read-only brand info banner at the top.

```tsx
import { ActionForm } from "@/components/action-form";
import { BRAND } from "@/lib/brand";
import { getSettings } from "@/lib/db/settings";
import { btnPrimaryCls, cardCls, inputCls, labelCls } from "@/lib/ui";
import { saveCafeAction } from "./actions";

export function CafeTab() {
  const s = getSettings();
  return (
    <div className="grid max-w-3xl gap-6">
      {/* Read-only brand banner */}
      <div className={`${cardCls} flex items-center gap-4 p-4`}>
        <div className="shrink-0 rounded-xl bg-[#0b0d0f] p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND.logo.banner} alt={BRAND.name} className="h-10 w-auto" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-base font-bold">{BRAND.name}</p>
          <p className="truncate text-xs text-mute">{BRAND.address}</p>
        </div>
      </div>

      <ActionForm action={saveCafeAction} success="Saved" className={`${cardCls} space-y-5 p-6`}>
        <h2 className="font-display text-xl font-semibold">Contact &amp; billing</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="address">Address (shown on invoices)</label>
            <input id="address" name="address" maxLength={200} defaultValue={s["cafe.address"]} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="phone">Phone</label>
            <input id="phone" name="phone" maxLength={30} defaultValue={s["cafe.phone"]} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="upiId">UPI ID (for payment QR codes)</label>
            <input id="upiId" name="upiId" defaultValue={s["cafe.upiId"]} placeholder="yourname@bank" className={inputCls} />
          </div>
        </div>

        <h2 className="pt-2 font-display text-xl font-semibold">Tax</h2>
        <div className="grid items-end gap-4 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm text-silver sm:col-span-1">
            <input type="checkbox" name="gst" defaultChecked={s["gst.enabled"] === "1"} className="size-4 accent-[var(--color-brand)]" />
            Show GST on invoices
          </label>
          <div>
            <label className={labelCls} htmlFor="gstPct">GST % (included in prices)</label>
            <input id="gstPct" name="gstPct" inputMode="numeric" defaultValue={s["gst.pct"]} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="gstin">GSTIN</label>
            <input id="gstin" name="gstin" maxLength={20} defaultValue={s["cafe.gstin"]} className={inputCls} />
          </div>
        </div>

        <h2 className="pt-2 font-display text-xl font-semibold">Floor rules</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="leadMin">Warn when this many minutes are left</label>
            <input id="leadMin" name="leadMin" inputMode="numeric" defaultValue={s["alert.leadMin"]} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="maxDiscount">Most discount staff can give (%)</label>
            <input id="maxDiscount" name="maxDiscount" inputMode="numeric" defaultValue={s["staff.maxDiscountPct"]} className={inputCls} />
          </div>
        </div>
        <button className={btnPrimaryCls}>Save changes</button>
      </ActionForm>
    </div>
  );
}
```

- [ ] **Step 2: Update `app/(app)/settings/actions.ts`**

Remove `uploadLogoAction`, `removeLogoAction`, and the `cafeName`/`accent` fields from `saveCafeAction`. Remove the `saveLogo`/`UPLOAD_NAME` import.

Replace lines 1–62 of `actions.ts` (the imports + first three exports) with:

```typescript
"use server";
import { act } from "@/lib/action";
import { ownerActor } from "@/lib/session";
import { UserError } from "@/lib/errors";
import { bool, hhmm, int, oneOf, rupeesToPaise, str } from "@/lib/validate";
import { isValidUpiId } from "@/lib/engine/upi";
import { createUser, listStaff, removeUser, setPin } from "@/lib/auth-core";
import { getAuth } from "@/lib/auth";
import { audit } from "@/lib/db/index";
import { setSettings } from "@/lib/db/settings";
import {
  ZONE_KINDS, archivePackage, archiveRate, archiveStation, archiveZone,
  createStation, createZone, renameZone, savePackage, saveRate, updateStation,
} from "@/lib/db/catalog";

const field = (fd: FormData, k: string) => fd.get(k);

export async function saveCafeAction(fd: FormData) {
  return act(async () => {
    const me = await ownerActor();
    const upiId = str(field(fd, "upiId"), "UPI ID", { max: 80, required: false });
    if (upiId && !isValidUpiId(upiId))
      throw new UserError("That UPI ID doesn't look right. It should look like name@bank.");
    setSettings({
      "cafe.address": str(field(fd, "address"), "Address", { max: 200, required: false }),
      "cafe.phone":   str(field(fd, "phone"),   "Phone",   { max: 30,  required: false }),
      "cafe.gstin":   str(field(fd, "gstin"),   "GSTIN",   { max: 20,  required: false }),
      "cafe.upiId":   upiId,
      "gst.enabled":  bool(field(fd, "gst")) ? "1" : "0",
      "gst.pct":      String(int(field(fd, "gstPct"),     "GST %",                  { min: 0, max: 28 })),
      "alert.leadMin":        String(int(field(fd, "leadMin"),   "Ending-soon warning",    { min: 1, max: 120 })),
      "staff.maxDiscountPct": String(int(field(fd, "maxDiscount"), "Staff discount limit", { min: 0, max: 100 })),
    });
    audit(me.id, "settings.cafe", "contact, tax or floor settings changed");
  });
}
```

Keep the rest of the file (`createZoneAction`, `saveRateAction`, staff actions, etc.) unchanged.

Also remove the `dataDir` import from `@/lib/db/index` if it is now unused (it was used only in the logo actions). Check the import line and adjust.

- [ ] **Step 3: Delete removed files**

```bash
node -e "const fs=require('fs'); ['lib/logo.ts','tests/logo.test.ts','app/api/brand/logo/route.ts'].forEach(p=>fs.rmSync(p,{force:true}))"
```

- [ ] **Step 4: Verify nothing else imports from the deleted files**

```bash
npx tsc --noEmit
```

If `dataDir` is still needed in `actions.ts` for other reasons, keep the import. If not, remove it. Fix any remaining errors.

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: `tests/logo.test.ts` no longer runs; all other tests still pass.

- [ ] **Step 6: Screenshot settings > Lounge tab**

Run the app against a populated data folder. Navigate to `/settings`. Verify: no logo upload section, no accent picker, no editable lounge name field; brand banner shown at top; UPI ID, address, phone, tax, floor-rules fields present.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/settings/CafeTab.tsx" "app/(app)/settings/actions.ts"
git commit -m "feat: settings cleanup — remove logo upload, accent picker, editable name

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Floor — summary strip + zone filter chips

**Files:**
- Modify: `components/floor/Board.tsx`

**Interfaces:**
- Consumes: `liveInfo`, `rupees`, `ZONE_ICON`, existing props unchanged
- Produces: `zoneFilter` client state; `StatTile` local component; summary strip above zone sections

- [ ] **Step 1: Add summary strip and zone filter chips to `components/floor/Board.tsx`**

After the existing imports, add a local `StatTile` component and update the Board JSX. Key changes:

1. Add `zoneFilter` state after the existing `useState` declarations:
```tsx
const [zoneFilter, setZoneFilter] = useState<number | null>(null);
```

2. Derive new counts before the `if (zones.length === 0)` guard:
```tsx
const ending = all.filter((s) => {
  if (!s.session || !now) return false;
  const { status } = liveInfo(s.session, leadMin, now);
  return status === "ending" || status === "overtime";
});
const free = all.filter((s) => !s.session && !s.maintenance);
const visibleZones = zoneFilter === null ? zones : zones.filter((z) => z.id === zoneFilter);
```

3. Replace the current header `<div>` (the one with `<h1>Floor</h1>` and the stats line) with:
```tsx
<div className="space-y-4">
  <div className="flex flex-wrap items-end justify-between gap-3">
    <h1 className="font-display text-3xl font-bold tracking-wide">Floor</h1>
  </div>

  {/* Summary strip */}
  <div className="flex flex-wrap gap-3">
    <StatTile label="In use"       value={`${busy.length}/${all.length}`}  colorCls="text-brand" />
    <StatTile label="Free"         value={String(free.length)}             colorCls={free.length > 0 ? "text-free" : "text-mute"} />
    <StatTile label="Ending soon"  value={String(ending.length)}           colorCls={ending.length > 0 ? "text-warn" : "text-mute"} />
    <StatTile label="On the clock" value={rupees(running)}                 colorCls="font-mono text-ink" />
  </div>

  {/* Zone filter chips — only shown when there are at least 2 zones */}
  {zones.length > 1 && (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by zone">
      <button
        onClick={() => setZoneFilter(null)}
        className={`rounded-full px-3 py-1 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand ${zoneFilter === null ? "bg-brand text-white" : "bg-raised text-silver hover:text-ink"}`}
      >
        All
      </button>
      {zones.map((z) => {
        const Icon = ZONE_ICON[z.kind] ?? ZONE_ICON.custom;
        return (
          <button
            key={z.id}
            onClick={() => setZoneFilter(zoneFilter === z.id ? null : z.id)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand ${zoneFilter === z.id ? "bg-brand text-white" : "bg-raised text-silver hover:text-ink"}`}
          >
            <Icon className="size-3.5" aria-hidden />
            {z.name}
          </button>
        );
      })}
    </div>
  )}
</div>
```

4. Replace `zones.map(...)` with `visibleZones.map(...)` in the zone section rendering.

5. Add `StatTile` as a module-level function at the top of the file (after imports):
```tsx
function StatTile({ label, value, colorCls }: { label: string; value: string; colorCls: string }) {
  return (
    <div className="flex min-w-[7rem] flex-col rounded-xl border border-line bg-panel px-4 py-2">
      <span className={`tnum text-2xl font-bold leading-tight ${colorCls}`}>{value}</span>
      <span className="mt-0.5 text-xs text-mute">{label}</span>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Screenshot floor**

Navigate to `/` (floor page, logged in). Verify the summary strip and zone chips are visible above the station cards.

- [ ] **Step 4: Commit**

```bash
git add components/floor/Board.tsx
git commit -m "feat: floor summary strip and zone filter chips

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Station card redesign

**Files:**
- Modify: `components/floor/StationCard.tsx`

**Interfaces:**
- Consumes: `liveInfo`, `hms`, `rupees`, `STATUS`, `BoardStation` — all unchanged
- Produces: SVG progress ring, Geist Mono timer (`font-mono`), initials avatar, hover lift

- [ ] **Step 1: Add `initials` helper and rewrite `StationCard`**

Replace the entire file with:

```tsx
"use client";
import { Plus } from "lucide-react";
import type { BoardStation } from "@/lib/db/sessions";
import { liveInfo } from "@/lib/live";
import { hms, rupees } from "@/lib/format";
import { STATUS, type StatusKey } from "./status";

function initials(name: string | null): string {
  if (!name) return "W";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

const RING_R = 28;
const RING_C = 2 * Math.PI * RING_R; // ≈ 175.9

export function StationCard({ station, now, leadMin, onOpen, onStart }: {
  station: BoardStation;
  now: number;
  leadMin: number;
  onOpen: () => void;
  onStart: () => void;
}) {
  const s = station.session;
  const info = s && now ? liveInfo(s, leadMin, now) : null;
  const key: StatusKey = station.maintenance ? "maintenance" : !s ? "free" : (info?.status ?? "running");
  const st = STATUS[key];
  const Icon = st.icon;

  const countdown = info && info.remainingMs !== null && !info.stopped;
  const big = !info
    ? "-:--:--"
    : countdown
      ? (info.remainingMs! < 0 ? `+${hms(-info.remainingMs!)}` : hms(info.remainingMs!))
      : hms(info.playedMs);

  // Progress ring: only for fixed/prepaid sessions with a planned duration
  const progress =
    s && s.mode !== "open" && s.plannedMinutes && info
      ? Math.max(0, Math.min(1, info.playedMs / 1000 / 60 / s.plannedMinutes))
      : null;

  const timerColor =
    key === "overtime" ? "text-brand-hi" : key === "ending" ? "text-warn" : "text-ink";
  const ringColor =
    key === "overtime" ? "text-brand" : key === "ending" ? "text-warn" : "text-free";

  return (
    <button
      type="button"
      disabled={station.maintenance}
      onClick={s ? onOpen : onStart}
      className={`group flex min-h-40 flex-col rounded-xl border bg-panel p-4 text-left transition-all duration-150 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${st.card}`}
    >
      {/* Header row: station name + status chip */}
      <div className="flex items-start justify-between gap-2">
        <span className="font-display text-xl font-bold leading-tight tracking-wide">{station.name}</span>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${st.chip}`}>
          <Icon className="size-3.5" aria-hidden />
          {st.label}
        </span>
      </div>

      {s ? (
        <>
          {/* Timer + optional SVG progress ring */}
          <div className="relative mt-3">
            {progress !== null && (
              <svg
                width="64" height="64"
                className={`absolute -left-1 -top-1 -rotate-90 opacity-40 ${ringColor}`}
                aria-hidden
              >
                <circle cx="32" cy="32" r={RING_R} fill="none" stroke="currentColor" strokeWidth="4" className="opacity-20" />
                <circle
                  cx="32" cy="32" r={RING_R} fill="none" stroke="currentColor" strokeWidth="4"
                  strokeDasharray={RING_C}
                  strokeDashoffset={RING_C * (1 - progress)}
                  strokeLinecap="round"
                  className="transition-all duration-1000"
                />
              </svg>
            )}
            <div className={`tnum font-mono text-4xl font-bold leading-none ${timerColor}`}>{big}</div>
            <div className="mt-1 text-xs text-mute">
              {countdown
                ? (info!.remainingMs! < 0 ? "over time" : "time left")
                : info?.stopped ? "played" : "elapsed"}
              {s.plannedMinutes ? ` · ${s.plannedMinutes} min` : ""}
            </div>
          </div>

          {/* Footer: customer avatar + name + running charge */}
          <div className="mt-auto flex items-end justify-between pt-3 text-sm">
            <span className="flex min-w-0 items-center gap-1.5 text-silver">
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-raised text-[0.6rem] font-bold text-silver"
                aria-hidden
              >
                {initials(s.customerName)}
              </span>
              <span className="truncate">{s.customerName ?? "Walk-in"}</span>
            </span>
            <span className="tnum font-mono font-semibold">{info ? rupees(info.totalPaise) : ""}</span>
          </div>
        </>
      ) : (
        <div className="mt-auto flex items-center gap-2 pt-6 text-sm text-mute transition group-hover:text-ink">
          {station.maintenance ? (
            "Out of service"
          ) : (
            <>
              <span className="grid size-8 place-items-center rounded-full border border-line group-hover:border-brand group-hover:bg-brand/10">
                <Plus className="size-4" aria-hidden />
              </span>
              Start session
            </>
          )}
        </div>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. (`s.mode` and `s.plannedMinutes` must be present on `BoardStation.session` — check `lib/db/sessions.ts` if the type errors out; `mode` comes from the `sessions` table, `plannedMinutes` from `planned_minutes`.)

- [ ] **Step 3: Screenshot floor with an active fixed session**

If no session is running, start one manually or run the smoke helper. Then screenshot the floor page and verify: progress ring visible on fixed sessions, mono timer font, initials circle instead of user icon, card lifts on hover (check animation by reading a hover-state screenshot or visually testing in the browser).

- [ ] **Step 4: Commit**

```bash
git add components/floor/StationCard.tsx
git commit -m "feat: station card — SVG progress ring, mono timer, initials avatar, hover lift

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Smoke test update + full verification

**Files:**
- Modify: `scripts/smoke.mjs`

**Interfaces:**
- Consumes: updated `setupAction` (no cafeName/starter), updated `saveCafeAction` (no cafeName/accent), no `uploadLogoAction`

- [ ] **Step 1: Update the setup step in `scripts/smoke.mjs`**

Line ~76 — remove `cafeName`, `upiId`, `gst`, `starter`:

```js
// BEFORE:
await form("setupAction", { cafeName: "Level 9 Gaming Lounge", upiId: "level9@okhdfc", gst: "on", ownerName: "Gabor", username: "owner", pin: "4821", pin2: "4821", starter: "level9" });

// AFTER:
await form("setupAction", { ownerName: "Gabor", username: "owner", pin: "4821", pin2: "4821" });
```

Line ~81 — remove `cafeName` and `starter` from the duplicate-setup attempt:

```js
// BEFORE:
const again = await form("setupAction", { cafeName: "Hijack", ownerName: "x", username: "evil", pin: "1111", pin2: "1111", starter: "empty" });

// AFTER:
const again = await form("setupAction", { ownerName: "x", username: "evil", pin: "1111", pin2: "1111" });
```

The assertion on line ~83 still holds (`cafe.name` = "Level 9 Gaming Lounge" set by the new `setupAction` from `BRAND.name`).

- [ ] **Step 2: Update the staff-settings step**

Line ~185 — remove `cafeName` and `accent` from the staff attempt:

```js
// BEFORE:
await form("saveCafeAction", { cafeName: "Hijacked", accent: "#112233", gstPct: "18", leadMin: "10", maxDiscount: "10" }, staff);

// AFTER:
await form("saveCafeAction", { gstPct: "18", leadMin: "10", maxDiscount: "10" }, staff);
```

The assertion on line ~186 (`cafe.name` = "Level 9 Gaming Lounge") is trivially true and stays.

- [ ] **Step 3: Rewrite the "owner changes settings" step (was "uploads a logo")**

Replace the entire step (lines ~201–224) with:

```js
await step("owner changes settings, bad UPI ID is refused", async () => {
  await form("saveCafeAction", { address: "Lohegaon, Pune", gst: "on", gstPct: "18", leadMin: "5", maxDiscount: "10", upiId: "level9@okhdfc" }, owner);
  assert.equal(q("SELECT value FROM settings WHERE key='cafe.address'")[0].value, "Lohegaon, Pune");
  // A bad UPI ID must reject the entire save (address must stay unchanged)
  await form("saveCafeAction", { address: "Changed", gst: "on", gstPct: "18", leadMin: "5", maxDiscount: "10", upiId: "not-valid" }, owner);
  assert.equal(q("SELECT value FROM settings WHERE key='cafe.address'")[0].value, "Lohegaon, Pune", "bad UPI must reject the whole save");
});
```

- [ ] **Step 4: Update the audit log step**

Remove `"logo.upload"` from the expected actions set (lines ~251–253):

```js
// BEFORE:
for (const a of ["settings.cafe", "logo.upload", "rate.save", "package.save", "station.create", "staff.create", "staff.pin_reset", "session.stop"]) {

// AFTER:
for (const a of ["settings.cafe", "rate.save", "package.save", "station.create", "staff.create", "staff.pin_reset", "session.stop"]) {
```

- [ ] **Step 5: Run unit tests**

```bash
npm test
```

Expected: all pass (logo tests gone, brand tests pass, others unchanged).

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Lint**

```bash
npx eslint
```

Fix any warnings on changed files.

- [ ] **Step 8: Production build**

```bash
npm run build
```

Expected: no errors, `data/` folder not created by the build.

- [ ] **Step 9: Build release and run smoke**

Stop any running server first (run `release/stop.bat` if needed):

```bash
npm run release
```

Then in the release folder, clear data and start the server:

```powershell
node -e "const fs=require('fs'); const p='release/data'; if(fs.existsSync(p)) fs.rmSync(p,{recursive:true,force:true})"
$env:PORT=3100; $env:LOUNGE_NO_BROWSER=1; Start-Process -FilePath "release\start.bat" -NoNewWindow
Start-Sleep -Seconds 5
$env:BASE="http://127.0.0.1:3100"; $env:DATA=(Resolve-Path "release/data"); npm run smoke
```

Expected: all steps pass. Clean up after:

```bash
node -e "const fs=require('fs'); fs.rmSync('release/data',{recursive:true,force:true})"
```

- [ ] **Step 10: Final commit**

```bash
git add scripts/smoke.mjs
git commit -m "fix: update smoke test for simplified setup and removed logo upload

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

*End of plan. Execute with `superpowers:executing-plans` or natively, task by task.*
