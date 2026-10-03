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
  });
}
