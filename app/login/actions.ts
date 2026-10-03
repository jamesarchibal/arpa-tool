'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { SESSION_COOKIE, constantTimeEqual, sessionToken } from '@/lib/auth';

const THIRTY_DAYS = 60 * 60 * 24 * 30;

/** Must match `basePath` in next.config.mjs. */
const BASE_PATH = '/arpa/app';

export async function login(formData: FormData): Promise<void> {
  const typed = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/');

  // Constant-time so a wrong password cannot be narrowed down by response time.
  if (!constantTimeEqual(typed, process.env.ARPA_PASSWORD ?? '')) {
    redirect(
      `${BASE_PATH}/login?error=1${next === '/' ? '' : `&next=${encodeURIComponent(next)}`}`,
    );
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

  // redirect() from a server action does not prepend basePath, unlike the one in
  // middleware. Without this the browser would resolve Location against the host
  // root and land on joblanders.ai instead of the tool.
  redirect(`${BASE_PATH}${safe === '/' ? '' : safe}`);
}
