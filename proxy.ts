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
