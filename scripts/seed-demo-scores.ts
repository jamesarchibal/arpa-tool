/**
 * Scores the demo projects with ARPA's own engine.
 *
 * The seed migration writes companies, projects and people but no scores, on
 * purpose. A score is the output of their 16-criterion model, so writing one by
 * hand would put a number on screen that nothing computed. This script runs the
 * real engine over the demo financials instead, so the QSS pill on a card and
 * the score history in the ficha are both reproducible: change a figure in the
 * migration, run this again, and the number moves for a reason.
 *
 * Usage: node --experimental-strip-types scripts/seed-demo-scores.ts
 *
 * TypeScript, not .mjs, because it imports lib/arpa/scoring.ts. Node strips the
 * types, which is the same thing `npm test` already does.
 *
 * Idempotent: it deletes the example scores before writing them again.
 */
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

import { scoreProject, toScoreRows, toScoringInput } from '../lib/arpa/scoring.ts';

/**
 * Which gates a project has actually been through. A deal in Screening has one
 * score, not three: the engine can compute all three from the data, but ARPA
 * has not held those meetings, and a PFR score on a company nobody has called
 * is exactly the kind of invented confidence this demo must not show.
 */
const GATES_BY_CODE: Record<string, string[]> = {
  'ARPA-26-001': ['qss'],
  'ARPA-26-002': ['qss', 'om'],
  'ARPA-26-003': ['qss', 'om', 'pfr'],
  'ARPA-26-005': ['qss', 'om', 'pfr'],
  'ARPA-26-006': ['qss', 'om', 'pfr'],
  'ARPA-26-007': ['qss', 'om'],
  'ARPA-26-008': ['qss', 'om'],
  // ARPA-26-004 is still in Sourcing. Nobody has looked at it, so it has no score.
};

/** Days before today each gate was signed, so the history reads in order. */
const AGE_DAYS: Record<string, number> = { qss: 15, om: 8, pfr: 4 };

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
  await client.query('delete from public.arpa_scores where is_example');

  const { rows } = await client.query(`
    select p.*, c.country, c.ownership_type, c.taxonomy_fit,
           t.sector, t.category, t.subsector, t.growth, t.fragmentation, t.consolidation,
           coalesce(
             (select array_agg(k.kill_id) from public.arpa_kill_flags k
               where k.project_id = p.id and k.flagged),
             '{}'::text[]
           ) as flagged
      from public.arpa_projects p
      join public.arpa_companies c on c.id = p.company_id
      left join public.arpa_taxonomy t on t.id = coalesce(p.taxonomy_id, c.taxonomy_id)
     where p.is_example
     order by p.code
  `);

  let written = 0;
  for (const r of rows) {
    const gates = GATES_BY_CODE[r.code as string];
    if (!gates) {
      console.log(`${r.code}: sin puertas, sin puntuar`);
      continue;
    }

    const taxonomy = r.subsector
      ? {
          sector: r.sector,
          category: r.category,
          subsector: r.subsector,
          growth: r.growth,
          fragmentation: r.fragmentation,
          consolidation: r.consolidation,
        }
      : null;

    const input = toScoringInput(r, r, taxonomy);
    const result = scoreProject(input, { flagged: r.flagged as string[] });
    const scoreRows = toScoreRows(r.id as string, result, (r.owner as string) ?? 'Marc').filter((s) =>
      gates.includes(s.model),
    );

    for (const s of scoreRows) {
      await client.query(
        `insert into public.arpa_scores
           (project_id, model, total_1_5, total_0_100, verdict, vetoed, criteria,
            scored_by, scored_at, note, is_example)
         values ($1,$2,$3,$4,$5,$6,$7,$8, now() - ($9 || ' days')::interval, $10, true)`,
        [
          s.project_id,
          s.model,
          s.total_1_5,
          s.total_0_100,
          s.verdict,
          s.vetoed,
          JSON.stringify(s.criteria),
          s.scored_by,
          String(AGE_DAYS[s.model] ?? 10),
          'Puntuación de demo, calculada con el modelo de ARPA sobre los datos de ejemplo.',
        ],
      );
      written += 1;
    }

    console.log(
      `${r.code}: ${scoreRows.map((s) => `${s.model} ${s.total_0_100}${s.vetoed ? ' VETO' : ''}`).join(', ')}`,
    );
  }

  console.log(`\n${written} filas en arpa_scores.`);
} finally {
  await client.end();
}
