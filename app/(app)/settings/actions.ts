"use server";
import fs from "node:fs";
import path from "node:path";
import { act } from "@/lib/action";
import { ownerActor } from "@/lib/session";
import { UserError } from "@/lib/errors";
import { bool, hhmm, int, oneOf, rupeesToPaise, str } from "@/lib/validate";
import { isValidUpiId } from "@/lib/engine/upi";
import { createUser, listStaff, removeUser, renameUser, setPin } from "@/lib/auth-core";
import { getAuth } from "@/lib/auth";
import { audit, dataDir, getDb } from "@/lib/db/index";
import { BACKUP_NAME, backupsDir, makeBackup, restoreBackup } from "@/lib/backup";
import { getSetting, setSettings } from "@/lib/db/settings";
import { MESSAGE_TYPES } from "@/lib/whatsapp/compose";
import { LOGIN_NAME, saveLogo, UPLOAD_NAME } from "@/lib/logo";
import {
  ZONE_KINDS, archiveRate, archiveStation, archiveZone, createStation, createZone, renameZone, saveRate, updateStation,
} from "@/lib/db/catalog";

const field = (fd: FormData, k: string) => fd.get(k);

export async function saveCafeAction(fd: FormData) {
  return act(async () => {
    const me = await ownerActor();
    const upiId = str(field(fd, "upiId"), "UPI ID", { max: 80, required: false });
    if (upiId && !isValidUpiId(upiId)) throw new UserError("That UPI ID doesn't look right. It should look like name@bank.");
    setSettings({
      "cafe.name": str(field(fd, "cafeName"), "Lounge name", { max: 60 }),
      "cafe.address": str(field(fd, "address"), "Address", { max: 200, required: false }),
      "cafe.phone": str(field(fd, "phone"), "Phone", { max: 30, required: false }),
      "cafe.gstin": str(field(fd, "gstin"), "GSTIN", { max: 20, required: false }),
      "cafe.upiId": upiId,
      "gst.enabled": bool(field(fd, "gst")) ? "1" : "0",
      "gst.pct": String(int(field(fd, "gstPct"), "GST %", { min: 0, max: 28 })),
      "alert.enabled": bool(field(fd, "alerts")) ? "1" : "0",
      "alert.sound": bool(field(fd, "alertSound")) ? "1" : "0",
      "alert.leadMin": String(int(field(fd, "leadMin"), "Ending-soon warning", { min: 1, max: 120 })),
      "staff.maxDiscountPct": String(int(field(fd, "maxDiscount"), "Staff discount limit", { min: 0, max: 100 })),
    });
    audit(me.id, "settings.cafe", "name, contact, tax or floor settings changed");
  });
}

export async function saveWhatsAppAction(fd: FormData) {
  return act(async () => {
    const me = await ownerActor();
    const values: Parameters<typeof setSettings>[0] = { "wa.enabled": bool(field(fd, "enabled")) ? "1" : "0" };
    for (const t of MESSAGE_TYPES) {
      values[`wa.${t}`] = bool(field(fd, t)) ? "1" : "0";
      values[`wa.tpl.${t}`] = str(field(fd, `tpl-${t}`), "Message wording", { max: 1000, required: false });
    }
    setSettings(values);
    audit(me.id, "settings.whatsapp", "WhatsApp switches or wording changed");
  });
}

export async function uploadLogoAction(fd: FormData) {
  return act(async () => {
    const me = await ownerActor();
    const f = field(fd, "logo");
    if (!(f instanceof File)) throw new UserError("Choose an image file");
    const name = saveLogo(dataDir(), new Uint8Array(await f.arrayBuffer()), getSetting("cafe.logo"));
    setSettings({ "cafe.logo": name });
    audit(me.id, "logo.upload", name);
  });
}

export async function uploadLoginImageAction(fd: FormData) {
  return act(async () => {
    const me = await ownerActor();
    const f = field(fd, "image");
    if (!(f instanceof File)) throw new UserError("Choose an image file");
    const name = saveLogo(dataDir(), new Uint8Array(await f.arrayBuffer()), getSetting("cafe.loginImage"), "login");
    setSettings({ "cafe.loginImage": name });
    audit(me.id, "loginimage.upload", name);
  });
}

/** Back to the built-in Level 9 picture. */
export async function resetLoginImageAction() {
  return act(async () => {
    const me = await ownerActor();
    const current = getSetting("cafe.loginImage");
    if (LOGIN_NAME.test(current)) fs.rmSync(path.join(dataDir(), "uploads", current), { force: true });
    setSettings({ "cafe.loginImage": "" });
    audit(me.id, "loginimage.reset", "built-in");
  });
}

/** "builtin" goes back to the Level 9 logo, "none" shows the lounge name instead of a logo. */
export async function resetLogoAction(fd: FormData) {
  return act(async () => {
    const me = await ownerActor();
    const to = oneOf(field(fd, "to"), ["builtin", "none"] as const, "Logo");
    const current = getSetting("cafe.logo");
    if (UPLOAD_NAME.test(current)) fs.rmSync(path.join(dataDir(), "uploads", current), { force: true });
    setSettings({ "cafe.logo": to === "builtin" ? "builtin:level9" : "" });
    audit(me.id, "logo.reset", to);
  });
}

// ---- zones and stations ----
const zoneKind = (fd: FormData) => oneOf(field(fd, "kind"), ZONE_KINDS, "Zone type");

export const createZoneAction = async (fd: FormData) =>
  act(async () => {
    const me = await ownerActor();
    createZone(str(field(fd, "name"), "Zone name", { max: 40 }), zoneKind(fd));
    audit(me.id, "zone.create", String(field(fd, "name")));
  });

export const updateZoneAction = async (fd: FormData) =>
  act(async () => {
    const me = await ownerActor();
    renameZone(int(field(fd, "id"), "Zone"), str(field(fd, "name"), "Zone name", { max: 40 }), zoneKind(fd));
    audit(me.id, "zone.update", String(field(fd, "id")));
  });

export const archiveZoneAction = async (fd: FormData) =>
  act(async () => {
    const me = await ownerActor();
    archiveZone(int(field(fd, "id"), "Zone"));
    audit(me.id, "zone.remove", String(field(fd, "id")));
  });

export const createStationAction = async (fd: FormData) =>
  act(async () => {
    const me = await ownerActor();
    createStation(int(field(fd, "zoneId"), "Zone"), str(field(fd, "name"), "Station name", { max: 40 }));
    audit(me.id, "station.create", String(field(fd, "name")));
  });

export const updateStationAction = async (fd: FormData) =>
  act(async () => {
    const me = await ownerActor();
    updateStation(int(field(fd, "id"), "Station"), str(field(fd, "name"), "Station name", { max: 40 }), bool(field(fd, "maintenance")));
    audit(me.id, "station.update", String(field(fd, "id")));
  });

export const archiveStationAction = async (fd: FormData) =>
  act(async () => {
    const me = await ownerActor();
    archiveStation(int(field(fd, "id"), "Station"));
    audit(me.id, "station.remove", String(field(fd, "id")));
  });

// ---- rates ----
export async function saveRateAction(fd: FormData) {
  return act(async () => {
    const me = await ownerActor();
    let daysMask = 0;
    for (let d = 0; d < 7; d++) if (bool(field(fd, `d${d}`))) daysMask |= 1 << d;
    if (daysMask === 0) throw new UserError("Pick at least one day");
    // Blank times mean "from the start of the day" and "until the end of the day".
    const fromRaw = str(field(fd, "from"), "From", { max: 5, required: false });
    const toRaw = str(field(fd, "to"), "Until", { max: 5, required: false });
    const fromMin = fromRaw ? hhmm(fromRaw, "From") : 0;
    let toMin = toRaw ? hhmm(toRaw, "Until", true) : 1440;
    if (toMin === 0) toMin = 1440; // "until 00:00" is midnight, the end of the day
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
    audit(me.id, "rate.save", `${String(field(fd, "name"))} ${String(field(fd, "hourly"))}/hr`);
  });
}

export const archiveRateAction = async (fd: FormData) =>
  act(async () => {
    const me = await ownerActor();
    archiveRate(int(field(fd, "id"), "Rate"));
    audit(me.id, "rate.remove", String(field(fd, "id")));
  });

// ---- staff ----
const pin = (fd: FormData) => {
  const p = String(field(fd, "pin") ?? "");
  if (!/^\d{4,8}$/.test(p)) throw new UserError("PIN must be 4 to 8 digits");
  return p;
};

export async function createStaffAction(fd: FormData) {
  return act(async () => {
    const me = await ownerActor();
    const username = str(field(fd, "username"), "Username", { max: 20 }).toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) throw new UserError("Username can use letters, numbers and _ (3 to 20 characters)");
    await createUser(getAuth(), { username, pin: pin(fd), name: str(field(fd, "name"), "Name", { max: 60 }), role: "staff" });
    audit(me.id, "staff.create", username);
  });
}

export async function renameStaffAction(fd: FormData) {
  return act(async () => {
    const me = await ownerActor();
    const id = str(field(fd, "id"), "Person", { max: 64 });
    const name = str(field(fd, "name"), "Name", { max: 60 });
    const was = listStaff().find((s) => s.id === id)?.name; // names, not ids: the activity log is read by people
    renameUser(id, name);
    audit(me.id, "staff.rename", `${was} → ${name}`);
  });
}

export async function resetPinAction(fd: FormData) {
  return act(async () => {
    const me = await ownerActor();
    const id = str(field(fd, "id"), "Person", { max: 64 });
    const target = listStaff().find((s) => s.id === id);
    if (!target) throw new UserError("Person not found");
    await setPin(getAuth(), id, pin(fd));
    audit(me.id, "staff.pin_reset", `${target.name} (@${target.username})`);
  });
}

export async function removeStaffAction(fd: FormData) {
  return act(async () => {
    const me = await ownerActor();
    const id = str(field(fd, "id"), "Person", { max: 64 });
    const target = listStaff().find((s) => s.id === id);
    if (!target) throw new UserError("Person not found");
    if (target.role === "owner") throw new UserError("The owner can't be removed");
    await removeUser(getAuth(), id);
    audit(me.id, "staff.remove", `${target.username} (${id})`);
  });
}

// ---- backups ----
export async function backupNowAction() {
  return act(async () => {
    const me = await ownerActor();
    const second = getSetting("backup.folder") || undefined;
    const { name, copyError } = makeBackup(getDb(), backupsDir(), { second });
    audit(me.id, "backup.now", name);
    if (copyError) throw new UserError(`The backup was saved, but copying it to your second folder failed: ${copyError}`);
  });
}

/** The second folder must already exist and accept files, so a typo is caught now and not on the day a backup is needed. */
export async function saveBackupFolderAction(fd: FormData) {
  return act(async () => {
    const me = await ownerActor();
    const folder = str(field(fd, "folder"), "Folder", { max: 260, required: false });
    if (folder) {
      if (!path.isAbsolute(folder)) throw new UserError("Type the full folder path, like E:\LoungeBackups");
      if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw new UserError("That folder doesn't exist. Create it first, or plug in the drive.");
      const probe = path.join(folder, ".lounge-write-test");
      try {
        fs.writeFileSync(probe, "ok");
        fs.rmSync(probe, { force: true });
      } catch {
        throw new UserError("The app can't save files in that folder");
      }
    }
    setSettings({ "backup.folder": folder });
    audit(me.id, "backup.folder", folder || "none");
  });
}

export async function restoreBackupAction(fd: FormData) {
  return act(async () => {
    const me = await ownerActor();
    const from = oneOf(field(fd, "from"), ["main", "second"] as const, "Location");
    const name = str(field(fd, "name"), "Backup", { max: 80 });
    if (!BACKUP_NAME.test(name)) throw new UserError("That backup is not valid");
    const dir = from === "main" ? backupsDir() : getSetting("backup.folder");
    if (!dir) throw new UserError("No second folder is set");
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) throw new UserError("That backup file is no longer there");
    const { safety } = restoreBackup(getDb(), file, backupsDir());
    audit(me.id, "backup.restore", `${name} (safety copy: ${safety})`);
  });
}
