import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_AUTH_ROUTES = new Set(["/login", "/register"]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_AUTH_ROUTES.has(pathname)) {
    return NextResponse.next();
  }

  const isProtectedRoute =
    pathname.startsWith("/dashboard") || pathname.startsWith("/tests");

  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  const hasSessionCookie =
    Boolean(request.cookies.get("refreshToken")?.value) ||
    Boolean(request.cookies.get("refresh_token")?.value);

  if (!hasSessionCookie) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/tests/:path*", "/login", "/register"]
};
