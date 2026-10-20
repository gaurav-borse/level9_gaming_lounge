# Gaming Lounge Management App — Design Spec

Date: 2026-10-05
Status: Draft for owner review
First cafe: Level 9 Gaming Lounge (Aurum Elemento, Lohegaon, Pune)

## 1. Purpose and success criteria

A web app that lets a gaming-lounge owner run the whole floor from one laptop: live sessions on pool tables, PS5 bays, PC stations and sim-racing rigs, billing, food and stock, customers, reports.

Success means:
- Counter staff can start, pause, extend, transfer and bill a session in a few taps, and timers and charges are always correct.
- The owner can see revenue, utilisation, expenses and net profit without a spreadsheet.
- The app starts by double-clicking `start.bat`, with no commands and no installs.
- Data survives crashes and a dead disk (second-folder backup).
- Nothing about "Level 9" is hardcoded: name, logo, colours, zones, rates, tax and message templates are settings, so another owner can be set up from the UI.
- The UI follows the Level 9 logo palette (charcoal, silver, carbon red), looks modern, and works offline.

## 2. Constraints and decisions already made

- Runs on **one laptop only**, `127.0.0.1`, no access from other devices.
- Local now; later deployed to Vercel with a custom domain (cloud database swap, see §12).
- Stack: Next.js 16 (latest stable, confirmed at install), Tailwind v4, Node 24 LTS built-in `node:sqlite` (a Release Candidate in Node 24, in use without warnings; the release folder pins the exact Node that was tested), plain SQL, no ORM.
- Currency INR, money stored as integer paise.
- WhatsApp: **prompt-to-send** now (free, `wa.me` links); official Cloud API later as a switchable driver. Unofficial automation libraries are rejected (ban risk on the lounge's business number).
- No LLM (Mistral not used).
- No printing. Invoices are digital: in-app record and WhatsApp text.

## 3. Final feature list

Phase 1 (P1) is built first; Phase 2 (P2) follows once P1 is stable.

**A. Setup and branding**
- A1 (P1) First-run wizard: cafe name, logo, address, phone, GSTIN (optional), UPI ID, opening hours.
- A2 (P1) Theme from the logo, driven by CSS variables and settings. Dark theme only in P1.
- A3 (P1) Zones and stations manager (Pool, PS5, PC, Sim Racing, VR, custom) with maintenance mode.
- A4 (P1) Rate card manager, seeded with Pool ₹150/hr, Sim Racing ₹150/hr, High-End PC ₹130/hr, PS5 ₹150/hr: extra-controller rate, billing increment, minimum charge, grace minutes, time-of-day and weekend rates, time packages.

**B. Live floor and sessions**
- B1 (P1) Colour-coded floor board grouped by zone.
- B2 (P1) Start session: walk-in or saved customer; open-ended, fixed-duration or prepaid mode; player/controller count.
- B3 (P1) Pause, resume, extend, transfer (same zone), notes.
- B4 (P1) Rate frozen at session start.
- B5 (P1) On-screen "ending soon" and overtime alerts with sound.
- B6 (P1) Add food and extras to a running session.
- B7 (P1) Timers survive refresh, restart and power loss.
- B8 (P2) Drag-and-drop floor layout editor.

**C. Billing**
- C1 (P1) One tab per customer: session, food, extras.
- C2 (P1) Discounts (flat or %) with a reason. (Splitting a bill between people was dropped.)
- C3 (P1) Payments by cash, UPI or card, mixed payments allowed. No wallet, no pay-later.
- C4 (P1) UPI QR with the exact amount.
- C5 (P1) Digital invoice: sequential numbers, in-app record, optional GST. Optional Save as PDF.
- C6 (P1) Void or refund with a mandatory reason.

**D. Customers**
- D1 (P1) Profiles: phone, WhatsApp consent, notes, history, lifetime spend.
- D6 (P2) Lapsed-customer list with one-tap win-back WhatsApp prompts; birthday reminders.

**E. Food and inventory**
- E1 (P1) Menu with categories, items, prices, tax.
- E2 (P1) Counter sale (no session).
- E3 (P1) Stock counts, low-stock alerts, restock and wastage entries.

**F. Reservations**
- F1 (P2) Reserve a station for a slot with conflict prevention.

**G. Reports and insights**
- G1 (P1) Today dashboard.
- G2 (P1) Reports by day, week, month; by zone, station, item, staff; CSV and PDF export.
- G3 (P1) Busy-hours heatmap (hour x weekday).
- G4 (P1) Expense tracker with net profit.
- G5 (P2) Rule-based insights (no AI).

**H. Equipment and maintenance**
- H1 (P2) Asset register and maintenance log with reminders.
- H2 (P2) Subscription and licence renewal reminders.

**I. Staff and security**
- I1 (P1) Owner PIN and staff PINs with role limits.
- I2 (P1) Audit log; staff attribution on sessions and bills.

**J. Running and data safety**
- J1 (P1) Local SQLite, automatic backups, manual backup and restore, CSV export.
- J2 (P1) `start.bat`, `stop.bat`, desktop shortcut, optional auto-start.
- J3 (P1) Fully offline except WhatsApp links.
- J4 (P1) SQL isolated in one folder for the later cloud-database move.

**K. WhatsApp messaging (prompt mode)**
- K1 (P1) Master switch plus a switch for each of welcome, session started, ending reminder, invoice.
- K2 (P1) Welcome message (once per customer per day).
- K3 (P1) Session-started message: station, zone, start time, rate, mode, expected end.
- K4 (P1) Ending reminder at a configurable lead time (default 10 min); fixed and prepaid sessions only.
- K5 (P1) Invoice as itemised text with total.
- K6 (P1) Editable templates with placeholders; messages only for customers with a valid phone and consent.
- K7 (P1) Sender route is a setting: `prompt` now, `cloud` later.

**Explicitly out of scope:** tournaments, shift and cash-drawer close, lounge display, TV overlay, prepaid wallet, pay-later (udhaar), loyalty points, hour packs/memberships, printing and kitchen slips, recipe-level inventory, any LLM, access from other devices.

**Parked (Phase 3):** Vercel deploy, public booking page, customer app, Windows PC-lock agent, multi-cafe cloud/SaaS, light theme.

## 4. Architecture

One Next.js app, production build, bound to `127.0.0.1` (port configurable). Mutations use server actions; no separate API layer. Data is one SQLite file `data/lounge.db`.

```
app/          pages: floor, customers, menu, reports, settings
lib/db/       schema + migrations, plain SQL, one file per area
lib/engine/   pricing + session math (pure, unit-tested)
lib/whatsapp/ templates + sender
components/   UI
release/      start.bat, stop.bat, bundled Node, README
```

Rules:
- Money is integer paise; no floating-point amounts stored.
- The browser only displays timers (counting from stored timestamps). The **server computes every final amount**.
- SQL lives only in `lib/db/`. The later Postgres move rewrites that folder.
- Database upgrades use `PRAGMA user_version` migrations; a backup is taken first.

## 5. Data model

- `settings` (key/value): cafe name, logo path, UPI ID, GSTIN, GST on/off, theme colour, hours, WhatsApp toggles and templates, reminder lead minutes, default country code, backup folders, invoice counter.
- `zones`, `stations` (zone, name, maintenance flag, sort order).
- `rates`: zone, hourly paise, extra-controller paise, increment minutes, minimum minutes, grace minutes, day mask, start/end time, priority. `packages`: zone, name, minutes, price paise.
- `customers`: name, phone, whatsapp_consent, notes, created_at.
- `staff`: name, role (owner/staff), PIN hash.
- `sessions`: station, customer, staff, mode (open/fixed/prepaid), started_at, planned_minutes, paused_at, paused_total_ms, ended_at, players, rate_snapshot (JSON), state (running/paused/ended), notes.
- `menu_categories`, `menu_items` (price, tax %, tracked stock, low threshold, active), `stock_moves` (item, delta, reason restock/sale/wastage/adjust, at).
- `session_items`: session, item, name, qty, unit paise.
- `bills` (invoice_no unique and sequential, session nullable, customer, subtotal, discount, discount_reason, tax, total, status paid/void, void_reason, staff, created_at), `bill_lines` (snapshot), `payments` (bill, method cash/upi/card, amount).
- `expenses`: date, category, amount, note.
- `audit_log`: at, staff, action, detail.
- `message_log`: type, customer, session, body, status (prompted/opened/dismissed), at; unique on (session, type).

P2 adds reservations and equipment tables when those features are built.

## 6. Billing and session engine

- Billable time = end - start - paused total. Charged minutes round up to the rate's increment; the minimum-minutes rule applies. Charge = minutes x frozen hourly rate / 60. Extra controllers add a pro-rata amount. Rounding to paise happens once at bill level.
- The rate is selected at session start (zone, weekday, time window, priority) and frozen in `rate_snapshot`; later rate edits never alter a running session.
- **Grace:** a session ended within its grace minutes costs nothing.
- **Fixed-duration:** bills actual time; overtime continues at the same rate. **Prepaid:** the amount is recorded as an advance payment, deducted at stop; staff collect or refund the difference.
- **Transfer** is allowed within the same zone only; a cross-zone move means ending one session and starting another.
- **Extend** raises planned minutes. **Pause/resume** change only the paused total.
- **Stop** creates a draft bill (session line, items, discount with reason, tax). **Finalise** runs in one transaction: assign next invoice number, insert bill and lines and payments, deduct stock, end the session, write audit. Finalise fails unless payments sum exactly to the total.
- **GST:** prices are tax-inclusive; the invoice shows the tax breakup when GST is on.
- **UPI QR** is built from a standard `upi://pay` link (payee, name, exact amount, INR, invoice reference). The app cannot see whether payment succeeded; staff confirm it.
- **Alerts:** a 1-second tick in the open page computes ending-soon and overtime from stored timestamps, so they recover after refresh. Browsers allow sound only after a click, so login asks for one tap.

## 7. UI and visual design

- Palette as CSS variables: charcoal background (~#0B0D0F), dark panels, silver text, carbon red accent (~#D4121C). Per-cafe overrides via settings.
- Status always uses colour plus icon plus label: free (green), running (red edge, glowing timer), ending soon (amber), overtime (pulsing red ring plus sound), paused (slate), maintenance (grey).
- Type: angular display font for headings and timers (Rajdhani) with Inter for body; both bundled at build for offline use. Tabular numerals for timers and amounts.
- Layout: left rail with logo; top bar with clock, staff, message tray; main floor board with zone sections of station cards (timer, customer, running charge, quick actions). Card click opens a side drawer (items, extend, transfer, notes). Start-session dialog and a bill panel with the UPI QR.
- Native `<dialog>` for modals and drawers, hand-drawn SVG for heatmap and bars, `lucide-react` for icons, `qrcode` for the QR. No component library, no chart library.
- Accessibility: visible focus rings, sufficient contrast, keyboard shortcuts for common actions, reduced-motion respected.

## 8. WhatsApp messaging

- `compose(type, data)` renders the editable template; `send()` selects a driver from the `whatsapp.mode` setting.
- **Prompt mode:** a message is added to a tray in the top bar; a tap opens `wa.me/<number>?text=<encoded>`. The app never opens windows by itself.
- Types: welcome (once per customer per day), session started, ending reminder (fixed/prepaid only, at the configured lead time), invoice (itemised text). Each has a toggle plus a master switch.
- A message is queued only with a valid phone and WhatsApp consent. Phones are normalised using the default country code (91, configurable).
- `message_log` uniqueness on (session, type) prevents repeats. Prompt mode records "opened", never "delivered".
- **Cloud mode (later):** same composed text mapped to Meta's numbered template parameters; the token comes from `.env`; reminders then need a small server-side timer because they cannot depend on an open browser tab.

## 9. Launcher, backup and security

- Release folder: `app/`, portable Node 24 LTS, `data/`, `backups/`, `start.bat`, `stop.bat`, README.
- `start.bat` reuses a running instance or starts one in a minimised window, then opens a Google Chrome app window (Chrome only; if Chrome is missing it says so and shows the address). First run creates a desktop shortcut with the logo. An optional script toggles auto-start with Windows.
- SQLite uses WAL and foreign keys. Closing the window or losing power loses only the moment; sessions recover from timestamps.
- Backups: consistent snapshot (`VACUUM INTO`) at startup and every 6 hours, last 14 kept, copied to a user-chosen second folder (USB or cloud-synced). Backup now and Restore buttons; Restore validates the file and takes a safety backup first.
- Security: bind to `127.0.0.1` and reject other host headers (DNS-rebinding protection); login with **Better Auth** (username plugin; the username is the login name and the PIN is the password; PINs are hashed by Better Auth) and an httpOnly session cookie. Auth.js was dropped: v5 never left beta, is in maintenance mode, and had a critical authentication-bypass fix in July 2026; its maintainers now recommend Better Auth for new projects. Browser requests to Better Auth's sign-in and sign-up endpoints are refused; only our own server code can call them, so every login passes through our lockout (5 wrong tries per username locks it for 60 seconds). Every server action checks the role (staff cannot void, give large discounts, see profit, or open settings). The auth secret is generated once per install into `data/auth-secret` (or taken from `BETTER_AUTH_SECRET`); nothing secret is committed. A forgotten owner PIN is recovered by placing the new PIN in `data/reset-owner-pin.txt` and restarting.

## 10. Error handling

- User-facing errors appear as toasts; no action leaves a half-written state. Finalise bill is atomic; stop session is idempotent.
- Invalid input (rates, phones, amounts) is validated at the server-action boundary.
- A missing or unreadable database file shows a clear recovery screen offering restore from backup.

## 11. Testing and verification

- Node's built-in test runner (`node:test`) covers: pricing (minimum, increment, grace, pause, controllers, rounding, discount, tax), bill finalise invariants (payments equal total, sequential invoice numbers, stock deduction), message dedupe, phone normalisation, and a backup/restore round trip.
- An HTTP-level smoke test (`scripts/smoke.mjs`) drives the real production server and the real release folder: first-run setup, login and lockout, role limits, start/pause/stop/bill, logo upload, rates. A browser test was planned but browser automation is blocked on the company laptop ("DevTools remote debugging is disallowed by the system admin"), so how the screens look and feel is checked by the owner opening the app, not by an automated test.
- Nothing is called done without running type-check, lint, unit tests, the production build and the smoke test, and reporting their output.

## 12. Later move to Vercel

SQLite files cannot persist on Vercel. The move needs a hosted Postgres and a rewrite of `lib/db/` only. Multi-cafe cloud support, public booking, and customer-facing pages build on the same settings-driven design.

## 13. Build order (P1)

P1 is delivered as separate plans, each producing working software:

- **Plan 1 (core):** setup wizard, theme, login and staff, settings (lounge, zones and stations, rates and packages, logo), floor board, sessions and alerts, billing, payments, UPI QR, digital invoices, void, launcher. Also the minimal customer record used when starting a session, and a free-text "extras" line on the tab. The audit log is written from the start.
- **Plan 2:** customer pages, WhatsApp tray and messages (K1-K7), menu and stock (E1-E3) with counter sale.
- **Plan 3:** reports, heatmap, expenses (G1-G4), backup and restore (J1), audit log viewer, polish.

Plan 2 and 3 are written after Plan 1 ships, because they depend on its real interfaces.

Behaviours added while planning Plan 1 (all editable defaults): "Undo stop" re-opens a mistakenly stopped session (the gap is not billed); a session stays on its station, marked "Awaiting payment", until the bill is paid; time packages are billed at the package price plus hourly-rate overtime and cannot be extended.

## 14. Open items (not blocking)

- Real station counts and the food menu are entered in-app by the owner.
- Reminder lead time, grace minutes, minimum charge and billing increment ship with defaults (10 min, 0 min, 15 min, 1 min) and are editable.
