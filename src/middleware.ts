import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const secureCookie = req.nextUrl.protocol === "https:";
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie,
    // Must match the cookie name used by NextAuth (secureCookie adds __Secure- prefix)
    cookieName: secureCookie
      ? "__Secure-authjs.session-token"
      : "authjs.session-token",
  });
  const { pathname } = req.nextUrl;

  if (!token && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (token && pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/auth|api/|_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.ico$).*)",
  ],
};
