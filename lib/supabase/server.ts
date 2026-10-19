import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client.
 *
 * This app has no Supabase users: access is a single shared password checked in
 * middleware, so there is no end-user JWT to pass along and the service role
 * key does the reading and writing. That is only acceptable because this
 * Supabase project holds the arpa_* tables and nothing else.
 */
export function createClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Next patches global fetch and caches GETs in its Data Cache. A Supabase
    // read is a GET, so without this a freshly imported company does not appear
    // on the pipeline: the page re-renders (every screen is force-dynamic) and
    // then gets served the previous response from disk. Caught by renaming a row
    // in Postgres and reloading the page, which kept showing the old name.
    //
    // Set here rather than per query because every read in the app has the same
    // requirement: this is a deal pipeline several people edit, and a stale row
    // is worse than a slow one.
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
}
