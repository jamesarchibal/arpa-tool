export const SESSION_COOKIE = 'arpa_session';

/**
 * The cookie never contains the password. It holds a digest of the password
 * plus a server-only secret, so a stolen cookie cannot be turned back into
 * something you could type into the login form, and rotating the secret
 * invalidates every session at once.
 *
 * Web Crypto, not node:crypto, because this also runs in middleware on the
 * Edge runtime.
 */
export async function sessionToken(): Promise<string> {
  const password = process.env.ARPA_PASSWORD;
  const secret = process.env.ARPA_SESSION_SECRET;

  if (!password || !secret) {
    throw new Error('ARPA_PASSWORD and ARPA_SESSION_SECRET must be set');
  }

  const bytes = new TextEncoder().encode(`${password}:${secret}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Compare without leaking how many characters matched. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
