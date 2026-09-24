import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/config";

// A quick, cookie-only check so logged-out visitors land on the login page instead of an
// empty screen. It doesn't decide who may see what: the role layouts (via /auth/me) and the
// API do that.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/login" || request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.nextUrl);
  if (pathname !== "/") loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
