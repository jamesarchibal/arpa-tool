import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE, constantTimeEqual, sessionToken } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE)?.value ?? '';
  const expected = await sessionToken();

  if (constantTimeEqual(cookie, expected)) return NextResponse.next();

  const url = request.nextUrl.clone();
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  url.pathname = '/login';
  url.search = next === '/' ? '' : `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the login page itself and Next's own assets.
  // '/' is listed separately: under basePath the catch-all compiles to a regex
  // that requires a slash after the prefix, so it never matches the bare root.
  //
  // `api` used to be excluded, because the intake route's caller was a program
  // with no cookie jar. That route is gone: the SABI export is now parsed in
  // the browser and posted through a server action, which travels with the
  // session cookie. So the exclusion is gone too, and nothing can sit in front
  // of a service-role database client without a password. Do not re-add it
  // without giving the new route its own secret check.
  matcher: ['/', '/((?!login|_next/static|_next/image|favicon.ico).*)'],
};
