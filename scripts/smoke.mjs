// End-to-end smoke test over HTTP against a RUNNING app with an EMPTY data folder.
//   BASE=http://127.0.0.1:3100 DATA=path/to/that/data/folder node scripts/smoke.mjs
// It drives the real server: first-run setup, login, lockout, role limits, sessions, billing, settings, theme cookie.
// (No browser: remote debugging is blocked on some company laptops. This checks everything except how it looks.)
import crypto from "node:crypto";
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
  await form("setupAction", { ownerName: "Gabor", username: "owner", pin: "4821", pin2: "4821" });
  assert.equal((await get("/login")).status, 200);
  assert.match((await get("/setup")).headers.get("location"), /\/login$/);
  assert.equal(q("SELECT count(*) AS n FROM stations")[0].n, 4);
  assert.deepEqual(q("SELECT hourly_paise AS h FROM rates ORDER BY id").map((r) => r.h), [15000, 15000, 13000, 15000]);
  const again = await form("setupAction", { ownerName: "x", username: "evil", pin: "1111", pin2: "1111" });
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

await step("setup leaves GST off; the owner turns it on in settings", async () => {
  assert.equal(q("SELECT count(*) AS n FROM settings WHERE key = 'gst.enabled' AND value = '1'")[0].n, 0);
  await form("saveCafeAction", { cafeName: "Level 9 Gaming Lounge", address: "Lohegaon, Pune", gst: "on", gstPct: "18", leadMin: "10", maxDiscount: "10", upiId: "level9@okhdfc" }, owner);
  assert.equal(q("SELECT value FROM settings WHERE key = 'gst.enabled'")[0].value, "1");
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
  await form("saveCafeAction", { cafeName: "Level 9 Gaming Lounge", address: "Hijacked", upiId: "evil@bank", gstPct: "18", leadMin: "10", maxDiscount: "10" }, staff);
  assert.notEqual(q("SELECT value FROM settings WHERE key='cafe.address'")[0].value, "Hijacked");
  assert.equal(q("SELECT count(*) AS n FROM settings WHERE key='cafe.upiId' AND value='evil@bank'")[0].n, 0);
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

await step("owner changes settings; a bad UPI ID rejects the whole save; the lounge name can be changed", async () => {
  const setting = (k) => q("SELECT value FROM settings WHERE key = ?", k)[0]?.value;
  const base = { address: "Lohegaon, Pune", gst: "on", gstPct: "18", leadMin: "5", maxDiscount: "10", upiId: "level9@okhdfc" };
  await form("saveCafeAction", { cafeName: "Renamed Lounge", ...base }, owner);
  assert.equal(setting("cafe.address"), "Lohegaon, Pune");
  assert.equal(setting("cafe.upiId"), "level9@okhdfc");
  assert.equal(setting("cafe.name"), "Renamed Lounge", "the owner can rename the lounge");
  assert.ok((await (await get("/", owner)).text()).includes("Renamed Lounge"));
  await form("saveCafeAction", { cafeName: "", ...base, address: "Blank name" }, owner);
  assert.equal(setting("cafe.address"), "Lohegaon, Pune", "an empty lounge name rejects the whole save");
  await form("saveCafeAction", { cafeName: "Level 9 Gaming Lounge", ...base, address: "Changed", upiId: "not valid" }, owner);
  assert.equal(setting("cafe.address"), "Lohegaon, Pune", "bad UPI ID must reject the whole save");
  await form("saveCafeAction", { cafeName: "Level 9 Gaming Lounge", ...base }, owner);
  assert.equal(setting("cafe.name"), "Level 9 Gaming Lounge");
  assert.equal((await get("/brand/logo-hero.png")).status, 200, "built-in logo is served");
});

await step("logo: owner uploads a real image, junk and staff are refused, reset goes back to the Level 9 logo or to none", async () => {
  const setting = () => q("SELECT value FROM settings WHERE key = 'cafe.logo'")[0]?.value ?? "builtin:level9";
  const png = new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 1, 2, 3, 4])], "my logo.png", { type: "image/png" });
  const junk = new File([new TextEncoder().encode("<svg onload=alert(1)></svg>")], "logo.png", { type: "image/png" });
  assert.ok(byName.has("uploadLogoAction") && byName.has("resetLogoAction"));

  await form("uploadLogoAction", { logo: png }, staff);
  assert.equal(setting(), "builtin:level9", "staff cannot change the logo");
  await form("uploadLogoAction", { logo: junk }, owner);
  assert.equal(setting(), "builtin:level9", "a file that is not a PNG, JPG or WebP is refused whatever it is called");
  await form("uploadLogoAction", { logo: png }, owner);
  assert.match(setting(), /^logo-[0-9a-f]{16}\.png$/);
  const served = await get("/api/brand/logo");
  assert.equal(served.status, 200, "the logo is public, the sign-in page needs it");
  assert.equal(served.headers.get("content-type"), "image/png");
  assert.equal(served.headers.get("x-content-type-options"), "nosniff");
  assert.ok((await (await get("/", owner)).text()).includes("/api/brand/logo?v=logo-"), "the sidebar uses the uploaded logo");

  await form("resetLogoAction", { to: "none" }, owner);
  assert.equal(setting(), "");
  assert.equal((await get("/api/brand/logo")).status, 404);
  assert.equal(fs.readdirSync(path.join(DATA, "uploads")).length, 0, "the old upload file is deleted");
  await form("resetLogoAction", { to: "builtin" }, owner);
  assert.equal(setting(), "builtin:level9");
  assert.equal((await get("/api/brand/logo")).status, 200);
});

await step("theme cookie sets data-theme on the first paint; no cookie follows the system", async () => {
  const html = async (cookie) => (await (await get("/", cookie)).text()).match(/<html[^>]*>/)[0];
  assert.doesNotMatch(await html(owner), /data-theme/);
  assert.match(await html(`${owner}; theme=dark`), /data-theme="dark"/);
  assert.match(await html(`${owner}; theme=light`), /data-theme="light"/);
  assert.doesNotMatch(await html(`${owner}; theme=evil"onload="x`), /data-theme/, "unknown theme values are ignored");
});

await step("main colour: cookie recolours the first paint, junk falls back to teal, the action saves a cookie; sidebar cookie", async () => {
  const tag = async (cookie) => (await (await get("/", cookie)).text()).match(/<html[^>]*>/)[0];
  assert.match(await tag(owner), /--color-brand:#3dbda7/);
  assert.match(await tag(`${owner}; accent=%23d4121c`), /--color-brand:#d4121c;--color-on-brand:#ffffff/);
  assert.match(await tag(`${owner}; accent=%23F59E0B`), /--color-brand:#f59e0b;--color-on-brand:#06100e/, "hex is lowercased and gets dark text");
  assert.match(await tag(`${owner}; accent=red`), /--color-brand:#3dbda7/);
  assert.doesNotMatch(await tag(`${owner}; accent=%22onload%3D%22x`), /onload/, "a hostile cookie never reaches the markup");
  const saved = await call("setAccentAction", ["#8b5cf6"], owner);
  assert.match(saved.cookie, /accent=%238b5cf6/);
  assert.match(await tag(saved.cookie), /--color-brand:#8b5cf6/);
  const bad = await call("setAccentAction", ["javascript:alert(1)"], saved.cookie);
  assert.doesNotMatch(await tag(bad.cookie), /javascript/);
  const body = async (cookie) => (await get("/", cookie)).text();
  assert.doesNotMatch(await body(owner), /data-collapsed="true"/);
  assert.match(await body(`${owner}; sidebar=collapsed`), /data-collapsed="true"/);
  assert.ok((await body(owner)).includes("Today"), "floor shows the Today card");
});

await step("menu and stock: owner builds a menu, staff restock but cannot edit, tab item and counter sale move stock, void puts it back", async () => {
  await form("saveCategoryAction", { name: "Drinks" }, owner);
  const cat = q("SELECT id FROM menu_categories WHERE name = 'Drinks'")[0].id;
  await form("saveItemAction", { categoryId: cat, name: "Coke", price: "40" }, owner);
  await form("saveItemAction", { categoryId: cat, name: "Hidden", price: "10" }, staff);
  assert.equal(q("SELECT count(*) AS n FROM menu_items WHERE name = 'Hidden'")[0].n, 0, "staff cannot add menu items");
  await form("saveCategoryAction", { name: "Staff cat" }, staff);
  assert.equal(q("SELECT count(*) AS n FROM menu_categories WHERE name = 'Staff cat'")[0].n, 0, "staff cannot add categories");
  const coke = q("SELECT id, track_stock AS t FROM menu_items WHERE name = 'Coke'")[0];
  assert.equal(coke.t, 1, "every menu item is counted in stock automatically");
  assert.ok((await (await get("/menu", owner)).text()).includes("Coke"), "and it is on the stock list straight away");
  const onHand = () => q("SELECT COALESCE(SUM(delta), 0) AS n FROM stock_moves WHERE item_id = ?", coke.id)[0].n;

  await form("stockAction", { id: coke.id, kind: "restock", qty: "10", note: "delivery" }, staff);
  assert.equal(onHand(), 10, "staff can restock");
  await form("stockAction", { id: coke.id, kind: "adjust", qty: "99" }, staff);
  assert.equal(onHand(), 10, "staff cannot overwrite the count");
  await form("stockAction", { id: coke.id, kind: "adjust", qty: "12" }, owner);
  assert.equal(onHand(), 12, "the owner can take stock");
  await form("stockAction", { id: coke.id, kind: "wastage", qty: "1", note: "spilt" }, staff);
  assert.equal(onHand(), 12, "there is no wastage option any more");
  await form("stockAction", { id: coke.id, kind: "adjust", qty: "11" }, owner);
  assert.equal(onHand(), 11);

  for (const p of ["/menu", "/menu?tab=menu"]) assert.equal((await get(p, owner)).status, 200, p);
  assert.equal((await get("/menu", staff)).status, 200);
  assert.ok(!(await (await get("/menu?tab=menu", staff)).text()).includes("Add category"), "staff never see the menu editor");
  assert.ok((await (await get("/", owner)).text()).includes("Counter sale"));

  // on a tab: nothing leaves stock until the bill is paid
  const pc = station("PC 1");
  const started = await call("startSessionAction", [{ stationId: pc, mode: "open", players: 1, customerId: null }], owner);
  assert.equal(started.result.ok, true);
  const sid = started.result.data;
  assert.equal((await call("addMenuItemAction", [sid, coke.id, 2], owner)).result.ok, true);
  assert.equal((await call("addMenuItemAction", [sid, coke.id, 0], owner)).result.ok, false);
  assert.equal(onHand(), 11);
  await call("stopAction", [sid], owner);
  const d = (await call("getDraftAction", [sid], owner)).result.data;
  assert.equal(d.lines.find((l) => l.name === "Coke").taxPct, 18, "items use the lounge GST rate");
  const total = d.lines.reduce((a, l) => a + l.qty * l.unitPaise, 0);
  const paid = await call("finalizeBillAction", [{ sessionId: sid, discountType: "none", discountValue: "", reason: "", payments: [{ method: "cash", rupees: (total / 100).toFixed(2) }] }], owner);
  assert.equal(paid.result.ok, true);
  assert.equal(onHand(), 9, "two Cokes left stock when the bill was paid");

  // counter sale
  const lines = [{ itemId: coke.id, qty: 3 }];
  const sale = (rupees, who = owner) => call("counterSaleAction", [{ lines, discountType: "none", discountValue: "", reason: "", payments: [{ method: "upi", rupees }] }], who);
  assert.match((await sale("119.00")).result.error, /add up/);
  assert.equal(onHand(), 9, "a refused payment leaves stock alone");
  const ok = await sale("120.00", staff);
  assert.equal(ok.result.ok, true);
  assert.equal(onHand(), 6);
  assert.equal(q("SELECT session_id AS s FROM bills WHERE id = ?", ok.result.data.billId)[0].s, null, "a counter sale has no session");
  assert.ok((await (await get("/bills", owner)).text()).includes("Counter sale"));
  assert.ok((await (await get(`/bills/${ok.result.data.billId}`, owner)).text()).includes("Coke"));
  assert.equal((await call("counterSaleAction", [{ lines: [], discountType: "none", discountValue: "", reason: "", payments: [] }], owner)).result.ok, false);
  assert.notEqual((await call("counterSaleAction", [{ lines, discountType: "none", discountValue: "", reason: "", payments: [{ method: "upi", rupees: "120.00" }] }], "")).result.ok, true, "signed-out callers cannot sell");

  // void puts the stock back; deleting an item removes it from the menu and stock but not from old bills
  assert.equal((await call("voidBillAction", [ok.result.data.billId, "test"], owner)).result.ok, true);
  assert.equal(onHand(), 9);
  await form("deleteItemAction", { id: coke.id }, staff);
  assert.equal(q("SELECT active FROM menu_items WHERE id = ?", coke.id)[0].active, 1, "staff cannot delete items");
  await form("deleteItemAction", { id: coke.id }, owner);
  assert.equal((await sale("120.00")).result.ok, false, "deleted items cannot be sold");
  assert.ok(!(await (await get("/menu", owner)).text()).includes("Coke"), "a deleted item leaves the stock list");
  assert.ok(q("SELECT count(*) AS n FROM bill_lines WHERE item_id = ?", coke.id)[0].n >= 2, "history keeps the item");

  // deleting a category takes its items with it
  await form("saveCategoryAction", { name: "Temp" }, owner);
  const temp = q("SELECT id FROM menu_categories WHERE name = 'Temp'")[0].id;
  await form("saveItemAction", { categoryId: temp, name: "Gum", price: "5" }, owner);
  await form("deleteCategoryAction", { id: temp }, staff);
  assert.equal(q("SELECT active FROM menu_categories WHERE id = ?", temp)[0].active, 1, "staff cannot delete categories");
  await form("deleteCategoryAction", { id: temp }, owner);
  assert.deepEqual(q("SELECT active FROM menu_categories WHERE id = ?", temp).map((r) => r.active).concat(q("SELECT active FROM menu_items WHERE name = 'Gum'").map((r) => r.active)), [0, 0]);
});

await step("bills: payment column, search by invoice/station/counter, filter by method, status and date", async () => {
  const page = async (qs) => (await (await get(`/bills${qs}`, owner)).text()).replace(/<script[\s\S]*?<\/script>/g, ""); // only what is on screen: the data the page carries for its pop-ups has station names too
  const all_ = await page("");
  assert.ok(all_.includes("Paid by"), "payment mode column");
  assert.ok(all_.includes("Cash") && all_.includes("UPI"), "both payment modes show up");
  assert.ok((await page("?q=counter")).includes("Counter sale") && !(await page("?q=counter")).includes("PC 1"), "search finds counter sales only");
  assert.ok((await page("?q=PS5%201")).includes("INV-000001"), "search by station");
  assert.ok((await page("?q=1")).includes("INV-000001"), "search by invoice number");
  assert.ok(!(await page("?method=card")).includes("INV-0000"), "no card bills, nothing listed");
  assert.ok((await page("?method=card")).includes("No bills match"), "and it says so");
  assert.ok((await page("?method=upi")).includes("Counter sale"), "UPI filter finds the counter sale");
  assert.ok((await page("?status=void")).includes("Void") && !(await page("?status=void")).includes("Paid</span>"), "void filter");
  const today = new Date().toLocaleDateString("en-CA");
  assert.ok((await page(`?from=${today}&to=${today}`)).includes("INV-0000"), "today is inside today");
  assert.ok((await page("?from=2020-01-01&to=2020-01-02")).includes("No bills match"), "an old date range is empty");
  assert.ok((await page("?q=%25_%27%22%3Cb%3E")).includes("No bills match"), "odd characters in the search are harmless");
});

await step("customers: staff and owner can add and edit, search works, spend counts paid bills, bad input is refused", async () => {
  await form("addCustomerAction", { name: "Quincy Vance", phone: "98765 43210" }, staff);
  const id = q("SELECT id FROM customers WHERE name = 'Quincy Vance'")[0].id;
  assert.equal(q("SELECT phone FROM customers WHERE id = ?", id)[0].phone, "919876543210");
  await form("addCustomerAction", { name: "Bad Phone", phone: "12" }, owner);
  assert.equal(q("SELECT count(*) AS n FROM customers WHERE name = 'Bad Phone'")[0].n, 0, "a number that can't be real is refused");
  await form("updateCustomerAction", { id, name: "Quincy V", phone: "98765 43210", notes: "likes pool" }, owner);
  assert.deepEqual(q("SELECT name, notes FROM customers WHERE id = ?", id)[0], { name: "Quincy V", notes: "likes pool" });
  const list = async (qs = "") => (await (await get(`/customers${qs}`, staff)).text());
  assert.ok((await list()).includes("Quincy V") && (await list()).includes("+91 98765 43210"));
  assert.ok((await list("?q=98765")).includes("Quincy V"), "phone search finds her");
  const none = await list("?q=zzz");
  assert.ok(!none.includes("Quincy V"), "a search for nobody finds nobody: " + none.slice(Math.max(0, none.indexOf("Quincy V") - 150), none.indexOf("Quincy V") + 60));
  assert.equal((await get(`/customers/${id}`, staff)).status, 200);
  assert.equal((await get("/customers/99999", owner)).status, 404);
  assert.equal((await get("/customers", "")).status, 307, "signed-out visitors are sent to sign in");

  const s = await call("startSessionAction", [{ stationId: station("Sim 1"), mode: "open", players: 1, customerId: id }], owner);
  await call("stopAction", [s.result.data], owner);
  const total = (await call("getDraftAction", [s.result.data], owner)).result.data.lines.reduce((a, l) => a + l.qty * l.unitPaise, 0);
  await call("finalizeBillAction", [{ sessionId: s.result.data, discountType: "none", discountValue: "", reason: "", payments: [{ method: "upi", rupees: (total / 100).toFixed(2) }] }], owner);
  const page = await (await get(`/customers/${id}`, owner)).text();
  assert.ok(page.includes("INV-0000"), "the bill shows in the customer history");
  assert.ok((await (await get(`/bills?q=Quincy`, owner)).text()).includes("Quincy V"), "and bills can be searched by customer");
});

await step("sign-in picture: built-in by default, owner uploads and resets it, junk and staff are refused", async () => {
  const setting = () => q("SELECT value FROM settings WHERE key = 'cafe.loginImage'")[0]?.value ?? "";
  const png = new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 1, 2, 3, 4])], "pic.png", { type: "image/png" });
  const junk = new File([new TextEncoder().encode("<svg onload=alert(1)></svg>")], "pic.png", { type: "image/png" });
  assert.ok((await (await get("/login")).text()).includes("/brand/logo-hero.png"), "the built-in picture is on the sign-in page");
  await form("uploadLoginImageAction", { image: png }, staff);
  assert.equal(setting(), "", "staff cannot change it");
  await form("uploadLoginImageAction", { image: junk }, owner);
  assert.equal(setting(), "", "a file that is not an image is refused");
  await form("uploadLoginImageAction", { image: png }, owner);
  assert.match(setting(), /^login-[0-9a-f]{16}\.png$/);
  assert.match(await (await get("/login")).text(), /\/api\/brand\/logo\?kind=login(&amp;|&)v=login-/, "the sign-in page shows the upload");
  const served = await get("/api/brand/logo?kind=login");
  assert.equal(served.status, 200, "public: the sign-in page is shown to signed-out visitors");
  assert.equal(served.headers.get("content-type"), "image/png");
  assert.equal(fs.readdirSync(path.join(DATA, "uploads")).filter((f) => f.startsWith("login-")).length, 1);
  await call("resetLoginImageAction", [], staff);
  assert.match(setting(), /^login-/, "staff cannot reset it either");
  await call("resetLoginImageAction", [], owner);
  assert.equal(setting(), "");
  assert.equal((await get("/api/brand/logo?kind=login")).status, 404, "nothing is served once reset: the page uses the built-in file");
  assert.equal(fs.readdirSync(path.join(DATA, "uploads")).filter((f) => f.startsWith("login-")).length, 0, "the upload is deleted");
});

await step("zones, stations and rates: add a rate window, duplicates refused", async () => {
  const zone = q("SELECT id FROM zones WHERE kind = 'ps5'")[0].id;
  const days = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [`d${d}`, "on"]));
  await form("saveRateAction", { zoneId: zone, name: "Happy hour", hourly: "100", extra: "", increment: "1", min: "15", grace: "0", from: "14:00", to: "17:00", priority: "5", ...days }, owner);
  assert.equal(q("SELECT count(*) AS n FROM rates WHERE name = 'Happy hour'")[0].n, 1);
  // From and Until are optional: blank means all day.
  await form("saveRateAction", { zoneId: zone, name: "Weekend", hourly: "120", extra: "", increment: "1", min: "15", grace: "0", from: "", to: "", priority: "10", d0: "on", d6: "on" }, owner);
  const weekend = q("SELECT id, from_min AS f, to_min AS t, days_mask AS d FROM rates WHERE name = 'Weekend'")[0];
  assert.deepEqual([weekend.f, weekend.t, weekend.d], [0, 1440, 65], "no times means all day");
  await form("archiveRateAction", { id: weekend.id }, owner);
  await form("saveRateAction", { zoneId: zone, name: "Evening", hourly: "180", extra: "", increment: "1", min: "15", grace: "0", from: "18:00", to: "00:00", priority: "10", ...days }, owner);
  const evening = q("SELECT id, from_min AS f, to_min AS t FROM rates WHERE name = 'Evening'")[0];
  assert.deepEqual([evening?.f, evening?.t], [1080, 1440], "until 00:00 means midnight, not a crash");
  await form("archiveRateAction", { id: evening.id }, owner);
  // The simple Rates page: the normal price form hides name, days, times and priority; a special price form adds days and times.
  const normalId = q("SELECT id FROM rates WHERE zone_id = ? AND name = 'Standard'", zone)[0].id;
  await form("saveRateAction", { id: normalId, zoneId: zone, name: "Standard", hourly: "160", extra: "", increment: "1", min: "15", grace: "0", from: "00:00", to: "24:00", priority: "0", ...days }, owner);
  assert.equal(q("SELECT hourly_paise AS h FROM rates WHERE id = ?", normalId)[0].h, 16000, "the normal price can be changed with just the price");
  const rates = await (await get("/settings?tab=rates", owner)).text();
  assert.ok(rates.includes("Normal price") && rates.includes("Special prices") && rates.includes("Happy hour") && rates.includes("Every day · 14:00–17:00"), "the rates page shows normal and special prices");
  assert.ok(!rates.includes(">Priority<"), "no priority box any more");
  await form("saveRateAction", { zoneId: zone, name: "Broken", hourly: "-5", increment: "1", min: "15", grace: "0", from: "14:00", to: "17:00", priority: "5", ...days }, owner);
  assert.equal(q("SELECT count(*) AS n FROM rates WHERE name = 'Broken'")[0].n, 0);
  await form("createStationAction", { zoneId: zone, name: "PS5 1" }, owner);
  assert.equal(q("SELECT count(*) AS n FROM stations WHERE name = 'PS5 1' AND active = 1")[0].n, 1);
  await form("createStationAction", { zoneId: zone, name: "PS5 2" }, owner);
  assert.equal(q("SELECT count(*) AS n FROM stations WHERE name = 'PS5 2'")[0].n, 1);
});

await step("whatsapp: tray offers messages to customers with a phone, staff can't change settings, opened messages leave the tray", async () => {
  await form("addCustomerAction", { name: "Wanda Wu", phone: "98765 11111" }, staff);
  const id = q("SELECT id FROM customers WHERE name = 'Wanda Wu'")[0].id;
  const s = await call("startSessionAction", [{ stationId: station("PS5 2"), mode: "open", players: 1, customerId: id }], staff);
  const tray = async () => [...new Set((await (await get("/", staff)).text()).replaceAll("&#x27;", "'").match(/https:\/\/wa\.me\/919876511111\?text=[^"\\]*/g) ?? [])]; // the page carries each link twice (markup and payload); React escapes the apostrophe in the markup
  assert.equal((await tray()).length, 2, "welcome and session-started messages are waiting: ");
  assert.ok(decodeURIComponent((await tray())[0]).includes("Wanda Wu"));

  await form("saveWhatsAppAction", { enabled: "on", started: "on", "tpl-started": "Custom {name}" }, staff);
  assert.equal(q("SELECT count(*) AS n FROM settings WHERE key LIKE 'wa.%'")[0].n, 0, "staff cannot change WhatsApp settings");
  await form("saveWhatsAppAction", { enabled: "on", started: "on", "tpl-started": "Custom {name}" }, owner);
  assert.equal(q("SELECT value FROM settings WHERE key = 'wa.welcome'")[0].value, "0", "an unticked box turns that message off");
  const links = await tray();
  assert.equal(links.length, 1);
  assert.ok(decodeURIComponent(links[0]).endsWith("Custom Wanda Wu"), "the owner's wording is used");

  const key = `started:${s.result.data}`;
  assert.equal((await call("markMessageAction", [key, "opened"], staff)).result.ok, true);
  assert.equal((await call("markMessageAction", [key, "opened"], staff)).result.ok, true, "twice is harmless");
  assert.equal((await call("markMessageAction", ["junk", "opened"], staff)).result.ok, false);
  assert.deepEqual(q("SELECT key, outcome FROM message_log"), [{ key, outcome: "opened" }]);
  assert.equal((await tray()).length, 0);
});

await step("excel export: one file with everything for the owner only; staff and signed-out visitors cannot", async () => {
  const r = await get("/api/export", owner);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /spreadsheetml\.sheet/);
  assert.match(r.headers.get("content-disposition"), new RegExp(String.raw`^attachment; filename="[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.xlsx"$`));
  const bytes = Buffer.from(await r.arrayBuffer());
  assert.equal(bytes.subarray(0, 2).toString(), "PK", "a real .xlsx (zip) file");
  assert.equal((await get("/api/export?from=2020-01-01&to=2020-01-02", owner)).status, 200, "a date range is accepted");
  assert.equal((await get("/api/export", staff)).status, 403, "staff cannot export");
  assert.equal((await get("/api/export")).status, 307, "signed-out visitors are sent to sign in");
  assert.ok(q("SELECT action FROM audit_log").some((x) => x.action === "export"), "exports are audited");
  const tab = await (await get("/settings?tab=export", owner)).text();
  assert.ok(tab.includes("Export to Excel") && tab.includes('action="/api/export"'), "the owner finds the export in Settings");
  assert.ok(!(await (await get("/bills", owner)).text()).includes("Export to Excel"), "and not scattered over other pages");
});

await step("alerts can be switched off in Settings: the bell and the sounds follow", async () => {
  const bell = async () => (await (await get("/", owner)).text()).includes('title="Alerts"');
  const save = (extra) => form("saveCafeAction", { cafeName: "Level 9 Gaming Lounge", address: "Lohegaon, Pune", gst: "on", gstPct: "18", leadMin: "10", maxDiscount: "10", upiId: "level9@okhdfc", ...extra }, owner);
  const value = (k) => q("SELECT value FROM settings WHERE key = ?", k)[0]?.value;
  await save({ alerts: "on", alertSound: "on" });
  assert.deepEqual([value("alert.enabled"), value("alert.sound")], ["1", "1"]);
  assert.equal(await bell(), true, "the bell is there when alerts are on");
  await save({ alerts: "on" });
  assert.deepEqual([value("alert.enabled"), value("alert.sound")], ["1", "0"], "alerts without sound");
  assert.equal(await bell(), true);
  await save({});
  assert.deepEqual([value("alert.enabled"), value("alert.sound")], ["0", "0"]);
  assert.equal(await bell(), false, "no bell when alerts are off");
  await save({ alerts: "on", alertSound: "on" });
  assert.equal(await bell(), true, "and back again");
});

await step("paging: any page number in the address is safe on Bills, Customers, a customer and the Activity log", async () => {
  for (const url of ["/bills?page=999", "/bills?page=abc&q=x", "/bills?page=-4", "/bills?size=7", "/bills?size=100", "/customers?page=999", "/customers?page=0&q=zzz", "/customers?size=500", "/customers/1?page=77&size=20", "/settings?tab=activity&page=999&size=30"]) {
    assert.equal((await get(url, owner)).status, 200, url);
  }
  assert.ok((await (await get("/settings?tab=activity&page=999", owner)).text()).includes("Changed"), "past the end shows the last page, not an empty one");
  for (const [url, who] of [["/bills", "staff"], ["/customers", "staff"], ["/customers/1", "staff"], ["/settings?tab=activity", "owner"]]) {
    const html = (await (await get(url, who === "owner" ? owner : staff)).text()).replaceAll("<!-- -->", ""); // React separates text pieces with comments
    assert.ok(html.includes("Rows per page") && /Showing 1–\d+ of \d+/.test(html), `${url} shows the page-size choice and the count even when everything fits on one page`);
    assert.ok(["10", "20", "50", "100"].every((n) => html.includes(`<option value="${n}"`)), `${url} offers sizes 10 to 100`);
  }
  assert.match(await (await get("/bills?size=100", staff)).text(), /<option value="100" selected/, "the chosen size is the selected one");
});

await step("owner renames themselves; staff cannot rename anyone", async () => {
  const id = q("SELECT id FROM user WHERE username = 'owner'")[0].id;
  await form("renameStaffAction", { id, name: "Gabor Sebok" }, staff);
  assert.notEqual(q("SELECT name FROM user WHERE id = ?", id)[0].name, "Gabor Sebok", "staff cannot rename");
  await form("renameStaffAction", { id, name: "   " }, owner);
  assert.notEqual(q("SELECT name FROM user WHERE id = ?", id)[0].name, "", "a blank name is refused");
  await form("renameStaffAction", { id, name: "Gabor Sebok" }, owner);
  assert.equal(q("SELECT name FROM user WHERE id = ?", id)[0].name, "Gabor Sebok");
  assert.ok((await (await get("/", owner)).text()).includes("Gabor Sebok"), "the new name shows in the app");
  assert.equal(q("SELECT username FROM user WHERE id = ?", id)[0].username, "owner", "the sign-in username is unchanged");
});

await step("reports and expenses: owner only, expenses add and delete, net profit follows", async () => {
  assert.equal((await get("/reports", staff)).status, 307, "staff cannot open Reports");
  assert.equal((await get("/reports")).status, 307, "signed-out visitors cannot");
  const page = await (await get("/reports?range=month", owner)).text();
  for (const t of ["Takings", "Net profit", "Takings by day", "How it was paid", "From sales to net profit", "Show the exact numbers"]) assert.ok(page.includes(t), `Reports overview shows "${t}"`);
  const sales = await (await get("/reports?range=month&tab=sales", owner)).text();
  for (const t of ["Time or food?", "By zone", "By station", "Best sellers", "By staff", "Show every figure, with totals"]) assert.ok(sales.includes(t), `Sales tab shows "${t}"`);
  assert.ok((await (await get("/reports?range=month&tab=daily", owner)).text()).includes("Every day"), "Day by day tab");
  assert.ok((await (await get("/reports?range=month&tab=hours", owner)).text()).includes("When sessions start"), "Busy hours tab (the smoke run has started sessions)");
  assert.equal((await get("/reports?range=bogus&tab=bogus&from=x&to=y", owner)).status, 200, "nonsense in the address falls back to the overview of this month");
  assert.ok(!(await (await get("/", staff)).text()).includes('href="/reports"'), "staff don't see the Reports link");
  assert.ok((await (await get("/", owner)).text()).includes('href="/reports"'), "the owner does");

  const today = new Date().toLocaleDateString("en-CA");
  await form("addExpenseAction", { day: today, category: "Rent", amount: "2500", note: "Smoke rent" }, staff);
  assert.equal(q("SELECT COUNT(*) AS n FROM expenses")[0].n, 0, "staff cannot add expenses");
  await form("addExpenseAction", { day: today, category: "Made up", amount: "10" }, owner);
  await form("addExpenseAction", { day: today, category: "Rent", amount: "-5" }, owner);
  assert.equal(q("SELECT COUNT(*) AS n FROM expenses")[0].n, 0, "unknown category and bad amount are refused");
  await form("addExpenseAction", { day: today, category: "Rent", amount: "2500", note: "Smoke rent" }, owner);
  const exp = q("SELECT id, amount_paise AS a FROM expenses")[0];
  assert.equal(exp.a, 250000);
  const tab = await (await get("/reports?range=today&tab=expenses", owner)).text();
  assert.ok(tab.includes("Smoke rent") && tab.includes("Add expense") && tab.includes("Biggest category"), "the expense is listed");
  assert.ok(Buffer.from(await (await get("/api/export", owner)).arrayBuffer()).length > 2000, "the export still builds with expenses in it");
  await form("deleteExpenseAction", { id: exp.id }, owner);
  assert.equal(q("SELECT COUNT(*) AS n FROM expenses")[0].n, 0);
});

await step("backups: back up now, second folder, restore returns the old data, junk refused, staff refused", async () => {
  const count = () => q("SELECT COUNT(*) AS n FROM customers")[0].n;
  const names = () => fs.readdirSync(path.join(DATA, "backups")).filter((f) => /^lounge-\d{8}-\d{6}\.db$/.test(f));
  const second = path.join(DATA, "second-copy");
  fs.mkdirSync(second);

  assert.equal((await call("backupNowAction", [], staff)).result.ok, false, "staff cannot back up");
  await form("saveBackupFolderAction", { folder: "relative/path" }, owner);
  await form("saveBackupFolderAction", { folder: path.join(DATA, "does-not-exist") }, owner);
  assert.equal(q("SELECT value FROM settings WHERE key = 'backup.folder'")[0]?.value ?? "", "", "a folder that isn't there is refused");
  await form("saveBackupFolderAction", { folder: second }, owner);
  assert.equal(q("SELECT value FROM settings WHERE key = 'backup.folder'")[0].value, second);

  const before = count();
  const r = await call("backupNowAction", [], owner);
  assert.equal(r.result.ok, true);
  const mine = names().sort().at(-1);
  assert.ok(mine, "a backup file was written next to the data");
  assert.ok(fs.existsSync(path.join(second, mine)), "and copied to the second folder");
  assert.ok(names().length >= 1, "startup made one too");

  await form("addCustomerAction", { name: "Added After Backup", phone: "" }, owner);
  assert.equal(count(), before + 1);
  assert.ok((await (await get("/settings?tab=backups", owner)).text()).includes("Restore"), "the Backups tab lists restorable backups");

  await form("restoreBackupAction", { from: "main", name: "../../etc/passwd" }, owner);
  await form("restoreBackupAction", { from: "main", name: "lounge-19990101-000000.db" }, owner);
  fs.writeFileSync(path.join(second, "lounge-19990101-000000.db"), "not a database");
  await form("restoreBackupAction", { from: "second", name: "lounge-19990101-000000.db" }, owner);
  await form("restoreBackupAction", { from: "main", name: mine }, staff);
  assert.equal(count(), before + 1, "junk, missing files and staff change nothing");

  await form("restoreBackupAction", { from: "main", name: mine }, owner);
  assert.equal(count(), before, "the restore put the data back as it was at the backup");
  assert.ok(fs.readdirSync(path.join(DATA, "backups")).some((f) => f.startsWith("lounge-before-restore-")), "and kept a copy of what was there before");
  assert.ok(q("SELECT action FROM audit_log").some((x) => x.action === "backup.restore"), "restores are audited");
  fs.rmSync(path.join(second, "lounge-19990101-000000.db"), { force: true });
  await form("saveBackupFolderAction", { folder: "" }, owner);
});

await step("activity log: the owner can read it; the Rates page has no packages", async () => {
  const log = await (await get("/settings?tab=activity&size=100", owner)).text(); // 100 rows: the first page of 10 only holds the newest entries
  assert.ok(log.includes("Voided a bill") || log.includes("Saved a price"), "the log is in plain words");
  assert.ok(log.includes("Restored a backup"), "restores show up in it");
  assert.ok((await (await get("/settings?tab=activity&q=zzzznothing", owner)).text()).includes("Nothing matches"), "search works");
  assert.equal((await get("/settings?tab=activity", staff)).status, 307, "staff cannot read the log");
  const rates = await (await get("/settings?tab=rates", owner)).text();
  assert.ok(!/package/i.test(rates), "packages are gone from the Rates page");
  assert.ok(rates.includes("+ Add a special price"));
});

await step("investments: owner only, validated, shown with progress and payback, costs can be tied to a station, Excel gets the sheets", async () => {
  const ps5 = station("PS5 1");
  const longAgo = new Date(Date.now() - 20 * 86400000).toLocaleDateString("en-CA");
  assert.equal((await get("/reports?tab=investments", staff)).status, 307, "staff cannot open Reports");
  await form("saveInvestmentAction", { name: "Staff try", amount: "1000", boughtOn: longAgo, station: String(ps5) }, staff);
  await form("saveInvestmentAction", { name: "Free", amount: "0", boughtOn: longAgo, station: String(ps5) }, owner);
  await form("saveInvestmentAction", { name: "Bad date", amount: "100", boughtOn: "2026-02-30", station: "" }, owner);
  await form("saveInvestmentAction", { name: "No such station", amount: "100", boughtOn: longAgo, station: "99999" }, owner);
  assert.equal(q("SELECT COUNT(*) AS n FROM investments")[0].n, 0, "staff, a zero amount, a bad date and a missing station are all refused");

  const empty = await (await get("/reports?tab=investments", owner)).text();
  assert.ok(empty.includes("Track what your equipment earns back") && empty.includes("Add investment"), "the empty Investments tab explains itself");

  await form("saveInvestmentAction", { name: "PS5 console", amount: "1500", boughtOn: longAgo, station: String(ps5), note: "with two controllers" }, owner);
  await form("saveInvestmentAction", { name: "Interiors", amount: "250000", boughtOn: longAgo, station: "" }, owner);
  const rows = q("SELECT name, amount_paise AS a, station_id AS s FROM investments ORDER BY id");
  assert.deepEqual(rows.map((r) => [r.name, r.a, r.s]), [["PS5 console", 150000, ps5], ["Interiors", 25000000, null]]);

  await form("addExpenseAction", { day: new Date().toLocaleDateString("en-CA"), category: "Repairs", amount: "100", note: "controller", station: String(ps5) }, owner);
  assert.equal(q("SELECT station_id AS s FROM expenses WHERE note = 'controller'")[0].s, ps5, "an expense can belong to a station");

  const page = await (await get("/reports?tab=investments", owner)).text();
  for (const t of ["All investments together", "PS5 1", "Whole lounge", "Payback", "Earnings after costs, building up to the amount invested", "Your investments", "Return on investment"]) assert.ok(page.includes(t), `Investments shows "${t}"`);
  assert.ok(/Paid back|Earning it back/.test(page), "each card says where it stands");
  assert.ok((await (await get("/reports?tab=expenses", owner)).text()).includes("Belongs to"), "expenses show which station they belong to");

  assert.ok(Buffer.from(await (await get("/api/export", owner)).arrayBuffer()).length > 2000, "the export builds with investments in it");
  const id = rows[0].id ?? q("SELECT id FROM investments WHERE name = 'PS5 console'")[0].id;
  await form("deleteInvestmentAction", { id }, staff);
  assert.equal(q("SELECT COUNT(*) AS n FROM investments")[0].n, 2, "staff cannot delete");
  await form("deleteInvestmentAction", { id }, owner);
  assert.equal(q("SELECT COUNT(*) AS n FROM investments")[0].n, 1);
  await form("deleteInvestmentAction", { id: q("SELECT id FROM investments")[0].id }, owner);
});

await step("past bills: the owner adds a bill from before the app, it is a normal paid bill marked 'Added by hand'; staff and bad entries are refused", async () => {
  const ps5 = station("PS5 1");
  const before = q("SELECT COUNT(*) AS n FROM bills")[0].n;
  const d = new Date(Date.now() - 5 * 86400000);
  const when = `${d.toLocaleDateString("en-CA")}T18:30`;
  const fields = { startedAt: when, station: String(ps5), minutes: "90", timeAmount: "225", extrasAmount: "80", method: "upi", customer: "", note: "from the register" };

  assert.ok((await (await get("/bills", owner)).text()).includes("Add past bill"), "the owner has the button");
  assert.ok(!(await (await get("/bills", staff)).text()).includes("Add past bill"), "staff don't");
  await form("addPastBillAction", fields, staff);
  await form("addPastBillAction", { ...fields, startedAt: `${new Date(Date.now() + 86400000).toLocaleDateString("en-CA")}T10:00` }, owner);
  await form("addPastBillAction", { ...fields, minutes: "0" }, owner);
  await form("addPastBillAction", { ...fields, timeAmount: "", extrasAmount: "" }, owner);
  await form("addPastBillAction", { ...fields, station: "99999" }, owner);
  await form("addPastBillAction", { ...fields, startedAt: "yesterday" }, owner);
  await form("addPastBillAction", { ...fields, method: "bitcoin" }, owner);
  assert.equal(q("SELECT COUNT(*) AS n FROM bills")[0].n, before, "staff, a future visit, zero minutes, nothing paid, a missing station, a bad date and a bad method are all refused");

  await form("addPastBillAction", fields, owner);
  const bill = q("SELECT id, total_paise AS total, status, entered_by_hand AS hand, created_at AS at FROM bills ORDER BY id DESC LIMIT 1")[0];
  assert.deepEqual([bill.total, bill.status, bill.hand], [30500, "paid", 1]);
  assert.equal(bill.at, new Date(`${when}:00`).getTime() + 90 * 60000, "dated when the visit ended");
  assert.deepEqual(q("SELECT method, amount_paise AS a FROM payments WHERE bill_id = ?", bill.id), [{ method: "upi", a: 30500 }]);
  assert.equal(q("SELECT billed, notes FROM sessions WHERE id = (SELECT session_id FROM bills WHERE id = ?)", bill.id)[0].billed, 1);
  const list = await (await get("/bills?q=PS5", owner)).text();
  assert.ok(list.includes("Added by hand"), "the list says so");
  assert.ok((await (await get(`/bills/${bill.id}`, owner)).text()).includes("Added by hand"), "and so does the invoice");
});

await step("owner resets a PIN: old PIN stops working, new one works", async () => {
  const id = q("SELECT id FROM user WHERE username = 'counter'")[0].id;
  await form("resetPinAction", { id, pin: "5566" }, owner);
  assert.equal((await call("loginAction", ["counter", "1234"])).result.ok, false);
  assert.equal((await call("loginAction", ["counter", "5566"])).result.ok, true);
  assert.equal((await get("/", staff)).status, 307, "old session is signed out after a PIN reset");
});

await step("owner actions are written to the audit log, and the launcher keeps a server log", async () => {
  const actions = new Set(q("SELECT action FROM audit_log").map((r) => r.action));
  for (const a of ["settings.cafe", "rate.save", "station.create", "staff.create", "staff.pin_reset", "session.stop"]) {
    assert.ok(actions.has(a), `audit log is missing ${a}`);
  }
  assert.ok(fs.existsSync(path.join(DATA, "server.log")), "data/server.log should exist (start.bat writes it)");
});

await step("clear all data (last, it wipes everything): owner only, needs the code and the tick, keeps logins, saves a safety copy", async () => {
  const secret = fs.readFileSync(path.join(DATA, "auth-secret"), "utf8").trim();
  const challenge = (code, expires = Date.now() + 600_000) => ({ code, expires: String(expires), mac: crypto.createHmac("sha256", secret).update(`clear:${code}:${expires}`).digest("hex") });
  const n = (t) => q(`SELECT COUNT(*) AS n FROM ${t}`)[0].n;
  const intact = (why) => assert.ok(n("bills") > 0 && n("zones") > 0 && n("settings") > 1, `data is still there: ${why}`);

  assert.ok((await (await get("/settings?tab=backups", owner)).text()).includes("Clear all data"), "the button is in Settings > Backups");
  await form("clearAllDataAction", { ...challenge("ACDEFG"), code: "ACDEFG", understand: "on" }, staff);
  intact("staff cannot");
  await form("clearAllDataAction", { ...challenge("ACDEFG"), code: "ACDEFG" }, owner);
  intact("the box was not ticked");
  await form("clearAllDataAction", { ...challenge("ACDEFG"), code: "WRONG1", understand: "on" }, owner);
  intact("wrong code");
  await form("clearAllDataAction", { ...challenge("ACDEFG", Date.now() - 1000), code: "ACDEFG", understand: "on" }, owner);
  intact("expired code");
  await form("clearAllDataAction", { ...challenge("ACDEFG"), mac: "0".repeat(64), code: "ACDEFG", understand: "on" }, owner);
  intact("forged signature");

  await form("clearAllDataAction", { ...challenge("ACDEFG"), code: "acdefg", understand: "on", deleteBackups: "on" }, owner);
  for (const t of ["bills", "bill_lines", "payments", "sessions", "customers", "expenses", "investments", "menu_items", "menu_categories", "zones", "stations", "rates", "stock_moves", "message_log"]) assert.equal(n(t), 0, t);
  assert.deepEqual(q("SELECT key FROM settings").map((r) => r.key), ["setup.done"]);
  assert.equal(n("user"), 2, "both logins are kept");
  assert.deepEqual(q("SELECT action FROM audit_log").map((r) => r.action), ["data.clear"]);
  const left = fs.readdirSync(path.join(DATA, "backups")).filter((f) => f.endsWith(".db"));
  assert.ok(left.length === 1 && /^lounge-before-clear-\d{8}-\d{6}\.db$/.test(left[0]), `only the safety copy is left: ${left}`);
  assert.equal((await call("loginAction", ["owner", "4821"])).result.ok, true, "the owner can still sign in");
  assert.equal((await get("/", owner)).status, 200, "and the app opens on the empty floor, not on a setup loop");
});

console.log(`\n${passed} smoke steps passed`);
