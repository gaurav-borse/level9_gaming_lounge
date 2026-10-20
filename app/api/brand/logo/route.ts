import fs from "node:fs";
import path from "node:path";
import { connection } from "next/server";
import { dataDir } from "@/lib/db/index";
import { getSetting } from "@/lib/db/settings";
import { LOGIN_NAME, UPLOAD_NAME } from "@/lib/logo";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

export async function GET(req: Request) {
  await connection(); // read settings per request, not at build time
  const login = new URL(req.url).searchParams.get("kind") === "login"; // the sign-in picture, not the sidebar logo
  const logo = getSetting(login ? "cafe.loginImage" : "cafe.logo");
  let file: string | null = null;
  if (!login && logo === "builtin:level9") file = path.join(process.cwd(), "public", "brand", "logo-banner.png");
  else if ((login ? LOGIN_NAME : UPLOAD_NAME).test(logo)) file = path.join(dataDir(), "uploads", logo); // name is regex-checked: no traversal
  if (!file || !fs.existsSync(file)) return new Response("Not found", { status: 404 });
  const type = TYPES[path.extname(file).slice(1)] ?? "application/octet-stream";
  return new Response(new Uint8Array(fs.readFileSync(file)), { headers: { "Content-Type": type, "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" } });
}
