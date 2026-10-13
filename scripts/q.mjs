/**
 * Run a read-only query and print the rows. `migrate.mjs` applies a file but
 * swallows result sets, which makes it useless for checking what is in a table
 * before writing a migration against it.
 *
 * Usage: node scripts/q.mjs "select ... "
 *
 * Must live inside the repo so Node resolves `pg` from ./node_modules.
 */
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const sql = process.argv[2];
if (!sql) {
  console.error('usage: node scripts/q.mjs "<sql>"');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const client = new Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.ocprcxvivnhllzerurhw',
  database: 'postgres',
  password: env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  for (const statement of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
    const res = await client.query(statement);
    console.log(`--- ${statement.slice(0, 70)} (${res.rowCount} rows)`);
    console.table(res.rows);
  }
} finally {
  await client.end();
}
