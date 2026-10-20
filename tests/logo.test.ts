import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sniffImage, saveLogo, logoSources, loginImageSrc, UPLOAD_NAME, LOGIN_NAME, MAX_LOGO_BYTES, MAX_LOGIN_BYTES } from "../lib/logo.ts";
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

test("logoSources: built-in files, a safe upload URL, or nothing; a hostile setting never becomes a URL", () => {
  assert.deepEqual(logoSources("builtin:level9"), { wide: "/brand/logo-banner.png", icon: "/brand/logo-hero.png", fit: "cover" });
  const up = logoSources("logo-0123456789abcdef.png")!;
  assert.equal(up.wide, "/api/brand/logo?v=logo-0123456789abcdef.png");
  assert.equal(up.fit, "contain");
  assert.equal(logoSources(""), null);
  assert.equal(logoSources("../../etc/passwd"), null);
  assert.equal(logoSources("javascript:alert(1)"), null);
});

test("sign-in picture: its own file names and size limit, built-in unless a safe upload is set", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "login-"));
  try {
    const big = Uint8Array.from([...png, ...new Uint8Array(MAX_LOGO_BYTES)]);
    assert.throws(() => saveLogo(dir, big, "", "logo"), /too large/);
    const name = saveLogo(dir, big, "", "login"); // too big for a logo, fine for a sign-in picture
    assert.match(name, LOGIN_NAME);
    assert.equal(LOGIN_NAME.test("logo-0123456789abcdef.png"), false, "a sidebar logo name is not a sign-in name");
    assert.throws(() => saveLogo(dir, Uint8Array.from([...png, ...new Uint8Array(MAX_LOGIN_BYTES)]), name, "login"), /too large/);
    const next = saveLogo(dir, png, name, "login");
    assert.ok(!fs.existsSync(path.join(dir, "uploads", name)), "the previous picture is deleted");
    assert.ok(fs.existsSync(path.join(dir, "uploads", next)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(loginImageSrc(""), "/brand/logo-hero.png");
  assert.equal(loginImageSrc("login-0123456789abcdef.webp"), "/api/brand/logo?kind=login&v=login-0123456789abcdef.webp");
  assert.equal(loginImageSrc("logo-0123456789abcdef.png"), "/brand/logo-hero.png");
  assert.equal(loginImageSrc("../../etc/passwd"), "/brand/logo-hero.png");
});
