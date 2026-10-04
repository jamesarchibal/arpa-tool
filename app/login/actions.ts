'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { SESSION_COOKIE, constantTimeEqual, sessionToken } from '@/lib/auth';

const THIRTY_DAYS = 60 * 60 * 24 * 30;

export async function login(formData: FormData): Promise<void> {
  const typed = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/');

  // Constant-time so a wrong password cannot be narrowed down by response time.
  if (!constantTimeEqual(typed, process.env.ARPA_PASSWORD ?? '')) {
    redirect(`/login?error=1${next === '/' ? '' : `&next=${encodeURIComponent(next)}`}`);
  }

  cookies().set({
    name: SESSION_COOKIE,
    value: await sessionToken(),
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: THIRTY_DAYS,
  });

  // Only ever bounce back to a path inside this app, never to another host.
  const safe = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  // The path must NOT carry the basePath. redirect() from a server action is
  // resolved by the client router, which adds `/arpa/app` itself; writing it
  // here produced /arpa/app/arpa/app/origination and a 404 on every deep link.
  redirect(safe);
}
