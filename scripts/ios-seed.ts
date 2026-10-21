/**
 * Load ARPA's IOS v9 workbook into the `ios_*` catalogue tables.
 *
 *   node --experimental-strip-types scripts/ios-seed.ts [--dry-run] [--file=x.xlsx]
 *
 * Expected on today's workbook:
 *   100 industries · 140 theses · 486 pairs · 173 archetypes · 22 sources
 *   · 258 companies · 0 rejects
 *
 * TypeScript and not .mjs for one reason: this script imports `lib/ios/lists.ts`
 * and validates every single-select value against ARPA's own vocabulary before
 * the insert, and imports `lib/ios/industries.ts` to recompute each subsector's
 * weighted score and compare it to the sheet's `Check:` column in the same pass.
 * A seeder that cannot read the app's lists will happily load values the check
 * constraints reject, and you find out from a 500 on a form.
 *
 * Two rules it follows:
 *
 *   1. Idempotent. Every table has a natural key, every write is an upsert, and
 *      running it twice changes no counts. The N:N is delete-then-insert per
 *      thesis rather than upsert, so a thesis that loses a subsector in v10 loses
 *      the row instead of keeping a stale one forever.
 *   2. No row is dropped in silence. A failed join, a value outside the
 *      vocabulary or an empty mandatory cell writes {sheet, row_no, reason,
 *      payload} to `ios_seed_rejects`, the data load is rolled back whole, and the
 *      process exits non-zero. Today that table ends up empty because all five
 *      joins resolve 100 per cent. It exists for the next workbook.
 */
import { readFileSync } from 'node:fs';
import * as fs from 'node:fs';
import { Client } from 'pg';
import XLSX from 'xlsx';

import { industryScore } from '../lib/ios/industries.ts';
import {
  AI_OUTPUT_STATUS,
  COMPANY_STATUS,
  CONFIDENCE,
  INDUSTRIES,
  ORIGIN_TYPES,
  PE_ROLES,
  PRIMARY_STRATEGIES,
  PRIORITY,
  RATING_LMH,
  THESIS_SCOPES,
  THESIS_STATUS,
} from '../lib/ios/lists.ts';

// The ESM build of SheetJS ships without a filesystem, so readFile throws
// "Cannot access file" until you hand it one. The CJS build wires this itself.
XLSX.set_fs(fs);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const file =
  args.find((a) => a.startsWith('--file='))?.slice('--file='.length) ??
  '/tmp/arpaios/PE_Airtable_Projects_Build_Workbook_v9.xlsx';

// ----------------------------------------------------------------- the sheets

const wb = XLSX.readFile(file);

type Row = Record<string, unknown>;

/**
 * Rows of one sheet, keyed by its header names, with the row number as it reads
 * in Excel so a reject points at something a human can open and look at.
 *
 * Every `Seed_*` sheet carries two preamble rows (a title, then a "Mirror of
 * build-pack/..." note), so the real header is the third. `firstHeader` is
 * asserted: if Ignasi adds a preamble row in v10 this has to fail loudly here
 * rather than load the header row as data.
 */
function sheet(name: string, firstHeader: string): { row: Row; row_no: number }[] {
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
    header: 1,
    blankrows: false,
  });
  const header = (grid[2] as unknown[] | undefined)?.map((h) => String(h).trim());
  if (header?.[0] !== firstHeader) {
    throw new Error(
      `${name}: expected first header "${firstHeader}", got "${header?.[0]}". The sheet layout changed, stopping before anything is written.`,
    );
  }
  return grid.slice(3).map((cells, i) => ({
    row: Object.fromEntries(header.map((k, j) => [k, (cells as unknown[])[j] ?? ''])),
    row_no: i + 4,
  }));
}

const text = (v: unknown): string => String(v ?? '').trim();
const textOrNull = (v: unknown): string | null => text(v) || null;

/** Blank stays NULL. A 0 here would read as "we checked and it is tiny". */
function numberOrNull(v: unknown): number | null {
  const s = text(v);
  if (!s) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const splitList = (v: unknown, sep: RegExp): string[] =>
  text(v)
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);

// ---------------------------------------------------------------- the rejects

interface Reject {
  sheet: string;
  row_no: number;
  reason: string;
  payload: Row;
}
const rejects: Reject[] = [];

function reject(sheetName: string, row_no: number, reason: string, payload: Row): null {
  rejects.push({ sheet: sheetName, row_no, reason, payload });
  return null;
}

/** A single-select value, checked against the vocabulary. Blank is allowed. */
function pick(
  allowed: readonly string[],
  value: unknown,
  field: string,
  ctx: { sheet: string; row_no: number; row: Row },
): string | null | undefined {
  const s = text(value);
  if (!s) return null;
  if (!allowed.includes(s)) {
    reject(ctx.sheet, ctx.row_no, `${field}: "${s}" is not in the v9 vocabulary`, ctx.row);
    return undefined; // undefined means "this row is already rejected"
  }
  return s;
}

// -------------------------------------------------------------------- the load

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
  ssl: { rejectUnauthorized: false },
});

const counts: Record<string, number> = {};

await client.connect();
try {
  await client.query('begin');

  // ------------------------------------------------------------- industries
  const industryId = new Map<string, string>();
  for (const { row, row_no } of sheet('Seed_Industries', 'Subsector')) {
    const ctx = { sheet: 'Seed_Industries', row_no, row };
    const subsector = text(row.Subsector);
    if (!subsector) {
      reject(ctx.sheet, row_no, 'Subsector is empty', row);
      continue;
    }

    const ratings = {
      market_growth: Number(row['Market Growth']),
      fragmentation_addons: Number(row['Fragmentation / Add-ons']),
      target_density: Number(row['Target Density']),
      margin_profile: Number(row['Margin Profile']),
      recurring_revenue: Number(row['Recurring / Resilient Revenue']),
      barriers: Number(row['Barriers / Differentiation']),
      succession: Number(row['Succession / Founder Exit']),
      risk_low_is_5: Number(row['Risk (5 = low)']),
    };

    // Their own answer, in the same pass. If our weights ever stop reproducing
    // their sheet, the seeder is the earliest place that can say so.
    let ours: number;
    try {
      ours = industryScore(ratings);
    } catch (error) {
      reject(ctx.sheet, row_no, (error as Error).message, row);
      continue;
    }
    const theirs = Number(row['Check: Weighted Score (source)']);
    if (Math.abs(ours - theirs) > 0.005) {
      reject(ctx.sheet, row_no, `weighted score ${ours} != their ${theirs}`, row);
      continue;
    }

    const industry = pick(INDUSTRIES, row.Industry, 'Industry', ctx);
    const growth = pick(RATING_LMH, row['Growth Attractiveness'], 'Growth Attractiveness', ctx);
    const frag = pick(RATING_LMH, row.Fragmentation, 'Fragmentation', ctx);
    const consol = pick(RATING_LMH, row['Consolidation Potential'], 'Consolidation Potential', ctx);
    if (industry === undefined || growth === undefined || frag === undefined || consol === undefined) continue;
    if (!industry) {
      reject(ctx.sheet, row_no, 'Industry is empty', row);
      continue;
    }

    const { rows } = await client.query<{ id: string }>(
      `insert into ios_industries (
         subsector, industry, sector,
         growth_attractiveness, fragmentation, consolidation_potential,
         market_growth, fragmentation_addons, target_density, margin_profile,
         recurring_revenue, barriers, succession, risk_low_is_5,
         source_rank, investment_thesis, key_risks, spanish_clusters, notes
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       on conflict (subsector) do update set
         industry = excluded.industry,
         sector = excluded.sector,
         growth_attractiveness = excluded.growth_attractiveness,
         fragmentation = excluded.fragmentation,
         consolidation_potential = excluded.consolidation_potential,
         market_growth = excluded.market_growth,
         fragmentation_addons = excluded.fragmentation_addons,
         target_density = excluded.target_density,
         margin_profile = excluded.margin_profile,
         recurring_revenue = excluded.recurring_revenue,
         barriers = excluded.barriers,
         succession = excluded.succession,
         risk_low_is_5 = excluded.risk_low_is_5,
         source_rank = excluded.source_rank,
         investment_thesis = excluded.investment_thesis,
         key_risks = excluded.key_risks,
         spanish_clusters = excluded.spanish_clusters,
         notes = excluded.notes,
         updated_at = now()
       returning id`,
      [
        subsector,
        industry,
        text(row.Sector),
        growth,
        frag,
        consol,
        ratings.market_growth,
        ratings.fragmentation_addons,
        ratings.target_density,
        ratings.margin_profile,
        ratings.recurring_revenue,
        ratings.barriers,
        ratings.succession,
        ratings.risk_low_is_5,
        numberOrNull(row.Rank),
        textOrNull(row['Investment Thesis']),
        textOrNull(row['Key Risks']),
        textOrNull(row['Spanish Clusters']),
        textOrNull(row.Notes),
      ],
    );
    industryId.set(subsector, rows[0].id);
  }
  counts.industries = industryId.size;

  // ----------------------------------------------------------------- theses
  const thesisId = new Map<string, string>();
  let pairs = 0;
  for (const { row, row_no } of sheet('Seed_Theses', 'Thesis Name')) {
    const ctx = { sheet: 'Seed_Theses', row_no, row };
    const code = text(row['Thesis Code']);
    const name = text(row['Thesis Name']);
    if (!code || !name) {
      reject(ctx.sheet, row_no, 'Thesis Code or Thesis Name is empty', row);
      continue;
    }

    const scope = pick(THESIS_SCOPES, row.Scope, 'Scope', ctx);
    const status = pick(THESIS_STATUS, row['Thesis Status'], 'Thesis Status', ctx);
    const priority = pick(PRIORITY, row.Priority, 'Priority', ctx);
    const strategy = pick(PRIMARY_STRATEGIES, row['Primary Strategy'], 'Primary Strategy', ctx);
    if (scope === undefined || status === undefined || priority === undefined || strategy === undefined) continue;
    if (!scope) {
      reject(ctx.sheet, row_no, 'Scope is empty', row);
      continue;
    }

    const { rows } = await client.query<{ id: string }>(
      `insert into ios_theses (
         code, name, scope, category, structural_driver, primary_strategy,
         description, value_creation_levers, ideal_target_profile,
         key_screening_risks, priority, status, mandate_fit, geographic_focus,
         target_ebitda_eur_m, target_revenue_eur_m, evidence_status
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       on conflict (code) do update set
         name = excluded.name,
         scope = excluded.scope,
         category = excluded.category,
         structural_driver = excluded.structural_driver,
         primary_strategy = excluded.primary_strategy,
         description = excluded.description,
         value_creation_levers = excluded.value_creation_levers,
         ideal_target_profile = excluded.ideal_target_profile,
         key_screening_risks = excluded.key_screening_risks,
         priority = excluded.priority,
         status = excluded.status,
         mandate_fit = excluded.mandate_fit,
         geographic_focus = excluded.geographic_focus,
         target_ebitda_eur_m = excluded.target_ebitda_eur_m,
         target_revenue_eur_m = excluded.target_revenue_eur_m,
         evidence_status = excluded.evidence_status,
         updated_at = now()
       returning id`,
      [
        code,
        name,
        scope,
        textOrNull(row['Thesis Category']),
        textOrNull(row['Structural Driver']),
        strategy,
        textOrNull(row['Thesis Description']),
        splitList(row['Value Creation Levers'], /;/),
        textOrNull(row['Ideal Target Profile']),
        textOrNull(row['Key Screening Risks']),
        priority,
        status ?? 'Proposed',
        textOrNull(row['Mandate Fit']),
        textOrNull(row['Geographic Focus']),
        textOrNull(row['Target EBITDA €M']),
        textOrNull(row['Target Revenue €M']),
        textOrNull(row['Evidence Status']),
      ],
    );
    const id = rows[0].id;
    thesisId.set(code, id);

    // The N:N comes from `Industries`, where 486 of 486 tokens match a subsector
    // exactly. Their `Applicable Subsectors (library text)` column looks like the
    // right one and is not: 0 of its 425 tokens match anything, they are tags.
    //
    // Delete and reinsert, so losing a subsector in v10 loses the row. The 17
    // Cross-sector theses have this column blank on purpose and end with none.
    await client.query('delete from ios_thesis_subsectors where thesis_id = $1', [id]);
    for (const token of splitList(row.Industries, /;/)) {
      const target = industryId.get(token);
      if (!target) {
        reject(ctx.sheet, row_no, `Industries: no subsector called "${token}"`, row);
        continue;
      }
      await client.query(
        `insert into ios_thesis_subsectors (thesis_id, industry_id)
         values ($1,$2) on conflict do nothing`,
        [id, target],
      );
      pairs += 1;
    }
  }
  counts.theses = thesisId.size;
  counts.pairs = pairs;

  // ------------------------------------------------------------- archetypes
  const archetypeId = new Map<string, string>();
  for (const { row, row_no } of sheet('Seed_Archetypes', 'Archetype')) {
    const ctx = { sheet: 'Seed_Archetypes', row_no, row };
    const name = text(row.Archetype);
    const subsector = text(row.Subsector);
    const target = industryId.get(subsector);
    if (!name) {
      reject(ctx.sheet, row_no, 'Archetype is empty', row);
      continue;
    }
    if (!target) {
      reject(ctx.sheet, row_no, `Subsector: no subsector called "${subsector}"`, row);
      continue;
    }

    const peRole = pick(PE_ROLES, row['PE Role'], 'PE Role', ctx);
    if (peRole === undefined) continue;

    const { rows } = await client.query<{ id: string }>(
      `insert into ios_archetypes (
         name, industry_id, archetype_no, what_it_does, revenue_model,
         typical_ebitda_margin, pe_role, cnae_codes, sabi_keywords
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (industry_id, lower(btrim(name))) do update set
         name = excluded.name,
         archetype_no = excluded.archetype_no,
         what_it_does = excluded.what_it_does,
         revenue_model = excluded.revenue_model,
         typical_ebitda_margin = excluded.typical_ebitda_margin,
         pe_role = excluded.pe_role,
         cnae_codes = excluded.cnae_codes,
         sabi_keywords = excluded.sabi_keywords,
         updated_at = now()
       returning id`,
      [
        name,
        target,
        numberOrNull(row['Archetype #']),
        textOrNull(row['What the Company Does / Customers']),
        textOrNull(row['Revenue Model']),
        numberOrNull(row['Typical EBITDA Margin']),
        peRole,
        splitList(row['CNAE-2009'], /[,;]/),
        splitList(row['SABI Search Keywords (ES)'], /[,;]/),
      ],
    );
    // Keyed by subsector too: archetype names are not unique across subsectors,
    // and the long list joins on both.
    archetypeId.set(`${subsector}\u0000${name.toLowerCase()}`, rows[0].id);
  }
  counts.archetypes = archetypeId.size;

  // ---------------------------------------------------------------- sources
  const sourceId = new Map<string, string>();
  for (const { row, row_no } of sheet('Seed_Sources', 'Source Name')) {
    const ctx = { sheet: 'Seed_Sources', row_no, row };
    const name = text(row['Source Name']);
    if (!name) {
      reject(ctx.sheet, row_no, 'Source Name is empty', row);
      continue;
    }
    const sourceType = pick(ORIGIN_TYPES, row['Source Type'], 'Source Type', ctx);
    if (sourceType === undefined) continue;

    const { rows } = await client.query<{ id: string }>(
      `insert into ios_sources (name, source_type, url, notes)
       values ($1,$2,$3,$4)
       on conflict (lower(btrim(name))) do update set
         name = excluded.name,
         source_type = excluded.source_type,
         url = excluded.url,
         notes = excluded.notes,
         updated_at = now()
       returning id`,
      [name, sourceType, textOrNull(row.URL), textOrNull(row.Notes)],
    );
    sourceId.set(name.toLowerCase(), rows[0].id);
  }
  counts.sources = sourceId.size;

  // -------------------------------------------------------------- companies
  let companies = 0;
  for (const { row, row_no } of sheet('Seed_Companies', 'Company Name')) {
    const ctx = { sheet: 'Seed_Companies', row_no, row };
    const name = text(row['Company Name']);
    if (!name) {
      reject(ctx.sheet, row_no, 'Company Name is empty', row);
      continue;
    }

    const subsector = text(row['Primary Subsector']);
    const industry = industryId.get(subsector) ?? null;
    if (subsector && !industry) {
      reject(ctx.sheet, row_no, `Primary Subsector: no subsector called "${subsector}"`, row);
      continue;
    }

    const archetypeName = text(row['Target Archetype']);
    const archetype = archetypeName
      ? archetypeId.get(`${subsector}\u0000${archetypeName.toLowerCase()}`) ?? null
      : null;
    if (archetypeName && !archetype) {
      reject(
        ctx.sheet,
        row_no,
        `Target Archetype: "${archetypeName}" is not an archetype of "${subsector}"`,
        row,
      );
      continue;
    }

    const sourceName = text(row.Source);
    const source = sourceName ? sourceId.get(sourceName.toLowerCase()) ?? null : null;
    if (sourceName && !source) {
      reject(ctx.sheet, row_no, `Source: no source called "${sourceName}"`, row);
      continue;
    }

    const status = pick(COMPANY_STATUS, row['Company Status'], 'Company Status', ctx);
    const origin = pick(ORIGIN_TYPES, row['Origin Type'], 'Origin Type', ctx);
    const confidence = pick(CONFIDENCE, row['Source Confidence'], 'Source Confidence', ctx);
    const ai = pick(AI_OUTPUT_STATUS, row['AI Enrichment Status'], 'AI Enrichment Status', ctx);
    if (status === undefined || origin === undefined || confidence === undefined || ai === undefined) continue;

    await client.query(
      `insert into ios_companies (
         name, country, autonomous_community, province, industry_id, archetype_id,
         status, origin_type, revenue_estimate_eur_m, source_id,
         source_confidence, ai_enrichment_status, research_notes
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       on conflict (lower(btrim(name))) do update set
         name = excluded.name,
         country = excluded.country,
         autonomous_community = excluded.autonomous_community,
         province = excluded.province,
         industry_id = excluded.industry_id,
         archetype_id = excluded.archetype_id,
         status = excluded.status,
         origin_type = excluded.origin_type,
         revenue_estimate_eur_m = excluded.revenue_estimate_eur_m,
         source_id = excluded.source_id,
         source_confidence = excluded.source_confidence,
         ai_enrichment_status = excluded.ai_enrichment_status,
         research_notes = excluded.research_notes,
         updated_at = now()`,
      [
        name,
        text(row.Country) || 'Spain',
        textOrNull(row['Autonomous Community']),
        textOrNull(row.Province),
        industry,
        archetype,
        status ?? 'Mapped',
        origin,
        numberOrNull(row['Revenue Estimate €M']),
        source,
        confidence,
        ai ?? 'Not Run',
        textOrNull(row['Research Notes']),
      ],
    );
    companies += 1;
  }
  counts.companies = companies;

  // ----------------------------------------------------------------- finish
  if (rejects.length > 0) {
    // All or nothing: a half-loaded catalogue is worse than none, because the
    // screens look fine and the numbers are wrong. The reject report is written
    // afterwards, outside the rolled-back transaction, so it survives.
    await client.query('rollback');
    for (const r of rejects) {
      await client.query(
        `insert into ios_seed_rejects (sheet, row_no, reason, payload)
         values ($1,$2,$3,$4)`,
        [r.sheet, r.row_no, r.reason, JSON.stringify(r.payload)],
      );
    }
    console.error(`REJECTED ${rejects.length} row(s), nothing was loaded:`);
    for (const r of rejects.slice(0, 20)) {
      console.error(`  ${r.sheet} row ${r.row_no}: ${r.reason}`);
    }
    if (rejects.length > 20) console.error(`  ... and ${rejects.length - 20} more`);
    console.error('See ios_seed_rejects for the full payloads.');
    process.exitCode = 1;
  } else if (dryRun) {
    await client.query('rollback');
    console.log('--dry-run: rolled back.');
  } else {
    await client.query('commit');
  }

  console.log(
    `industries ${counts.industries} · theses ${counts.theses} · pairs ${counts.pairs} · archetypes ${counts.archetypes} · sources ${counts.sources} · companies ${counts.companies} · rejects ${rejects.length}`,
  );
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error(`FAILED: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
