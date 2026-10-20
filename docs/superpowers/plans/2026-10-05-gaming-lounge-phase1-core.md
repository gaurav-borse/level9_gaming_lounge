# Gaming Lounge Manager, Plan 1: Core (setup, floor, billing, launcher) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A lounge owner double-clicks `start.bat`, sets up the lounge, signs in with a PIN, runs the floor (start, pause, extend, transfer and stop sessions with live timers and alerts), takes payment with a UPI QR, and keeps digital invoices, all offline on one laptop.

**Architecture:** One Next.js 16 app bound to `127.0.0.1`, mutations as server actions. Plain-SQL repositories over `node:sqlite` in `lib/db`, a pure pricing engine in `lib/engine`, Better Auth for username + PIN login. A standalone build plus a bundled `node.exe` and batch launchers make the double-click release folder.

**Tech Stack:** Node 24 LTS (v24.16.0 when planned), Next.js 16.3.x, React 19.2, Tailwind CSS v4, TypeScript 5, `node:sqlite`, Better Auth 1.7.x (username plugin), `qrcode`, `lucide-react`, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-05-gaming-lounge-management-design.md` (read it first; this plan implements the "Plan 1" slice of its section 13).

**Prototype status, read before starting.** Every file in this plan was written and run in a throwaway prototype before the plan was written. Type-check, lint, all 67 unit tests, the production build, a 14-step HTTP smoke test against the standalone server, and the same smoke test against the packaged `release` folder (including `start.bat`, `stop.bat` and a restart that kept the data) all passed. Copy the code exactly. What was **not** verified: how the screens look and feel in a browser. Browser automation is blocked on this laptop by company policy, so Task 13 ends with the owner opening the app and looking.

## Global Constraints

- Node 24 LTS. `node:sqlite` is a Release Candidate there (no warnings printed). Tests run on Node's native TypeScript type-stripping: use erasable syntax only (no `enum`, `namespace`, parameter properties).
- Inside `lib/`, relative imports carry an explicit `.ts` extension (Node's test runner cannot resolve the `@/` alias). Files in `app/` and `components/` import with `@/...` and no extension. `tsconfig.json` sets `allowImportingTsExtensions`.
- All money is integer paise. Rupees exist only at the screen and validation edge (`rupeesToPaise`, `rupees()`).
- The server binds `127.0.0.1` and `proxy.ts` refuses any other Host header.
- Nothing secret is committed: `data/` and `release/` are gitignored; the auth secret is generated into `data/auth-secret`.
- Colours come from CSS variables in `app/globals.css`; `--color-brand` is overridden per cafe from settings. Level 9 palette: charcoal `#0b0d0f`, silver `#c9ced6`, carbon red `#d4121c`.
- Do not add dependencies beyond those named in Task 1. Before adding any, check it is maintained and `npm audit --omit=dev` stays at 0 (it is 0 today).
- `npm audit` also reports 5 high advisories in the lint tooling chain (`eslint-config-next` → `braces`). That chain is dev-only and never ships. Do **not** run `npm audit fix --force` (it downgrades `eslint-config-next` to v14).
- `next dev` and `create-next-app` write `AGENTS.md` and `CLAUDE.md`. Commit them as generated.
- Every commit message ends with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Commands are written for Git Bash on Windows (the Bash tool). The project root is `C:/Users/gaborse/Downloads/Projects/Gaming Lounge Management App` (contains spaces: always quote it).

## Review Focus

The spec says what the software must do; these are the inputs it implies but no feature test names, most likely to bite first. Each is pinned by a test in the task that owns the code.

1. **Double-click on Start, Stop or Mark paid.** Expect exactly one session, one stop, one bill, one invoice number. Pinned in Task 4 (`a station can't run two unbilled sessions`, `pause and resume ... both are idempotent`) and Task 5 (`billing twice is refused and leaves exactly one bill`).
2. **Staff calling owner-only operations directly** (void a bill, big discount, settings, creating staff, anyone signed out). Expect a clear refusal and no change. Pinned in Task 5 (`void: owner only`, `discount ... staff are capped`), Task 6 (browser sign-in/sign-up refused) and the smoke test (Task 13: `staff: ...cannot reach owner-only things`, `signed-out callers can't run actions`).
3. **Hostile or malformed form input**: HTML in names, blank, huge, negative, fractional or `NaN` amounts and quantities, a UPI shop name containing `&` or `#`, a "logo" that is really a script. Expect a short message, nothing stored, nothing executed. Pinned in Task 3 (`validate.test.ts`), Task 2 (`upiLink ... encodes hostile names`), Task 7 (`logo.test.ts`) and the smoke test (`invoice renders escaped`).
4. **A station with no rate, rate edits during a session, the clock moving backwards.** Expect a plain "No rate is set for PS5 Zone" refusal, running sessions keep the rate they started with, and no negative time or amounts. Pinned in Task 4 (`no rate at that time refuses to start`, `start freezes the rate snapshot`) and Task 2 (`billableMs never goes negative`).
5. **The laptop is switched off or the app is closed mid-session.** Expect every running session to come back with the right elapsed time, and data intact after `stop.bat` and `start.bat`. Pinned in Task 4 (`a running session survives closing and reopening the database file`) and Task 13 (restart check on the release folder).

## Spec coverage and deliberate gaps

Plan 1 covers these spec features: **A1** (wizard asks name, UPI ID, GST switch, starter; address, phone, GSTIN and logo upload are in Settings; **opening hours are not included**, nothing in Plan 1 uses them), **A2**, **A3**, **A4** (including time packages), **B1 to B7**, **C1 to C6** (C5 is an on-screen invoice plus Save as PDF through the browser print dialog), **D1** (the minimal customer record created from the Start dialog: name, phone, WhatsApp consent), **I1**, **I2** (the audit log is written from day one; the viewer comes in Plan 3), **J2**, **J3**, **J4**.

Not in Plan 1, by design (Plans 2 and 3, spec section 13): customer pages and WhatsApp messages (D6, K1 to K7), menu, stock and counter sale (E1 to E3; Plan 1 has a free-text "Food and extras" line on each tab), reports, heatmap and expenses (G1 to G4), **backup and restore (J1)**. P2 items B8, F1, G5, H1 and H2 stay in Phase 2.

**Until Plan 3 ships there is no automatic backup.** The owner's only protection is copying the `data` folder (the release README says so). Say this plainly in the Task 14 hand-off.

## File structure

```
app/layout.tsx, globals.css            root layout, fonts, theme tokens (Task 8)
app/login, app/setup                   login and first-run wizard (Task 9)
app/(app)/layout.tsx, page.tsx         signed-in shell and the floor (Task 10)
app/(app)/actions.ts                   floor + billing server actions (Task 10)
app/(app)/bills                        bill list and invoice (Task 11)
app/(app)/settings                     lounge, zones, rates, staff (Task 12)
app/api/{auth,health,brand/logo}       route handlers (Task 7)
components/floor/*                     board, cards, start dialog, drawer, bill panel (Task 10)
components/*.tsx                       toast, modal, action form, nav, brand, clock (Task 8)
lib/engine/*                           pure pricing, rates, bill totals, UPI link (Task 2)
lib/db/*                               SQLite connection, migrations, repositories (Tasks 4, 5)
lib/auth-core.ts, lockout.ts           Better Auth wrapper and PIN lockout (Task 6)
lib/{auth,boot,session,action}.ts      server wiring (Task 7)
proxy.ts, instrumentation.ts           host guard + login gate, startup boot (Task 7)
scripts/smoke.mjs, build-release.mjs   HTTP smoke test, release builder (Task 13)
release-files/*                        start.bat, stop.bat, autostart, README (Task 13)
tests/*.test.ts                        node:test suites (Tasks 2 to 7)
```

---

### Task 1: Scaffold the project

**Files:**
- Create (by scaffold): `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `app/`, `public/`, `AGENTS.md`, `CLAUDE.md`
- Modify: `.gitignore`
- Create: `public/brand/logo-banner.png`, `public/brand/logo-hero.png`

**Interfaces:**
- Produces: a project root that builds; `npm test`, `npm run lint`, `npm run build`, `npm run smoke`, `npm run release` scripts; Level 9 logo files served from `/brand/...`.

- [ ] **Step 1: Scaffold in a temp folder**

`create-next-app` refuses the project folder's name (spaces and capitals), so scaffold elsewhere and copy in. Use any empty temp folder outside the project:

```bash
mkdir -p "$TMPDIR/scaffold" && cd "$TMPDIR/scaffold"
npx create-next-app@latest gaming-lounge --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --turbopack --skip-install --yes
```

Expected: "Success! Created gaming-lounge".

- [ ] **Step 2: Copy it into the project root (without node_modules and .git)**

```bash
cd "$TMPDIR/scaffold/gaming-lounge"
tar --exclude=node_modules --exclude=.git -cf - . | (cd "C:/Users/gaborse/Downloads/Projects/Gaming Lounge Management App" && tar -xf -)
cd "C:/Users/gaborse/Downloads/Projects/Gaming Lounge Management App" && ls
```

Expected: `app  AGENTS.md  CLAUDE.md  docs  eslint.config.mjs  next.config.ts  package.json  public  tsconfig.json ...`

- [ ] **Step 3: Install dependencies**

```bash
npm install
npm install better-auth qrcode lucide-react
npm install -D @types/qrcode "@types/node@^24"
npm audit --omit=dev
```

Expected: `found 0 vulnerabilities`. Versions seen when this plan was written: next 16.3.8, react 19.2.8, better-auth 1.7.7, qrcode 1.5.4, lucide-react 1.52.0.

- [ ] **Step 4: Baseline build of the untouched scaffold**

Run: `npm run build`
Expected: "Compiled successfully" (this proves the toolchain works before we change anything).

- [ ] **Step 5: Set the package name, module type and scripts**

Edit `package.json`: set `"name": "gaming-lounge-manager"`, add `"type": "module"` next to `"private": true`, and replace the `scripts` block with:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "node --test \"tests/**/*.test.ts\"",
  "smoke": "node scripts/smoke.mjs",
  "release": "node scripts/build-release.mjs"
}
```

- [ ] **Step 6: Replace the config files**

**`tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "allowImportingTsExtensions": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules", "release"]
}
```

**`next.config.ts`**

```typescript
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone", // the release folder runs .next/standalone/server.js
  outputFileTracingRoot: process.cwd(),
  outputFileTracingExcludes: { "*": ["data/**", "release/**", "scripts/**", "tests/**"] }, // never ship local data into a release
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "3mb" } }, // logo upload
};

export default config;
```

**`eslint.config.mjs`**

```javascript
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Ours: build output and local data are never linted.
    "release/**",
    "data/**",
  ]),
]);

export default eslintConfig;
```

Append to `.gitignore`:

```
# lounge data and release output (never commit)
/data/
/release/
```

- [ ] **Step 7: Remove scaffold files we do not use**

```bash
rm public/file.svg public/globe.svg public/next.svg public/vercel.svg public/window.svg app/page.tsx README.md
```

(`app/layout.tsx` and `app/globals.css` are replaced in Task 8. The build stays broken until Task 10 adds the floor page; do not run `npm run build` between here and Task 9.)

- [ ] **Step 8: Add the Level 9 logo files**

The owner attached these in the first conversation. Copy: image 3 (banner) and image 5 (silver logo on charcoal).

```bash
mkdir -p public/brand
IMG="C:/Users/gaborse/AppData/Local/Temp/claude/c--Users-gaborse-Downloads-Projects-Gaming-Lounge-Management-App/3326b1e2-dea9-4534-9ad0-021b8a058c68/images"
cp "$IMG/3.png" public/brand/logo-banner.png
cp "$IMG/5.png" public/brand/logo-hero.png
file public/brand/*
```

Expected: `logo-banner.png: PNG image data, 1170 x 642` and `logo-hero.png: PNG image data, 1170 x 939`. If those paths no longer exist, ask the owner to re-send the logo and banner.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Scaffold Next.js 16 project with Tailwind v4, Better Auth, QR and icons" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Pricing engine (pure code)

**Files:**
- Create: `lib/engine/pricing.ts`, `lib/engine/rates.ts`, `lib/engine/bill.ts`, `lib/engine/upi.ts`
- Test: `tests/engine.test.ts`

**Interfaces:**
- Produces (all pure, no I/O):
  - `pricing.ts`: types `RateSnapshot {rateId,name,hourlyPaise,extraControllerPaise,incrementMin,minMinutes,graceMin,packagePaise:number|null}`, `SessionTimes {startedAt,endedAt,pausedAt,pausedTotalMs}`, `SessionStatus = "running"|"paused"|"ending"|"overtime"`; `billableMs(t, now): number`; `chargedMinutes(ms, rate): number`; `sessionChargePaise(ms, rate, players, plannedMinutes?): number`; `remainingMs(plannedMinutes, playedMs): number|null`; `sessionStatus(t, plannedMinutes, leadMin, now): SessionStatus`; `prepaidMinutes(advancePaise, hourlyPaise): number`.
  - `rates.ts`: type `RateRow`; `pickRate(rates, zoneId, at: Date): RateRow | null`.
  - `bill.ts`: `PAYMENT_METHODS`, types `PaymentMethod`, `PaymentInput {method, amountPaise}`, `BillLineInput {kind,name,qty,unitPaise,taxPct}`, `Discount`, `BillTotals`; `computeBill(lines, discount)`, `splitEven(totalPaise, people)`, `validatePayments(totalPaise, payments): string | null`.
  - `upi.ts`: `isValidUpiId(id)`, `upiLink({upiId,name,amountPaise,note}): string` (throws on bad input).

- [ ] **Step 1: Write the failing test**

**`tests/engine.test.ts`**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { billableMs, chargedMinutes, sessionChargePaise, sessionStatus, prepaidMinutes } from "../lib/engine/pricing.ts";
import type { RateSnapshot, SessionTimes } from "../lib/engine/pricing.ts";
import { pickRate } from "../lib/engine/rates.ts";
import type { RateRow } from "../lib/engine/rates.ts";
import { computeBill, splitEven, validatePayments } from "../lib/engine/bill.ts";
import { upiLink } from "../lib/engine/upi.ts";

const MIN = 60000;
const rate: RateSnapshot = {
  rateId: 1, name: "PS5", hourlyPaise: 15000, extraControllerPaise: 0,
  incrementMin: 1, minMinutes: 15, graceMin: 0, packagePaise: null,
};
const t0 = 1_700_000_000_000;
const times = (over: Partial<SessionTimes> = {}): SessionTimes => ({
  startedAt: t0, endedAt: null, pausedAt: null, pausedTotalMs: 0, ...over,
});

test("billableMs subtracts closed and open pauses", () => {
  assert.equal(billableMs(times({ pausedTotalMs: 10 * MIN }), t0 + 60 * MIN), 50 * MIN);
  assert.equal(billableMs(times({ pausedAt: t0 + 30 * MIN }), t0 + 60 * MIN), 30 * MIN);
  assert.equal(billableMs(times({ endedAt: t0 + 20 * MIN }), t0 + 999 * MIN), 20 * MIN);
});

test("billableMs never goes negative (clock moved back)", () => {
  assert.equal(billableMs(times({ pausedTotalMs: 99 * MIN }), t0 + MIN), 0);
  assert.equal(billableMs(times(), t0 - 5 * MIN), 0);
});

test("minimum charge applies to short sessions", () => {
  assert.equal(chargedMinutes(2 * MIN, rate), 15);
});

test("one second over a minute rounds up", () => {
  assert.equal(chargedMinutes(20 * MIN + 1, rate), 21);
  assert.equal(chargedMinutes(20 * MIN, rate), 20);
});

test("increment rounding", () => {
  assert.equal(chargedMinutes(31 * MIN, { ...rate, incrementMin: 15 }), 45);
});

test("grace makes a quick abort free", () => {
  assert.equal(chargedMinutes(3 * MIN, { ...rate, graceMin: 5 }), 0);
  assert.equal(chargedMinutes(6 * MIN, { ...rate, graceMin: 5 }), 15);
});

test("charge is minutes * hourly / 60, rounded once", () => {
  assert.equal(sessionChargePaise(60 * MIN, rate, 1), 15000);
  assert.equal(sessionChargePaise(20 * MIN, rate, 1), 5000);
  assert.equal(sessionChargePaise(17 * MIN, { ...rate, hourlyPaise: 13000 }, 1), 3683); // 3683.33
});

test("extra controllers add pro rata", () => {
  const r = { ...rate, extraControllerPaise: 5000 };
  assert.equal(sessionChargePaise(60 * MIN, r, 3), 15000 + 2 * 5000);
  assert.equal(sessionChargePaise(60 * MIN, rate, 4), 15000); // zone without extras ignores players
});

test("package pays the package price, overtime bills at the hourly rate", () => {
  const pkg = { ...rate, packagePaise: 10000 };
  assert.equal(sessionChargePaise(30 * MIN, pkg, 1, 60), 10000); // finished early, still pays package
  assert.equal(sessionChargePaise(60 * MIN, pkg, 1, 60), 10000);
  assert.equal(sessionChargePaise(75 * MIN, pkg, 1, 60), 10000 + 3750); // 15 min over
  assert.equal(sessionChargePaise(60 * MIN + 1, pkg, 1, 60), 10000 + 250); // one started minute over
});

test("status: running, ending, overtime, paused", () => {
  const T = times();
  assert.equal(sessionStatus(T, null, 10, t0 + 500 * MIN), "running");
  assert.equal(sessionStatus(T, 60, 10, t0 + 30 * MIN), "running");
  assert.equal(sessionStatus(T, 60, 10, t0 + 50 * MIN), "ending");
  assert.equal(sessionStatus(T, 60, 10, t0 + 60 * MIN), "overtime");
  assert.equal(sessionStatus(times({ pausedAt: t0 + 5 * MIN }), 60, 10, t0 + 55 * MIN), "paused");
});

test("pause pushes the end out", () => {
  const T = times({ pausedTotalMs: 20 * MIN });
  assert.equal(sessionStatus(T, 60, 10, t0 + 70 * MIN), "ending"); // 50 played of 60
});

test("prepaid minutes", () => {
  assert.equal(prepaidMinutes(15000, 15000), 60);
  assert.equal(prepaidMinutes(10000, 15000), 40);
  assert.equal(prepaidMinutes(100, 0), 0);
});

const base: RateRow = {
  id: 1, zoneId: 1, name: "Std", hourlyPaise: 15000, extraControllerPaise: 0,
  incrementMin: 1, minMinutes: 15, graceMin: 0, daysMask: 127, fromMin: 0, toMin: 1440, priority: 0,
};

test("pickRate: priority, window, zone, none", () => {
  const happy: RateRow = { ...base, id: 2, name: "Happy", hourlyPaise: 10000, fromMin: 14 * 60, toMin: 17 * 60, priority: 5 };
  const rows = [base, happy, { ...base, id: 3, zoneId: 2 }];
  const at = (h: number) => new Date(2026, 9, 7, h, 0);
  assert.equal(pickRate(rows, 1, at(15))!.id, 2);
  assert.equal(pickRate(rows, 1, at(18))!.id, 1);
  assert.equal(pickRate(rows, 9, at(15)), null);
});

test("pickRate: day mask and overnight window", () => {
  const weekend: RateRow = { ...base, id: 4, daysMask: (1 << 0) | (1 << 6), priority: 3 };
  const sunday = new Date(2026, 9, 4, 12, 0);
  const monday = new Date(2026, 9, 5, 12, 0);
  assert.equal(pickRate([base, weekend], 1, sunday)!.id, 4);
  assert.equal(pickRate([base, weekend], 1, monday)!.id, 1);
  const night: RateRow = { ...base, id: 5, fromMin: 22 * 60, toMin: 2 * 60, priority: 9 };
  assert.equal(pickRate([base, night], 1, new Date(2026, 9, 5, 23, 30))!.id, 5);
  assert.equal(pickRate([base, night], 1, new Date(2026, 9, 5, 1, 0))!.id, 5);
  assert.equal(pickRate([base, night], 1, new Date(2026, 9, 5, 12, 0))!.id, 1);
});

test("computeBill: flat and percent discount, clamped", () => {
  const lines = [
    { kind: "session" as const, name: "PS5", qty: 1, unitPaise: 15000, taxPct: 0 },
    { kind: "item" as const, name: "Coke", qty: 2, unitPaise: 4000, taxPct: 0 },
  ];
  assert.equal(computeBill(lines, null).totalPaise, 23000);
  assert.equal(computeBill(lines, { type: "flat", value: 3000 }).totalPaise, 20000);
  assert.equal(computeBill(lines, { type: "percent", value: 10 }).totalPaise, 20700);
  assert.equal(computeBill(lines, { type: "flat", value: 999999 }).totalPaise, 0);
  assert.equal(computeBill(lines, { type: "percent", value: 150 }).totalPaise, 0);
});

test("computeBill: inclusive tax breakup after discount", () => {
  const lines = [{ kind: "session" as const, name: "PC", qty: 1, unitPaise: 11800, taxPct: 18 }];
  const b = computeBill(lines, null);
  assert.equal(b.taxPaise, 1800);
  assert.equal(b.totalPaise, 11800);
  assert.equal(computeBill(lines, { type: "flat", value: 1180 }).taxPaise, 1620);
});

test("computeBill: empty bill is zero", () => {
  assert.deepEqual(computeBill([], null), { subtotalPaise: 0, discountPaise: 0, taxPaise: 0, totalPaise: 0 });
});

test("splitEven always sums to total", () => {
  for (const [t, n] of [[10000, 3], [1, 4], [0, 2], [99999, 7]] as const) {
    const s = splitEven(t, n);
    assert.equal(s.length, n);
    assert.equal(s.reduce((a, b) => a + b, 0), t);
  }
  assert.deepEqual(splitEven(10000, 3), [3334, 3333, 3333]);
  assert.equal(splitEven(500, 0).length, 1);
});

test("validatePayments", () => {
  assert.equal(validatePayments(1000, [{ method: "cash", amountPaise: 1000 }]), null);
  assert.equal(validatePayments(1000, [{ method: "cash", amountPaise: 400 }, { method: "upi", amountPaise: 600 }]), null);
  assert.match(validatePayments(1000, [{ method: "cash", amountPaise: 999 }])!, /add up/);
  assert.match(validatePayments(1000, [])!, /at least one/);
  assert.match(validatePayments(1000, [{ method: "cash", amountPaise: -5 }, { method: "upi", amountPaise: 1005 }])!, /positive/);
  assert.match(validatePayments(1000, [{ method: "wallet" as never, amountPaise: 1000 }])!, /Unknown/);
  assert.equal(validatePayments(0, []), null);
});

test("upiLink carries exact amount and encodes hostile names", () => {
  const url = upiLink({ upiId: "level9@okhdfc", name: "Level 9 Gaming Lounge", amountPaise: 20050, note: "INV-12" });
  assert.match(url, /^upi:\/\/pay\?/);
  assert.match(url, /am=200\.50/);
  assert.match(url, /pa=level9%40okhdfc/);
  const nasty = upiLink({ upiId: "level9@okhdfc", name: "Tom & Jerry's #1", amountPaise: 100, note: "a&am=1" });
  assert.equal(new URL(nasty).searchParams.get("am"), "1.00"); // injected "&am=1" can't override the amount
  assert.throws(() => upiLink({ upiId: "bad id", name: "x", amountPaise: 100, note: "n" }));
  assert.throws(() => upiLink({ upiId: "a@b", name: "x", amountPaise: 0, note: "n" }));
  assert.throws(() => upiLink({ upiId: "level9@okhdfc", name: "x", amountPaise: 10.5, note: "n" }));
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test`
Expected: FAIL with `Cannot find module` for `lib/engine/pricing.ts`.

- [ ] **Step 3: Write the engine**

**`lib/engine/pricing.ts`**

```typescript
export type RateSnapshot = {
  rateId: number;
  name: string;
  hourlyPaise: number;
  extraControllerPaise: number;
  incrementMin: number;
  minMinutes: number;
  graceMin: number;
  packagePaise: number | null; // set when the session was started from a time package
};

export type SessionTimes = {
  startedAt: number; // epoch ms
  endedAt: number | null;
  pausedAt: number | null;
  pausedTotalMs: number;
};

export type SessionStatus = "running" | "paused" | "ending" | "overtime";

/** Milliseconds actually played: wall time minus every pause (including a pause still open). */
export function billableMs(t: SessionTimes, now: number): number {
  const end = t.endedAt ?? now;
  const openPause = t.pausedAt !== null ? Math.max(0, end - t.pausedAt) : 0;
  return Math.max(0, end - t.startedAt - t.pausedTotalMs - openPause);
}

/** Minutes charged: grace -> free, else round up to the increment, then apply the minimum. */
export function chargedMinutes(ms: number, rate: RateSnapshot): number {
  const inc = Math.max(1, rate.incrementMin);
  if (ms <= rate.graceMin * 60000) return 0;
  const rounded = Math.ceil(ms / (inc * 60000)) * inc;
  return Math.max(rounded, rate.minMinutes);
}

/**
 * Session charge in paise. Rounds once, half up. `players` > 1 adds the extra-controller price.
 * A package session pays the package price, plus hourly-rate overtime past `plannedMinutes`.
 */
export function sessionChargePaise(
  ms: number,
  rate: RateSnapshot,
  players: number,
  plannedMinutes: number | null = null,
): number {
  const extras = Math.max(0, players - 1);
  const perHour = rate.hourlyPaise + rate.extraControllerPaise * extras;
  if (rate.packagePaise !== null && plannedMinutes !== null) {
    const inc = Math.max(1, rate.incrementMin);
    const overMs = Math.max(0, ms - plannedMinutes * 60000);
    const overMin = overMs === 0 ? 0 : Math.ceil(overMs / (inc * 60000)) * inc;
    return rate.packagePaise + Math.round((overMin * perHour) / 60);
  }
  return Math.round((chargedMinutes(ms, rate) * perHour) / 60);
}

export function remainingMs(plannedMinutes: number | null, playedMs: number): number | null {
  return plannedMinutes === null ? null : plannedMinutes * 60000 - playedMs;
}

export function sessionStatus(
  t: SessionTimes,
  plannedMinutes: number | null,
  leadMin: number,
  now: number,
): SessionStatus {
  if (t.pausedAt !== null) return "paused";
  const left = remainingMs(plannedMinutes, billableMs(t, now));
  if (left === null) return "running";
  if (left <= 0) return "overtime";
  if (left <= leadMin * 60000) return "ending";
  return "running";
}

/** Minutes a prepaid amount buys at an hourly rate (whole minutes, rounded down). */
export function prepaidMinutes(advancePaise: number, hourlyPaise: number): number {
  if (hourlyPaise <= 0) return 0;
  return Math.floor((advancePaise * 60) / hourlyPaise);
}
```

**`lib/engine/rates.ts`**

```typescript
export type RateRow = {
  id: number;
  zoneId: number;
  name: string;
  hourlyPaise: number;
  extraControllerPaise: number;
  incrementMin: number;
  minMinutes: number;
  graceMin: number;
  daysMask: number; // bit 0 = Sunday ... bit 6 = Saturday
  fromMin: number; // minutes since midnight, inclusive
  toMin: number; // minutes since midnight, exclusive (1440 = end of day)
  priority: number;
};

/** Highest-priority rate for a zone at a moment; ties go to the lowest id. Null = no price set. */
export function pickRate(rates: RateRow[], zoneId: number, at: Date): RateRow | null {
  const day = at.getDay();
  const minute = at.getHours() * 60 + at.getMinutes();
  const matches = rates.filter((r) => {
    if (r.zoneId !== zoneId) return false;
    if ((r.daysMask & (1 << day)) === 0) return false;
    const inWindow =
      r.fromMin <= r.toMin
        ? minute >= r.fromMin && minute < r.toMin
        : minute >= r.fromMin || minute < r.toMin; // overnight window
    return inWindow;
  });
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.priority - a.priority || a.id - b.id)[0];
}
```

**`lib/engine/bill.ts`**

```typescript
export type BillLineInput = {
  kind: "session" | "item";
  name: string;
  qty: number;
  unitPaise: number;
  taxPct: number; // 0 when GST is off
};

export type Discount = { type: "flat" | "percent"; value: number } | null;

export type BillTotals = {
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number; // included in total (prices are tax-inclusive)
  totalPaise: number;
};

export const PAYMENT_METHODS = ["cash", "upi", "card"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type PaymentInput = { method: PaymentMethod; amountPaise: number };

export function computeBill(lines: BillLineInput[], discount: Discount): BillTotals {
  const lineTotals = lines.map((l) => l.qty * l.unitPaise);
  const subtotalPaise = lineTotals.reduce((a, b) => a + b, 0);

  let discountPaise = 0;
  if (discount && subtotalPaise > 0) {
    discountPaise =
      discount.type === "flat"
        ? Math.min(Math.max(0, Math.round(discount.value)), subtotalPaise)
        : Math.round((subtotalPaise * Math.min(100, Math.max(0, discount.value))) / 100);
  }

  // Spread the discount across lines in proportion, last line absorbs rounding.
  let allocated = 0;
  let taxPaise = 0;
  lines.forEach((l, i) => {
    const share =
      i === lines.length - 1
        ? discountPaise - allocated
        : subtotalPaise === 0
          ? 0
          : Math.round((discountPaise * lineTotals[i]) / subtotalPaise);
    allocated += share;
    const after = lineTotals[i] - share;
    taxPaise += Math.round((after * l.taxPct) / (100 + l.taxPct));
  });

  return { subtotalPaise, discountPaise, taxPaise, totalPaise: subtotalPaise - discountPaise };
}

/** Even split in paise; the first `remainder` shares carry one extra paisa. Sum always equals total. */
export function splitEven(totalPaise: number, people: number): number[] {
  const n = Math.max(1, Math.floor(people));
  const base = Math.floor(totalPaise / n);
  const rem = totalPaise - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/** Returns an error message, or null when payments are valid and cover the total exactly. */
export function validatePayments(totalPaise: number, payments: PaymentInput[]): string | null {
  if (totalPaise === 0 && payments.length === 0) return null;
  if (payments.length === 0) return "Add at least one payment";
  for (const p of payments) {
    if (!PAYMENT_METHODS.includes(p.method)) return "Unknown payment method";
    if (!Number.isInteger(p.amountPaise) || p.amountPaise <= 0) return "Payment amounts must be positive";
  }
  const sum = payments.reduce((a, p) => a + p.amountPaise, 0);
  return sum === totalPaise ? null : "Payments must add up to the bill total";
}
```

**`lib/engine/upi.ts`**

```typescript
const UPI_ID = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

export const isValidUpiId = (id: string): boolean => UPI_ID.test(id);

/** Standard UPI deep link carrying the exact amount. Throws on an invalid payee. */
export function upiLink(o: { upiId: string; name: string; amountPaise: number; note: string }): string {
  if (!isValidUpiId(o.upiId)) throw new Error("Invalid UPI ID");
  if (!Number.isInteger(o.amountPaise) || o.amountPaise <= 0) throw new Error("Invalid amount");
  const q = new URLSearchParams({
    pa: o.upiId,
    pn: o.name,
    am: (o.amountPaise / 100).toFixed(2),
    cu: "INR",
    tn: o.note,
  });
  return `upi://pay?${q.toString()}`;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: `ℹ tests 20`, `ℹ pass 20`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/engine tests/engine.test.ts
git commit -m "Add pure pricing, rate-picking, bill and UPI engine" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Input validation, phone numbers, formatting, live status

**Files:**
- Create: `lib/errors.ts`, `lib/validate.ts`, `lib/phone.ts`, `lib/format.ts`, `lib/live.ts`
- Test: `tests/validate.test.ts`, `tests/format.test.ts`

**Interfaces:**
- Produces:
  - `errors.ts`: `class UserError extends Error` (message is safe to show on screen).
  - `validate.ts`: `str(v, label, {max?, required?})`, `int(v, label, {min?, max?})`, `rupeesToPaise(v, label, {min?, max?})` (min/max in rupees), `oneOf(v, allowed, label)`, `bool(v)`, `hhmm(v, label, allow24?)`, `minToHHMM(min)`. All throw `UserError`.
  - `phone.ts`: `normalizePhone(raw, defaultCc="91"): string | null`.
  - `format.ts`: `rupees(paise)`, `hms(ms)`, `clock(ms)`, `dateTime(ms)`, `invoiceNo(n)`.
  - `live.ts`: `liveInfo(s: BoardSession, leadMin, now)` returning `{stopped,status,playedMs,remainingMs,chargePaise,totalPaise}`; type `LiveStatus`. (Imports `BoardSession` as a type from `lib/db/sessions.ts`, created in Task 4; type imports are erased so tests run now.)
- Consumes: Task 2 engine.

- [ ] **Step 1: Write the failing tests**

**`tests/validate.test.ts`**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { str, int, rupeesToPaise, oneOf, bool } from "../lib/validate.ts";
import { normalizePhone } from "../lib/phone.ts";
import { UserError } from "../lib/errors.ts";

test("str trims, requires and caps length", () => {
  assert.equal(str("  Ali  ", "Name"), "Ali");
  assert.throws(() => str("   ", "Name"), UserError);
  assert.throws(() => str("x".repeat(201), "Name"), /too long/);
  assert.equal(str(undefined, "Notes", { required: false }), "");
  assert.equal(str("<script>alert(1)</script>", "Name"), "<script>alert(1)</script>"); // stored raw, React escapes on render
});

test("int rejects floats, NaN, blanks and out-of-range", () => {
  assert.equal(int("15", "Minutes"), 15);
  assert.throws(() => int("1.5", "Minutes"), /whole number/);
  assert.throws(() => int("", "Minutes"), /whole number/);
  assert.throws(() => int("abc", "Minutes"), /whole number/);
  assert.throws(() => int(NaN, "Minutes"), /whole number/);
  assert.throws(() => int(-1, "Minutes"), /between/);
  assert.throws(() => int(5, "Minutes", { max: 4 }), /between/);
});

test("rupeesToPaise handles rupees and paise, rejects junk", () => {
  assert.equal(rupeesToPaise("150", "Rate"), 15000);
  assert.equal(rupeesToPaise("150.5", "Rate"), 15050);
  assert.equal(rupeesToPaise("0.07", "Rate"), 7);
  for (const bad of ["-5", "1e3", "1,000", "12.345", "", "abc", "NaN", "Infinity"]) {
    assert.throws(() => rupeesToPaise(bad, "Rate"), UserError, bad);
  }
  assert.throws(() => rupeesToPaise("99999999", "Rate"), /out of range/);
});

test("oneOf and bool", () => {
  assert.equal(oneOf("cash", ["cash", "upi"] as const, "Method"), "cash");
  assert.throws(() => oneOf("wallet", ["cash", "upi"] as const, "Method"), UserError);
  assert.equal(bool("on"), true);
  assert.equal(bool(undefined), false);
});

test("normalizePhone", () => {
  assert.equal(normalizePhone("98765 43210"), "919876543210");
  assert.equal(normalizePhone("+91 98765-43210"), "919876543210");
  assert.equal(normalizePhone("09876543210"), "919876543210");
  assert.equal(normalizePhone("0091 9876543210"), "919876543210");
  assert.equal(normalizePhone("+1 415 555 2671"), "14155552671");
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizePhone("abc"), null);
  assert.equal(normalizePhone(""), null);
});
```

**`tests/format.test.ts`**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { rupees, hms, invoiceNo } from "../lib/format.ts";
import { hhmm, minToHHMM } from "../lib/validate.ts";
import { liveInfo } from "../lib/live.ts";
import type { BoardSession } from "../lib/db/sessions.ts";

test("rupees: whole amounts have no decimals, Indian grouping", () => {
  assert.equal(rupees(15000), "₹150");
  assert.equal(rupees(15050), "₹150.50");
  assert.equal(rupees(12345600), "₹1,23,456");
  assert.equal(rupees(0), "₹0");
  assert.equal(rupees(7), "₹0.07");
});

test("hms and invoiceNo", () => {
  assert.equal(hms(3_909_000), "1:05:09");
  assert.equal(hms(-5000), "0:00:00");
  assert.equal(hms(0), "0:00:00");
  assert.equal(invoiceNo(42), "INV-000042");
});

test("hhmm parses times and rejects junk", () => {
  assert.equal(hhmm("14:30", "From"), 870);
  assert.equal(hhmm("00:00", "From"), 0);
  assert.equal(hhmm("24:00", "To", true), 1440);
  for (const bad of ["24:00", "25:00", "9", "12:60", "ab:cd", "", "12:5"]) assert.throws(() => hhmm(bad, "T"), /like 14:30/, bad);
  assert.equal(minToHHMM(870), "14:30");
  assert.equal(minToHHMM(1440), "24:00");
});

const MIN = 60000;
const session = (over: Partial<BoardSession> = {}): BoardSession => ({
  id: 1, stationId: 1, customerId: null, staffId: "u", mode: "fixed", startedAt: 0, plannedMinutes: 60,
  advancePaise: 0, advanceMethod: null, players: 1, pausedAt: null, pausedTotalMs: 0, endedAt: null, notes: "",
  billed: false, customerName: null, itemsPaise: 4000, items: [],
  rate: { rateId: 1, name: "S", hourlyPaise: 15000, extraControllerPaise: 0, incrementMin: 1, minMinutes: 15, graceMin: 0, packagePaise: null },
  ...over,
});

test("liveInfo: running, ending, overtime, awaiting payment", () => {
  const a = liveInfo(session(), 10, 30 * MIN);
  assert.equal(a.status, "running");
  assert.equal(a.chargePaise, 7500);
  assert.equal(a.totalPaise, 11500); // + items
  assert.equal(a.remainingMs, 30 * MIN);
  assert.equal(liveInfo(session(), 10, 55 * MIN).status, "ending");
  const over = liveInfo(session(), 10, 70 * MIN);
  assert.equal(over.status, "overtime");
  assert.equal(over.remainingMs, -10 * MIN);
  const done = liveInfo(session({ endedAt: 40 * MIN }), 10, 999 * MIN);
  assert.equal(done.status, "awaiting");
  assert.equal(done.playedMs, 40 * MIN); // frozen at stop, doesn't keep growing
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: the two new files FAIL with `Cannot find module`.

- [ ] **Step 3: Write the implementation**

**`lib/errors.ts`**

```typescript
/** An expected, user-fixable failure. Its message is safe to show on screen. */
export class UserError extends Error {}
```

**`lib/validate.ts`**

```typescript
import { UserError } from "./errors.ts";

export function str(v: unknown, label: string, o: { max?: number; required?: boolean } = {}): string {
  const { max = 200, required = true } = o;
  const s = typeof v === "string" ? v.trim() : "";
  if (required && !s) throw new UserError(`${label} is required`);
  if (s.length > max) throw new UserError(`${label} is too long (max ${max} characters)`);
  return s;
}

export function int(v: unknown, label: string, o: { min?: number; max?: number } = {}): number {
  const { min = 0, max = 1_000_000_000 } = o;
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isInteger(n)) throw new UserError(`${label} must be a whole number`);
  if (n < min || n > max) throw new UserError(`${label} must be between ${min} and ${max}`);
  return n;
}

/** Rupees typed by a person ("150", "150.5") -> whole paise. */
export function rupeesToPaise(v: unknown, label: string, o: { min?: number; max?: number } = {}): number {
  const { min = 0, max = 10_000_000 } = o;
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new UserError(`${label} must be an amount like 150 or 150.50`);
  const paise = Math.round(Number(s) * 100);
  if (paise < min * 100 || paise > max * 100) throw new UserError(`${label} is out of range`);
  return paise;
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], label: string): T {
  if (typeof v === "string" && (allowed as readonly string[]).includes(v)) return v as T;
  throw new UserError(`${label} is not valid`);
}

export function bool(v: unknown): boolean {
  return v === true || v === "on" || v === "1" || v === "true";
}

/** "14:30" -> 870 minutes since midnight. "24:00" is allowed (as 1440) when `allow24` is set, for "until end of day". */
export function hhmm(v: unknown, label: string, allow24 = false): number {
  const m = typeof v === "string" ? /^(\d{1,2}):(\d{2})$/.exec(v.trim()) : null;
  const minutes = m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  if (!m || Number(m[2]) > 59 || minutes > (allow24 ? 1440 : 1439)) throw new UserError(`${label} must be a time like 14:30`);
  return minutes;
}

export const minToHHMM = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
```

**`lib/phone.ts`**

```typescript
/** Digits-only phone with country code, or null when it can't be a real number. */
export function normalizePhone(raw: string, defaultCc = "91"): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = defaultCc + d;
  return d.length >= 11 && d.length <= 15 ? d : null;
}
```

**`lib/format.ts`**

```typescript
const whole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const exact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 15000 -> "₹150", 15050 -> "₹150.50", 12345600 -> "₹1,23,456" */
export function rupees(paise: number): string {
  return (paise % 100 === 0 ? whole : exact).format(paise / 100);
}

/** Milliseconds -> "1:05:09". Negative values show as zero. */
export function hms(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export const clock = (ms: number): string =>
  new Date(ms).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });

export const dateTime = (ms: number): string =>
  new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

export const invoiceNo = (n: number): string => `INV-${String(n).padStart(6, "0")}`;
```

**`lib/live.ts`**

```typescript
import { billableMs, remainingMs, sessionChargePaise, sessionStatus } from "./engine/pricing.ts";
import type { SessionStatus } from "./engine/pricing.ts";
import type { BoardSession } from "./db/sessions.ts";

export type LiveStatus = SessionStatus | "awaiting"; // awaiting = stopped, bill not paid yet

/** Everything a card or drawer shows about a session at a given moment. Pure: pass in `now`. */
export function liveInfo(s: BoardSession, leadMin: number, now: number) {
  const stopped = s.endedAt !== null;
  const playedMs = billableMs(s, s.endedAt ?? now);
  const status: LiveStatus = stopped ? "awaiting" : sessionStatus(s, s.plannedMinutes, leadMin, now);
  const chargePaise = sessionChargePaise(playedMs, s.rate, s.players, s.plannedMinutes);
  return {
    stopped,
    status,
    playedMs,
    remainingMs: remainingMs(s.plannedMinutes, playedMs),
    chargePaise,
    totalPaise: chargePaise + s.itemsPaise,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: `ℹ tests 29`, `ℹ fail 0` (20 engine + 5 validate + 4 format).

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "Add input validation, phone normalisation, formatting and live session info" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Database, catalog and sessions

**Files:**
- Create: `lib/db/migrations.ts`, `lib/db/index.ts`, `lib/db/settings.ts`, `lib/db/catalog.ts`, `lib/db/seed.ts`, `lib/db/customers.ts`, `lib/db/sessions.ts`
- Test: `tests/helpers.ts`, `tests/sessions.test.ts`, `tests/persist.test.ts`

**Interfaces:**
- Consumes: Task 2 (`pickRate`, `prepaidMinutes`, `RateSnapshot`, `PaymentMethod`), Task 3 (`UserError`, `normalizePhone`).
- Produces:
  - `db/index.ts`: `getDb()`, `closeDb()`, `dataDir()`, `migrate(db)`, `all<T>(sql, ...params)`, `get<T>(sql, ...params)`, `run(sql, ...params)`, `tx(fn)` (nestable), `audit(staffId, action, detail?, at?)`. Rows are copied to plain objects (Next refuses `node:sqlite`'s null-prototype rows in client components). `LOUNGE_DB` env overrides the file (tests use `:memory:`); `LOUNGE_DATA_DIR` sets the data folder.
  - `db/settings.ts`: `DEFAULTS`, `getSettings()`, `getSetting(key)`, `setSettings(partial)`, `isSetupDone()`; keys include `cafe.name`, `cafe.upiId`, `cafe.logo`, `cafe.accent`, `gst.enabled`, `gst.pct`, `alert.leadMin`, `staff.maxDiscountPct`, `setup.done`.
  - `db/catalog.ts`: zones, stations, rates, packages CRUD (`listZones`, `createZone`, `renameZone`, `archiveZone`, `listStations`, `createStation`, `updateStation`, `archiveStation`, `listRates`, `saveRate`, `archiveRate`, `listPackages`, `getPackage`, `savePackage`, `archivePackage`, `ZONE_KINDS`).
  - `db/seed.ts`: `seedLevel9Starter()` (Pool/PS5/PC/Sim zones, one station and one "Standard" rate each: ₹150, ₹150, ₹130, ₹150; only on an empty catalog).
  - `db/customers.ts`: `searchCustomers(q)`, `createCustomer(name, phone, consent, defaultCc?, now?)`.
  - `db/sessions.ts`: `startSession`, `getSession`, `pauseSession`, `resumeSession`, `extendSession`, `transferSession`, `stopSession`, `reopenSession`, `setNotes`, `listItems`, `addItem`, `removeItem`, `listBoard()`; types `SessionRow`, `BoardSession`, `BoardStation`, `BoardZone`, `SessionItem`, `StartInput`.

- [ ] **Step 1: Write the failing tests**

**`tests/helpers.ts`**

```typescript
import { getDb, closeDb, get } from "../lib/db/index.ts";
import { seedLevel9Starter } from "../lib/db/seed.ts";
import { listStations, listZones } from "../lib/db/catalog.ts";

export const MIN = 60000;
export const T0 = new Date(2026, 9, 7, 15, 0).getTime(); // Wed 15:00 local

/** Brand-new in-memory database with Level 9's starter zones, stations and rates. */
export function freshDb(): void {
  process.env.LOUNGE_DB = ":memory:";
  closeDb();
  getDb();
  seedLevel9Starter();
}

export function station(zoneKind: string): number {
  const zone = listZones().find((z) => z.kind === zoneKind)!;
  return listStations().find((s) => s.zoneId === zone.id)!.id;
}

export function zoneOf(stationId: number): number {
  return get<{ zoneId: number }>("SELECT zone_id AS zoneId FROM stations WHERE id = ?", stationId)!.zoneId;
}
```

**`tests/sessions.test.ts`**

```typescript
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshDb, station, zoneOf, MIN, T0 } from "./helpers.ts";
import {
  startSession, getSession, pauseSession, resumeSession, stopSession, reopenSession, extendSession,
  transferSession, addItem, removeItem, listItems, listBoard,
} from "../lib/db/sessions.ts";
import { saveRate, listRates, createStation, savePackage, updateStation, archiveStation, createZone, archiveZone } from "../lib/db/catalog.ts";
import { createCustomer } from "../lib/db/customers.ts";
import { run } from "../lib/db/index.ts";
import { UserError } from "../lib/errors.ts";

beforeEach(freshDb);

const start = (stationId: number, over: Record<string, unknown> = {}) =>
  startSession({ stationId, staffId: "u1", mode: "open", players: 1, now: T0, ...over });

test("start freezes the rate snapshot; later rate edits don't touch a running session", () => {
  const ps5 = station("ps5");
  const id = start(ps5);
  assert.equal(getSession(id).rate.hourlyPaise, 15000);
  const r = listRates().find((x) => x.zoneId === zoneOf(ps5))!;
  saveRate({ ...r, hourlyPaise: 99900 });
  assert.equal(getSession(id).rate.hourlyPaise, 15000);
});

test("a station can't run two unbilled sessions (double-click safe)", () => {
  const ps5 = station("ps5");
  start(ps5);
  assert.throws(() => start(ps5), /already in use/);
});

test("no rate at that time refuses to start with a clear message", () => {
  const ps5 = station("ps5");
  for (const r of listRates()) run("UPDATE rates SET active = 0 WHERE id = ?", r.id);
  assert.throws(() => start(ps5), /No rate is set for PS5 Zone/);
});

test("maintenance and unknown stations are refused", () => {
  const ps5 = station("ps5");
  updateStation(ps5, "PS5 1", true);
  assert.throws(() => start(ps5), /under maintenance/);
  assert.throws(() => start(99999), /Station not found/);
});

test("fixed needs a sane duration; prepaid derives minutes from the amount", () => {
  const ps5 = station("ps5");
  assert.throws(() => start(ps5, { mode: "fixed" }), /duration/);
  assert.throws(() => start(ps5, { mode: "fixed", plannedMinutes: 0 }), /duration/);
  assert.throws(() => start(ps5, { mode: "fixed", plannedMinutes: 99999 }), /duration/);
  const fixed = start(ps5, { mode: "fixed", plannedMinutes: 90 });
  assert.equal(getSession(fixed).plannedMinutes, 90);
  stopSession(fixed, T0 + MIN);
  run("UPDATE sessions SET billed = 1");
  assert.throws(() => start(ps5, { mode: "prepaid", advancePaise: 15000 }), /how the prepaid/);
  assert.throws(() => start(ps5, { mode: "prepaid", advancePaise: 1, advanceMethod: "cash" }), /too small/);
  const pre = start(ps5, { mode: "prepaid", advancePaise: 15000, advanceMethod: "upi" });
  assert.equal(getSession(pre).plannedMinutes, 60);
  assert.equal(getSession(pre).advanceMethod, "upi");
});

test("package starts a fixed session with the package price and can't be extended", () => {
  const ps5 = station("ps5");
  const zoneId = zoneOf(ps5);
  const pkgId = savePackage({ zoneId, name: "Night 3h", minutes: 180, pricePaise: 35000 });
  const id = start(ps5, { packageId: pkgId });
  const s = getSession(id);
  assert.equal(s.mode, "fixed");
  assert.equal(s.plannedMinutes, 180);
  assert.equal(s.rate.packagePaise, 35000);
  assert.throws(() => extendSession(id, 30), /Package sessions can't be extended/);
  assert.throws(() => start(station("pc"), { packageId: pkgId }), /isn't available/);
});

test("players and customer are validated", () => {
  const ps5 = station("ps5");
  assert.throws(() => start(ps5, { players: 0 }), /Players/);
  assert.throws(() => start(ps5, { players: 2.5 }), /Players/);
  assert.throws(() => start(ps5, { customerId: 424242 }), /Customer not found/);
  const cid = createCustomer("Ali", "98765 43210", true, "91", T0);
  const id = start(ps5, { customerId: cid });
  assert.equal(getSession(id).customerId, cid);
});

test("pause and resume accumulate; both are idempotent; stop folds an open pause", () => {
  const id = start(station("ps5"), { mode: "fixed", plannedMinutes: 60 });
  pauseSession(id, T0 + 10 * MIN);
  pauseSession(id, T0 + 12 * MIN); // second pause is ignored
  assert.equal(getSession(id).pausedAt, T0 + 10 * MIN);
  resumeSession(id, T0 + 25 * MIN);
  resumeSession(id, T0 + 26 * MIN); // second resume is ignored
  assert.equal(getSession(id).pausedTotalMs, 15 * MIN);
  pauseSession(id, T0 + 30 * MIN);
  stopSession(id, T0 + 40 * MIN); // stopped while paused
  const s = getSession(id);
  assert.equal(s.pausedAt, null);
  assert.equal(s.pausedTotalMs, 25 * MIN);
  assert.equal(s.endedAt, T0 + 40 * MIN);
  stopSession(id, T0 + 99 * MIN); // double click: no change
  assert.equal(getSession(id).endedAt, T0 + 40 * MIN);
});

test("a stopped session can't be paused or extended; reopen counts the gap as a pause", () => {
  const id = start(station("ps5"), { mode: "fixed", plannedMinutes: 60 });
  stopSession(id, T0 + 20 * MIN);
  assert.throws(() => pauseSession(id, T0 + 21 * MIN), /already been stopped/);
  assert.throws(() => extendSession(id, 15), /already been stopped/);
  reopenSession(id, T0 + 25 * MIN);
  const s = getSession(id);
  assert.equal(s.endedAt, null);
  assert.equal(s.pausedTotalMs, 5 * MIN);
});

test("extend rules", () => {
  const ps5 = station("ps5");
  const open = start(ps5);
  assert.throws(() => extendSession(open, 15), /no end time/);
  stopSession(open, T0 + MIN);
  run("UPDATE sessions SET billed = 1");
  const fixed = start(ps5, { mode: "fixed", plannedMinutes: 30 });
  extendSession(fixed, 15);
  assert.equal(getSession(fixed).plannedMinutes, 45);
  assert.throws(() => extendSession(fixed, 0), /Extend by/);
});

test("transfer: same zone only, target must be free and in service", () => {
  const ps5 = station("ps5");
  const zoneId = zoneOf(ps5);
  const second = createStation(zoneId, "PS5 2");
  const id = start(ps5);
  assert.throws(() => transferSession(id, station("pc"), "u1", T0), /same zone/);
  start(second);
  assert.throws(() => transferSession(id, second, "u1", T0), /already in use/);
  const third = createStation(zoneId, "PS5 3");
  updateStation(third, "PS5 3", true);
  assert.throws(() => transferSession(id, third, "u1", T0), /under maintenance/);
  const fourth = createStation(zoneId, "PS5 4");
  transferSession(id, fourth, "u1", T0);
  assert.equal(getSession(id).stationId, fourth);
});

test("items: validated, listed, removed; frozen once billed", () => {
  const id = start(station("ps5"));
  assert.throws(() => addItem(id, "Coke", 0, 4000, T0), /Quantity/);
  assert.throws(() => addItem(id, "Coke", 1, -1, T0), /Price/);
  assert.throws(() => addItem(id, "Coke", 1, 40.5, T0), /Price/);
  addItem(id, "Coke", 2, 4000, T0);
  const [item] = listItems(id);
  assert.equal(item.qty, 2);
  removeItem(item.id);
  assert.equal(listItems(id).length, 0);
  stopSession(id, T0 + MIN);
  run("UPDATE sessions SET billed = 1");
  assert.throws(() => addItem(id, "Coke", 1, 4000, T0), /already billed/);
});

test("station and zone archive are blocked while in use", () => {
  const ps5 = station("ps5");
  start(ps5);
  assert.throws(() => archiveStation(ps5), /Finish and bill/);
  assert.throws(() => updateStation(ps5, "PS5 1", true), /Finish and bill/);
  assert.throws(() => archiveZone(zoneOf(ps5)), /Remove this zone's stations first/);
  const z = createZone("VR", "vr");
  archiveZone(z);
  assert.throws(() => createStation(z, "VR 1"), /Zone not found/);
});

test("duplicate zone and station names get a friendly error", () => {
  assert.throws(() => createZone("PS5 Zone", "ps5"), (e: unknown) => e instanceof UserError && /already exists/.test(e.message));
  assert.throws(() => createStation(zoneOf(station("ps5")), "PS5 1"), /already exists/);
});

test("listBoard returns plain serialisable objects with the live session attached", () => {
  const ps5 = station("ps5");
  const id = start(ps5, { customerId: createCustomer("Ali", "", false) });
  addItem(id, "Coke", 2, 4000, T0);
  const board = listBoard();
  assert.equal(board.length, 4);
  const st = board.flatMap((z) => z.stations).find((s) => s.id === ps5)!;
  assert.equal(st.session!.customerName, "Ali");
  assert.equal(st.session!.itemsPaise, 8000);
  assert.deepEqual(st.session!.items.map((i) => [i.name, i.qty, i.unitPaise]), [["Coke", 2, 4000]]);
  assert.equal(Object.getPrototypeOf(st), Object.prototype);
  assert.equal(Object.getPrototypeOf(st.session), Object.prototype);
  assert.doesNotThrow(() => JSON.stringify(board));
  assert.equal(board.flatMap((z) => z.stations).filter((s) => s.session).length, 1);
});
```

**`tests/persist.test.ts`**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDb, closeDb } from "../lib/db/index.ts";
import { seedLevel9Starter } from "../lib/db/seed.ts";
import { startSession, getSession, listBoard } from "../lib/db/sessions.ts";
import { station, T0 } from "./helpers.ts";

test("a running session survives closing and reopening the database file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lounge-"));
  process.env.LOUNGE_DB = path.join(dir, "lounge.db");
  try {
    closeDb();
    getDb();
    seedLevel9Starter();
    const id = startSession({ stationId: station("ps5"), staffId: "u1", mode: "fixed", plannedMinutes: 60, players: 2, now: T0 });
    closeDb(); // simulates the laptop being switched off
    getDb(); // simulates start.bat the next morning
    const s = getSession(id);
    assert.equal(s.startedAt, T0);
    assert.equal(s.plannedMinutes, 60);
    assert.equal(s.players, 2);
    assert.equal(listBoard().flatMap((z) => z.stations).filter((x) => x.session).length, 1);
  } finally {
    closeDb();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL with `Cannot find module` for `lib/db/index.ts`.

- [ ] **Step 3: Write the database layer**

**`lib/db/migrations.ts`**

```typescript
// Append-only. Index + 1 is the PRAGMA user_version after that entry runs. Never edit a shipped entry.
export const MIGRATIONS: string[] = [
  `
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE zones (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'custom',
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX zones_name_active ON zones(name) WHERE active = 1;

CREATE TABLE stations (
  id INTEGER PRIMARY KEY,
  zone_id INTEGER NOT NULL REFERENCES zones(id),
  name TEXT NOT NULL,
  maintenance INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX stations_name_active ON stations(zone_id, name) WHERE active = 1;

CREATE TABLE rates (
  id INTEGER PRIMARY KEY,
  zone_id INTEGER NOT NULL REFERENCES zones(id),
  name TEXT NOT NULL,
  hourly_paise INTEGER NOT NULL CHECK (hourly_paise >= 0),
  extra_controller_paise INTEGER NOT NULL DEFAULT 0 CHECK (extra_controller_paise >= 0),
  increment_min INTEGER NOT NULL DEFAULT 1 CHECK (increment_min >= 1),
  min_minutes INTEGER NOT NULL DEFAULT 15 CHECK (min_minutes >= 0),
  grace_min INTEGER NOT NULL DEFAULT 0 CHECK (grace_min >= 0),
  days_mask INTEGER NOT NULL DEFAULT 127 CHECK (days_mask BETWEEN 1 AND 127),
  from_min INTEGER NOT NULL DEFAULT 0 CHECK (from_min BETWEEN 0 AND 1439),
  to_min INTEGER NOT NULL DEFAULT 1440 CHECK (to_min BETWEEN 1 AND 1440),
  priority INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE packages (
  id INTEGER PRIMARY KEY,
  zone_id INTEGER NOT NULL REFERENCES zones(id),
  name TEXT NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes > 0),
  price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  whatsapp_consent INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  station_id INTEGER NOT NULL REFERENCES stations(id),
  customer_id INTEGER REFERENCES customers(id),
  staff_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('open','fixed','prepaid')),
  started_at INTEGER NOT NULL,
  planned_minutes INTEGER,
  advance_paise INTEGER NOT NULL DEFAULT 0,
  advance_method TEXT CHECK (advance_method IN ('cash','upi','card')),
  players INTEGER NOT NULL DEFAULT 1,
  paused_at INTEGER,
  paused_total_ms INTEGER NOT NULL DEFAULT 0,
  ended_at INTEGER,
  rate_json TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  billed INTEGER NOT NULL DEFAULT 0
);
-- A station can have only one unbilled session: it stays busy until the bill is paid.
CREATE UNIQUE INDEX one_unbilled_session_per_station ON sessions(station_id) WHERE billed = 0;

CREATE TABLE session_items (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  name TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_paise INTEGER NOT NULL CHECK (unit_paise >= 0),
  created_at INTEGER NOT NULL
);

CREATE TABLE bills (
  id INTEGER PRIMARY KEY,
  invoice_no INTEGER NOT NULL UNIQUE,
  session_id INTEGER UNIQUE REFERENCES sessions(id),
  customer_id INTEGER REFERENCES customers(id),
  staff_id TEXT NOT NULL,
  subtotal_paise INTEGER NOT NULL,
  discount_paise INTEGER NOT NULL DEFAULT 0,
  discount_reason TEXT NOT NULL DEFAULT '',
  tax_paise INTEGER NOT NULL DEFAULT 0,
  total_paise INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','void')),
  void_reason TEXT,
  voided_by TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE bill_lines (
  id INTEGER PRIMARY KEY,
  bill_id INTEGER NOT NULL REFERENCES bills(id),
  kind TEXT NOT NULL CHECK (kind IN ('session','item')),
  name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_paise INTEGER NOT NULL,
  tax_pct INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  bill_id INTEGER NOT NULL REFERENCES bills(id),
  method TEXT NOT NULL CHECK (method IN ('cash','upi','card')),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0)
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  staff_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
`,
];
```

**`lib/db/index.ts`**

```typescript
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { MIGRATIONS } from "./migrations.ts";

type Param = string | number | bigint | null;
type G = typeof globalThis & { __loungeDb?: DatabaseSync };

export function dataDir(): string {
  const dir = process.env.LOUNGE_DATA_DIR ?? path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function migrate(db: DatabaseSync): void {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = row.user_version; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}

/** One shared connection per process (cached on globalThis so Next's separate bundles reuse it). */
export function getDb(): DatabaseSync {
  const g = globalThis as G;
  if (g.__loungeDb) return g.__loungeDb;
  const file = process.env.LOUNGE_DB ?? path.join(dataDir(), "lounge.db");
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db);
  g.__loungeDb = db;
  return db;
}

/** Test helper: drop the cached connection so the next getDb() reopens the file. */
export function closeDb(): void {
  const g = globalThis as G;
  g.__loungeDb?.close();
  g.__loungeDb = undefined;
}

// node:sqlite returns null-prototype rows, which Next refuses to pass to client components.
export function all<T>(sql: string, ...p: Param[]): T[] {
  return getDb().prepare(sql).all(...p).map((r) => ({ ...r }) as T);
}

export function get<T>(sql: string, ...p: Param[]): T | undefined {
  const r = getDb().prepare(sql).get(...p);
  return r ? ({ ...r } as T) : undefined;
}

export function run(sql: string, ...p: Param[]) {
  return getDb().prepare(sql).run(...p);
}

/** All-or-nothing. Safe to nest: an inner call just joins the outer transaction. */
export function tx<T>(fn: () => T): T {
  const db = getDb();
  if (db.isTransaction) return fn();
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function audit(staffId: string, action: string, detail = "", at = Date.now()): void {
  run("INSERT INTO audit_log (at, staff_id, action, detail) VALUES (?, ?, ?, ?)", at, staffId, action, detail);
}
```

**`lib/db/settings.ts`**

```typescript
import { all, get, run, tx } from "./index.ts";

export const DEFAULTS = {
  "setup.done": "0",
  "cafe.name": "My Gaming Lounge",
  "cafe.address": "",
  "cafe.phone": "",
  "cafe.gstin": "",
  "cafe.upiId": "",
  "cafe.logo": "", // "" = none, "builtin:level9", or an uploaded file name under data/uploads
  "cafe.accent": "#d4121c",
  "cafe.hours": "",
  "gst.enabled": "0",
  "gst.pct": "18",
  "alert.leadMin": "10",
  "staff.maxDiscountPct": "10",
} as const;

export type SettingKey = keyof typeof DEFAULTS;
export type Settings = Record<SettingKey, string>;

export function getSettings(): Settings {
  const out: Settings = { ...DEFAULTS };
  for (const r of all<{ key: string; value: string }>("SELECT key, value FROM settings")) {
    if (r.key in DEFAULTS) out[r.key as SettingKey] = r.value;
  }
  return out;
}

export function getSetting(key: SettingKey): string {
  return get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key)?.value ?? DEFAULTS[key];
}

export function setSettings(values: Partial<Settings>): void {
  tx(() => {
    for (const [k, v] of Object.entries(values)) {
      if (!(k in DEFAULTS) || v === undefined) continue;
      run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", k, v);
    }
  });
}

export const isSetupDone = (): boolean => getSetting("setup.done") === "1";
```

**`lib/db/catalog.ts`**

```typescript
import { all, get, run, tx } from "./index.ts";
import { UserError } from "../errors.ts";
import type { RateRow } from "../engine/rates.ts";

export type Zone = { id: number; name: string; kind: string };
export type Station = { id: number; zoneId: number; name: string; maintenance: boolean };
export type PackageRow = { id: number; zoneId: number; name: string; minutes: number; pricePaise: number };

export const ZONE_KINDS = ["pool", "ps5", "pc", "sim", "vr", "custom"] as const;

const dupe = (e: unknown, msg: string): never => {
  if (e instanceof Error && /UNIQUE/.test(e.message)) throw new UserError(msg);
  throw e;
};

// ---- zones ----
export const listZones = (): Zone[] => all<Zone>("SELECT id, name, kind FROM zones WHERE active = 1 ORDER BY sort, id");

export function createZone(name: string, kind: string): number {
  try {
    return Number(run("INSERT INTO zones (name, kind, sort) VALUES (?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM zones))", name, kind).lastInsertRowid);
  } catch (e) {
    return dupe(e, `A zone called "${name}" already exists`);
  }
}

export function renameZone(id: number, name: string, kind: string): void {
  try {
    run("UPDATE zones SET name = ?, kind = ? WHERE id = ? AND active = 1", name, kind, id);
  } catch (e) {
    dupe(e, `A zone called "${name}" already exists`);
  }
}

export function archiveZone(id: number): void {
  tx(() => {
    if (get("SELECT 1 AS x FROM stations WHERE zone_id = ? AND active = 1", id)) {
      throw new UserError("Remove this zone's stations first");
    }
    run("UPDATE zones SET active = 0 WHERE id = ?", id);
    run("UPDATE rates SET active = 0 WHERE zone_id = ?", id);
    run("UPDATE packages SET active = 0 WHERE zone_id = ?", id);
  });
}

// ---- stations ----
type StationRaw = Omit<Station, "maintenance"> & { maintenance: number };
const toStation = (r: StationRaw): Station => ({ ...r, maintenance: r.maintenance === 1 });

export const listStations = (): Station[] =>
  all<StationRaw>("SELECT id, zone_id AS zoneId, name, maintenance FROM stations WHERE active = 1 ORDER BY sort, id").map(toStation);

export function createStation(zoneId: number, name: string): number {
  if (!get("SELECT 1 AS x FROM zones WHERE id = ? AND active = 1", zoneId)) throw new UserError("Zone not found");
  try {
    return Number(run("INSERT INTO stations (zone_id, name, sort) VALUES (?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM stations))", zoneId, name).lastInsertRowid);
  } catch (e) {
    return dupe(e, `A station called "${name}" already exists in this zone`);
  }
}

const inUse = (stationId: number): boolean => !!get("SELECT 1 AS x FROM sessions WHERE station_id = ? AND billed = 0", stationId);

export function updateStation(id: number, name: string, maintenance: boolean): void {
  tx(() => {
    if (maintenance && inUse(id)) throw new UserError("Finish and bill the running session before maintenance");
    try {
      run("UPDATE stations SET name = ?, maintenance = ? WHERE id = ? AND active = 1", name, maintenance ? 1 : 0, id);
    } catch (e) {
      dupe(e, `A station called "${name}" already exists in this zone`);
    }
  });
}

export function archiveStation(id: number): void {
  tx(() => {
    if (inUse(id)) throw new UserError("Finish and bill the running session first");
    run("UPDATE stations SET active = 0 WHERE id = ?", id);
  });
}

// ---- rates ----
export type RateInput = Omit<RateRow, "id"> & { id?: number };

export const listRates = (): RateRow[] =>
  all<RateRow>(
    `SELECT id, zone_id AS zoneId, name, hourly_paise AS hourlyPaise, extra_controller_paise AS extraControllerPaise,
            increment_min AS incrementMin, min_minutes AS minMinutes, grace_min AS graceMin, days_mask AS daysMask,
            from_min AS fromMin, to_min AS toMin, priority
     FROM rates WHERE active = 1 ORDER BY zone_id, priority DESC, id`,
  );

export function saveRate(r: RateInput): number {
  if (!get("SELECT 1 AS x FROM zones WHERE id = ? AND active = 1", r.zoneId)) throw new UserError("Zone not found");
  const v = [r.zoneId, r.name, r.hourlyPaise, r.extraControllerPaise, r.incrementMin, r.minMinutes, r.graceMin, r.daysMask, r.fromMin, r.toMin, r.priority] as const;
  if (r.id === undefined) {
    return Number(run(
      `INSERT INTO rates (zone_id, name, hourly_paise, extra_controller_paise, increment_min, min_minutes, grace_min, days_mask, from_min, to_min, priority)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`, ...v).lastInsertRowid);
  }
  run(
    `UPDATE rates SET zone_id=?, name=?, hourly_paise=?, extra_controller_paise=?, increment_min=?, min_minutes=?, grace_min=?, days_mask=?, from_min=?, to_min=?, priority=?
     WHERE id=? AND active = 1`, ...v, r.id);
  return r.id;
}

export const archiveRate = (id: number): void => void run("UPDATE rates SET active = 0 WHERE id = ?", id);

// ---- packages ----
export const listPackages = (): PackageRow[] =>
  all<PackageRow>("SELECT id, zone_id AS zoneId, name, minutes, price_paise AS pricePaise FROM packages WHERE active = 1 ORDER BY zone_id, minutes");

export const getPackage = (id: number): PackageRow | undefined =>
  get<PackageRow>("SELECT id, zone_id AS zoneId, name, minutes, price_paise AS pricePaise FROM packages WHERE id = ? AND active = 1", id);

export function savePackage(p: Omit<PackageRow, "id"> & { id?: number }): number {
  if (!get("SELECT 1 AS x FROM zones WHERE id = ? AND active = 1", p.zoneId)) throw new UserError("Zone not found");
  if (p.id === undefined) {
    return Number(run("INSERT INTO packages (zone_id, name, minutes, price_paise) VALUES (?,?,?,?)", p.zoneId, p.name, p.minutes, p.pricePaise).lastInsertRowid);
  }
  run("UPDATE packages SET zone_id=?, name=?, minutes=?, price_paise=? WHERE id=? AND active = 1", p.zoneId, p.name, p.minutes, p.pricePaise, p.id);
  return p.id;
}

export const archivePackage = (id: number): void => void run("UPDATE packages SET active = 0 WHERE id = ?", id);
```

**`lib/db/seed.ts`**

```typescript
import { get, run, tx } from "./index.ts";

/** Level 9's starting zones and rates (from its WhatsApp rate card). Only runs on an empty catalog. */
export function seedLevel9Starter(): void {
  tx(() => {
    if (get("SELECT 1 AS x FROM zones")) return;
    const starter = [
      { zone: "Pool Tables", kind: "pool", station: "Pool 1", rupees: 150 },
      { zone: "PS5 Zone", kind: "ps5", station: "PS5 1", rupees: 150 },
      { zone: "PC Gaming", kind: "pc", station: "PC 1", rupees: 130 },
      { zone: "Sim Racing", kind: "sim", station: "Sim 1", rupees: 150 },
    ];
    starter.forEach((s, i) => {
      const zoneId = Number(run("INSERT INTO zones (name, kind, sort) VALUES (?, ?, ?)", s.zone, s.kind, i + 1).lastInsertRowid);
      run("INSERT INTO stations (zone_id, name, sort) VALUES (?, ?, ?)", zoneId, s.station, i + 1);
      run("INSERT INTO rates (zone_id, name, hourly_paise) VALUES (?, 'Standard', ?)", zoneId, s.rupees * 100);
    });
  });
}
```

**`lib/db/customers.ts`**

```typescript
import { all, run } from "./index.ts";
import { normalizePhone } from "../phone.ts";
import { UserError } from "../errors.ts";

export type Customer = { id: number; name: string; phone: string | null; whatsappConsent: boolean };
type Raw = Omit<Customer, "whatsappConsent"> & { whatsappConsent: number };
const toCustomer = (r: Raw): Customer => ({ ...r, whatsappConsent: r.whatsappConsent === 1 });

export function searchCustomers(q: string, limit = 8): Customer[] {
  const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
  return all<Raw>(
    `SELECT id, name, phone, whatsapp_consent AS whatsappConsent FROM customers
     WHERE name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' ORDER BY name LIMIT ?`,
    like, like, limit,
  ).map(toCustomer);
}

export function createCustomer(name: string, phoneRaw: string, consent: boolean, defaultCc = "91", now = Date.now()): number {
  let phone: string | null = null;
  if (phoneRaw.trim()) {
    phone = normalizePhone(phoneRaw, defaultCc);
    if (!phone) throw new UserError("That phone number doesn't look right");
  }
  if (consent && !phone) throw new UserError("Add a phone number to record WhatsApp consent");
  return Number(
    run("INSERT INTO customers (name, phone, whatsapp_consent, created_at) VALUES (?, ?, ?, ?)", name, phone, consent ? 1 : 0, now).lastInsertRowid,
  );
}
```

**`lib/db/sessions.ts`**

```typescript
import { all, get, run, tx, audit } from "./index.ts";
import { UserError } from "../errors.ts";
import { pickRate } from "../engine/rates.ts";
import { prepaidMinutes } from "../engine/pricing.ts";
import type { RateSnapshot } from "../engine/pricing.ts";
import type { PaymentMethod } from "../engine/bill.ts";
import { listRates, getPackage } from "./catalog.ts";

export type SessionMode = "open" | "fixed" | "prepaid";

export type SessionRow = {
  id: number;
  stationId: number;
  customerId: number | null;
  staffId: string;
  mode: SessionMode;
  startedAt: number;
  plannedMinutes: number | null;
  advancePaise: number;
  advanceMethod: PaymentMethod | null;
  players: number;
  pausedAt: number | null;
  pausedTotalMs: number;
  endedAt: number | null;
  notes: string;
  billed: boolean;
  rate: RateSnapshot;
};

const COLS = `s.id, s.station_id AS stationId, s.customer_id AS customerId, s.staff_id AS staffId, s.mode,
  s.started_at AS startedAt, s.planned_minutes AS plannedMinutes, s.advance_paise AS advancePaise,
  s.advance_method AS advanceMethod, s.players, s.paused_at AS pausedAt, s.paused_total_ms AS pausedTotalMs,
  s.ended_at AS endedAt, s.notes, s.billed, s.rate_json AS rateJson`;

type Raw = Omit<SessionRow, "rate" | "billed"> & { billed: number; rateJson: string };
const toSession = ({ rateJson, billed, ...r }: Raw): SessionRow => ({ ...r, billed: billed === 1, rate: JSON.parse(rateJson) });

export function getSession(id: number): SessionRow {
  const r = get<Raw>(`SELECT ${COLS} FROM sessions s WHERE s.id = ?`, id);
  if (!r) throw new UserError("Session not found");
  return toSession(r);
}

/** Session that can still change: not ended, not billed. */
function live(id: number): SessionRow {
  const s = getSession(id);
  if (s.billed) throw new UserError("This session is already billed");
  if (s.endedAt !== null) throw new UserError("This session has already been stopped");
  return s;
}

export type StartInput = {
  stationId: number;
  staffId: string;
  mode: SessionMode;
  plannedMinutes?: number;
  packageId?: number;
  advancePaise?: number;
  advanceMethod?: PaymentMethod;
  players: number;
  customerId?: number | null;
  now: number;
};

export function startSession(i: StartInput): number {
  return tx(() => {
    const st = get<{ id: number; zoneId: number; name: string; maintenance: number; zoneName: string }>(
      `SELECT st.id, st.zone_id AS zoneId, st.name, st.maintenance, z.name AS zoneName
       FROM stations st JOIN zones z ON z.id = st.zone_id
       WHERE st.id = ? AND st.active = 1 AND z.active = 1`,
      i.stationId,
    );
    if (!st) throw new UserError("Station not found");
    if (st.maintenance) throw new UserError(`${st.name} is under maintenance`);
    if (get("SELECT 1 AS x FROM sessions WHERE station_id = ? AND billed = 0", st.id)) {
      throw new UserError(`${st.name} is already in use`);
    }
    if (!Number.isInteger(i.players) || i.players < 1 || i.players > 20) throw new UserError("Players must be between 1 and 20");
    if (i.customerId != null && !get("SELECT 1 AS x FROM customers WHERE id = ?", i.customerId)) {
      throw new UserError("Customer not found");
    }

    const rate = pickRate(listRates(), st.zoneId, new Date(i.now));
    if (!rate) throw new UserError(`No rate is set for ${st.zoneName} right now. Add one in Settings.`);

    let mode = i.mode;
    let planned: number | null = null;
    let packagePaise: number | null = null;
    let advance = 0;
    let advanceMethod: PaymentMethod | null = null;

    if (i.packageId !== undefined) {
      const pkg = getPackage(i.packageId);
      if (!pkg || pkg.zoneId !== st.zoneId) throw new UserError("That package isn't available for this zone");
      mode = "fixed";
      planned = pkg.minutes;
      packagePaise = pkg.pricePaise;
    } else if (mode === "fixed") {
      const m = i.plannedMinutes;
      if (m === undefined || !Number.isInteger(m) || m < 1 || m > 1440) throw new UserError("Choose a duration between 1 and 1440 minutes");
      planned = m;
    } else if (mode === "prepaid") {
      advance = i.advancePaise ?? 0;
      if (!Number.isInteger(advance) || advance <= 0) throw new UserError("Enter the prepaid amount");
      if (!i.advanceMethod) throw new UserError("Choose how the prepaid amount was paid");
      advanceMethod = i.advanceMethod;
      planned = prepaidMinutes(advance, rate.hourlyPaise);
      if (planned < 1) throw new UserError("That amount is too small for this rate");
    }

    const snap: RateSnapshot = {
      rateId: rate.id,
      name: rate.name,
      hourlyPaise: rate.hourlyPaise,
      extraControllerPaise: rate.extraControllerPaise,
      incrementMin: rate.incrementMin,
      minMinutes: rate.minMinutes,
      graceMin: rate.graceMin,
      packagePaise,
    };
    const id = Number(
      run(
        `INSERT INTO sessions (station_id, customer_id, staff_id, mode, started_at, planned_minutes,
                               advance_paise, advance_method, players, rate_json)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        st.id, i.customerId ?? null, i.staffId, mode, i.now, planned, advance, advanceMethod, i.players, JSON.stringify(snap),
      ).lastInsertRowid,
    );
    audit(i.staffId, "session.start", `${st.name} ${mode}`, i.now);
    return id;
  });
}

export function pauseSession(id: number, now: number): void {
  const s = live(id);
  if (s.pausedAt !== null) return;
  run("UPDATE sessions SET paused_at = ? WHERE id = ?", Math.max(now, s.startedAt), id);
}

export function resumeSession(id: number, now: number): void {
  const s = live(id);
  if (s.pausedAt === null) return;
  run("UPDATE sessions SET paused_total_ms = paused_total_ms + ?, paused_at = NULL WHERE id = ?", Math.max(0, now - s.pausedAt), id);
}

export function extendSession(id: number, minutes: number): void {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new UserError("Extend by 1 to 1440 minutes");
  const s = live(id);
  if (s.plannedMinutes === null) throw new UserError("Open sessions have no end time to extend");
  if (s.rate.packagePaise !== null) {
    throw new UserError("Package sessions can't be extended. Time past the package is billed at the hourly rate.");
  }
  run("UPDATE sessions SET planned_minutes = planned_minutes + ? WHERE id = ?", minutes, id);
}

export function transferSession(id: number, toStationId: number, staffId: string, now: number): void {
  tx(() => {
    const s = live(id);
    const from = get<{ zoneId: number; name: string }>("SELECT zone_id AS zoneId, name FROM stations WHERE id = ?", s.stationId);
    const to = get<{ zoneId: number; name: string; maintenance: number }>(
      "SELECT zone_id AS zoneId, name, maintenance FROM stations WHERE id = ? AND active = 1",
      toStationId,
    );
    if (!from || !to) throw new UserError("Station not found");
    if (from.zoneId !== to.zoneId) throw new UserError("Sessions can only move to a station in the same zone");
    if (to.maintenance) throw new UserError(`${to.name} is under maintenance`);
    if (get("SELECT 1 AS x FROM sessions WHERE station_id = ? AND billed = 0", toStationId)) {
      throw new UserError(`${to.name} is already in use`);
    }
    run("UPDATE sessions SET station_id = ? WHERE id = ?", toStationId, id);
    audit(staffId, "session.transfer", `${from.name} -> ${to.name}`, now);
  });
}

export function stopSession(id: number, now: number): void {
  tx(() => {
    const s = getSession(id);
    if (s.billed) throw new UserError("This session is already billed");
    if (s.endedAt !== null) return; // double-click safe
    const pausedTotal = s.pausedTotalMs + (s.pausedAt !== null ? Math.max(0, now - s.pausedAt) : 0);
    run("UPDATE sessions SET ended_at = ?, paused_at = NULL, paused_total_ms = ? WHERE id = ?", Math.max(now, s.startedAt), pausedTotal, id);
  });
}

/** Undo a mistaken Stop before the bill is paid. The gap counts as a pause, so it isn't billed. */
export function reopenSession(id: number, now: number): void {
  tx(() => {
    const s = getSession(id);
    if (s.billed) throw new UserError("This session is already billed");
    if (s.endedAt === null) return;
    run("UPDATE sessions SET paused_total_ms = paused_total_ms + ?, ended_at = NULL WHERE id = ?", Math.max(0, now - s.endedAt), id);
  });
}

export function setNotes(id: number, notes: string): void {
  const s = getSession(id);
  if (s.billed) throw new UserError("This session is already billed");
  run("UPDATE sessions SET notes = ? WHERE id = ?", notes, id);
}

// ---- items (food and extras on the tab) ----
export type SessionItem = { id: number; name: string; qty: number; unitPaise: number };

export const listItems = (sessionId: number): SessionItem[] =>
  all<SessionItem>("SELECT id, name, qty, unit_paise AS unitPaise FROM session_items WHERE session_id = ? ORDER BY id", sessionId);

export function addItem(sessionId: number, name: string, qty: number, unitPaise: number, now: number): void {
  const s = getSession(sessionId);
  if (s.billed) throw new UserError("This session is already billed");
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new UserError("Quantity must be between 1 and 99");
  if (!Number.isInteger(unitPaise) || unitPaise < 0) throw new UserError("Price is not valid");
  run("INSERT INTO session_items (session_id, name, qty, unit_paise, created_at) VALUES (?,?,?,?,?)", sessionId, name, qty, unitPaise, now);
}

export function removeItem(itemId: number): void {
  const it = get<{ sessionId: number }>("SELECT session_id AS sessionId FROM session_items WHERE id = ?", itemId);
  if (!it) return;
  if (getSession(it.sessionId).billed) throw new UserError("This session is already billed");
  run("DELETE FROM session_items WHERE id = ?", itemId);
}

// ---- floor board ----
export type BoardSession = SessionRow & { customerName: string | null; itemsPaise: number; items: SessionItem[] };
export type BoardStation = { id: number; name: string; maintenance: boolean; session: BoardSession | null };
export type BoardZone = { id: number; name: string; kind: string; stations: BoardStation[] };

export function listBoard(): BoardZone[] {
  const zones = all<{ id: number; name: string; kind: string }>("SELECT id, name, kind FROM zones WHERE active = 1 ORDER BY sort, id");
  const stations = all<{ id: number; zoneId: number; name: string; maintenance: number }>(
    "SELECT id, zone_id AS zoneId, name, maintenance FROM stations WHERE active = 1 ORDER BY sort, id",
  );
  const sessions = all<Raw & { customerName: string | null }>(
    `SELECT ${COLS}, c.name AS customerName
     FROM sessions s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.billed = 0`,
  );
  const items = all<SessionItem & { sessionId: number }>(
    `SELECT i.id, i.session_id AS sessionId, i.name, i.qty, i.unit_paise AS unitPaise
     FROM session_items i JOIN sessions s ON s.id = i.session_id WHERE s.billed = 0 ORDER BY i.id`,
  );
  const byStation = new Map<number, BoardSession>();
  for (const r of sessions) {
    const { customerName, ...raw } = r;
    const mine = items.filter((i) => i.sessionId === r.id).map(({ id, name, qty, unitPaise }) => ({ id, name, qty, unitPaise }));
    byStation.set(r.stationId, {
      ...toSession(raw),
      customerName,
      items: mine,
      itemsPaise: mine.reduce((sum, i) => sum + i.qty * i.unitPaise, 0),
    });
  }
  return zones.map((z) => ({
    ...z,
    stations: stations
      .filter((s) => s.zoneId === z.id)
      .map((s) => ({ id: s.id, name: s.name, maintenance: s.maintenance === 1, session: byStation.get(s.id) ?? null })),
  }));
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: `ℹ tests 45`, `ℹ fail 0` (29 + 15 sessions + 1 persist).

- [ ] **Step 5: Prove the tests can fail (mutation check)**

Temporarily change `Math.ceil` to `Math.floor` inside `chargedMinutes` in `lib/engine/pricing.ts`, run `npm test`, confirm at least one failure, then revert the change and confirm `fail 0` again. (Skipping this check is how a test suite that cannot fail slips in.)

- [ ] **Step 6: Commit**

```bash
git add lib tests
git commit -m "Add SQLite layer: migrations, settings, catalog, customers and sessions" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Billing

**Files:**
- Create: `lib/db/bills.ts`
- Test: `tests/bills.test.ts`

**Interfaces:**
- Consumes: Task 4 (`getSession`, `listItems`, `getSetting`, `tx`, `audit`, `run`, `get`, `all`), Task 2 (`computeBill`, `validatePayments`, `sessionChargePaise`, `chargedMinutes`, `billableMs`).
- Produces: `buildDraft(sessionId, now): Draft`; `finalizeBill({sessionId, staffId, role, discount, discountReason, payments, now}): {billId, invoiceNo, refundPaise}`; `voidBill(billId, reason, userId, role, now)`; `listBills(limit?, offset?)`; `getBill(id): BillDetail | undefined`.
- Rules it enforces: a session is billed once; the bill needs payments summing exactly to the total (a prepaid advance is added automatically and capped at the total, any excess is reported as `refundPaise`); a discount needs a reason; staff are capped at `staff.maxDiscountPct`; only the owner voids; invoice numbers are sequential; the whole finalise is one transaction.

- [ ] **Step 1: Write the failing test**

**`tests/bills.test.ts`**

```typescript
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshDb, station, MIN, T0 } from "./helpers.ts";
import { startSession, stopSession, addItem, getSession } from "../lib/db/sessions.ts";
import { buildDraft, finalizeBill, voidBill, getBill, listBills } from "../lib/db/bills.ts";
import { setSettings } from "../lib/db/settings.ts";
import { savePackage, listZones } from "../lib/db/catalog.ts";
import { all, run } from "../lib/db/index.ts";

beforeEach(freshDb);

const begin = (kind: string, over: Record<string, unknown> = {}) =>
  startSession({ stationId: station(kind), staffId: "u1", mode: "open", players: 1, now: T0, ...over });

const pay = (id: number, amountPaise: number, over: Record<string, unknown> = {}) =>
  finalizeBill({
    sessionId: id, staffId: "u1", role: "owner", discount: null, discountReason: "",
    payments: [{ method: "cash", amountPaise }], now: T0 + 90 * MIN, ...over,
  });

test("full flow: play, add item, stop, pay; invoice numbers are sequential; station frees up", () => {
  const id = begin("ps5");
  addItem(id, "Coke", 2, 4000, T0);
  stopSession(id, T0 + 65 * MIN);
  const draft = buildDraft(id, T0 + 65 * MIN);
  assert.equal(draft.lines[0].unitPaise, 16250); // 65 min at 150/hr
  assert.equal(draft.lines.length, 2);

  const r = pay(id, 16250 + 8000);
  assert.equal(r.invoiceNo, 1);
  assert.equal(getSession(id).billed, true);

  const again = begin("ps5", { now: T0 + 100 * MIN });
  stopSession(again, T0 + 130 * MIN);
  assert.equal(pay(again, 7500).invoiceNo, 2);
});

test("billing twice is refused and leaves exactly one bill", () => {
  const id = begin("pool");
  stopSession(id, T0 + 60 * MIN);
  pay(id, 15000);
  assert.throws(() => pay(id, 15000), /already billed/);
  assert.equal(listBills().length, 1);
});

test("can't bill a running session", () => {
  const id = begin("pool");
  assert.throws(() => pay(id, 15000), /Stop the session/);
});

test("payments that don't match the total are refused and nothing is written", () => {
  const id = begin("pool");
  stopSession(id, T0 + 60 * MIN);
  assert.throws(() => pay(id, 14999), /add up/);
  assert.throws(() => finalizeBill({ sessionId: id, staffId: "u1", role: "owner", discount: null, discountReason: "", payments: [], now: T0 }), /at least one/);
  assert.equal(listBills().length, 0);
  assert.equal(getSession(id).billed, false);
  assert.equal(all("SELECT * FROM payments").length, 0);
});

test("mixed payments on one bill", () => {
  const id = begin("pool");
  stopSession(id, T0 + 60 * MIN);
  const r = finalizeBill({
    sessionId: id, staffId: "u1", role: "owner", discount: null, discountReason: "",
    payments: [{ method: "cash", amountPaise: 5000 }, { method: "upi", amountPaise: 10000 }], now: T0,
  });
  assert.deepEqual(getBill(r.billId)!.payments, [{ method: "cash", amountPaise: 5000 }, { method: "upi", amountPaise: 10000 }]);
});

test("discount needs a reason; staff are capped, the owner is not", () => {
  const id = begin("pool");
  stopSession(id, T0 + 60 * MIN); // 15000
  assert.throws(() => pay(id, 13500, { discount: { type: "percent", value: 10 } }), /reason/);
  assert.throws(() => pay(id, 12000, { role: "staff", discount: { type: "percent", value: 20 }, discountReason: "regular" }), /at most 10%/);
  assert.equal(listBills().length, 0);
  const ok = pay(id, 13500, { role: "staff", discount: { type: "percent", value: 10 }, discountReason: "regular" });
  const b = getBill(ok.billId)!;
  assert.equal(b.discountPaise, 1500);
  assert.equal(b.totalPaise, 13500);
  assert.equal(b.discountReason, "regular");

  const id2 = begin("pool", { now: T0 + 200 * MIN });
  stopSession(id2, T0 + 260 * MIN);
  const owner = pay(id2, 7500, { role: "owner", discount: { type: "percent", value: 50 }, discountReason: "owner's friend" });
  assert.equal(getBill(owner.billId)!.totalPaise, 7500);
});

test("prepaid: advance is applied automatically; early finish refunds, overrun collects the rest", () => {
  const early = begin("ps5", { mode: "prepaid", advancePaise: 15000, advanceMethod: "upi" });
  stopSession(early, T0 + 40 * MIN); // 40 min = 10000
  const r1 = finalizeBill({ sessionId: early, staffId: "u1", role: "owner", discount: null, discountReason: "", payments: [], now: T0 });
  assert.equal(r1.refundPaise, 5000);
  assert.deepEqual(getBill(r1.billId)!.payments, [{ method: "upi", amountPaise: 10000 }]);

  const long = begin("ps5", { mode: "prepaid", advancePaise: 15000, advanceMethod: "cash", now: T0 + 100 * MIN });
  stopSession(long, T0 + 190 * MIN); // 90 min = 22500, 7500 still due
  assert.throws(() => finalizeBill({ sessionId: long, staffId: "u1", role: "owner", discount: null, discountReason: "", payments: [], now: T0 }), /add up/);
  const r2 = finalizeBill({
    sessionId: long, staffId: "u1", role: "owner", discount: null, discountReason: "",
    payments: [{ method: "card", amountPaise: 7500 }], now: T0,
  });
  assert.equal(r2.refundPaise, 0);
  assert.equal(getBill(r2.billId)!.payments.length, 2);
});

test("package: pays the package price, overtime at the hourly rate", () => {
  const zoneId = listZones().find((z) => z.kind === "ps5")!.id;
  const pkg = savePackage({ zoneId, name: "Hour deal", minutes: 60, pricePaise: 10000 });
  const id = begin("ps5", { packageId: pkg });
  stopSession(id, T0 + 75 * MIN);
  const d = buildDraft(id, T0 + 75 * MIN);
  assert.equal(d.lines[0].unitPaise, 13750);
  assert.match(d.lines[0].name, /60 min package/);
});

test("GST on: tax breakup is recorded, total unchanged (inclusive)", () => {
  setSettings({ "gst.enabled": "1", "gst.pct": "18" });
  const id = begin("pc");
  stopSession(id, T0 + 60 * MIN); // 13000 incl.
  const r = pay(id, 13000);
  const b = getBill(r.billId)!;
  assert.equal(b.totalPaise, 13000);
  assert.equal(b.taxPaise, 1983); // 13000 * 18 / 118
  assert.equal(b.lines[0].taxPct, 18);
});

test("zero-value session (grace) can be closed with no payments", () => {
  run("UPDATE rates SET grace_min = 5");
  const id = begin("pool");
  stopSession(id, T0 + 2 * MIN);
  const r = finalizeBill({ sessionId: id, staffId: "u1", role: "staff", discount: null, discountReason: "", payments: [], now: T0 });
  assert.equal(getBill(r.billId)!.totalPaise, 0);
});

test("void: owner only, reason required, once; writes the audit log", () => {
  const id = begin("pool");
  stopSession(id, T0 + 60 * MIN);
  const { billId } = pay(id, 15000);
  assert.throws(() => voidBill(billId, "oops", "u2", "staff", T0), /Only the owner/);
  assert.throws(() => voidBill(billId, "  ", "u1", "owner", T0), /reason/);
  voidBill(billId, "wrong station", "u1", "owner", T0);
  assert.equal(getBill(billId)!.status, "void");
  assert.throws(() => voidBill(billId, "again", "u1", "owner", T0), /already void/);
  const actions = all<{ action: string }>("SELECT action FROM audit_log ORDER BY id").map((a) => a.action);
  assert.deepEqual(actions, ["session.start", "bill.create", "bill.void"]);
});

test("listBills and getBill return the joined details", () => {
  const id = begin("pool");
  stopSession(id, T0 + 60 * MIN);
  const { billId } = pay(id, 15000);
  const [row] = listBills();
  assert.equal(row.stationName, "Pool 1");
  assert.equal(row.status, "paid");
  assert.equal(getBill(billId)!.lines[0].name, "Pool 1 - 60 min");
  assert.equal(getBill(99999), undefined);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: `bills.test.ts` FAILS with `Cannot find module` for `lib/db/bills.ts`.

- [ ] **Step 3: Write the billing layer**

**`lib/db/bills.ts`**

```typescript
import { all, get, run, tx, audit } from "./index.ts";
import { UserError } from "../errors.ts";
import { billableMs, chargedMinutes, sessionChargePaise } from "../engine/pricing.ts";
import { computeBill, validatePayments } from "../engine/bill.ts";
import type { BillLineInput, Discount, PaymentInput, PaymentMethod } from "../engine/bill.ts";
import { getSession, listItems } from "./sessions.ts";
import type { SessionRow } from "./sessions.ts";
import { getSetting } from "./settings.ts";

export type Draft = {
  session: SessionRow;
  stationName: string;
  customerName: string | null;
  playedMs: number;
  lines: BillLineInput[];
};

/** What the bill would be right now. For a stopped session this is final; for a running one it is a preview. */
export function buildDraft(sessionId: number, now: number): Draft {
  const session = getSession(sessionId);
  const st = get<{ name: string }>("SELECT name FROM stations WHERE id = ?", session.stationId);
  const cust = session.customerId
    ? get<{ name: string }>("SELECT name FROM customers WHERE id = ?", session.customerId)
    : undefined;
  const playedMs = billableMs(session, now);
  const taxPct = getSetting("gst.enabled") === "1" ? Number(getSetting("gst.pct")) : 0;

  const charge = sessionChargePaise(playedMs, session.rate, session.players, session.plannedMinutes);
  const label =
    session.rate.packagePaise !== null
      ? `${st?.name ?? "Station"} - ${session.plannedMinutes} min package`
      : `${st?.name ?? "Station"} - ${chargedMinutes(playedMs, session.rate)} min`;

  const lines: BillLineInput[] = [{ kind: "session", name: label, qty: 1, unitPaise: charge, taxPct }];
  for (const it of listItems(sessionId)) {
    lines.push({ kind: "item", name: it.name, qty: it.qty, unitPaise: it.unitPaise, taxPct });
  }
  return { session, stationName: st?.name ?? "Station", customerName: cust?.name ?? null, playedMs, lines };
}

export type FinalizeInput = {
  sessionId: number;
  staffId: string;
  role: "owner" | "staff";
  discount: Discount;
  discountReason: string;
  payments: PaymentInput[]; // collected now; any prepaid advance is added automatically
  now: number;
};

export function finalizeBill(i: FinalizeInput): { billId: number; invoiceNo: number; refundPaise: number } {
  return tx(() => {
    const s = getSession(i.sessionId);
    if (s.billed) throw new UserError("This session is already billed");
    if (s.endedAt === null) throw new UserError("Stop the session before billing it");

    const draft = buildDraft(i.sessionId, s.endedAt);
    const totals = computeBill(draft.lines, i.discount);

    if (totals.discountPaise > 0) {
      if (!i.discountReason.trim()) throw new UserError("Give a reason for the discount");
      if (i.role === "staff") {
        const maxPct = Number(getSetting("staff.maxDiscountPct"));
        if (totals.discountPaise * 100 > totals.subtotalPaise * maxPct) {
          throw new UserError(`Staff can give at most ${maxPct}% discount. Ask the owner.`);
        }
      }
    }

    const advanceApplied = s.advanceMethod ? Math.min(s.advancePaise, totals.totalPaise) : 0;
    const refundPaise = s.advancePaise - advanceApplied;
    const all_: PaymentInput[] = [
      ...(advanceApplied > 0 && s.advanceMethod ? [{ method: s.advanceMethod, amountPaise: advanceApplied }] : []),
      ...i.payments,
    ];
    const bad = validatePayments(totals.totalPaise, all_);
    if (bad) throw new UserError(bad);

    const invoiceNo = (get<{ n: number }>("SELECT COALESCE(MAX(invoice_no), 0) + 1 AS n FROM bills")?.n) ?? 1;
    const billId = Number(
      run(
        `INSERT INTO bills (invoice_no, session_id, customer_id, staff_id, subtotal_paise, discount_paise, discount_reason,
                            tax_paise, total_paise, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        invoiceNo, s.id, s.customerId, i.staffId, totals.subtotalPaise, totals.discountPaise, i.discountReason.trim(),
        totals.taxPaise, totals.totalPaise, i.now,
      ).lastInsertRowid,
    );
    for (const l of draft.lines) {
      run("INSERT INTO bill_lines (bill_id, kind, name, qty, unit_paise, tax_pct) VALUES (?,?,?,?,?,?)", billId, l.kind, l.name, l.qty, l.unitPaise, l.taxPct);
    }
    for (const p of all_) run("INSERT INTO payments (bill_id, method, amount_paise) VALUES (?,?,?)", billId, p.method, p.amountPaise);
    run("UPDATE sessions SET billed = 1 WHERE id = ?", s.id);
    audit(i.staffId, "bill.create", `INV-${invoiceNo} total ${totals.totalPaise}${refundPaise ? ` refund ${refundPaise}` : ""}`, i.now);
    return { billId, invoiceNo, refundPaise };
  });
}

export function voidBill(billId: number, reason: string, userId: string, role: "owner" | "staff", now: number): void {
  if (role !== "owner") throw new UserError("Only the owner can void a bill");
  if (!reason.trim()) throw new UserError("Give a reason for voiding this bill");
  tx(() => {
    const b = get<{ status: string; invoiceNo: number }>("SELECT status, invoice_no AS invoiceNo FROM bills WHERE id = ?", billId);
    if (!b) throw new UserError("Bill not found");
    if (b.status === "void") throw new UserError("This bill is already void");
    run("UPDATE bills SET status = 'void', void_reason = ?, voided_by = ? WHERE id = ?", reason.trim(), userId, billId);
    audit(userId, "bill.void", `INV-${b.invoiceNo}: ${reason.trim()}`, now);
  });
}

export type BillSummary = {
  id: number;
  invoiceNo: number;
  totalPaise: number;
  status: "paid" | "void";
  createdAt: number;
  stationName: string | null;
  customerName: string | null;
};

export const listBills = (limit = 50, offset = 0): BillSummary[] =>
  all<BillSummary>(
    `SELECT b.id, b.invoice_no AS invoiceNo, b.total_paise AS totalPaise, b.status, b.created_at AS createdAt,
            st.name AS stationName, c.name AS customerName
     FROM bills b
     LEFT JOIN sessions s ON s.id = b.session_id
     LEFT JOIN stations st ON st.id = s.station_id
     LEFT JOIN customers c ON c.id = b.customer_id
     ORDER BY b.id DESC LIMIT ? OFFSET ?`,
    limit, offset,
  );

export type BillDetail = BillSummary & {
  subtotalPaise: number;
  discountPaise: number;
  discountReason: string;
  taxPaise: number;
  voidReason: string | null;
  staffId: string;
  lines: { kind: string; name: string; qty: number; unitPaise: number; taxPct: number }[];
  payments: { method: PaymentMethod; amountPaise: number }[];
};

export function getBill(id: number): BillDetail | undefined {
  const b = billRow(id);
  if (!b) return undefined;
  return {
    ...b,
    lines: all("SELECT kind, name, qty, unit_paise AS unitPaise, tax_pct AS taxPct FROM bill_lines WHERE bill_id = ? ORDER BY id", id),
    payments: all("SELECT method, amount_paise AS amountPaise FROM payments WHERE bill_id = ? ORDER BY id", id),
  };
}

function billRow(id: number) {
  return get<Omit<BillDetail, "lines" | "payments">>(
    `SELECT b.id, b.invoice_no AS invoiceNo, b.total_paise AS totalPaise, b.status, b.created_at AS createdAt,
            st.name AS stationName, c.name AS customerName, b.subtotal_paise AS subtotalPaise,
            b.discount_paise AS discountPaise, b.discount_reason AS discountReason, b.tax_paise AS taxPaise,
            b.void_reason AS voidReason, b.staff_id AS staffId
     FROM bills b
     LEFT JOIN sessions s ON s.id = b.session_id
     LEFT JOIN stations st ON st.id = s.station_id
     LEFT JOIN customers c ON c.id = b.customer_id
     WHERE b.id = ?`,
    id,
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: `ℹ tests 57`, `ℹ fail 0`.

- [ ] **Step 5: Mutation check**

Delete the line `if (bad) throw new UserError(bad);` in `finalizeBill`, run `npm test`, confirm the "payments that don't match the total" and "prepaid" tests fail, restore the line, confirm `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add lib/db/bills.ts tests/bills.test.ts
git commit -m "Add billing: drafts, atomic finalise, discounts, advances and voids" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Auth core (Better Auth, PINs, lockout)

**Files:**
- Create: `lib/auth-core.ts`, `lib/lockout.ts`
- Test: `tests/auth.test.ts`

**Interfaces:**
- Consumes: Task 3 (`UserError`), Task 4 (`getDb`).
- Produces:
  - `auth-core.ts`: `makeAuth({db, secret, baseURL, plugins?}) → { auth, internalHeaders(base?) }`; `migrateAuth(opts)` (create Better Auth's tables; **must run before** `makeAuth`); `createUser(made, {username, pin, name, role})` (returns the user id; throws `UserError` with Better Auth's message on duplicates or bad input); `hasAnyUser()`; `listStaff()`; `setPin(made, userId, pin)` (also signs that person out); `removeUser(made, userId)`; `applyPinResetFile(made, file)`; types `Role`, `StaffRow`, `Made`.
  - `lockout.ts`: `makeLockout(maxFails=5, windowMs=60000, now?)` → `{ wait(key): seconds, fail(key), clear(key) }`.
- Design notes: usernames are the login name, the PIN is the password (4 to 12 characters at the library, 4 to 8 digits at our forms). Browser requests to `/sign-in/*` and `/sign-up/email` are refused with 403; our own code passes an internal header, so every login goes through our lockout. The role is stored in a `user.role` column (`owner` or `staff`).

- [ ] **Step 1: Write the failing test**

**`tests/auth.test.ts`**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { makeAuth, migrateAuth, createUser, hasAnyUser, listStaff, setPin, removeUser, applyPinResetFile } from "../lib/auth-core.ts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeLockout } from "../lib/lockout.ts";
import { UserError } from "../lib/errors.ts";
import { closeDb, getDb } from "../lib/db/index.ts";

async function setup() {
  process.env.LOUNGE_DB = ":memory:";
  closeDb();
  const db = getDb();
  const opts = { db: db as DatabaseSync, secret: crypto.randomBytes(32).toString("hex"), baseURL: "http://127.0.0.1:3000" };
  await migrateAuth(opts);
  return makeAuth(opts);
}

const post = (m: Awaited<ReturnType<typeof setup>>, path: string, body: unknown, headers: Record<string, string> = {}) =>
  m.auth.handler(new Request(`http://127.0.0.1:3000/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000", ...headers },
    body: JSON.stringify(body),
  }));

test("owner can sign in with username + PIN and the session carries the role", async () => {
  const m = await setup();
  assert.equal(hasAnyUser(), false);
  await createUser(m, { username: "owner", pin: "4821", name: "Owner", role: "owner" });
  assert.equal(hasAnyUser(), true);

  const res = await m.auth.api.signInUsername({
    body: { username: "owner", password: "4821" }, headers: m.internalHeaders(), asResponse: true,
  });
  assert.equal(res.status, 200);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  assert.match(res.headers.getSetCookie().join(";"), /HttpOnly/i);
  const session = await m.auth.api.getSession({ headers: new Headers({ cookie }) });
  assert.equal((session?.user as { username?: string }).username, "owner");
  assert.equal((session?.user as { role?: string }).role, "owner");
});

test("sign-in and sign-up straight from the browser are refused", async () => {
  const m = await setup();
  await createUser(m, { username: "owner", pin: "4821", name: "Owner", role: "owner" });
  assert.equal((await post(m, "/sign-in/username", { username: "owner", password: "4821" })).status, 403);
  assert.equal((await post(m, "/sign-in/email", { email: "owner@lounge.invalid", password: "4821" })).status, 403);
  assert.equal((await post(m, "/sign-up/email", { name: "x", email: "x@y.com", password: "1234", username: "evil" })).status, 403);
  assert.equal(getDb().prepare("SELECT count(*) AS n FROM user").get()!.n, 1);
});

test("wrong PIN fails; staff default to the staff role; duplicate usernames rejected", async () => {
  const m = await setup();
  await createUser(m, { username: "owner", pin: "4821", name: "Owner", role: "owner" });
  const sid = await createUser(m, { username: "counter", pin: "1234", name: "Counter", role: "staff" });
  assert.ok(sid);
  await assert.rejects(m.auth.api.signInUsername({ body: { username: "owner", password: "0000" }, headers: m.internalHeaders() }));
  await assert.rejects(createUser(m, { username: "counter", pin: "9999", name: "Dup", role: "staff" }), UserError);
  const row = getDb().prepare("SELECT role FROM user WHERE username = 'counter'").get() as { role: string };
  assert.equal(row.role, "staff");
});

test("PIN length limits come from the auth config", async () => {
  const m = await setup();
  await assert.rejects(createUser(m, { username: "a", pin: "123", name: "A", role: "staff" }));
  await assert.rejects(createUser(m, { username: "b", pin: "1".repeat(13), name: "B", role: "staff" }));
});

test("lockout: 5 misses lock for the window, success clears, window expires", () => {
  let t = 1_000_000;
  const l = makeLockout(5, 60_000, () => t);
  for (let i = 0; i < 4; i++) l.fail("owner");
  assert.equal(l.wait("owner"), 0);
  l.fail("owner");
  assert.ok(l.wait("owner") > 0 && l.wait("owner") <= 60);
  assert.equal(l.wait("someone-else"), 0);
  t += 61_000;
  assert.equal(l.wait("owner"), 0);
  l.fail("owner");
  l.clear("owner");
  for (let i = 0; i < 4; i++) l.fail("owner");
  assert.equal(l.wait("owner"), 0);
});

const signIn = (m: Awaited<ReturnType<typeof setup>>, u: string, p: string) =>
  m.auth.api.signInUsername({ body: { username: u, password: p }, headers: m.internalHeaders() });

test("setPin replaces the PIN and signs the person out; removeUser deletes them", async () => {
  const m = await setup();
  await createUser(m, { username: "owner", pin: "4821", name: "Owner", role: "owner" });
  const id = await createUser(m, { username: "counter", pin: "1234", name: "Counter", role: "staff" });
  const first = await signIn(m, "counter", "1234");
  assert.ok(first.token);
  await setPin(m, id, "9876");
  await assert.rejects(signIn(m, "counter", "1234"));
  assert.ok((await signIn(m, "counter", "9876")).token);
  assert.equal(await m.auth.api.getSession({ headers: new Headers({ authorization: `Bearer ${first.token}` }) }), null);
  assert.deepEqual(listStaff().map((s) => [s.username, s.role]), [["owner", "owner"], ["counter", "staff"]]);
  await removeUser(m, id);
  assert.deepEqual(listStaff().map((s) => s.username), ["owner"]);
  await assert.rejects(setPin(m, id, "12"), /PIN must be/);
});

test("PIN reset file: replaces the oldest owner's PIN once, ignores junk, always deletes the file", async () => {
  const m = await setup();
  await createUser(m, { username: "owner", pin: "4821", name: "Owner", role: "owner" });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pin-"));
  const file = path.join(dir, "reset-owner-pin.txt");
  assert.equal(await applyPinResetFile(m, file), false); // no file
  fs.writeFileSync(file, "abc");
  assert.equal(await applyPinResetFile(m, file), false); // junk
  assert.equal(fs.existsSync(file), false);
  fs.writeFileSync(file, " 7315\n");
  assert.equal(await applyPinResetFile(m, file), true);
  assert.equal(fs.existsSync(file), false);
  await assert.rejects(signIn(m, "owner", "4821"));
  assert.ok((await signIn(m, "owner", "7315")).token);
  fs.rmSync(dir, { recursive: true });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: `auth.test.ts` FAILS with `Cannot find module` for `lib/auth-core.ts`.

- [ ] **Step 3: Write the auth core**

**`lib/auth-core.ts`**

```typescript
import crypto from "node:crypto";
import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { betterAuth } from "better-auth";
import type { BetterAuthPlugin } from "better-auth";
import { username } from "better-auth/plugins";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";
import { getDb } from "./db/index.ts";
import { UserError } from "./errors.ts";

export type Role = "owner" | "staff";
export type AuthOpts = { db: DatabaseSync; secret: string; baseURL: string; plugins?: BetterAuthPlugin[] };

// Sign-up and sign-in only run from our own server code (which adds the internal header),
// never straight from the browser, so every login goes through our lockout.
const GUARDED = new Set(["/sign-up/email", "/sign-in/email", "/sign-in/username"]);

function build(o: AuthOpts, internal: string) {
  return {
    database: o.db,
    secret: o.secret,
    baseURL: o.baseURL,
    trustedOrigins: [o.baseURL, o.baseURL.replace("127.0.0.1", "localhost")],
    emailAndPassword: { enabled: true, autoSignIn: false, minPasswordLength: 4, maxPasswordLength: 12 },
    user: { additionalFields: { role: { type: "string" as const, required: false, defaultValue: "staff", input: false } } },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (GUARDED.has(ctx.path) && ctx.headers?.get("x-lounge-internal") !== internal) {
          throw new APIError("FORBIDDEN", { message: "Not allowed" });
        }
      }),
    },
    plugins: [username(), ...(o.plugins ?? [])],
  };
}

/** Create Better Auth's tables. Run this BEFORE makeAuth, which checks that they exist. */
export async function migrateAuth(o: AuthOpts): Promise<void> {
  const { runMigrations } = await getMigrations(build(o, "migrate-only"));
  await runMigrations();
}

export function makeAuth(o: AuthOpts) {
  const internal = crypto.randomBytes(16).toString("hex");
  const internalHeaders = (base?: Headers) => {
    const h = new Headers(base);
    h.set("x-lounge-internal", internal);
    return h;
  };
  return { auth: betterAuth(build(o, internal)), internalHeaders };
}

export type Made = ReturnType<typeof makeAuth>;

export function hasAnyUser(): boolean {
  return getDb().prepare("SELECT 1 AS x FROM user LIMIT 1").get() !== undefined;
}

export async function createUser(
  m: Made,
  u: { username: string; pin: string; name: string; role: Role },
): Promise<string> {
  try {
    // A variable, not a literal: the username plugin adds a field TypeScript can't see through the plugin list.
    const body = { name: u.name, email: `${u.username}@lounge.invalid`, password: u.pin, username: u.username };
    const res = await m.auth.api.signUpEmail({ body, headers: m.internalHeaders() });
    getDb().prepare("UPDATE user SET role = ? WHERE id = ?").run(u.role, res.user.id);
    return res.user.id;
  } catch (e) {
    const msg = (e as { body?: { message?: string } }).body?.message;
    throw msg ? new UserError(msg) : e; // Better Auth's own wording ("Username is already taken…") is safe to show
  }
}

export type StaffRow = { id: string; name: string; username: string; role: Role };

export function listStaff(): StaffRow[] {
  return getDb()
    .prepare("SELECT id, name, username, role FROM user ORDER BY createdAt, id")
    .all()
    .map((r) => ({ ...r }) as StaffRow);
}

/** Replace a user's PIN. Caller must already have checked the actor is allowed to. */
export async function setPin(m: Made, userId: string, pin: string): Promise<void> {
  if (pin.length < 4 || pin.length > 12) throw new Error("PIN must be 4 to 12 characters");
  const ctx = await m.auth.$context;
  await ctx.internalAdapter.updatePassword(userId, await ctx.password.hash(pin));
  await ctx.internalAdapter.deleteUserSessions(userId); // sign that person out everywhere
}

export async function removeUser(m: Made, userId: string): Promise<void> {
  const ctx = await m.auth.$context;
  await ctx.internalAdapter.deleteUser(userId);
}

/**
 * Forgot-PIN recovery for someone who can touch the laptop: put the new PIN in data/reset-owner-pin.txt
 * and restart. The oldest owner's PIN is replaced and the file is deleted.
 */
export async function applyPinResetFile(m: Made, file: string): Promise<boolean> {
  if (!fs.existsSync(file)) return false;
  const pin = fs.readFileSync(file, "utf8").trim();
  fs.rmSync(file, { force: true });
  if (!/^\d{4,8}$/.test(pin)) return false;
  const owner = getDb().prepare("SELECT id FROM user WHERE role = 'owner' ORDER BY createdAt, id LIMIT 1").get() as { id: string } | undefined;
  if (!owner) return false;
  await setPin(m, owner.id, pin);
  return true;
}
```

**`lib/lockout.ts`**

```typescript
/** Per-name brute-force guard for PIN logins. In memory: a restart clears it, which is fine for one laptop. */
export function makeLockout(maxFails = 5, windowMs = 60_000, now: () => number = Date.now) {
  const fails = new Map<string, number[]>();
  const recent = (key: string): number[] => {
    const t = now();
    const list = (fails.get(key) ?? []).filter((x) => t - x < windowMs);
    fails.set(key, list);
    return list;
  };
  return {
    /** Seconds the caller must wait, or 0 when a try is allowed. */
    wait(key: string): number {
      const list = recent(key);
      return list.length >= maxFails ? Math.ceil((windowMs - (now() - list[0])) / 1000) : 0;
    },
    fail(key: string): void {
      recent(key).push(now());
    },
    clear(key: string): void {
      fails.delete(key);
    },
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: `ℹ tests 64`, `ℹ fail 0`. A line like `WARN [Better Auth]: Invalid password` in the output is expected (a test signs in with a wrong PIN on purpose).

- [ ] **Step 5: Commit**

```bash
git add lib/auth-core.ts lib/lockout.ts tests/auth.test.ts
git commit -m "Add Better Auth core: PIN logins, role column, PIN reset file, lockout" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Server wiring (auth instance, boot, session helpers, proxy, route handlers)

**Files:**
- Create: `lib/logo.ts`, `lib/action.ts`, `lib/auth.ts`, `lib/boot.ts`, `lib/session.ts`, `instrumentation.ts`, `proxy.ts`
- Create: `app/api/auth/[...all]/route.ts`, `app/api/health/route.ts`, `app/api/brand/logo/route.ts`, `app/login/actions.ts`
- Test: `tests/logo.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 4, 6.
- Produces:
  - `lib/action.ts`: `type Result<T>`, `act(fn): Promise<Result<T>>` (turns `UserError` into `{ok:false,error}`; logs anything else and returns a generic message).
  - `lib/auth.ts`: `getAuth(): Made` (one cached instance), `authOpts()`, `port()`.
  - `lib/boot.ts`: `bootServer()` (open DB, create auth tables, apply PIN reset file). Called once by `instrumentation.ts`, skipped during `next build`.
  - `lib/session.ts`: `currentUser()`, `requireUser()` (pages: redirect to `/login`), `requireOwnerPage()`, `actor()` and `ownerActor()` (server actions: throw `UserError`). `Me = {id,name,username,role}`.
  - `lib/logo.ts`: `UPLOAD_NAME`, `MAX_LOGO_BYTES`, `sniffImage(bytes)`, `saveLogo(dir, bytes, previous)`.
  - `app/login/actions.ts`: `loginAction(username, pin)` (lockout, generic "Wrong username or PIN"), `logoutAction()`.
  - `proxy.ts`: Host allow-list (`127.0.0.1:PORT`, `localhost:PORT`, else 421) and a session-cookie gate for everything except `/login`, `/setup`, `/api/auth`, `/api/health`, `/api/brand`, `/brand`.
- **Build-time trap (already handled in these files, do not undo):** `next build` pre-renders GET route handlers and runs page code that touches the database before any dynamic API. So `await connection()` (or `await headers()`) must come **before** any database or `getAuth()` call in route handlers, layouts and `currentUser()`. A build that creates a `data/` folder means this was broken.

- [ ] **Step 1: Write the failing test**

**`tests/logo.test.ts`**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sniffImage, saveLogo, UPLOAD_NAME, MAX_LOGO_BYTES } from "../lib/logo.ts";
import { UserError } from "../lib/errors.ts";

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 1, 2, 3]);
const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const webp = Uint8Array.from([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP"), 1]);

test("sniffImage goes by bytes, not names", () => {
  assert.equal(sniffImage(png), "png");
  assert.equal(sniffImage(jpg), "jpg");
  assert.equal(sniffImage(webp), "webp");
  assert.equal(sniffImage(Buffer.from("<svg onload=alert(1)>")), null);
  assert.equal(sniffImage(Buffer.from("MZ\x90\x00 evil.exe renamed to .png")), null);
  assert.equal(sniffImage(new Uint8Array()), null);
});

test("saveLogo stores a safe file name, replaces the previous upload, rejects junk and big files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logo-"));
  try {
    const first = saveLogo(dir, png, "");
    assert.match(first, UPLOAD_NAME);
    assert.ok(fs.existsSync(path.join(dir, "uploads", first)));
    const second = saveLogo(dir, jpg, first);
    assert.ok(!fs.existsSync(path.join(dir, "uploads", first)));
    assert.ok(fs.existsSync(path.join(dir, "uploads", second)));
    assert.throws(() => saveLogo(dir, Buffer.from("hello"), second), UserError);
    assert.throws(() => saveLogo(dir, new Uint8Array(), second), /Choose an image/);
    assert.throws(() => saveLogo(dir, Uint8Array.from([...png, ...new Uint8Array(MAX_LOGO_BYTES)]), second), /too large/);
    // a hostile "previous" value must not delete anything outside uploads
    const victim = path.join(dir, "keep.txt");
    fs.writeFileSync(victim, "x");
    saveLogo(dir, png, "../keep.txt");
    assert.ok(fs.existsSync(victim));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("UPLOAD_NAME refuses anything that isn't one of our own file names", () => {
  for (const bad of ["../x.png", "logo-zz.png", "logo-0123456789abcdef.svg", "/etc/passwd", "logo-0123456789abcdef.png/../x", ""]) {
    assert.equal(UPLOAD_NAME.test(bad), false, bad);
  }
  assert.equal(UPLOAD_NAME.test("logo-0123456789abcdef.png"), true);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: `logo.test.ts` FAILS with `Cannot find module` for `lib/logo.ts`.

- [ ] **Step 3: Write the logo helper and the server wiring**

**`lib/logo.ts`**

```typescript
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { UserError } from "./errors.ts";

/** The only file names we ever serve from data/uploads, so a setting can never point outside that folder. */
export const UPLOAD_NAME = /^logo-[0-9a-f]{16}\.(png|jpg|webp)$/;
export const MAX_LOGO_BYTES = 900 * 1024;

/** Identify an image by its first bytes, never by the file name the browser claims. */
export function sniffImage(b: Uint8Array): "png" | "jpg" | "webp" | null {
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "webp";
  return null;
}

/** Validate and store a logo; returns the new file name. Deletes the previous upload. */
export function saveLogo(dir: string, bytes: Uint8Array, previous: string): string {
  if (bytes.length === 0) throw new UserError("Choose an image file");
  if (bytes.length > MAX_LOGO_BYTES) throw new UserError("That image is too large (max 900 KB)");
  const ext = sniffImage(bytes);
  if (!ext) throw new UserError("Use a PNG, JPG or WebP image");
  const uploads = path.join(dir, "uploads");
  fs.mkdirSync(uploads, { recursive: true });
  const name = `logo-${crypto.randomBytes(8).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(uploads, name), bytes);
  if (UPLOAD_NAME.test(previous)) fs.rmSync(path.join(uploads, previous), { force: true });
  return name;
}
```

**`lib/action.ts`**

```typescript
import { UserError } from "./errors.ts";

export type Result<T = void> = { ok: true; data: T } | { ok: false; error: string };

/** Wrap a server action body: expected problems become messages, anything else is logged and made generic. */
export async function act<T>(fn: () => Promise<T> | T): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong and nothing was saved. Please try again." };
  }
}
```

**`lib/auth.ts`**

```typescript
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { nextCookies } from "better-auth/next-js";
import { makeAuth, type Made } from "./auth-core.ts";
import { dataDir, getDb } from "./db/index.ts";

export const port = (): string => process.env.PORT ?? "3000";

/** Per-install secret: BETTER_AUTH_SECRET if set, otherwise generated once into data/auth-secret. */
function secret(): string {
  if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
  const file = path.join(dataDir(), "auth-secret");
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
  const s = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(file, s, { mode: 0o600 });
  return s;
}

export const authOpts = () => ({
  db: getDb(),
  secret: secret(),
  baseURL: `http://127.0.0.1:${port()}`,
  plugins: [nextCookies()],
});

type G = typeof globalThis & { __loungeAuth?: Made };

export function getAuth(): Made {
  const g = globalThis as G;
  return (g.__loungeAuth ??= makeAuth(authOpts()));
}
```

**`lib/boot.ts`**

```typescript
import path from "node:path";
import { dataDir, getDb } from "./db/index.ts";
import { applyPinResetFile, migrateAuth } from "./auth-core.ts";
import { authOpts, getAuth } from "./auth.ts";

/** Runs once when the server starts (via instrumentation.ts). Auth tables must exist before getAuth(). */
export async function bootServer(): Promise<void> {
  getDb();
  await migrateAuth(authOpts());
  const reset = await applyPinResetFile(getAuth(), path.join(dataDir(), "reset-owner-pin.txt"));
  if (reset) console.log("Owner PIN was reset from data/reset-owner-pin.txt");
}
```

**`lib/session.ts`**

```typescript
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth.ts";
import type { Role } from "./auth-core.ts";
import { UserError } from "./errors.ts";

export type Me = { id: string; name: string; username: string; role: Role };

export async function currentUser(): Promise<Me | null> {
  const h = await headers(); // first: it makes the page dynamic before anything touches the database
  const s = await getAuth().auth.api.getSession({ headers: h });
  if (!s) return null;
  const u = s.user as typeof s.user & { role?: string; username?: string };
  return { id: u.id, name: u.name, username: u.username ?? u.name, role: u.role === "owner" ? "owner" : "staff" };
}

/** For pages and layouts: send signed-out visitors to the login screen. */
export async function requireUser(): Promise<Me> {
  const me = await currentUser();
  if (!me) redirect("/login");
  return me;
}

export async function requireOwnerPage(): Promise<Me> {
  const me = await requireUser();
  if (me.role !== "owner") redirect("/");
  return me;
}

/** For server actions: throw a message the screen can show instead of redirecting mid-action. */
export async function actor(): Promise<Me> {
  const me = await currentUser();
  if (!me) throw new UserError("Your session expired. Please sign in again.");
  return me;
}

export async function ownerActor(): Promise<Me> {
  const me = await actor();
  if (me.role !== "owner") throw new UserError("Only the owner can do that");
  return me;
}
```

**`instrumentation.ts`**

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return; // the build must not open the database
  const { bootServer } = await import("./lib/boot.ts");
  await bootServer();
}
```

**`proxy.ts`**

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Paths that work without a login. Everything else needs a session cookie (and each page/action re-checks it).
const PUBLIC = ["/login", "/setup", "/api/auth", "/api/health", "/api/brand", "/brand"];

export function proxy(req: NextRequest) {
  const port = process.env.PORT ?? "3000";
  const host = req.headers.get("host") ?? "";
  // Refuse any other Host header: a website open in the same browser could otherwise reach this app via DNS rebinding.
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
    return new NextResponse("Not available", { status: 421 });
  }
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (!getSessionCookie(req)) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
```

**`app/api/auth/[...all]/route.ts`**

```typescript
import { connection } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

// `next build` pre-renders GET route handlers, so opt out first: the build must never open the database.
const handler = () => toNextJsHandler(getAuth().auth);
export const GET = async (req: Request) => {
  await connection();
  return handler().GET(req);
};
export const POST = async (req: Request) => {
  await connection();
  return handler().POST(req);
};
```

**`app/api/health/route.ts`**

```typescript
export function GET() {
  return Response.json({ ok: true });
}
```

**`app/api/brand/logo/route.ts`**

```typescript
import fs from "node:fs";
import path from "node:path";
import { connection } from "next/server";
import { dataDir } from "@/lib/db/index";
import { getSetting } from "@/lib/db/settings";
import { UPLOAD_NAME } from "@/lib/logo";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

export async function GET() {
  await connection(); // read settings per request, not at build time
  const logo = getSetting("cafe.logo");
  let file: string | null = null;
  if (logo === "builtin:level9") file = path.join(process.cwd(), "public", "brand", "logo-banner.png");
  else if (UPLOAD_NAME.test(logo)) file = path.join(dataDir(), "uploads", logo); // name is regex-checked: no traversal
  if (!file || !fs.existsSync(file)) return new Response("Not found", { status: 404 });
  const type = TYPES[path.extname(file).slice(1)] ?? "application/octet-stream";
  return new Response(new Uint8Array(fs.readFileSync(file)), { headers: { "Content-Type": type, "Cache-Control": "no-cache" } });
}
```

**`app/login/actions.ts`**

```typescript
"use server";
import { headers } from "next/headers";
import { act } from "@/lib/action";
import { getAuth } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import { makeLockout } from "@/lib/lockout";
import { str } from "@/lib/validate";

type G = typeof globalThis & { __loungeLockout?: ReturnType<typeof makeLockout> };
const lockout = () => ((globalThis as G).__loungeLockout ??= makeLockout());

export async function loginAction(username: string, pin: string) {
  return act(async () => {
    const name = str(username, "Username", { max: 30 }).toLowerCase();
    const wait = lockout().wait(name);
    if (wait > 0) throw new UserError(`Too many wrong tries. Wait ${wait} seconds and try again.`);
    const a = getAuth();
    try {
      await a.auth.api.signInUsername({ body: { username: name, password: String(pin) }, headers: a.internalHeaders(await headers()) });
    } catch {
      lockout().fail(name);
      throw new UserError("Wrong username or PIN");
    }
    lockout().clear(name);
  });
}

export async function logoutAction() {
  await getAuth().auth.api.signOut({ headers: await headers() });
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `npm test && npx tsc --noEmit`
Expected: `ℹ tests 67`, `ℹ fail 0`, and no `tsc` output.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add server wiring: auth instance, boot, session helpers, proxy and route handlers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: App shell: theme, root layout and shared components

**Files:**
- Create: `lib/ui.ts`, `lib/alerts.ts`, `lib/useNow.ts`, `lib/useCall.ts`
- Create: `components/toast.tsx`, `components/modal.tsx`, `components/action-form.tsx`, `components/brand.tsx`, `components/clock.tsx`, `components/nav.tsx`
- Modify (replace): `app/globals.css`, `app/layout.tsx`

**Interfaces:**
- Produces:
  - `lib/ui.ts`: `inputCls`, `labelCls`, `btnCls`, `btnPrimaryCls`, `btnDangerCls`, `cardCls` (shared Tailwind class strings).
  - `lib/alerts.ts` (browser only): `unlockAudio()` (call from any click), `beep("ending" | "overtime")`.
  - `lib/useNow.ts`: `useNow(): number` (ticks each second; `0` on the server and first paint, so check for `0`).
  - `lib/useCall.ts`: `useCall() → { call(fn, {ok?, onOk?}), pending }` runs a server action, toasts its error or `ok` note, then `router.refresh()`.
  - `components/toast.tsx`: `ToastProvider`, `useToast() → (kind: "ok"|"err"|"info", text)`.
  - `components/modal.tsx`: `<Modal open onClose title side?>` over native `<dialog>`; children mount only while open.
  - `components/action-form.tsx`: `<ActionForm action success? resetOnSuccess? onSuccess?>` runs a `FormData` server action.
  - `components/brand.tsx`, `clock.tsx`, `nav.tsx` (`NavLinks`, `SignOut`).
- Visual design: dark charcoal surfaces, silver text, carbon-red accent; Rajdhani for headings and timers, Inter for body; status always colour + icon + label; reduced motion respected.

- [ ] **Step 1: Write the theme and root layout**

**`app/globals.css`**

```css
@import "tailwindcss";

/* Level 9 palette: charcoal textile, brushed silver, carbon red. --color-brand is overridden per cafe from settings. */
@theme {
  --color-bg: #0b0d0f;
  --color-panel: #12161a;
  --color-raised: #1a1f25;
  --color-line: #262d35;
  --color-ink: #e8ebef;
  --color-silver: #c9ced6;
  --color-mute: #8a929c;
  --color-brand: #d4121c;
  --color-brand-hi: color-mix(in srgb, var(--color-brand) 78%, white);
  --color-free: #2fbf71;
  --color-warn: #f5a524;
  --color-paused: #7b8da6;
  --font-display: var(--font-rajdhani), ui-sans-serif, system-ui, sans-serif;
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
}

html {
  color-scheme: dark;
}

body {
  background: var(--color-bg);
  color: var(--color-ink);
  font-family: var(--font-sans);
}

.tnum {
  font-variant-numeric: tabular-nums;
}

@keyframes ring {
  0%,
  100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-brand) 65%, transparent);
  }
  50% {
    box-shadow: 0 0 0 7px transparent;
  }
}

.overtime {
  animation: ring 1.2s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .overtime {
    animation: none;
  }
}

dialog {
  color: inherit;
}

dialog::backdrop {
  background: rgb(0 0 0 / 0.65);
}

@media print {
  body {
    background: white;
    color: black;
  }
  .no-print {
    display: none !important;
  }
}
```

**`app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { connection } from "next/server";
import { Inter, Rajdhani } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/toast";
import { getSetting } from "@/lib/db/settings";

const display = Rajdhani({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-rajdhani" });
const sans = Inter({ subsets: ["latin"], variable: "--font-inter" });

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return { title: getSetting("cafe.name"), description: "Gaming lounge management" };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection(); // read settings per request, never at build time
  const accent = getSetting("cafe.accent");
  const style = /^#[0-9a-f]{6}$/i.test(accent) ? ({ "--color-brand": accent } as React.CSSProperties) : undefined;
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`} style={style}>
      <body className="min-h-dvh antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Write the shared helpers**

**`lib/ui.ts`**

```typescript
// Shared Tailwind class strings so every form and button looks the same.
export const inputCls =
  "w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink placeholder:text-mute focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-50";

export const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wider text-mute";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50";

export const btnCls = `${btnBase} border border-line bg-raised text-ink hover:border-silver/40 hover:bg-line`;
export const btnPrimaryCls = `${btnBase} bg-brand text-white shadow-[0_0_0_1px_rgb(255_255_255/0.06)_inset] hover:bg-brand-hi`;
export const btnDangerCls = `${btnBase} border border-brand/50 bg-transparent text-brand-hi hover:bg-brand/10`;

export const cardCls = "rounded-xl border border-line bg-panel";
```

**`lib/alerts.ts`**

```typescript
// Browsers only allow sound after a click, so call unlockAudio() from any button press (login does).
let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    /* no audio available: alerts stay visual */
  }
}

/** "ending" = two soft beeps, "overtime" = three sharp ones. */
export function beep(kind: "ending" | "overtime"): void {
  if (!ctx || ctx.state !== "running") return;
  const count = kind === "ending" ? 2 : 3;
  const freq = kind === "ending" ? 660 : 880;
  for (let i = 0; i < count; i++) {
    const t = ctx.currentTime + i * 0.28;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = kind === "ending" ? "sine" : "square";
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  }
}
```

**`lib/useNow.ts`**

```typescript
"use client";
import { useSyncExternalStore } from "react";

function subscribe(cb: () => void): () => void {
  const id = setInterval(cb, 1000);
  return () => clearInterval(id);
}

const snapshot = (): number => Math.floor(Date.now() / 1000) * 1000;

/** Current time, ticking every second. Returns 0 on the server and first paint, so check for 0 before showing times. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}
```

**`lib/useCall.ts`**

```typescript
"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Result } from "./action.ts";
import { useToast } from "@/components/toast";

/** Run a server action, show its error (or an optional success note), then refresh the page data. */
export function useCall() {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const call = <T,>(fn: () => Promise<Result<T>>, o: { ok?: string; onOk?: (data: T) => void } = {}) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        if (o.ok) toast("ok", o.ok);
        o.onOk?.(r.data);
        router.refresh();
      } else {
        toast("err", r.error);
      }
    });
  return { call, pending };
}
```

- [ ] **Step 3: Write the shared components**

**`components/toast.tsx`**

```tsx
"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";

type Kind = "ok" | "err" | "info";
type Toast = { id: number; kind: Kind; text: string };

const Ctx = createContext<(kind: Kind, text: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

const STYLE: Record<Kind, string> = {
  ok: "border-free/40",
  err: "border-brand/60",
  info: "border-warn/50",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Kind, text: string) => {
    const id = Date.now() + Math.random();
    setItems((l) => [...l.slice(-3), { id, kind, text }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), kind === "err" ? 8000 : 4500);
  }, []);
  return (
    <Ctx value={push}>
      {children}
      <div aria-live="polite" className="no-print fixed bottom-4 right-4 z-[100] flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} role={t.kind === "err" ? "alert" : "status"} className={`flex items-start gap-2.5 rounded-lg border bg-raised px-3.5 py-3 text-sm shadow-xl ${STYLE[t.kind]}`}>
            {t.kind === "ok" ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-free" /> : t.kind === "err" ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-brand-hi" /> : <Info className="mt-0.5 size-4 shrink-0 text-warn" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx>
  );
}
```

**`components/modal.tsx`**

```tsx
"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** Native <dialog>: focus trap, Esc to close and a backdrop for free. Children only mount while open. */
export function Modal({ open, onClose, title, children, side = false }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  side?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const shape = side
    ? "m-0 ml-auto h-dvh max-h-none w-full max-w-[30rem] rounded-none border-y-0 border-r-0"
    : "m-auto w-full max-w-xl rounded-2xl";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
      className={`border border-line bg-panel p-0 text-ink shadow-2xl ${shape}`}
    >
      {open && (
        <div className="flex max-h-dvh flex-col">
          <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="font-display text-xl font-bold tracking-wide">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-mute hover:bg-raised hover:text-ink">
              <X className="size-5" />
            </button>
          </header>
          <div className="overflow-y-auto p-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}
```

**`components/action-form.tsx`**

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import type { Result } from "@/lib/action";
import { useToast } from "./toast";

/** A normal <form> that runs a server action, shows its error or success note, then refreshes the page data. */
export function ActionForm({ action, children, className, success, resetOnSuccess = false, onSuccess }: {
  action: (fd: FormData) => Promise<Result<unknown>>;
  children: ReactNode;
  className?: string;
  success?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (data: unknown) => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        start(async () => {
          const r = await action(fd);
          if (r.ok) {
            if (success) toast("ok", success);
            if (resetOnSuccess) form.reset();
            onSuccess?.(r.data);
            router.refresh();
          } else {
            toast("err", r.error);
          }
        });
      }}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
    </form>
  );
}
```

**`components/brand.tsx`**

```tsx
/** The cafe's logo if one is set, otherwise its name in the display font. */
export function Brand({ name, logo, className = "" }: { name: string; logo: string; className?: string }) {
  if (!logo) return <span className={`font-display text-2xl font-bold tracking-wide ${className}`}>{name}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/brand/logo?v=${encodeURIComponent(logo)}`} alt={name} className={`h-auto w-full object-contain ${className}`} />;
}
```

**`components/clock.tsx`**

```tsx
"use client";
import { useNow } from "@/lib/useNow";

export function Clock() {
  const now = useNow();
  if (!now) return <span className="tnum text-mute">--:--</span>;
  const d = new Date(now);
  return (
    <span className="tnum text-sm text-mute">
      {d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
      <span className="ml-3 font-display text-lg font-semibold text-ink">
        {d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })}
      </span>
    </span>
  );
}
```

**`components/nav.tsx`**

```tsx
"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, LogOut, Receipt, Settings } from "lucide-react";
import { logoutAction } from "@/app/login/actions";

const LINKS = [
  { href: "/", label: "Floor", icon: LayoutGrid, owner: false },
  { href: "/bills", label: "Bills", icon: Receipt, owner: false },
  { href: "/settings", label: "Settings", icon: Settings, owner: true },
];

export function NavLinks({ role }: { role: "owner" | "staff" }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1 px-3">
      {LINKS.filter((l) => !l.owner || role === "owner").map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${active ? "bg-brand/15 text-ink shadow-[inset_3px_0_0_var(--color-brand)]" : "text-silver hover:bg-raised hover:text-ink"}`}
          >
            <Icon className="size-[1.15rem]" /> {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SignOut() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await logoutAction();
        router.push("/login");
        router.refresh();
      }}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-mute transition hover:bg-raised hover:text-ink"
    >
      <LogOut className="size-4" /> Sign out
    </button>
  );
}
```

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint`
Expected: no output from either.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add Level 9 theme, root layout and shared UI components" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: First-run setup and login pages

**Files:**
- Create: `app/setup/actions.ts`, `app/setup/page.tsx`, `app/setup/SetupForm.tsx`, `app/login/page.tsx`, `app/login/LoginForm.tsx`

**Interfaces:**
- Consumes: Task 6 (`createUser`, `hasAnyUser`), Task 7 (`getAuth`, `currentUser`, `act`, `loginAction`), Task 8 (`ActionForm`, `ui`), Task 4 (`seedLevel9Starter`, `setSettings`, `getSettings`).
- Produces: `/setup` (only reachable while no user exists; creates the owner, optional Level 9 starter zones/rates/logo, UPI ID, GST switch) and `/login`. `setupAction(fd)` refuses once any user exists.

- [ ] **Step 1: Write the setup pages**

**`app/setup/actions.ts`**

```typescript
"use server";
import { act } from "@/lib/action";
import { createUser, hasAnyUser } from "@/lib/auth-core";
import { getAuth } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import { isValidUpiId } from "@/lib/engine/upi";
import { bool, str } from "@/lib/validate";
import { seedLevel9Starter } from "@/lib/db/seed";
import { setSettings } from "@/lib/db/settings";

export async function setupAction(fd: FormData) {
  return act(async () => {
    if (hasAnyUser()) throw new UserError("Setup is already done. Please sign in.");
    const cafeName = str(fd.get("cafeName"), "Cafe name", { max: 60 });
    const upiId = str(fd.get("upiId"), "UPI ID", { max: 80, required: false });
    if (upiId && !isValidUpiId(upiId)) throw new UserError("That UPI ID doesn't look right. It should look like name@bank.");
    const name = str(fd.get("ownerName"), "Your name", { max: 60 });
    const username = str(fd.get("username"), "Username", { max: 20 }).toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) throw new UserError("Username can use letters, numbers and _ (3 to 20 characters)");
    const pin = String(fd.get("pin") ?? "");
    if (!/^\d{4,8}$/.test(pin)) throw new UserError("PIN must be 4 to 8 digits");
    if (pin !== String(fd.get("pin2") ?? "")) throw new UserError("The two PINs don't match");
    const starter = fd.get("starter") === "level9";

    await createUser(getAuth(), { username, pin, name, role: "owner" });
    if (starter) seedLevel9Starter();
    setSettings({
      "cafe.name": cafeName,
      "cafe.upiId": upiId,
      "gst.enabled": bool(fd.get("gst")) ? "1" : "0",
      "cafe.logo": starter ? "builtin:level9" : "",
      "setup.done": "1",
    });
  });
}
```

**`app/setup/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { hasAnyUser } from "@/lib/auth-core";
import { SetupForm } from "./SetupForm";

export default async function SetupPage() {
  await connection();
  if (hasAnyUser()) redirect("/login");
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-xl">
        <h1 className="font-display text-4xl font-bold tracking-wide">Welcome 👋</h1>
        <p className="mb-6 mt-1 text-silver">Let&apos;s set up your lounge. It takes a minute, and you can change everything later in Settings.</p>
        <SetupForm />
      </div>
    </main>
  );
}
```

**`app/setup/SetupForm.tsx`**

```tsx
"use client";
import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { btnPrimaryCls, inputCls, labelCls } from "@/lib/ui";
import { setupAction } from "./actions";

export function SetupForm() {
  const router = useRouter();
  return (
    <ActionForm action={setupAction} success="All set. Please sign in." onSuccess={() => router.push("/login")} className="space-y-6 rounded-2xl border border-line bg-panel p-6">
      <fieldset className="space-y-4">
        <legend className="mb-1 font-display text-xl font-semibold">Your lounge</legend>
        <div>
          <label htmlFor="cafeName" className={labelCls}>Lounge name</label>
          <input id="cafeName" name="cafeName" required maxLength={60} className={inputCls} placeholder="Level 9 Gaming Lounge" />
        </div>
        <div>
          <label htmlFor="upiId" className={labelCls}>UPI ID for payment QR codes (optional)</label>
          <input id="upiId" name="upiId" className={inputCls} placeholder="yourname@bank" />
        </div>
        <label className="flex items-center gap-2 text-sm text-silver">
          <input type="checkbox" name="gst" className="size-4 accent-[var(--color-brand)]" /> Show GST on invoices (prices include 18% GST)
        </label>
        <div>
          <span className={labelCls}>Start with</span>
          <label className="mb-2 flex items-start gap-2 text-sm">
            <input type="radio" name="starter" value="level9" defaultChecked className="mt-1 accent-[var(--color-brand)]" />
            <span>Level 9 starter: Pool, PS5, PC Gaming and Sim Racing zones with their hourly rates, and the Level 9 logo</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="starter" value="empty" className="mt-1 accent-[var(--color-brand)]" />
            <span>Empty: I&apos;ll add my own zones, stations and rates</span>
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-1 font-display text-xl font-semibold">Owner login</legend>
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
        <p className="text-xs text-mute">Forgot the PIN later? Put a new one in a file called <code>reset-owner-pin.txt</code> inside the <code>data</code> folder and restart the app.</p>
      </fieldset>

      <button className={`${btnPrimaryCls} w-full !py-3 text-base`}>Create my lounge</button>
    </ActionForm>
  );
}
```

- [ ] **Step 2: Write the login pages**

**`app/login/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { hasAnyUser } from "@/lib/auth-core";
import { currentUser } from "@/lib/session";
import { getSettings } from "@/lib/db/settings";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  await connection();
  if (!hasAnyUser()) redirect("/setup");
  if (await currentUser()) redirect("/");
  const cafe = getSettings();
  const logo = cafe["cafe.logo"];
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {logo === "builtin:level9" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/brand/logo-hero.png" alt={cafe["cafe.name"]} className="mx-auto w-72 rounded-2xl" />
          ) : logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/brand/logo?v=${encodeURIComponent(logo)}`} alt={cafe["cafe.name"]} className="mx-auto max-h-40 w-auto max-w-full" />
          ) : (
            <h1 className="font-display text-4xl font-bold tracking-wide">{cafe["cafe.name"]}</h1>
          )}
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
```

**`app/login/LoginForm.tsx`**

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { loginAction } from "./actions";
import { unlockAudio } from "@/lib/alerts";
import { btnPrimaryCls, inputCls, labelCls } from "@/lib/ui";

export function LoginForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <form
      className="space-y-4 rounded-2xl border border-line bg-panel p-6"
      onSubmit={(e) => {
        e.preventDefault();
        unlockAudio(); // this click is what lets the timer alerts make sound later
        const fd = new FormData(e.currentTarget);
        setError("");
        start(async () => {
          const r = await loginAction(String(fd.get("username") ?? ""), String(fd.get("pin") ?? ""));
          if (r.ok) {
            router.push("/");
            router.refresh();
          } else setError(r.error);
        });
      }}
    >
      <div>
        <label htmlFor="username" className={labelCls}>Username</label>
        <input id="username" name="username" autoComplete="username" autoCapitalize="none" autoFocus required className={inputCls} />
      </div>
      <div>
        <label htmlFor="pin" className={labelCls}>PIN</label>
        <input id="pin" name="pin" type="password" inputMode="numeric" autoComplete="current-password" required className={inputCls} />
      </div>
      {error && <p role="alert" className="text-sm text-brand-hi">{error}</p>}
      <button disabled={pending} className={`${btnPrimaryCls} w-full !py-3`}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add first-run setup wizard and PIN login" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(The app cannot be built yet: the signed-in shell and the floor page arrive in Task 10.)

---

### Task 10: Signed-in shell and the floor

**Files:**
- Create: `app/(app)/layout.tsx`, `app/(app)/page.tsx`, `app/(app)/actions.ts`
- Create: `components/upi-qr.tsx`, `components/floor/status.tsx`, `components/floor/StationCard.tsx`, `components/floor/StartDialog.tsx`, `components/floor/SessionDrawer.tsx`, `components/floor/BillPanel.tsx`, `components/floor/Board.tsx`

**Interfaces:**
- Consumes: Tasks 4, 5, 7, 8.
- Produces:
  - `app/(app)/actions.ts` (all `act`-wrapped, all call `actor()` first): `startSessionAction(form)`, `pauseAction`, `resumeAction`, `stopAction`, `reopenAction`, `extendAction(id, minutes)`, `transferAction(id, toStationId)`, `notesAction`, `addItemAction(id, name, qty, rupees)`, `removeItemAction`, `searchCustomersAction`, `createCustomerAction`, `getDraftAction`, `finalizeBillAction(form)`, `voidBillAction(billId, reason)`.
  - The floor: zone sections of station cards (status, timer, customer, running charge), a Start dialog (open / fixed / prepaid / package, players, customer search or quick-add with WhatsApp consent), a side drawer (pause, resume, extend, move, extras, notes, stop, undo stop) and a bill panel (discount with reason, mixed payments, split-between calculator, UPI QR, "Mark paid"). Beeps and a toast when a session reaches "ending soon" or "overtime"; overtime repeats each minute.
- The signed-in layout redirects to `/setup` when setup is not done and to `/login` when signed out.

- [ ] **Step 1: Write the server actions and the signed-in layout**

**`app/(app)/actions.ts`**

```typescript
"use server";
import { act } from "@/lib/action";
import { actor } from "@/lib/session";
import { UserError } from "@/lib/errors";
import { int, oneOf, rupeesToPaise, str, bool } from "@/lib/validate";
import { PAYMENT_METHODS } from "@/lib/engine/bill";
import type { Discount } from "@/lib/engine/bill";
import {
  addItem, extendSession, pauseSession, removeItem, reopenSession, resumeSession, setNotes, startSession, stopSession, transferSession,
} from "@/lib/db/sessions";
import { buildDraft, finalizeBill, voidBill } from "@/lib/db/bills";
import { createCustomer, searchCustomers } from "@/lib/db/customers";
import { getSetting } from "@/lib/db/settings";

export type StartForm = {
  stationId: number;
  mode: string;
  players: number | string;
  customerId: number | null;
  minutes?: number | string;
  packageId?: number | string;
  rupees?: string;
  method?: string;
};

export async function startSessionAction(f: StartForm) {
  return act(async () => {
    const me = await actor();
    const mode = oneOf(f.mode, ["open", "fixed", "prepaid", "package"] as const, "Mode");
    const base = {
      stationId: int(f.stationId, "Station"),
      staffId: me.id,
      players: int(f.players, "Players", { min: 1, max: 20 }),
      customerId: f.customerId == null ? null : int(f.customerId, "Customer"),
      now: Date.now(),
    };
    if (mode === "package") return startSession({ ...base, mode: "fixed", packageId: int(f.packageId, "Package") });
    if (mode === "fixed") return startSession({ ...base, mode, plannedMinutes: int(f.minutes, "Minutes", { min: 1, max: 1440 }) });
    if (mode === "prepaid") {
      return startSession({
        ...base,
        mode,
        advancePaise: rupeesToPaise(f.rupees, "Prepaid amount", { min: 1 }),
        advanceMethod: oneOf(f.method, PAYMENT_METHODS, "Payment method"),
      });
    }
    return startSession({ ...base, mode });
  });
}

export const pauseAction = async (id: number) => act(async () => { await actor(); pauseSession(int(id, "Session"), Date.now()); });
export const resumeAction = async (id: number) => act(async () => { await actor(); resumeSession(int(id, "Session"), Date.now()); });
export const stopAction = async (id: number) => act(async () => { await actor(); stopSession(int(id, "Session"), Date.now()); });
export const reopenAction = async (id: number) => act(async () => { await actor(); reopenSession(int(id, "Session"), Date.now()); });
export const extendAction = async (id: number, minutes: number) => act(async () => { await actor(); extendSession(int(id, "Session"), int(minutes, "Minutes", { min: 1, max: 1440 })); });

export async function transferAction(id: number, toStationId: number) {
  return act(async () => {
    const me = await actor();
    transferSession(int(id, "Session"), int(toStationId, "Station"), me.id, Date.now());
  });
}

export async function notesAction(id: number, notes: string) {
  return act(async () => {
    await actor();
    setNotes(int(id, "Session"), str(notes, "Notes", { max: 500, required: false }));
  });
}

export async function addItemAction(id: number, name: string, qty: number | string, rupees: string) {
  return act(async () => {
    await actor();
    addItem(int(id, "Session"), str(name, "Item name", { max: 80 }), int(qty, "Quantity", { min: 1, max: 99 }), rupeesToPaise(rupees, "Price"), Date.now());
  });
}

export const removeItemAction = async (itemId: number) => act(async () => { await actor(); removeItem(int(itemId, "Item")); });

export async function searchCustomersAction(q: string) {
  return act(async () => {
    await actor();
    return searchCustomers(str(q, "Search", { max: 60, required: false }));
  });
}

export async function createCustomerAction(name: string, phone: string, consent: boolean) {
  return act(async () => {
    await actor();
    const n = str(name, "Customer name", { max: 80 });
    const p = str(phone, "Phone", { max: 30, required: false });
    const id = createCustomer(n, p, bool(consent));
    return { id, name: n };
  });
}

export async function getDraftAction(sessionId: number) {
  return act(async () => {
    await actor();
    const d = buildDraft(int(sessionId, "Session"), Date.now());
    return {
      lines: d.lines,
      advancePaise: d.session.advancePaise,
      advanceMethod: d.session.advanceMethod,
      maxStaffDiscountPct: Number(getSetting("staff.maxDiscountPct")),
    };
  });
}

export type PayForm = {
  sessionId: number;
  discountType: "none" | "flat" | "percent";
  discountValue: string;
  reason: string;
  payments: { method: string; rupees: string }[];
};

export async function finalizeBillAction(f: PayForm) {
  return act(async () => {
    const me = await actor();
    let discount: Discount = null;
    if (f.discountType !== "none" && f.discountValue.trim() !== "") {
      discount =
        f.discountType === "flat"
          ? { type: "flat", value: rupeesToPaise(f.discountValue, "Discount") }
          : { type: "percent", value: int(f.discountValue, "Discount %", { min: 0, max: 100 }) };
    }
    if (!Array.isArray(f.payments)) throw new UserError("Payments are not valid");
    const payments = f.payments
      .filter((p) => typeof p?.rupees === "string" && p.rupees.trim() !== "")
      .map((p) => ({ method: oneOf(p.method, PAYMENT_METHODS, "Payment method"), amountPaise: rupeesToPaise(p.rupees, "Payment") }));
    return finalizeBill({
      sessionId: int(f.sessionId, "Session"),
      staffId: me.id,
      role: me.role,
      discount,
      discountReason: str(f.reason, "Reason", { max: 200, required: false }),
      payments,
      now: Date.now(),
    });
  });
}

export async function voidBillAction(billId: number, reason: string) {
  return act(async () => {
    const me = await actor();
    voidBill(int(billId, "Bill"), str(reason, "Reason", { max: 200, required: false }), me.id, me.role, Date.now());
  });
}
```

**`app/(app)/layout.tsx`**

```tsx
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { hasAnyUser } from "@/lib/auth-core";
import { requireUser } from "@/lib/session";
import { getSettings, isSetupDone } from "@/lib/db/settings";
import { Brand } from "@/components/brand";
import { Clock } from "@/components/clock";
import { NavLinks, SignOut } from "@/components/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await connection(); // always per request: never touch the database while building
  if (!hasAnyUser() || !isSetupDone()) redirect("/setup");
  const me = await requireUser();
  const cafe = getSettings();
  return (
    <div className="flex min-h-dvh">
      <aside className="no-print sticky top-0 flex h-dvh w-60 shrink-0 flex-col border-r border-line bg-panel">
        <div className="px-4 pb-4 pt-5">
          <Brand name={cafe["cafe.name"]} logo={cafe["cafe.logo"]} />
        </div>
        <NavLinks role={me.role} />
        <div className="mt-auto border-t border-line p-3">
          <div className="px-3 pb-2">
            <div className="truncate text-sm font-semibold">{me.name}</div>
            <div className="text-xs capitalize text-mute">{me.role}</div>
          </div>
          <SignOut />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex h-14 items-center justify-end border-b border-line px-6">
          <Clock />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
```

**`app/(app)/page.tsx`**

```tsx
import { requireUser } from "@/lib/session";
import { listBoard } from "@/lib/db/sessions";
import { listPackages } from "@/lib/db/catalog";
import { getSettings } from "@/lib/db/settings";
import { Board } from "@/components/floor/Board";

export default async function FloorPage() {
  const me = await requireUser();
  const cafe = getSettings();
  return (
    <Board
      zones={listBoard()}
      packages={listPackages()}
      leadMin={Number(cafe["alert.leadMin"])}
      cafe={{ name: cafe["cafe.name"], upiId: cafe["cafe.upiId"] }}
      role={me.role}
    />
  );
}
```

- [ ] **Step 2: Write the floor components**

**`components/upi-qr.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Scannable UPI QR. Rendered black on white so every phone camera reads it. */
export function UpiQr({ link, size = 200 }: { link: string; size?: number }) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(link, { margin: 2, width: size, color: { dark: "#000000", light: "#ffffff" } })
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(""));
    return () => {
      live = false;
    };
  }, [link, size]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} width={size} height={size} alt="UPI payment QR code" className="rounded-lg" /> : <div style={{ width: size, height: size }} className="animate-pulse rounded-lg bg-raised" />;
}
```

**`components/floor/status.tsx`**

```tsx
import { AlarmClock, CircleCheck, CircleDot, Car, Gamepad2, Glasses, LayoutGrid, Monitor, Pause, Play, Timer, Wallet, Wrench, type LucideIcon } from "lucide-react";
import type { LiveStatus } from "@/lib/live";

export type StatusKey = LiveStatus | "free" | "maintenance";

// Always colour + icon + label, so status never depends on colour alone.
export const STATUS: Record<StatusKey, { label: string; icon: LucideIcon; chip: string; card: string }> = {
  free: { label: "Free", icon: CircleCheck, chip: "bg-free/15 text-free", card: "border-line hover:border-free/50" },
  running: { label: "Running", icon: Play, chip: "bg-brand/15 text-brand-hi", card: "border-brand/50" },
  ending: { label: "Ending soon", icon: Timer, chip: "bg-warn/15 text-warn", card: "border-warn/70" },
  overtime: { label: "Overtime", icon: AlarmClock, chip: "bg-brand text-white", card: "overtime border-brand" },
  paused: { label: "Paused", icon: Pause, chip: "bg-paused/20 text-paused", card: "border-paused/50" },
  awaiting: { label: "Awaiting payment", icon: Wallet, chip: "bg-silver/15 text-silver", card: "border-silver/50" },
  maintenance: { label: "Maintenance", icon: Wrench, chip: "bg-line text-mute", card: "border-dashed border-line opacity-70" },
};

export const ZONE_ICON: Record<string, LucideIcon> = {
  pool: CircleDot,
  ps5: Gamepad2,
  pc: Monitor,
  sim: Car,
  vr: Glasses,
  custom: LayoutGrid,
};
```

**`components/floor/StationCard.tsx`**

```tsx
"use client";
import { Plus, User } from "lucide-react";
import type { BoardStation } from "@/lib/db/sessions";
import { liveInfo } from "@/lib/live";
import { hms, rupees } from "@/lib/format";
import { STATUS, type StatusKey } from "./status";

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
  const big = !info ? "-:--:--" : countdown ? (info.remainingMs! < 0 ? `+${hms(-info.remainingMs!)}` : hms(info.remainingMs!)) : hms(info.playedMs);

  return (
    <button
      type="button"
      disabled={station.maintenance}
      onClick={s ? onOpen : onStart}
      className={`group flex min-h-40 flex-col rounded-xl border bg-panel p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${st.card}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-display text-xl font-bold leading-tight tracking-wide">{station.name}</span>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${st.chip}`}>
          <Icon className="size-3.5" />
          {st.label}
        </span>
      </div>

      {s ? (
        <>
          <div className="mt-3">
            <div className={`tnum font-display text-4xl font-bold leading-none ${key === "overtime" ? "text-brand-hi" : key === "ending" ? "text-warn" : "text-ink"}`}>{big}</div>
            <div className="mt-1 text-xs text-mute">
              {countdown ? (info!.remainingMs! < 0 ? "over time" : "time left") : info?.stopped ? "played" : "elapsed"}
              {s.plannedMinutes ? ` · ${s.plannedMinutes} min` : ""}
            </div>
          </div>
          <div className="mt-auto flex items-end justify-between pt-3 text-sm">
            <span className="flex min-w-0 items-center gap-1.5 text-silver">
              <User className="size-3.5 shrink-0 text-mute" />
              <span className="truncate">{s.customerName ?? "Walk-in"}</span>
            </span>
            <span className="tnum font-semibold">{info ? rupees(info.totalPaise) : ""}</span>
          </div>
        </>
      ) : (
        <div className="mt-auto flex items-center gap-2 pt-6 text-sm text-mute transition group-hover:text-ink">
          {station.maintenance ? (
            "Out of service"
          ) : (
            <>
              <span className="grid size-8 place-items-center rounded-full border border-line group-hover:border-brand group-hover:bg-brand/10">
                <Plus className="size-4" />
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

**`components/floor/StartDialog.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { Modal } from "@/components/modal";
import { useCall } from "@/lib/useCall";
import { useToast } from "@/components/toast";
import { createCustomerAction, searchCustomersAction, startSessionAction } from "@/app/(app)/actions";
import { btnCls, btnPrimaryCls, inputCls, labelCls } from "@/lib/ui";
import { rupees } from "@/lib/format";
import type { PackageRow } from "@/lib/db/catalog";
import type { Customer } from "@/lib/db/customers";

type Mode = "open" | "fixed" | "prepaid" | "package";
type Pick = { id: number; name: string };

export function StartDialog({ stationName, stationId, packages, onClose }: {
  stationName: string;
  stationId: number;
  packages: PackageRow[]; // already limited to this station's zone
  onClose: () => void;
}) {
  const { call, pending } = useCall();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("open");
  const [minutes, setMinutes] = useState("60");
  const [rupeesIn, setRupeesIn] = useState("");
  const [method, setMethod] = useState("cash");
  const [packageId, setPackageId] = useState(packages[0]?.id ?? 0);
  const [players, setPlayers] = useState("1");
  const [customer, setCustomer] = useState<Pick | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Customer[]>([]);
  const [adding, setAdding] = useState(false);
  const [nName, setNName] = useState("");
  const [nPhone, setNPhone] = useState("");
  const [nConsent, setNConsent] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => {
      const r = await searchCustomersAction(q);
      if (r.ok) setFound(r.data);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const shownFound = q.trim().length < 2 ? [] : found;
  const modes: [Mode, string][] = [["open", "Open (stopwatch)"], ["fixed", "Fixed time"], ["prepaid", "Prepaid"], ...(packages.length ? ([["package", "Package"]] as [Mode, string][]) : [])];

  async function addCustomer() {
    const r = await createCustomerAction(nName, nPhone, nConsent);
    if (!r.ok) return toast("err", r.error);
    setCustomer(r.data);
    setAdding(false);
    setQ("");
  }

  return (
    <Modal open onClose={onClose} title={`Start · ${stationName}`}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          call(
            () => startSessionAction({ stationId, mode, players, customerId: customer?.id ?? null, minutes, packageId, rupees: rupeesIn, method }),
            { ok: `${stationName} started`, onOk: onClose },
          );
        }}
      >
        <div>
          <span className={labelCls}>How will they pay for time?</span>
          <div className="grid grid-cols-2 gap-2">
            {modes.map(([m, label]) => (
              <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m} className={`${btnCls} ${mode === m ? "border-brand bg-brand/10 text-ink" : ""}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === "fixed" && (
          <div>
            <label className={labelCls} htmlFor="mins">Minutes</label>
            <div className="mb-2 flex flex-wrap gap-2">
              {[30, 60, 90, 120, 180].map((m) => (
                <button key={m} type="button" onClick={() => setMinutes(String(m))} className={`${btnCls} !px-3 !py-1.5 ${minutes === String(m) ? "border-brand" : ""}`}>
                  {m}
                </button>
              ))}
            </div>
            <input id="mins" className={inputCls} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </div>
        )}

        {mode === "prepaid" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="adv">Amount paid now (₹)</label>
              <input id="adv" className={inputCls} inputMode="decimal" value={rupeesIn} onChange={(e) => setRupeesIn(e.target.value)} placeholder="150" />
            </div>
            <div>
              <label className={labelCls} htmlFor="adm">Paid by</label>
              <select id="adm" className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
              </select>
            </div>
          </div>
        )}

        {mode === "package" && (
          <div>
            <label className={labelCls} htmlFor="pkg">Package</label>
            <select id="pkg" className={inputCls} value={packageId} onChange={(e) => setPackageId(Number(e.target.value))}>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.minutes} min · {rupees(p.pricePaise)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={labelCls} htmlFor="players">Players / controllers</label>
          <input id="players" className={`${inputCls} max-w-28`} inputMode="numeric" value={players} onChange={(e) => setPlayers(e.target.value)} />
        </div>

        <div>
          <span className={labelCls}>Customer</span>
          {customer ? (
            <div className="flex items-center justify-between rounded-lg border border-line bg-raised px-3 py-2 text-sm">
              {customer.name}
              <button type="button" aria-label="Remove customer" onClick={() => setCustomer(null)} className="text-mute hover:text-ink">
                <X className="size-4" />
              </button>
            </div>
          ) : adding ? (
            <div className="space-y-2 rounded-lg border border-line p-3">
              <input className={inputCls} placeholder="Name" value={nName} onChange={(e) => setNName(e.target.value)} />
              <input className={inputCls} placeholder="Phone (optional)" inputMode="tel" value={nPhone} onChange={(e) => setNPhone(e.target.value)} />
              <label className="flex items-center gap-2 text-sm text-silver">
                <input type="checkbox" checked={nConsent} onChange={(e) => setNConsent(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />
                OK to message them on WhatsApp
              </label>
              <div className="flex gap-2">
                <button type="button" className={btnPrimaryCls} onClick={addCustomer}>Save customer</button>
                <button type="button" className={btnCls} onClick={() => setAdding(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-mute" />
                <input className={`${inputCls} pl-9`} placeholder="Walk-in. Type to find a regular…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              {shownFound.length > 0 && (
                <ul className="mt-1 overflow-hidden rounded-lg border border-line">
                  {shownFound.map((c) => (
                    <li key={c.id}>
                      <button type="button" className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-raised" onClick={() => { setCustomer({ id: c.id, name: c.name }); setQ(""); }}>
                        {c.name}
                        <span className="text-mute">{c.phone ?? ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" onClick={() => setAdding(true)} className="mt-2 inline-flex items-center gap-1.5 text-sm text-silver hover:text-ink">
                <UserPlus className="size-4" /> New customer
              </button>
            </>
          )}
        </div>

        <button type="submit" disabled={pending} className={`${btnPrimaryCls} w-full !py-3 text-base`}>
          {pending ? "Starting…" : "Start session"}
        </button>
      </form>
    </Modal>
  );
}
```

**`components/floor/BillPanel.tsx`**

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { finalizeBillAction, getDraftAction } from "@/app/(app)/actions";
import { useCall } from "@/lib/useCall";
import { useToast } from "@/components/toast";
import { UpiQr } from "@/components/upi-qr";
import { computeBill, splitEven } from "@/lib/engine/bill";
import type { BillLineInput, Discount } from "@/lib/engine/bill";
import { upiLink } from "@/lib/engine/upi";
import { rupeesToPaise } from "@/lib/validate";
import { rupees } from "@/lib/format";
import { btnCls, btnPrimaryCls, inputCls, labelCls } from "@/lib/ui";

type Draft = { lines: BillLineInput[]; advancePaise: number; advanceMethod: string | null; maxStaffDiscountPct: number };
type Row = { method: string; rupees: string };

const safePaise = (v: string): number | null => {
  try {
    return rupeesToPaise(v, "Amount");
  } catch {
    return null;
  }
};

export function BillPanel({ sessionId, cafeName, upiId, role, onPaid }: {
  sessionId: number;
  cafeName: string;
  upiId: string;
  role: "owner" | "staff";
  onPaid: (billId: number) => void;
}) {
  const toast = useToast();
  const { call, pending } = useCall();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dType, setDType] = useState<"none" | "flat" | "percent">("none");
  const [dValue, setDValue] = useState("");
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState<Row[]>([{ method: "cash", rupees: "" }]);
  const [touched, setTouched] = useState(false);
  const [people, setPeople] = useState("1");

  useEffect(() => {
    let live = true;
    getDraftAction(sessionId).then((r) => {
      if (!live) return;
      if (r.ok) setDraft(r.data as Draft);
      else toast("err", r.error);
    });
    return () => {
      live = false;
    };
  }, [sessionId, toast]);

  const discount: Discount = useMemo(() => {
    if (dType === "none" || !dValue.trim()) return null;
    if (dType === "flat") {
      const p = safePaise(dValue);
      return p === null ? null : { type: "flat", value: p };
    }
    const n = Number(dValue);
    return Number.isFinite(n) ? { type: "percent", value: n } : null;
  }, [dType, dValue]);

  const totals = useMemo(() => (draft ? computeBill(draft.lines, discount) : null), [draft, discount]);
  if (!draft || !totals) return <p className="text-sm text-mute">Calculating bill…</p>;

  const advanceApplied = draft.advanceMethod ? Math.min(draft.advancePaise, totals.totalPaise) : 0;
  const refund = draft.advancePaise - advanceApplied;
  const due = totals.totalPaise - advanceApplied;

  // Until staff edit anything, a single payment row simply follows the amount due.
  const shown: Row[] = !touched && rows.length === 1 ? (due > 0 ? [{ method: rows[0].method, rupees: (due / 100).toFixed(2) }] : []) : rows;
  const paidNow = shown.reduce((a, r) => a + (safePaise(r.rupees) ?? 0), 0);
  const remaining = due - paidNow;

  const edit = (i: number, patch: Partial<Row>) => {
    const base = !touched && rows.length === 1 ? (shown.length ? shown : rows) : rows;
    setTouched(true);
    setRows(base.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  const upiRow = shown.find((r) => r.method === "upi" && (safePaise(r.rupees) ?? 0) > 0);
  let qr: string | null = null;
  if (upiRow && upiId) {
    try {
      qr = upiLink({ upiId, name: cafeName, amountPaise: safePaise(upiRow.rupees)!, note: "Gaming session" });
    } catch {
      qr = null;
    }
  }

  const shares = splitEven(due, Math.max(1, Math.min(20, Number(people) || 1)));

  return (
    <div className="space-y-5">
      <ul className="divide-y divide-line rounded-lg border border-line text-sm">
        {draft.lines.map((l, i) => (
          <li key={i} className="flex justify-between gap-3 px-3 py-2">
            <span>{l.qty > 1 ? `${l.qty} × ` : ""}{l.name}</span>
            <span className="tnum">{rupees(l.qty * l.unitPaise)}</span>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2">
        <div>
          <label className={labelCls} htmlFor="dt">Discount</label>
          <select id="dt" className={inputCls} value={dType} onChange={(e) => setDType(e.target.value as typeof dType)}>
            <option value="none">None</option>
            <option value="flat">₹ off</option>
            <option value="percent">% off</option>
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="dv">Value</label>
          <input id="dv" className={inputCls} inputMode="decimal" disabled={dType === "none"} value={dValue} onChange={(e) => setDValue(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="dr">Reason</label>
          <input id="dr" className={inputCls} disabled={dType === "none"} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. regular" />
        </div>
      </div>
      {role === "staff" && dType !== "none" && <p className="-mt-3 text-xs text-mute">Staff can give up to {draft.maxStaffDiscountPct}%. More needs the owner.</p>}

      <dl className="space-y-1 text-sm">
        <div className="flex justify-between text-mute"><dt>Subtotal</dt><dd className="tnum">{rupees(totals.subtotalPaise)}</dd></div>
        {totals.discountPaise > 0 && <div className="flex justify-between text-mute"><dt>Discount</dt><dd className="tnum">−{rupees(totals.discountPaise)}</dd></div>}
        {totals.taxPaise > 0 && <div className="flex justify-between text-mute"><dt>Includes GST</dt><dd className="tnum">{rupees(totals.taxPaise)}</dd></div>}
        <div className="flex items-baseline justify-between border-t border-line pt-2 font-display text-3xl font-bold"><dt>Total</dt><dd className="tnum">{rupees(totals.totalPaise)}</dd></div>
        {advanceApplied > 0 && <div className="flex justify-between text-silver"><dt>Paid in advance ({draft.advanceMethod})</dt><dd className="tnum">−{rupees(advanceApplied)}</dd></div>}
        {refund > 0 && <div className="rounded-lg bg-warn/10 px-3 py-2 text-warn">Give back {rupees(refund)} to the customer.</div>}
      </dl>

      {due > 0 && (
        <div className="space-y-2">
          <span className={labelCls}>Payment</span>
          {shown.map((r, i) => (
            <div key={i} className="flex gap-2">
              <select aria-label="Method" className={`${inputCls} !w-28`} value={r.method} onChange={(e) => edit(i, { method: e.target.value })}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
              </select>
              <input aria-label="Amount" className={inputCls} inputMode="decimal" value={r.rupees} onChange={(e) => edit(i, { rupees: e.target.value })} />
              {shown.length > 1 && (
                <button type="button" aria-label="Remove payment" className={btnCls} onClick={() => { setTouched(true); setRows(shown.filter((_, j) => j !== i)); }}>
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-silver hover:text-ink"
              onClick={() => {
                setTouched(true);
                setRows([...shown, { method: "upi", rupees: remaining > 0 ? (remaining / 100).toFixed(2) : "" }]);
              }}
            >
              <Plus className="size-4" /> Split across methods
            </button>
            <span className={`tnum ${remaining === 0 ? "text-free" : "text-warn"}`}>{remaining === 0 ? "Matches total" : remaining > 0 ? `${rupees(remaining)} still due` : `${rupees(-remaining)} too much`}</span>
          </div>
        </div>
      )}

      {upiRow && (
        <div className="flex items-center gap-4 rounded-lg border border-line p-3">
          {qr ? <UpiQr link={qr} size={150} /> : null}
          <p className="text-sm text-silver">
            {qr ? <>Scan to pay <b className="tnum">{rupees(safePaise(upiRow.rupees)!)}</b> to {cafeName}. Confirm the payment arrived on your phone before marking paid.</> : "Add your UPI ID in Settings → Cafe to show a payment QR here."}
          </p>
        </div>
      )}

      <div className="flex items-center gap-3 text-sm text-mute">
        <label htmlFor="ppl">Split between</label>
        <input id="ppl" className={`${inputCls} !w-16`} inputMode="numeric" value={people} onChange={(e) => setPeople(e.target.value)} />
        <span className="tnum">people: {Number(people) > 1 ? shares.map((s) => rupees(s)).join(" · ") : "—"}</span>
      </div>

      <button
        type="button"
        disabled={pending || remaining !== 0}
        className={`${btnPrimaryCls} w-full !py-3 text-base`}
        onClick={() =>
          call(
            () => finalizeBillAction({ sessionId, discountType: dType, discountValue: dValue, reason, payments: shown }),
            { ok: "Bill paid", onOk: (r) => onPaid((r as { billId: number }).billId) },
          )
        }
      >
        {pending ? "Saving…" : `Mark paid · ${rupees(due)}`}
      </button>
    </div>
  );
}
```

**`components/floor/SessionDrawer.tsx`**

```tsx
"use client";
import { useState } from "react";
import { Pause, Play, Square, Undo2, X } from "lucide-react";
import { Modal } from "@/components/modal";
import { useCall } from "@/lib/useCall";
import { addItemAction, extendAction, notesAction, pauseAction, removeItemAction, reopenAction, resumeAction, stopAction, transferAction } from "@/app/(app)/actions";
import { liveInfo } from "@/lib/live";
import { clock, hms, rupees } from "@/lib/format";
import { btnCls, btnDangerCls, btnPrimaryCls, inputCls, labelCls } from "@/lib/ui";
import type { BoardStation } from "@/lib/db/sessions";
import { STATUS } from "./status";
import { BillPanel } from "./BillPanel";

export function SessionDrawer({ station, zoneName, siblings, now, leadMin, cafe, role, onClose }: {
  station: BoardStation;
  zoneName: string;
  siblings: BoardStation[]; // other stations in the same zone, for Transfer
  now: number;
  leadMin: number;
  cafe: { name: string; upiId: string };
  role: "owner" | "staff";
  onClose: () => void;
}) {
  const s = station.session!;
  const { call, pending } = useCall();
  const info = liveInfo(s, leadMin, now);
  const st = STATUS[info.status];
  const Icon = st.icon;
  const [item, setItem] = useState({ name: "", qty: "1", rupees: "" });
  const [notes, setNotes] = useState(s.notes);
  const free = siblings.filter((x) => x.id !== station.id && !x.session && !x.maintenance);
  const canExtend = s.plannedMinutes !== null && s.rate.packagePaise === null && !info.stopped;

  return (
    <Modal open onClose={onClose} title={`${station.name} · ${zoneName}`} side>
      <div className="space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${st.chip}`}><Icon className="size-3.5" />{st.label}</span>
            <div className="tnum mt-2 font-display text-5xl font-bold leading-none">
              {info.remainingMs !== null && !info.stopped ? (info.remainingMs < 0 ? `+${hms(-info.remainingMs)}` : hms(info.remainingMs)) : hms(info.playedMs)}
            </div>
            <div className="mt-1 text-sm text-mute">
              Started {clock(s.startedAt)} · {s.customerName ?? "Walk-in"} · {s.players} {s.players === 1 ? "player" : "players"}
              {s.plannedMinutes ? ` · ${s.plannedMinutes} min` : ""}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-mute">So far</div>
            <div className="tnum font-display text-2xl font-bold">{rupees(info.totalPaise)}</div>
            <div className="text-xs text-mute">{rupees(s.rate.hourlyPaise)}/hr{s.rate.packagePaise !== null ? " · package" : ""}</div>
          </div>
        </div>

        {!info.stopped && (
          <>
            <div className="flex flex-wrap gap-2">
              {s.pausedAt === null ? (
                <button disabled={pending} className={btnCls} onClick={() => call(() => pauseAction(s.id))}><Pause className="size-4" /> Pause</button>
              ) : (
                <button disabled={pending} className={btnPrimaryCls} onClick={() => call(() => resumeAction(s.id))}><Play className="size-4" /> Resume</button>
              )}
              {canExtend && [15, 30, 60].map((m) => (
                <button key={m} disabled={pending} className={btnCls} onClick={() => call(() => extendAction(s.id, m), { ok: `Extended by ${m} min` })}>+{m} min</button>
              ))}
              <button disabled={pending} className={`${btnDangerCls} ml-auto`} onClick={() => call(() => stopAction(s.id))}><Square className="size-4" /> Stop</button>
            </div>

            {free.length > 0 && (
              <div>
                <label className={labelCls} htmlFor="mv">Move to another {zoneName} station</label>
                <select id="mv" className={inputCls} defaultValue="" onChange={(e) => e.target.value && call(() => transferAction(s.id, Number(e.target.value)), { ok: "Moved", onOk: onClose })}>
                  <option value="">Choose…</option>
                  {free.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </div>
            )}
          </>
        )}

        <section>
          <h3 className={labelCls}>Food and extras</h3>
          {s.items.length > 0 && (
            <ul className="mb-3 divide-y divide-line rounded-lg border border-line text-sm">
              {s.items.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span>{i.qty} × {i.name}</span>
                  <span className="flex items-center gap-2"><span className="tnum">{rupees(i.qty * i.unitPaise)}</span>
                    <button aria-label={`Remove ${i.name}`} className="text-mute hover:text-brand-hi" onClick={() => call(() => removeItemAction(i.id))}><X className="size-4" /></button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <form
            className="grid grid-cols-[1fr_4rem_5.5rem_auto] gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              call(() => addItemAction(s.id, item.name, item.qty, item.rupees), { onOk: () => setItem({ name: "", qty: "1", rupees: "" }) });
            }}
          >
            <input aria-label="Item" className={inputCls} placeholder="Coke, chips…" value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} />
            <input aria-label="Quantity" className={inputCls} inputMode="numeric" value={item.qty} onChange={(e) => setItem({ ...item, qty: e.target.value })} />
            <input aria-label="Price each in rupees" className={inputCls} inputMode="decimal" placeholder="₹ each" value={item.rupees} onChange={(e) => setItem({ ...item, rupees: e.target.value })} />
            <button className={btnCls} disabled={pending}>Add</button>
          </form>
        </section>

        <section>
          <label className={labelCls} htmlFor="nt">Notes</label>
          <textarea id="nt" rows={2} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== s.notes && call(() => notesAction(s.id, notes))} />
        </section>

        {info.stopped && (
          <section className="space-y-4 border-t border-line pt-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-bold">Bill</h3>
              <button disabled={pending} className={btnCls} onClick={() => call(() => reopenAction(s.id), { ok: "Session resumed. The time since Stop isn't billed." })}><Undo2 className="size-4" /> Undo stop</button>
            </div>
            <BillPanel sessionId={s.id} cafeName={cafe.name} upiId={cafe.upiId} role={role} onPaid={onClose} />
          </section>
        )}
      </div>
    </Modal>
  );
}
```

**`components/floor/Board.tsx`**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import type { BoardZone } from "@/lib/db/sessions";
import type { PackageRow } from "@/lib/db/catalog";
import { liveInfo } from "@/lib/live";
import { beep } from "@/lib/alerts";
import { rupees } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { useToast } from "@/components/toast";
import { StationCard } from "./StationCard";
import { StartDialog } from "./StartDialog";
import { SessionDrawer } from "./SessionDrawer";
import { ZONE_ICON } from "./status";

export function Board({ zones, packages, leadMin, cafe, role }: {
  zones: BoardZone[];
  packages: PackageRow[];
  leadMin: number;
  cafe: { name: string; upiId: string };
  role: "owner" | "staff";
}) {
  const now = useNow();
  const toast = useToast();
  const [starting, setStarting] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const seen = useRef(new Map<number, { status: string; lastBeep: number }>());

  // Beep and toast when a session crosses into "ending soon" or "overtime"; overtime repeats every minute.
  useEffect(() => {
    if (!now) return;
    for (const z of zones) {
      for (const st of z.stations) {
        const s = st.session;
        if (!s || s.endedAt !== null) continue;
        const status = liveInfo(s, leadMin, now).status;
        const prev = seen.current.get(s.id);
        if (prev && prev.status !== status && (status === "ending" || status === "overtime")) {
          beep(status);
          toast("info", `${st.name}: ${status === "ending" ? `${leadMin} minutes or less left` : "time is up"}`);
          seen.current.set(s.id, { status, lastBeep: now });
        } else if (prev && status === "overtime" && now - prev.lastBeep >= 60_000) {
          beep("overtime");
          seen.current.set(s.id, { status, lastBeep: now });
        } else if (!prev || prev.status !== status) {
          seen.current.set(s.id, { status, lastBeep: now });
        }
      }
    }
  }, [now, zones, leadMin, toast]);

  const all = zones.flatMap((z) => z.stations);
  const busy = all.filter((s) => s.session);
  const running = busy.reduce((sum, s) => sum + (now ? liveInfo(s.session!, leadMin, now).totalPaise : 0), 0);
  const openStation = open === null ? null : all.find((s) => s.id === open) ?? null;
  const openZone = openStation ? zones.find((z) => z.stations.some((s) => s.id === openStation.id)) : null;
  const startStation = starting === null ? null : all.find((s) => s.id === starting) ?? null;
  const startZone = startStation ? zones.find((z) => z.stations.some((s) => s.id === startStation.id)) : null;

  if (zones.length === 0) {
    return <p className="rounded-xl border border-dashed border-line p-10 text-center text-mute">No stations yet. Add zones and stations in Settings.</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-bold tracking-wide">Floor</h1>
        <p className="text-sm text-mute">
          <span className="tnum font-semibold text-ink">{busy.length}</span> of {all.length} stations in use · <span className="tnum font-semibold text-ink">{rupees(running)}</span> on the clock
        </p>
      </div>

      {zones.map((z) => {
        const Icon = ZONE_ICON[z.kind] ?? ZONE_ICON.custom;
        return (
          <section key={z.id} aria-label={z.name}>
            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold uppercase tracking-widest text-silver">
              <Icon className="size-5 text-brand" /> {z.name}
              <span className="text-sm font-medium normal-case tracking-normal text-mute">{z.stations.filter((s) => s.session).length}/{z.stations.length}</span>
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
              {z.stations.map((st) => (
                <StationCard key={st.id} station={st} now={now} leadMin={leadMin} onOpen={() => setOpen(st.id)} onStart={() => setStarting(st.id)} />
              ))}
            </div>
          </section>
        );
      })}

      {startStation && startZone && (
        <StartDialog stationId={startStation.id} stationName={startStation.name} packages={packages.filter((p) => p.zoneId === startZone.id)} onClose={() => setStarting(null)} />
      )}
      {openStation?.session && openZone && now > 0 && (
        <SessionDrawer station={openStation} zoneName={openZone.name} siblings={openZone.stations} now={now} leadMin={leadMin} cafe={cafe} role={role} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check, lint and build**

Run: `npx tsc --noEmit && npx eslint && npm run build`
Expected: no `tsc` or `eslint` output; the build prints a route table with `ƒ /`, `ƒ /login`, `ƒ /setup`, `ƒ /api/auth/[...all]` and **no `data/` folder is created in the project root** (`ls data` says no such file). A "Database schema mismatch" line in the build output means a page or route touched the database at build time (see the Task 7 trap).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add the floor: board, start dialog, session drawer, bill panel and server actions" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Bills list and digital invoice

**Files:**
- Create: `app/(app)/bills/page.tsx`, `app/(app)/bills/[id]/page.tsx`, `app/(app)/bills/[id]/InvoiceActions.tsx`

**Interfaces:**
- Consumes: Task 5 (`listBills`, `getBill`), Task 10 (`voidBillAction`).
- Produces: `/bills` (50 per page, newer/older links) and `/bills/[id]` (invoice with lounge details, lines, discount, GST breakup, payments; "Save as PDF" opens the browser print dialog; owners can void with a reason).

- [ ] **Step 1: Write the pages**

**`app/(app)/bills/page.tsx`**

```tsx
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listBills } from "@/lib/db/bills";
import { dateTime, invoiceNo, rupees } from "@/lib/format";
import { btnCls, cardCls } from "@/lib/ui";

const PAGE = 50;

export default async function BillsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireUser();
  const page = Math.max(1, Math.floor(Number((await searchParams).page) || 1));
  const bills = listBills(PAGE + 1, (page - 1) * PAGE);
  const more = bills.length > PAGE;
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-bold tracking-wide">Bills</h1>
      {bills.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-10 text-center text-mute">No bills yet. They appear here once a session is paid.</p>
      ) : (
        <div className={`${cardCls} overflow-x-auto`}>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-mute">
              <tr className="border-b border-line">
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Station</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {bills.slice(0, PAGE).map((b) => (
                <tr key={b.id} className="hover:bg-raised/60">
                  <td className="px-4 py-3 font-semibold"><Link className="text-brand-hi hover:underline" href={`/bills/${b.id}`}>{invoiceNo(b.invoiceNo)}</Link></td>
                  <td className="px-4 py-3 text-silver">{dateTime(b.createdAt)}</td>
                  <td className="px-4 py-3">{b.stationName ?? "—"}</td>
                  <td className="px-4 py-3">{b.customerName ?? "Walk-in"}</td>
                  <td className="tnum px-4 py-3 text-right font-semibold">{rupees(b.totalPaise)}</td>
                  <td className="px-4 py-3">{b.status === "void" ? <span className="rounded-full bg-line px-2 py-0.5 text-xs text-mute">Void</span> : <span className="rounded-full bg-free/15 px-2 py-0.5 text-xs text-free">Paid</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex gap-2">
        {page > 1 && <Link className={btnCls} href={`/bills?page=${page - 1}`}>Newer</Link>}
        {more && <Link className={btnCls} href={`/bills?page=${page + 1}`}>Older</Link>}
      </div>
    </div>
  );
}
```

**`app/(app)/bills/[id]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getBill } from "@/lib/db/bills";
import { getSettings } from "@/lib/db/settings";
import { dateTime, invoiceNo, rupees } from "@/lib/format";
import { btnCls } from "@/lib/ui";
import { InvoiceActions } from "./InvoiceActions";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const bill = /^\d+$/.test(id) ? getBill(Number(id)) : undefined;
  if (!bill) notFound();
  const cafe = getSettings();
  const gst = bill.lines.some((l) => l.taxPct > 0);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="no-print flex items-center justify-between">
        <Link href="/bills" className={btnCls}><ArrowLeft className="size-4" /> Bills</Link>
        <InvoiceActions billId={bill.id} canVoid={me.role === "owner" && bill.status === "paid"} />
      </div>

      <article className="rounded-2xl border border-line bg-panel p-8 print:border-0 print:p-0">
        {bill.status === "void" && (
          <div className="mb-5 rounded-lg border border-brand/50 bg-brand/10 px-4 py-3 text-sm text-brand-hi">
            <b>VOID</b> · {bill.voidReason}
          </div>
        )}
        <header className="flex items-start justify-between gap-6 border-b border-line pb-5">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-wide">{cafe["cafe.name"]}</h1>
            {cafe["cafe.address"] && <p className="mt-1 max-w-xs text-sm text-silver">{cafe["cafe.address"]}</p>}
            {cafe["cafe.phone"] && <p className="text-sm text-silver">{cafe["cafe.phone"]}</p>}
            {gst && cafe["cafe.gstin"] && <p className="text-sm text-silver">GSTIN {cafe["cafe.gstin"]}</p>}
          </div>
          <div className="text-right text-sm">
            <div className="font-display text-xl font-bold">{invoiceNo(bill.invoiceNo)}</div>
            <div className="text-silver">{dateTime(bill.createdAt)}</div>
            <div className="text-silver">{bill.customerName ?? "Walk-in"}</div>
          </div>
        </header>

        <table className="mt-5 w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-mute">
            <tr><th className="pb-2 font-medium">Item</th><th className="pb-2 text-right font-medium">Qty</th><th className="pb-2 text-right font-medium">Price</th><th className="pb-2 text-right font-medium">Amount</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {bill.lines.map((l, i) => (
              <tr key={i}>
                <td className="py-2">{l.name}</td>
                <td className="tnum py-2 text-right">{l.qty}</td>
                <td className="tnum py-2 text-right">{rupees(l.unitPaise)}</td>
                <td className="tnum py-2 text-right">{rupees(l.qty * l.unitPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ml-auto mt-5 w-64 space-y-1 text-sm">
          <div className="flex justify-between text-silver"><dt>Subtotal</dt><dd className="tnum">{rupees(bill.subtotalPaise)}</dd></div>
          {bill.discountPaise > 0 && <div className="flex justify-between text-silver"><dt>Discount ({bill.discountReason})</dt><dd className="tnum">−{rupees(bill.discountPaise)}</dd></div>}
          {bill.taxPaise > 0 && <div className="flex justify-between text-silver"><dt>Includes GST</dt><dd className="tnum">{rupees(bill.taxPaise)}</dd></div>}
          <div className="flex justify-between border-t border-line pt-2 font-display text-2xl font-bold"><dt>Total</dt><dd className="tnum">{rupees(bill.totalPaise)}</dd></div>
        </dl>

        <p className="mt-6 text-xs uppercase tracking-wider text-mute">Paid by {bill.payments.map((p) => `${p.method.toUpperCase()} ${rupees(p.amountPaise)}`).join(" · ") || "—"}</p>
        <p className="mt-6 text-center text-sm text-silver">Thank you for playing at {cafe["cafe.name"]}!</p>
      </article>
    </div>
  );
}
```

**`app/(app)/bills/[id]/InvoiceActions.tsx`**

```tsx
"use client";
import { useState } from "react";
import { FileDown, Ban } from "lucide-react";
import { Modal } from "@/components/modal";
import { useCall } from "@/lib/useCall";
import { voidBillAction } from "@/app/(app)/actions";
import { btnCls, btnDangerCls, btnPrimaryCls, inputCls, labelCls } from "@/lib/ui";

export function InvoiceActions({ billId, canVoid }: { billId: number; canVoid: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { call, pending } = useCall();
  return (
    <div className="flex gap-2">
      <button type="button" className={btnCls} onClick={() => window.print()}><FileDown className="size-4" /> Save as PDF</button>
      {canVoid && (
        <>
          <button type="button" className={btnDangerCls} onClick={() => setOpen(true)}><Ban className="size-4" /> Void bill</button>
          <Modal open={open} onClose={() => setOpen(false)} title="Void this bill?">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                call(() => voidBillAction(billId, reason), { ok: "Bill voided", onOk: () => setOpen(false) });
              }}
            >
              <p className="text-sm text-silver">The bill stays in your records marked void. This can&apos;t be undone.</p>
              <div>
                <label htmlFor="vr" className={labelCls}>Reason</label>
                <input id="vr" required className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <button disabled={pending} className={btnPrimaryCls}>Void bill</button>
            </form>
          </Modal>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check, lint and build**

Run: `npx tsc --noEmit && npx eslint && npm run build`
Expected: clean; route table now lists `ƒ /bills` and `ƒ /bills/[id]`; still no `data/` folder.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Add bills list and digital invoice with void" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Settings (lounge, zones and stations, rates and packages, staff)

**Files:**
- Create: `app/(app)/settings/actions.ts`, `app/(app)/settings/page.tsx`, `app/(app)/settings/CafeTab.tsx`, `app/(app)/settings/ZonesTab.tsx`, `app/(app)/settings/RatesTab.tsx`, `app/(app)/settings/StaffTab.tsx`

**Interfaces:**
- Consumes: Task 4 (`catalog`, `settings`), Task 6 (`createUser`, `listStaff`, `setPin`, `removeUser`), Task 7 (`ownerActor`, `requireOwnerPage`), Task 8 (`ActionForm`).
- Produces: owner-only `/settings?tab=cafe|zones|rates|staff`. Every action calls `ownerActor()` first. A bad accent colour rejects the whole save (it is injected into a style attribute: it must match `#rrggbb`). Staff PINs are 4 to 8 digits; the owner cannot be removed.

- [ ] **Step 1: Write the settings actions**

**`app/(app)/settings/actions.ts`**

```typescript
"use server";
import fs from "node:fs";
import path from "node:path";
import { act } from "@/lib/action";
import { ownerActor } from "@/lib/session";
import { UserError } from "@/lib/errors";
import { bool, hhmm, int, oneOf, rupeesToPaise, str } from "@/lib/validate";
import { isValidUpiId } from "@/lib/engine/upi";
import { createUser, listStaff, removeUser, setPin } from "@/lib/auth-core";
import { getAuth } from "@/lib/auth";
import { dataDir } from "@/lib/db/index";
import { getSetting, setSettings } from "@/lib/db/settings";
import { saveLogo, UPLOAD_NAME } from "@/lib/logo";
import {
  ZONE_KINDS, archivePackage, archiveRate, archiveStation, archiveZone, createStation, createZone, renameZone, savePackage, saveRate, updateStation,
} from "@/lib/db/catalog";

const field = (fd: FormData, k: string) => fd.get(k);

export async function saveCafeAction(fd: FormData) {
  return act(async () => {
    await ownerActor();
    const upiId = str(field(fd, "upiId"), "UPI ID", { max: 80, required: false });
    if (upiId && !isValidUpiId(upiId)) throw new UserError("That UPI ID doesn't look right. It should look like name@bank.");
    const accent = str(field(fd, "accent"), "Accent colour", { max: 7 });
    if (!/^#[0-9a-f]{6}$/i.test(accent)) throw new UserError("Pick a colour from the colour box");
    setSettings({
      "cafe.name": str(field(fd, "cafeName"), "Lounge name", { max: 60 }),
      "cafe.address": str(field(fd, "address"), "Address", { max: 200, required: false }),
      "cafe.phone": str(field(fd, "phone"), "Phone", { max: 30, required: false }),
      "cafe.gstin": str(field(fd, "gstin"), "GSTIN", { max: 20, required: false }),
      "cafe.upiId": upiId,
      "cafe.accent": accent,
      "gst.enabled": bool(field(fd, "gst")) ? "1" : "0",
      "gst.pct": String(int(field(fd, "gstPct"), "GST %", { min: 0, max: 28 })),
      "alert.leadMin": String(int(field(fd, "leadMin"), "Ending-soon warning", { min: 1, max: 120 })),
      "staff.maxDiscountPct": String(int(field(fd, "maxDiscount"), "Staff discount limit", { min: 0, max: 100 })),
    });
  });
}

export async function uploadLogoAction(fd: FormData) {
  return act(async () => {
    await ownerActor();
    const f = field(fd, "logo");
    if (!(f instanceof File)) throw new UserError("Choose an image file");
    const name = saveLogo(dataDir(), new Uint8Array(await f.arrayBuffer()), getSetting("cafe.logo"));
    setSettings({ "cafe.logo": name });
  });
}

export async function removeLogoAction() {
  return act(async () => {
    await ownerActor();
    const current = getSetting("cafe.logo");
    if (UPLOAD_NAME.test(current)) fs.rmSync(path.join(dataDir(), "uploads", current), { force: true });
    setSettings({ "cafe.logo": "" });
  });
}

// ---- zones and stations ----
const zoneKind = (fd: FormData) => oneOf(field(fd, "kind"), ZONE_KINDS, "Zone type");

export const createZoneAction = async (fd: FormData) =>
  act(async () => { await ownerActor(); createZone(str(field(fd, "name"), "Zone name", { max: 40 }), zoneKind(fd)); });

export const updateZoneAction = async (fd: FormData) =>
  act(async () => { await ownerActor(); renameZone(int(field(fd, "id"), "Zone"), str(field(fd, "name"), "Zone name", { max: 40 }), zoneKind(fd)); });

export const archiveZoneAction = async (fd: FormData) =>
  act(async () => { await ownerActor(); archiveZone(int(field(fd, "id"), "Zone")); });

export const createStationAction = async (fd: FormData) =>
  act(async () => { await ownerActor(); createStation(int(field(fd, "zoneId"), "Zone"), str(field(fd, "name"), "Station name", { max: 40 })); });

export const updateStationAction = async (fd: FormData) =>
  act(async () => { await ownerActor(); updateStation(int(field(fd, "id"), "Station"), str(field(fd, "name"), "Station name", { max: 40 }), bool(field(fd, "maintenance"))); });

export const archiveStationAction = async (fd: FormData) =>
  act(async () => { await ownerActor(); archiveStation(int(field(fd, "id"), "Station")); });

// ---- rates and packages ----
export async function saveRateAction(fd: FormData) {
  return act(async () => {
    await ownerActor();
    let daysMask = 0;
    for (let d = 0; d < 7; d++) if (bool(field(fd, `d${d}`))) daysMask |= 1 << d;
    if (daysMask === 0) throw new UserError("Pick at least one day");
    const fromMin = hhmm(field(fd, "from"), "From");
    const toMin = hhmm(field(fd, "to"), "Until", true);
    if (fromMin === toMin) throw new UserError("From and Until can't be the same time");
    const idRaw = field(fd, "id");
    const extra = str(field(fd, "extra"), "Extra controller price", { max: 12, required: false });
    saveRate({
      id: idRaw ? int(idRaw, "Rate") : undefined,
      zoneId: int(field(fd, "zoneId"), "Zone"),
      name: str(field(fd, "name"), "Rate name", { max: 40 }),
      hourlyPaise: rupeesToPaise(field(fd, "hourly"), "Hourly rate"),
      extraControllerPaise: extra ? rupeesToPaise(extra, "Extra controller price") : 0,
      incrementMin: int(field(fd, "increment"), "Billing step", { min: 1, max: 240 }),
      minMinutes: int(field(fd, "min"), "Minimum minutes", { min: 0, max: 600 }),
      graceMin: int(field(fd, "grace"), "Free minutes", { min: 0, max: 120 }),
      daysMask,
      fromMin,
      toMin,
      priority: int(field(fd, "priority"), "Priority", { min: 0, max: 100 }),
    });
  });
}

export const archiveRateAction = async (fd: FormData) =>
  act(async () => { await ownerActor(); archiveRate(int(field(fd, "id"), "Rate")); });

export async function savePackageAction(fd: FormData) {
  return act(async () => {
    await ownerActor();
    const idRaw = field(fd, "id");
    savePackage({
      id: idRaw ? int(idRaw, "Package") : undefined,
      zoneId: int(field(fd, "zoneId"), "Zone"),
      name: str(field(fd, "name"), "Package name", { max: 40 }),
      minutes: int(field(fd, "minutes"), "Minutes", { min: 1, max: 1440 }),
      pricePaise: rupeesToPaise(field(fd, "price"), "Price"),
    });
  });
}

export const archivePackageAction = async (fd: FormData) =>
  act(async () => { await ownerActor(); archivePackage(int(field(fd, "id"), "Package")); });

// ---- staff ----
const pin = (fd: FormData) => {
  const p = String(field(fd, "pin") ?? "");
  if (!/^\d{4,8}$/.test(p)) throw new UserError("PIN must be 4 to 8 digits");
  return p;
};

export async function createStaffAction(fd: FormData) {
  return act(async () => {
    await ownerActor();
    const username = str(field(fd, "username"), "Username", { max: 20 }).toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) throw new UserError("Username can use letters, numbers and _ (3 to 20 characters)");
    await createUser(getAuth(), { username, pin: pin(fd), name: str(field(fd, "name"), "Name", { max: 60 }), role: "staff" });
  });
}

export async function resetPinAction(fd: FormData) {
  return act(async () => {
    await ownerActor();
    const id = str(field(fd, "id"), "Person", { max: 64 });
    if (!listStaff().some((s) => s.id === id)) throw new UserError("Person not found");
    await setPin(getAuth(), id, pin(fd));
  });
}

export async function removeStaffAction(fd: FormData) {
  return act(async () => {
    await ownerActor();
    const id = str(field(fd, "id"), "Person", { max: 64 });
    const target = listStaff().find((s) => s.id === id);
    if (!target) throw new UserError("Person not found");
    if (target.role === "owner") throw new UserError("The owner can't be removed");
    await removeUser(getAuth(), id);
  });
}
```

- [ ] **Step 2: Write the settings pages**

**`app/(app)/settings/page.tsx`**

```tsx
import Link from "next/link";
import { requireOwnerPage } from "@/lib/session";
import { CafeTab } from "./CafeTab";
import { ZonesTab } from "./ZonesTab";
import { RatesTab } from "./RatesTab";
import { StaffTab } from "./StaffTab";

const TABS = [
  { id: "cafe", label: "Lounge" },
  { id: "zones", label: "Zones & stations" },
  { id: "rates", label: "Rates & packages" },
  { id: "staff", label: "Staff" },
] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireOwnerPage();
  const wanted = (await searchParams).tab;
  const tab = TABS.find((t) => t.id === wanted)?.id ?? "cafe";
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold tracking-wide">Settings</h1>
      <nav aria-label="Settings sections" className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/settings?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition ${tab === t.id ? "border-brand text-ink" : "border-transparent text-mute hover:text-ink"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "cafe" && <CafeTab />}
      {tab === "zones" && <ZonesTab />}
      {tab === "rates" && <RatesTab />}
      {tab === "staff" && <StaffTab meId={me.id} />}
    </div>
  );
}
```

**`app/(app)/settings/CafeTab.tsx`**

```tsx
import { ActionForm } from "@/components/action-form";
import { Brand } from "@/components/brand";
import { getSettings } from "@/lib/db/settings";
import { btnCls, btnDangerCls, btnPrimaryCls, cardCls, inputCls, labelCls } from "@/lib/ui";
import { removeLogoAction, saveCafeAction, uploadLogoAction } from "./actions";

export function CafeTab() {
  const s = getSettings();
  return (
    <div className="grid max-w-3xl gap-6">
      <ActionForm action={saveCafeAction} success="Saved" className={`${cardCls} space-y-5 p-6`}>
        <h2 className="font-display text-xl font-semibold">Your lounge</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="cafeName">Lounge name</label>
            <input id="cafeName" name="cafeName" required maxLength={60} defaultValue={s["cafe.name"]} className={inputCls} />
          </div>
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
          <div>
            <label className={labelCls} htmlFor="accent">Accent colour</label>
            <input id="accent" name="accent" type="color" defaultValue={s["cafe.accent"]} className="h-10 w-20 cursor-pointer rounded-lg border border-line bg-raised p-1" />
          </div>
        </div>

        <h2 className="pt-2 font-display text-xl font-semibold">Tax</h2>
        <div className="grid items-end gap-4 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm text-silver sm:col-span-1">
            <input type="checkbox" name="gst" defaultChecked={s["gst.enabled"] === "1"} className="size-4 accent-[var(--color-brand)]" /> Show GST on invoices
          </label>
          <div>
            <label className={labelCls} htmlFor="gstPct">GST % (included in your prices)</label>
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

      <section className={`${cardCls} space-y-4 p-6`}>
        <h2 className="font-display text-xl font-semibold">Logo</h2>
        <div className="max-w-xs rounded-lg bg-black p-3">
          <Brand name={s["cafe.name"]} logo={s["cafe.logo"]} />
        </div>
        <ActionForm action={uploadLogoAction} success="Logo updated" className="flex flex-wrap items-center gap-3">
          <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" required className="text-sm text-silver file:mr-3 file:rounded-lg file:border file:border-line file:bg-raised file:px-3 file:py-2 file:text-sm file:text-ink" />
          <button className={btnCls}>Upload (PNG, JPG or WebP, up to 900 KB)</button>
        </ActionForm>
        {s["cafe.logo"] && (
          <ActionForm action={removeLogoAction} success="Logo removed">
            <button className={btnDangerCls}>Remove logo</button>
          </ActionForm>
        )}
      </section>
    </div>
  );
}
```

**`app/(app)/settings/ZonesTab.tsx`**

```tsx
import { ActionForm } from "@/components/action-form";
import { ZONE_KINDS, listStations, listZones } from "@/lib/db/catalog";
import { btnCls, btnDangerCls, btnPrimaryCls, cardCls, inputCls } from "@/lib/ui";
import { archiveStationAction, archiveZoneAction, createStationAction, createZoneAction, updateStationAction, updateZoneAction } from "./actions";

const KIND_LABEL: Record<string, string> = { pool: "Pool / snooker", ps5: "PS5 / console", pc: "PC gaming", sim: "Sim racing", vr: "VR", custom: "Other" };

function KindSelect({ value }: { value: string }) {
  return (
    <select name="kind" aria-label="Zone type" defaultValue={value} className={`${inputCls} !w-44`}>
      {ZONE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
    </select>
  );
}

export function ZonesTab() {
  const zones = listZones();
  const stations = listStations();
  return (
    <div className="max-w-3xl space-y-6">
      <ActionForm action={createZoneAction} success="Zone added" resetOnSuccess className={`${cardCls} flex flex-wrap items-end gap-2 p-4`}>
        <input name="name" required maxLength={40} aria-label="New zone name" placeholder="New zone, e.g. VR Corner" className={`${inputCls} !w-64`} />
        <KindSelect value="custom" />
        <button className={btnPrimaryCls}>Add zone</button>
      </ActionForm>

      {zones.map((z) => (
        <section key={z.id} className={`${cardCls} space-y-4 p-5`}>
          <div className="flex flex-wrap items-center gap-2">
            <ActionForm action={updateZoneAction} success="Zone saved" className="flex flex-1 flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={z.id} />
              <input name="name" required maxLength={40} aria-label="Zone name" defaultValue={z.name} className={`${inputCls} !w-56 font-semibold`} />
              <KindSelect value={z.kind} />
              <button className={btnCls}>Save</button>
            </ActionForm>
            <ActionForm action={archiveZoneAction} success="Zone removed">
              <input type="hidden" name="id" value={z.id} />
              <button className={btnDangerCls}>Remove zone</button>
            </ActionForm>
          </div>

          <ul className="space-y-2">
            {stations.filter((s) => s.zoneId === z.id).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2">
                <ActionForm action={updateStationAction} success="Station saved" className="flex flex-1 flex-wrap items-center gap-3">
                  <input type="hidden" name="id" value={s.id} />
                  <input name="name" required maxLength={40} aria-label="Station name" defaultValue={s.name} className={`${inputCls} !w-44`} />
                  <label className="flex items-center gap-2 text-sm text-silver">
                    <input type="checkbox" name="maintenance" defaultChecked={s.maintenance} className="size-4 accent-[var(--color-brand)]" /> Under maintenance
                  </label>
                  <button className={btnCls}>Save</button>
                </ActionForm>
                <ActionForm action={archiveStationAction} success="Station removed">
                  <input type="hidden" name="id" value={s.id} />
                  <button className={btnDangerCls}>Remove</button>
                </ActionForm>
              </li>
            ))}
          </ul>

          <ActionForm action={createStationAction} success="Station added" resetOnSuccess className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <input type="hidden" name="zoneId" value={z.id} />
            <input name="name" required maxLength={40} aria-label={`New station in ${z.name}`} placeholder="New station, e.g. PS5 2" className={`${inputCls} !w-52`} />
            <button className={btnCls}>Add station</button>
          </ActionForm>
        </section>
      ))}
    </div>
  );
}
```

**`app/(app)/settings/RatesTab.tsx`**

```tsx
import { ActionForm } from "@/components/action-form";
import { listPackages, listRates, listZones } from "@/lib/db/catalog";
import type { RateRow } from "@/lib/engine/rates";
import { minToHHMM } from "@/lib/validate";
import { rupees } from "@/lib/format";
import { btnCls, btnDangerCls, btnPrimaryCls, cardCls, inputCls, labelCls } from "@/lib/ui";
import { archivePackageAction, archiveRateAction, savePackageAction, saveRateAction } from "./actions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const paiseToInput = (p: number) => (p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2));

function Num({ name, label, value, w = "!w-24" }: { name: string; label: string; value: string | number; w?: string }) {
  return (
    <div>
      <label className={labelCls} htmlFor={`${name}-${label}`}>{label}</label>
      <input id={`${name}-${label}`} name={name} defaultValue={value} inputMode="decimal" className={`${inputCls} ${w}`} />
    </div>
  );
}

function RateForm({ zoneId, rate }: { zoneId: number; rate?: RateRow }) {
  const mask = rate?.daysMask ?? 127;
  return (
    <ActionForm action={saveRateAction} success={rate ? "Rate saved" : "Rate added"} resetOnSuccess={!rate} className="flex flex-wrap items-end gap-3">
      {rate && <input type="hidden" name="id" value={rate.id} />}
      <input type="hidden" name="zoneId" value={zoneId} />
      <div>
        <label className={labelCls} htmlFor={`rn-${rate?.id ?? "new"}-${zoneId}`}>Name</label>
        <input id={`rn-${rate?.id ?? "new"}-${zoneId}`} name="name" required maxLength={40} defaultValue={rate?.name ?? ""} placeholder="Standard, Happy hour…" className={`${inputCls} !w-40`} />
      </div>
      <Num name="hourly" label="₹ per hour" value={rate ? paiseToInput(rate.hourlyPaise) : ""} />
      <Num name="extra" label="₹ per extra controller" value={rate ? paiseToInput(rate.extraControllerPaise) : ""} w="!w-36" />
      <Num name="increment" label="Bill in steps of (min)" value={rate?.incrementMin ?? 1} w="!w-36" />
      <Num name="min" label="Minimum (min)" value={rate?.minMinutes ?? 15} />
      <Num name="grace" label="Free minutes" value={rate?.graceMin ?? 0} />
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
        <label className={labelCls} htmlFor={`rf-${rate?.id ?? "new"}-${zoneId}`}>From</label>
        <input id={`rf-${rate?.id ?? "new"}-${zoneId}`} name="from" defaultValue={minToHHMM(rate?.fromMin ?? 0)} pattern="\d{1,2}:\d{2}" className={`${inputCls} !w-24`} />
      </div>
      <div>
        <label className={labelCls} htmlFor={`rt-${rate?.id ?? "new"}-${zoneId}`}>Until</label>
        <input id={`rt-${rate?.id ?? "new"}-${zoneId}`} name="to" defaultValue={minToHHMM(rate?.toMin ?? 1440)} pattern="\d{1,2}:\d{2}" className={`${inputCls} !w-24`} />
      </div>
      <Num name="priority" label="Priority" value={rate?.priority ?? 0} w="!w-20" />
      <button className={rate ? btnCls : btnPrimaryCls}>{rate ? "Save" : "Add rate"}</button>
    </ActionForm>
  );
}

export function RatesTab() {
  const zones = listZones();
  const rates = listRates();
  const packages = listPackages();
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-silver">
        A rate applies on the days and times you pick. If two rates match at the same moment, the one with the higher <b>priority</b> wins, so a Happy hour rate with priority 5 beats a Standard rate with priority 0. A session keeps the rate it started with. &quot;Until 24:00&quot; means end of day; From later than Until covers overnight.
      </p>
      {zones.map((z) => (
        <section key={z.id} className={`${cardCls} space-y-5 p-5`}>
          <h2 className="font-display text-xl font-semibold">{z.name}</h2>
          {rates.filter((r) => r.zoneId === z.id).map((r) => (
            <div key={r.id} className="flex flex-wrap items-end gap-3 border-b border-line pb-5">
              <div className="min-w-0 flex-1"><RateForm zoneId={z.id} rate={r} /></div>
              <ActionForm action={archiveRateAction} success="Rate removed">
                <input type="hidden" name="id" value={r.id} />
                <button className={btnDangerCls}>Remove</button>
              </ActionForm>
            </div>
          ))}
          {!rates.some((r) => r.zoneId === z.id) && <p className="text-sm text-warn">No rate yet. Stations in this zone can&apos;t be started until you add one.</p>}
          <div>
            <h3 className={labelCls}>Add a rate</h3>
            <RateForm zoneId={z.id} />
          </div>

          <div className="border-t border-line pt-5">
            <h3 className={labelCls}>Time packages (fixed price for a fixed time)</h3>
            {packages.filter((p) => p.zoneId === z.id).map((p) => (
              <div key={p.id} className="mb-2 flex flex-wrap items-center gap-3 text-sm">
                <span className="font-semibold">{p.name}</span>
                <span className="text-silver">{p.minutes} min · {rupees(p.pricePaise)}</span>
                <ActionForm action={archivePackageAction} success="Package removed">
                  <input type="hidden" name="id" value={p.id} />
                  <button className={btnDangerCls}>Remove</button>
                </ActionForm>
              </div>
            ))}
            <ActionForm action={savePackageAction} success="Package added" resetOnSuccess className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="zoneId" value={z.id} />
              <div>
                <label className={labelCls} htmlFor={`pn-${z.id}`}>Name</label>
                <input id={`pn-${z.id}`} name="name" required maxLength={40} placeholder="Night 3 hours" className={`${inputCls} !w-44`} />
              </div>
              <Num name="minutes" label="Minutes" value="" />
              <Num name="price" label="₹ price" value="" />
              <button className={btnCls}>Add package</button>
            </ActionForm>
            <p className="mt-2 text-xs text-mute">Time past the package is billed at the hourly rate. Packages can&apos;t be extended.</p>
          </div>
        </section>
      ))}
    </div>
  );
}
```

**`app/(app)/settings/StaffTab.tsx`**

```tsx
import { ActionForm } from "@/components/action-form";
import { listStaff } from "@/lib/auth-core";
import { btnCls, btnDangerCls, btnPrimaryCls, cardCls, inputCls, labelCls } from "@/lib/ui";
import { createStaffAction, removeStaffAction, resetPinAction } from "./actions";

export function StaffTab({ meId }: { meId: string }) {
  const staff = listStaff();
  return (
    <div className="max-w-3xl space-y-6">
      <ActionForm action={createStaffAction} success="Staff login created" resetOnSuccess className={`${cardCls} flex flex-wrap items-end gap-3 p-5`}>
        <div>
          <label className={labelCls} htmlFor="sn">Name</label>
          <input id="sn" name="name" required maxLength={60} className={`${inputCls} !w-44`} />
        </div>
        <div>
          <label className={labelCls} htmlFor="su">Username</label>
          <input id="su" name="username" required autoCapitalize="none" autoComplete="off" className={`${inputCls} !w-40`} />
        </div>
        <div>
          <label className={labelCls} htmlFor="sp">PIN (4 to 8 digits)</label>
          <input id="sp" name="pin" type="password" inputMode="numeric" autoComplete="new-password" required className={`${inputCls} !w-36`} />
        </div>
        <button className={btnPrimaryCls}>Add staff</button>
      </ActionForm>

      <ul className={`${cardCls} divide-y divide-line`}>
        {staff.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{p.name}{p.id === meId ? " (you)" : ""}</div>
              <div className="text-sm capitalize text-mute">{p.username} · {p.role}</div>
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
```

- [ ] **Step 3: Type-check, lint and build**

Run: `npx tsc --noEmit && npx eslint && npm run build`
Expected: clean; route table lists `ƒ /settings`; still no `data/` folder.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add owner settings: lounge, zones and stations, rates and packages, staff" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Launcher, release folder, smoke test and final verification

**Files:**
- Create: `scripts/build-release.mjs`, `scripts/smoke.mjs`, `release-files/start.bat`, `release-files/stop.bat`, `release-files/autostart-on.bat`, `release-files/autostart-off.bat`, `release-files/README.txt`, `README.md`

**Interfaces:**
- Produces:
  - `npm run release` → `release/` containing `start.bat`, `stop.bat`, `autostart-on.bat`, `autostart-off.bat`, `README.txt`, `node/node.exe` (a copy of the Node that built it), `app/` (standalone server + static + public) and `VERSION`. It refuses to ship a `data/` or `release/` folder, and tells you to run `stop.bat` if `release/app` is locked.
  - `start.bat`: reuses a running instance, otherwise starts the server minimised, waits for `/api/health`, opens an Edge app window (default browser if Edge is missing), makes a "Gaming Lounge" Desktop shortcut on first run. Env knobs for testing: `PORT` (default 3000), `LOUNGE_NO_BROWSER=1` (skip the browser and the shortcut).
  - `stop.bat`: stops only the `node.exe` that lives in this folder.
  - `npm run smoke`: `BASE=http://127.0.0.1:PORT DATA=<data folder> [MANIFEST=<path to server-reference-manifest.json>] npm run smoke` against an app with an **empty** data folder.

- [ ] **Step 1: Write the release builder and launcher files**

**`scripts/build-release.mjs`**

```javascript
// Builds the double-click folder:  release/  (start.bat, stop.bat, node/, app/, README.txt)
// Run with:  npm run release     (needs internet once, for the fonts)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "release");
const standalone = path.join(root, ".next", "standalone");

const r = spawnSync("npm run build", { cwd: root, stdio: "inherit", shell: true });
if (r.status !== 0) throw new Error("npm run build failed");

const app = path.join(out, "app");
try {
  fs.rmSync(app, { recursive: true, force: true }); // only ever release/app, our own output
} catch {
  throw new Error("Could not replace release/app. Is the lounge app still running from it? Run release/stop.bat and try again.");
}
fs.mkdirSync(app, { recursive: true });

// Next's file tracer can pull the developer's own data/ folder (database, auth secret) into the standalone
// output. Never copy it, whatever the tracer decides.
const isLocalData = (src) => ["data", "release"].some((d) => path.relative(standalone, src).split(path.sep)[0] === d);
fs.cpSync(standalone, app, { recursive: true, filter: (src) => !isLocalData(src) });
fs.cpSync(path.join(root, ".next", "static"), path.join(app, ".next", "static"), { recursive: true });
fs.cpSync(path.join(root, "public"), path.join(app, "public"), { recursive: true });

for (const leaked of ["data", "release"]) {
  if (fs.existsSync(path.join(app, leaked))) throw new Error(`release/app/${leaked} must not exist. Refusing to ship local data.`);
}

// The Node you built and tested with is a single self-contained exe: ship it so nothing needs installing.
const nodeDir = path.join(out, "node");
fs.mkdirSync(nodeDir, { recursive: true });
fs.copyFileSync(process.execPath, path.join(nodeDir, "node.exe"));

// Windows batch files need CRLF line endings.
for (const f of fs.readdirSync(path.join(root, "release-files"))) {
  const text = fs.readFileSync(path.join(root, "release-files", f), "utf8").replace(/\r?\n/g, "\r\n");
  fs.writeFileSync(path.join(out, f), text);
}
fs.writeFileSync(path.join(out, "VERSION"), `${process.version}\n`);
console.log(`\nRelease ready: ${out}\nCopy that whole folder to the lounge laptop and double-click start.bat`);
```

**`release-files/start.bat`**

```bat
@echo off
setlocal
cd /d "%~dp0"
if not defined PORT set "PORT=3000"
set "URL=http://127.0.0.1:%PORT%"

rem Already running? Then just open it.
call :ping
if %errorlevel%==0 goto open

if not exist "data" mkdir "data"
set "HOSTNAME=127.0.0.1"
set "NODE_ENV=production"
set "LOUNGE_DATA_DIR=%~dp0data"
echo Starting the lounge app...
start "Lounge server - keep this window open (you can minimise it)" /min "%~dp0node\node.exe" "%~dp0app\server.js"

set /a tries=0
:wait
set /a tries+=1
if %tries% gtr 45 goto failed
call :ping
if %errorlevel%==0 goto open
ping -n 2 127.0.0.1 >nul
goto wait

:failed
echo.
echo The app did not start. Look at the "Lounge server" window for the reason.
echo If another program is using port %PORT%, close it and try again.
pause
exit /b 1

:open
if defined LOUNGE_NO_BROWSER exit /b 0
if not exist "data\.shortcut-made" call :shortcut
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" goto edge86
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" goto edge64
start "" "%URL%"
exit /b 0
:edge86
start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app=%URL%
exit /b 0
:edge64
start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app=%URL%
exit /b 0

:ping
powershell -NoProfile -Command "try { $null = Invoke-WebRequest -UseBasicParsing '%URL%/api/health' -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>&1
exit /b %errorlevel%

:shortcut
powershell -NoProfile -Command "$p = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Gaming Lounge.lnk'; if (-not (Test-Path $p)) { $s = (New-Object -ComObject WScript.Shell).CreateShortcut($p); $s.TargetPath = '%~dp0start.bat'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 7; $s.Save() }" >nul 2>&1
echo made> "data\.shortcut-made"
exit /b 0
```

**`release-files/stop.bat`**

```bat
@echo off
rem Stops only the lounge app that was started from this folder.
powershell -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -ieq '%~dp0node\node.exe' } | Stop-Process -Force"
echo The lounge app has been stopped. Your data is safe.
ping -n 3 127.0.0.1 >nul
```

**`release-files/autostart-on.bat`**

```bat
@echo off
rem Makes the lounge app start by itself when this laptop signs in to Windows.
powershell -NoProfile -Command "$p = Join-Path ([Environment]::GetFolderPath('Startup')) 'Gaming Lounge.lnk'; $s = (New-Object -ComObject WScript.Shell).CreateShortcut($p); $s.TargetPath = '%~dp0start.bat'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 7; $s.Save()"
echo Done. The lounge app will now start when Windows starts.
pause
```

**`release-files/autostart-off.bat`**

```bat
@echo off
powershell -NoProfile -Command "Remove-Item -ErrorAction SilentlyContinue (Join-Path ([Environment]::GetFolderPath('Startup')) 'Gaming Lounge.lnk')"
echo Done. The lounge app will no longer start by itself.
pause
```

**`release-files/README.txt`**

```text
GAMING LOUNGE MANAGER
=====================

START:   double-click  start.bat
         (the first time, a "Gaming Lounge" shortcut is also placed on your Desktop)
STOP:    double-click  stop.bat    (or just leave it running all day)

While the app runs there is a small minimised window called "Lounge server".
Leave it open. Closing it stops the app, but your data stays safe.

YOUR DATA
---------
Everything is in the  data  folder next to start.bat. Copy that folder to keep a backup.

FORGOT THE OWNER PIN?
---------------------
1. Close the app (stop.bat).
2. In the  data  folder, make a text file named  reset-owner-pin.txt
   containing only the new PIN (4 to 8 digits).
3. Start the app again. The PIN is changed and the file is deleted.

START WITH WINDOWS (optional)
-----------------------------
autostart-on.bat makes the app start when Windows starts. autostart-off.bat undoes it.

NOTES
-----
* The app only works on this laptop. It is not reachable from other devices.
* Timer alerts make a sound only after you have signed in on this screen.
  Keep the app window open (not minimised) so alerts are on time.
* If the app says port 3000 is busy, close the other program that uses it.
```

- [ ] **Step 2: Write the smoke test**

**`scripts/smoke.mjs`**

```javascript
// End-to-end smoke test over HTTP against a RUNNING app with an EMPTY data folder.
//   BASE=http://127.0.0.1:3100 DATA=path/to/that/data/folder node scripts/smoke.mjs
// It drives the real server: first-run setup, login, lockout, role limits, sessions, billing, logo upload.
// (No browser: remote debugging is blocked on some company laptops. This checks everything except how it looks.)
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const DATA = process.env.DATA;
if (!DATA) throw new Error("Set DATA to the app's data folder (the one start.bat uses)");
const manifest = JSON.parse(fs.readFileSync(process.env.MANIFEST ?? ".next/server/server-reference-manifest.json", "utf8")).node;
const db = () => new DatabaseSync(path.join(DATA, "lounge.db"), { readOnly: true });
const q = (sql, ...p) => { const d = db(); try { return d.prepare(sql).all(...p).map((r) => ({ ...r })); } finally { d.close(); } };

const byName = new Map();
for (const [id, v] of Object.entries(manifest)) byName.set(v.exportedName, { id, page: Object.keys(v.workers)[0] });
const pagePath = (worker) => "/" + worker.replace(/^app\//, "").replace(/\/page$/, "").split("/").filter((s) => !s.startsWith("(")).join("/");

const jar = (res, cookie = "") => {
  const set = res.headers.getSetCookie().map((c) => c.split(";")[0]);
  if (!set.length) return cookie;
  const map = new Map(cookie.split("; ").filter(Boolean).map((c) => [c.split("=")[0], c]));
  for (const c of set) map.set(c.split("=")[0], c);
  return [...map.values()].join("; ");
};

/** Call a server action that takes plain JSON arguments. Returns { result, cookie }. */
async function call(name, args, cookie = "") {
  const a = byName.get(name);
  assert.ok(a, `no action ${name}`);
  const res = await fetch(BASE + pagePath(a.page), {
    method: "POST",
    headers: { "Next-Action": a.id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Cookie: cookie, Origin: BASE },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  const line = text.split("\n").find((l) => l.startsWith("1:"));
  return { result: line ? JSON.parse(line.slice(2)) : { raw: text.slice(0, 200), status: res.status }, cookie: jar(res, cookie) };
}

/** Submit a FormData server action the way a browser without JavaScript would. */
async function form(name, fields, cookie = "") {
  const a = byName.get(name);
  assert.ok(a, `no action ${name}`);
  const fd = new FormData();
  fd.append(`$ACTION_ID_${a.id}`, "");
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const res = await fetch(BASE + pagePath(a.page), { method: "POST", headers: { Cookie: cookie, Origin: BASE }, body: fd, redirect: "manual" });
  await res.text();
  return jar(res, cookie);
}

const statusWithHost = (host) =>
  new Promise((resolve, reject) => {
    const u = new URL(BASE);
    http.get({ host: u.hostname, port: u.port, path: "/api/health", headers: { Host: host } }, (r) => { r.resume(); resolve(r.statusCode); }).on("error", reject);
  });

const get = (p, cookie = "", headers = {}) => fetch(BASE + p, { headers: { Cookie: cookie, ...headers }, redirect: "manual" });
let passed = 0;
const step = async (name, fn) => { await fn(); passed++; console.log("ok  ", name); };

await step("health, signed-out redirects, wrong Host refused", async () => {
  assert.equal((await get("/api/health")).status, 200);
  assert.equal((await get("/")).status, 307);
  assert.match((await get("/login")).headers.get("location"), /\/setup$/); // no users yet
  assert.equal(await statusWithHost("evil.example:3100"), 421); // fetch() can't override Host, so use http directly
  assert.equal(await statusWithHost(new URL(BASE).host), 200);
});

let owner = "";
await step("first-run setup creates the owner and the Level 9 starter", async () => {
  await form("setupAction", { cafeName: "Level 9 Gaming Lounge", upiId: "level9@okhdfc", gst: "on", ownerName: "Gabor", username: "owner", pin: "4821", pin2: "4821", starter: "level9" });
  assert.equal((await get("/login")).status, 200);
  assert.match((await get("/setup")).headers.get("location"), /\/login$/);
  assert.equal(q("SELECT count(*) AS n FROM stations")[0].n, 4);
  assert.deepEqual(q("SELECT hourly_paise AS h FROM rates ORDER BY id").map((r) => r.h), [15000, 15000, 13000, 15000]);
  const again = await form("setupAction", { cafeName: "Hijack", ownerName: "x", username: "evil", pin: "1111", pin2: "1111", starter: "empty" });
  assert.equal(q("SELECT count(*) AS n FROM user")[0].n, 1, "second setup must not create a user");
  assert.equal(q("SELECT value FROM settings WHERE key='cafe.name'")[0].value, "Level 9 Gaming Lounge");
  void again;
});

await step("browser sign-in and sign-up straight to /api/auth are refused", async () => {
  const h = { "Content-Type": "application/json", Origin: BASE };
  assert.equal((await fetch(`${BASE}/api/auth/sign-in/username`, { method: "POST", headers: h, body: JSON.stringify({ username: "owner", password: "4821" }) })).status, 403);
  assert.equal((await fetch(`${BASE}/api/auth/sign-up/email`, { method: "POST", headers: h, body: JSON.stringify({ name: "x", email: "x@y.com", password: "1234", username: "evil" }) })).status, 403);
});

await step("login: wrong PIN, lockout after 5 misses, right PIN sets an httpOnly cookie", async () => {
  const bad = await call("loginAction", ["owner", "0000"]);
  assert.deepEqual(bad.result, { ok: false, error: "Wrong username or PIN" });
  const ghost = `ghost${Date.now()}`; // fresh name: lockout is remembered for a minute
  for (let i = 0; i < 5; i++) assert.equal((await call("loginAction", [ghost, "0000"])).result.error, "Wrong username or PIN");
  const locked = await call("loginAction", [ghost, "0000"]);
  assert.match(locked.result.error, /Too many wrong tries/);
  const good = await call("loginAction", ["owner", "4821"]);
  assert.equal(good.result.ok, true);
  assert.ok(good.cookie.includes("better-auth"), "session cookie expected");
  owner = good.cookie;
  const raw = await fetch(BASE + pagePath(byName.get("loginAction").page), {
    method: "POST",
    headers: { "Next-Action": byName.get("loginAction").id, "Content-Type": "text/plain;charset=UTF-8", Origin: BASE },
    body: JSON.stringify(["owner", "4821"]),
  });
  assert.match(raw.headers.getSetCookie().join(";"), /HttpOnly/i);
});

await step("pages render for the owner with real data", async () => {
  const floor = await (await get("/", owner)).text();
  for (const s of ["Pool 1", "PS5 1", "PC 1", "Sim 1", "Level 9 Gaming Lounge"]) assert.ok(floor.includes(s), `floor missing ${s}`);
  for (const p of ["/bills", "/settings", "/settings?tab=zones", "/settings?tab=rates", "/settings?tab=staff"]) assert.equal((await get(p, owner)).status, 200, p);
  assert.equal((await get("/login", owner)).status, 307); // already signed in
});

const station = (name) => q("SELECT id FROM stations WHERE name = ?", name)[0].id;
let sessionId;
await step("start a session: bad input refused, good input runs, double start refused", async () => {
  const ps5 = station("PS5 1");
  assert.equal((await call("startSessionAction", [{ stationId: ps5, mode: "fixed", players: 1, customerId: null, minutes: "abc" }], owner)).result.ok, false);
  assert.equal((await call("startSessionAction", [{ stationId: ps5, mode: "hack", players: 1, customerId: null }], owner)).result.ok, false);
  const ok = await call("startSessionAction", [{ stationId: ps5, mode: "fixed", players: 2, customerId: null, minutes: 60 }], owner);
  assert.equal(ok.result.ok, true);
  sessionId = ok.result.data;
  const dup = await call("startSessionAction", [{ stationId: ps5, mode: "open", players: 1, customerId: null }], owner);
  assert.match(dup.result.error, /already in use/);
  assert.equal(q("SELECT rate_json AS r FROM sessions WHERE id = ?", sessionId).length, 1);
  assert.match((await (await get("/", owner)).text()), /Ending soon|Running/);
});

await step("signed-out callers can't run actions", async () => {
  const r = await call("pauseAction", [sessionId], "");
  assert.notEqual(r.result.ok, true);
  assert.equal(q("SELECT paused_at AS p FROM sessions WHERE id = ?", sessionId)[0].p, null);
});

await step("pause, resume, add item, stop, preview the bill", async () => {
  assert.equal((await call("pauseAction", [sessionId], owner)).result.ok, true);
  assert.notEqual(q("SELECT paused_at AS p FROM sessions WHERE id = ?", sessionId)[0].p, null);
  assert.equal((await call("resumeAction", [sessionId], owner)).result.ok, true);
  assert.equal((await call("addItemAction", [sessionId, "Coke", 2, "40"], owner)).result.ok, true);
  assert.equal((await call("addItemAction", [sessionId, "Coke", 0, "40"], owner)).result.ok, false);
  assert.equal((await call("addItemAction", [sessionId, "<img src=x onerror=alert(1)>", 1, "10"], owner)).result.ok, true);
  assert.equal((await call("stopAction", [sessionId], owner)).result.ok, true);
  const d = await call("getDraftAction", [sessionId], owner);
  assert.equal(d.result.ok, true);
  assert.equal(d.result.data.lines[0].kind, "session");
  assert.equal(d.result.data.lines.length, 3);
});

let billId;
await step("billing: wrong total refused, correct total paid, second payment refused, invoice renders escaped", async () => {
  const d = (await call("getDraftAction", [sessionId], owner)).result.data;
  const total = d.lines.reduce((a, l) => a + l.qty * l.unitPaise, 0);
  const rupees = (p) => (p / 100).toFixed(2);
  const pay = (amount) => call("finalizeBillAction", [{ sessionId, discountType: "none", discountValue: "", reason: "", payments: [{ method: "cash", rupees: amount }] }], owner);
  assert.match((await pay(rupees(total - 1))).result.error, /add up/);
  const ok = await pay(rupees(total));
  assert.equal(ok.result.ok, true);
  billId = ok.result.data.billId;
  assert.equal(ok.result.data.invoiceNo, 1);
  assert.match((await pay(rupees(total))).result.error, /already billed/);
  assert.equal(q("SELECT count(*) AS n FROM bills")[0].n, 1);
  const html = await (await get(`/bills/${billId}`, owner)).text();
  assert.ok(html.includes("INV-000001") && html.includes("Paid by"));
  assert.ok(!html.includes("<img src=x onerror"), "item names must be escaped");
  assert.ok((await (await get("/bills", owner)).text()).includes("INV-000001"));
  // the GST breakup was recorded because setup switched GST on
  assert.ok(q("SELECT tax_paise AS t FROM bills WHERE id = ?", billId)[0].t > 0);
});

let staff = "";
await step("staff: created by the owner, can run the floor, cannot reach owner-only things", async () => {
  await form("createStaffAction", { name: "Counter", username: "counter", pin: "1234" }, owner);
  assert.equal(q("SELECT role FROM user WHERE username = 'counter'")[0].role, "staff");
  const login = await call("loginAction", ["counter", "1234"]);
  assert.equal(login.result.ok, true);
  staff = login.cookie;
  assert.equal((await get("/", staff)).status, 200);
  assert.equal((await get("/settings", staff)).status, 307); // bounced to the floor
  assert.equal((await call("voidBillAction", [billId, "nope"], staff)).result.error, "Only the owner can void a bill");
  await form("saveCafeAction", { cafeName: "Hijacked", accent: "#112233", gstPct: "18", leadMin: "10", maxDiscount: "10" }, staff);
  assert.equal(q("SELECT value FROM settings WHERE key='cafe.name'")[0].value, "Level 9 Gaming Lounge");
  await form("createStaffAction", { name: "Evil", username: "evil", pin: "9999" }, staff);
  assert.equal(q("SELECT count(*) AS n FROM user WHERE username = 'evil'")[0].n, 0);
  const s = await call("startSessionAction", [{ stationId: station("Pool 1"), mode: "open", players: 1, customerId: null }], staff);
  assert.equal(s.result.ok, true);
});

await step("staff discount cap is enforced on the server", async () => {
  const id = q("SELECT id FROM sessions WHERE billed = 0")[0].id;
  await call("stopAction", [id], staff);
  const pay = (role, type, value) => call("finalizeBillAction", [{ sessionId: id, discountType: type, discountValue: value, reason: "friend", payments: [{ method: "cash", rupees: "1.00" }] }], role);
  const r = await pay(staff, "percent", "50");
  assert.match(r.result.error, /at most 10%/);
});

await step("owner changes settings, uploads a logo, bad uploads are refused", async () => {
  await form("saveCafeAction", { cafeName: "Level 9 Lounge", address: "Lohegaon, Pune", accent: "#cc1122", gst: "on", gstPct: "18", leadMin: "5", maxDiscount: "10", upiId: "level9@okhdfc" }, owner);
  assert.equal(q("SELECT value FROM settings WHERE key='cafe.name'")[0].value, "Level 9 Lounge");
  assert.ok((await (await get("/", owner)).text()).includes("--color-brand:#cc1122"));
  await form("saveCafeAction", { cafeName: "X", accent: "red;}body{display:none", gstPct: "18", leadMin: "5", maxDiscount: "10" }, owner);
  assert.equal(q("SELECT value FROM settings WHERE key='cafe.name'")[0].value, "Level 9 Lounge", "bad colour must reject the whole save");

  const upload = async (bytes, name) => {
    const a = byName.get("uploadLogoAction");
    const fd = new FormData();
    fd.append(`$ACTION_ID_${a.id}`, "");
    fd.append("logo", new Blob([bytes]), name);
    await (await fetch(BASE + pagePath(a.page), { method: "POST", headers: { Cookie: owner, Origin: BASE }, body: fd, redirect: "manual" })).text();
  };
  await upload(Buffer.from("<script>alert(1)</script>"), "evil.png");
  assert.equal(q("SELECT value FROM settings WHERE key='cafe.logo'")[0].value, "builtin:level9");
  const png = fs.readFileSync("public/brand/logo-banner.png");
  await upload(png, "logo.png");
  const logo = q("SELECT value FROM settings WHERE key='cafe.logo'")[0].value;
  assert.match(logo, /^logo-[0-9a-f]{16}\.png$/);
  const served = await get("/api/brand/logo");
  assert.equal(served.headers.get("content-type"), "image/png");
  assert.equal(Buffer.from(await served.arrayBuffer()).length, png.length);
});

await step("zones, stations and rates: add a rate window and a package, duplicates refused", async () => {
  const zone = q("SELECT id FROM zones WHERE kind = 'ps5'")[0].id;
  const days = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [`d${d}`, "on"]));
  await form("saveRateAction", { zoneId: zone, name: "Happy hour", hourly: "100", extra: "", increment: "1", min: "15", grace: "0", from: "14:00", to: "17:00", priority: "5", ...days }, owner);
  assert.equal(q("SELECT count(*) AS n FROM rates WHERE name = 'Happy hour'")[0].n, 1);
  await form("saveRateAction", { zoneId: zone, name: "Broken", hourly: "-5", increment: "1", min: "15", grace: "0", from: "14:00", to: "17:00", priority: "5", ...days }, owner);
  assert.equal(q("SELECT count(*) AS n FROM rates WHERE name = 'Broken'")[0].n, 0);
  await form("savePackageAction", { zoneId: zone, name: "Night 3h", minutes: "180", price: "350" }, owner);
  assert.equal(q("SELECT price_paise AS p FROM packages")[0].p, 35000);
  await form("createStationAction", { zoneId: zone, name: "PS5 1" }, owner);
  assert.equal(q("SELECT count(*) AS n FROM stations WHERE name = 'PS5 1' AND active = 1")[0].n, 1);
  await form("createStationAction", { zoneId: zone, name: "PS5 2" }, owner);
  assert.equal(q("SELECT count(*) AS n FROM stations WHERE name = 'PS5 2'")[0].n, 1);
});

await step("owner resets a PIN: old PIN stops working, new one works", async () => {
  const id = q("SELECT id FROM user WHERE username = 'counter'")[0].id;
  await form("resetPinAction", { id, pin: "5566" }, owner);
  assert.equal((await call("loginAction", ["counter", "1234"])).result.ok, false);
  assert.equal((await call("loginAction", ["counter", "5566"])).result.ok, true);
  assert.equal((await get("/", staff)).status, 307, "old session is signed out after a PIN reset");
});

console.log(`\n${passed} smoke steps passed`);
```

- [ ] **Step 3: Write the developer README**

Create `README.md`:

```markdown
# Gaming Lounge Manager

Gaming lounge management for one laptop: floor board with live timers, billing with UPI QR, digital invoices, staff PINs. Next.js 16, Tailwind v4, SQLite (`node:sqlite`), Better Auth. Offline.

## Develop

    npm install
    npm run dev         # http://localhost:3000 (data in ./data)
    npm test            # unit tests (Node 24 test runner)
    npx tsc --noEmit && npx eslint

## Ship to a lounge laptop

    npm run release     # builds ./release (double-click folder with its own node.exe)

Copy the whole `release` folder to the laptop and double-click `start.bat`. See `release/README.txt` for owner instructions. Stop any running copy (`release\stop.bat`) before building a new release.

## Check a build over HTTP

    cd release && cmd //c ".\\start.bat"        # with PORT=3200 LOUNGE_NO_BROWSER=1 in the environment
    BASE=http://127.0.0.1:3200 DATA=<path to release/data> MANIFEST=release/app/.next/server/server-reference-manifest.json npm run smoke

The smoke test needs an empty data folder and no browser.

## Notes

- All money is stored as integer paise. SQL lives only in `lib/db`; moving to Postgres on Vercel later means rewriting that folder.
- `next build` must never open the database: put `await connection()` or `await headers()` before any database call in layouts, pages and route handlers.
- Data (`data/`) and builds (`release/`) are git-ignored.
```

- [ ] **Step 4: Full verification on the source tree**

Run: `npx tsc --noEmit && npx eslint && npm test`
Expected: no `tsc` or `eslint` output; `ℹ tests 67`, `ℹ pass 67`, `ℹ fail 0`.

- [ ] **Step 5: Build the release folder**

Run: `npm run release`
Expected: ends with `Release ready: ...\release`. Then confirm no local data leaked:

```bash
ls release/app            # expect: node_modules  package.json  public  server.js   (and a hidden .next)
ls release/app/data       # expect: No such file or directory
```

- [ ] **Step 6: Run the release folder for real and smoke-test it**

```bash
cd release
PORT=3200 LOUNGE_NO_BROWSER=1 cmd //c ".\\start.bat"     # expect: Starting the lounge app...
curl -s http://127.0.0.1:3200/api/health                  # expect: {"ok":true}
PORT=3200 LOUNGE_NO_BROWSER=1 cmd //c ".\\start.bat"     # second run returns at once (reuses the running app)
cd ..
BASE=http://127.0.0.1:3200 DATA="$(cygpath -m release/data)" MANIFEST=release/app/.next/server/server-reference-manifest.json npm run smoke
```

Expected: 14 lines starting `ok`, then `14 smoke steps passed`.

- [ ] **Step 7: Stop it and prove the data survives a restart**

```bash
cd release && cmd //c ".\\stop.bat"        # expect: The lounge app has been stopped.
curl -s -m 3 -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3200/api/health    # expect: 000
PORT=3200 LOUNGE_NO_BROWSER=1 cmd //c ".\\start.bat"
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3200/login             # expect: 200 (users still exist)
cmd //c ".\\stop.bat"
cd ..
```

Then delete the `release\data` folder (File Explorer or `rm -rf release/data`) so the next run starts empty.

- [ ] **Step 8: The owner looks at it (the one thing no test covers)**

Run the real thing: double-click `release\start.bat` (an Edge app window opens). Walk through, and write down anything that looks wrong, feels slow or is confusing:

1. First-run wizard appears; create the lounge with the Level 9 starter ticked. Sign in.
2. Left rail shows the Level 9 banner; the floor shows four zones in charcoal, silver and carbon red.
3. Start a **Fixed 2-minute** session on a PS5 (set "Warn when this many minutes are left" to 1 in Settings > Lounge first). Check the card timer counts down, turns amber at 1 minute with a beep and a toast, turns red and pulses at zero.
4. Open the card: Pause, Resume, +15 min, add "Coke" x2 at ₹40, Stop. The bill panel shows the lines, a discount box, a payment row, and a UPI QR when you switch the method to UPI (needs a UPI ID in Settings).
5. Mark paid. Open Bills, open the invoice, try Save as PDF. As owner, try Void.
6. Settings: change the accent colour, add a Happy hour rate (14:00 to 17:00, priority 5), add a station, add a staff login. Sign out, sign in as staff, confirm Settings is hidden.
7. Close the "Lounge server" window, double-click `start.bat` again: running sessions are still there with the right time.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Add release builder, launcher, smoke test and README" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Independent review and hand-off

**Files:**
- Modify: whatever the review finds (small fixes only; anything bigger goes in the hand-off as a follow-up)

- [ ] **Step 1: Adversarial review**

Dispatch the `clawness:code-critic` sub-agent (read-only) with: "Review the whole repository against `docs/superpowers/specs/2026-10-05-gaming-lounge-management-design.md` and `docs/superpowers/plans/2026-10-05-gaming-lounge-phase1-core.md`. Focus on money paths (`lib/engine`, `lib/db/bills.ts`), auth and role checks (`lib/auth-core.ts`, `lib/session.ts`, `app/(app)/**/actions.ts`, `proxy.ts`), build-time database access, and Windows launcher scripts. Report bugs, security holes and missed edge cases with file and line; skip style." Triage every finding: fix real ones with a failing test first, dismiss false positives with a reason.

- [ ] **Step 2: Re-run everything**

Run: `npx tsc --noEmit && npx eslint && npm test && npm run build` and repeat Task 13 steps 5 to 7.
Expected: all clean.

- [ ] **Step 3: Hand-off note**

Write a short note for the owner: what works, what was verified by tests and by the smoke test, what only they can verify (looks and feel, alert sounds, the Edge app window, the Desktop shortcut), and what Plan 2 and Plan 3 add (spec section 13). Commit.

```bash
git add -A
git commit -m "Review fixes and hand-off for Plan 1" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
