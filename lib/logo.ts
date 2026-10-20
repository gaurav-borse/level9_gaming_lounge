import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { UserError } from "./errors.ts";
import { BRAND } from "./brand.ts";

/** The only file names we ever serve from data/uploads, so a setting can never point outside that folder. */
export const UPLOAD_NAME = /^logo-[0-9a-f]{16}\.(png|jpg|webp)$/;
export const MAX_LOGO_BYTES = 900 * 1024;
/** The sign-in page picture is bigger (a full artwork, not a small mark). Uploads are capped by next.config's 3 MB action limit. */
export const LOGIN_NAME = /^login-[0-9a-f]{16}\.(png|jpg|webp)$/;
export const MAX_LOGIN_BYTES = 2500 * 1024;

const KINDS = {
  logo: { prefix: "logo", name: UPLOAD_NAME, max: MAX_LOGO_BYTES },
  login: { prefix: "login", name: LOGIN_NAME, max: MAX_LOGIN_BYTES },
} as const;

/** Identify an image by its first bytes, never by the file name the browser claims. */
export function sniffImage(b: Uint8Array): "png" | "jpg" | "webp" | null {
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "webp";
  return null;
}

/** Validate and store a logo (or the sign-in picture); returns the new file name. Deletes the previous upload. */
export function saveLogo(dir: string, bytes: Uint8Array, previous: string, kind: keyof typeof KINDS = "logo"): string {
  const k = KINDS[kind];
  if (bytes.length === 0) throw new UserError("Choose an image file");
  if (bytes.length > k.max) throw new UserError(`That image is too large (max ${Math.round(k.max / 1024)} KB)`);
  const ext = sniffImage(bytes);
  if (!ext) throw new UserError("Use a PNG, JPG or WebP image");
  const uploads = path.join(dir, "uploads");
  fs.mkdirSync(uploads, { recursive: true });
  const name = `${k.prefix}-${crypto.randomBytes(8).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(uploads, name), bytes);
  if (k.name.test(previous)) fs.rmSync(path.join(uploads, previous), { force: true });
  return name;
}

/** Where the sidebar and login page get their logo from. Built-in = the Level 9 files; an upload is served by /api/brand/logo. */
export type LogoSources = { wide: string; icon: string; fit: "cover" | "contain" } | null;

export function logoSources(setting: string): LogoSources {
  if (setting === "builtin:level9") return { wide: "/brand/logo-banner.png", icon: "/brand/logo-hero.png", fit: "cover" };
  if (UPLOAD_NAME.test(setting)) {
    const url = `/api/brand/logo?v=${setting}`; // the file name changes on every upload, so browsers never show a stale logo
    return { wide: url, icon: url, fit: "contain" };
  }
  return null; // no logo: screens show the lounge name instead
}

/** The picture on the sign-in page: the built-in Level 9 artwork (setting empty) or an upload, served by /api/brand/logo?kind=login. */
export function loginImageSrc(setting: string): string {
  return LOGIN_NAME.test(setting) ? `/api/brand/logo?kind=login&v=${setting}` : BRAND.logo.hero;
}
