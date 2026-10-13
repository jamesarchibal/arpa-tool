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
  // `api` is excluded because its callers are programs with no cookie jar: a
  // password session cannot authenticate a POST from Marc's Claude, and a
  // redirect to /login would just be swallowed as a 200 of HTML.
  // WARNING: that makes every route under `app/api/` responsible for its OWN
  // auth, sitting in front of a service-role database client. Any new file
  // added there MUST check a secret before it touches Supabase. Today there is
  // exactly one, `app/api/intake/route.ts`, and it rejects a bad bearer token
  // in its first statement.
  matcher: ['/', '/((?!api|login|_next/static|_next/image|favicon.ico).*)'],
};
