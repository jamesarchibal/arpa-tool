/**
 * Apply one migration file over the pooler.
 *
 * `supabase db push` is not used here: this project was not linked through the
 * CLI and push wants to reconcile the whole migration history, which would try
 * to replay files that are already live. This runs exactly the file you name.
 *
 * Usage: node scripts/migrate.mjs supabase/migrations/<file>.sql
 *
 * Must live inside the repo so Node resolves `pg` from ./node_modules.
 */
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/migrate.mjs <path-to-sql>');
  process.exit(1);
}

// .env.local is not loaded automatically outside Next, so read it by hand.
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const password = env.SUPABASE_DB_PASSWORD;
if (!password) {
  console.error('SUPABASE_DB_PASSWORD missing from .env.local');
  process.exit(1);
}

const client = new Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.ocprcxvivnhllzerurhw',
  database: 'postgres',
  password,
  // The pooler presents a cert for *.pooler.supabase.com signed by a chain Node
  // does not ship. The connection is still TLS, only the chain is unverified.
  ssl: { rejectUnauthorized: false },
});

const sql = readFileSync(file, 'utf8');

await client.connect();
try {
  await client.query(sql);
  console.log(`applied ${file}`);
} catch (error) {
  console.error(`FAILED ${file}: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
