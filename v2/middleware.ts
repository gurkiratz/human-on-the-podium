import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional access gate. It is a no-op unless `APP_ACCESS_TOKEN` is set, so local development
 * is unchanged; set the env var before exposing the app to a network to stop anonymous
 * callers from spending the provider keys, reading transcripts, or deleting data.
 *
 * A caller is authorised by any of:
 *   - `x-app-token: <token>` header (for scripts/tests),
 *   - `Authorization: Bearer <token>`,
 *   - an `app_token` cookie, which `?token=<token>` sets and then strips from the URL.
 */
const COOKIE = "app_token";

function bearer(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim();
}

export function middleware(request: NextRequest) {
  const token = process.env.APP_ACCESS_TOKEN?.trim();
  if (!token) return NextResponse.next();

  const { pathname, searchParams, protocol, host } = request.nextUrl;

  // `?token=` is the bootstrap: set the cookie, then redirect to the clean URL.
  if (searchParams.get("token") === token) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("token");
    const response = NextResponse.redirect(url);
    response.cookies.set(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  }

  if (
    request.headers.get("x-app-token") === token ||
    bearer(request) === token ||
    request.cookies.get(COOKIE)?.value === token
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (pathname === "/unlock") return NextResponse.next();

  const unlock = new URL("/unlock", `${protocol}//${host}`);
  return NextResponse.redirect(unlock);
}

export const config = {
  // Skip Next internals and static assets so the unlock page can actually load.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js|map|woff2?|ttf)$).*)",
  ],
};
