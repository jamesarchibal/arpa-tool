/**
 * Load ARPA's own test fixtures, `Seed_Fixtures` P1 to P6, into V2.
 *
 *   node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
 *     scripts/ios-seed-fixtures.ts [--delete] [--dry-run] [--file=x.xlsx]
 *
 * Ignasi shipped his own acceptance test in the v9 workbook and nobody had run
 * it: `Test_Fixtures` describes six scenarios, `Seed_Fixtures` gives the data for
 * them, and `QA_Checklist` lists the 27 things to check. This script sets up the
 * board so those checks can be walked by hand, in V2, on his data.
 *
 * Two deliberate choices:
 *
 *   1. **It deletes before it writes, every time.** These are his words: the
 *      fixtures are demo rows to be removed before PROD. Re-running has to reset
 *      the scenarios, because a QA pass that starts from whatever the last tester
 *      left behind proves nothing. Everything it touches is named `(TEST)` or
 *      coded `TEST-*`, and it deletes nothing else. Projects go first: deleting
 *      one cascades its documents, perimeter and decisions, while
 *      `ios_project_companies.company_id` is `on delete restrict`, so the
 *      companies can only go afterwards.
 *   2. **The data comes from his sheet, the scenario is ours.** Names, provinces,
 *      subsectors, revenue, EBITDA, ownership, origin, thesis code, thesis fit,
 *      priority, project type and role are all read from `Seed_Fixtures`. The
 *      stage each project starts at and which deliverables are already approved
 *      are hard-coded below, because those are our reading of his `Scenario`
 *      prose, and a reading should be visible and commented rather than inferred
 *      from a cell.
 *
 * P4 is skipped and says so. It is a 4-row SABI import file for testing duplicate
 * detection on upload, and V2 has no importer: that screen is V1's. Pretending
 * otherwise by loading a near-duplicate company would be the one thing worse than
 * a gap, which is a gap that looks filled.
 *
 * P2 starts at Preliminary Financial Review, three stages in. There is no button
 * in V2 that puts it there, by design: the gate panel is the only way a stage
 * moves. So this script writes the stage directly, which is the documented escape
 * hatch (see the risks section of the plan) and the only place it is used.
 */
import { readFileSync } from 'node:fs';
import * as fs from 'node:fs';
import { Client } from 'pg';
import XLSX from 'xlsx';

import {
  ORIGIN_TYPES,
  OWNERSHIP_TYPES,
  PRIORITY,
  PROJECT_COMPANY_ROLES,
  PROJECT_TYPES,
  THESIS_FIT,
  type DocStatus,
  type DocType,
  type Stage,
  type StageStatus,
} from '../lib/ios/lists.ts';

// The ESM build of SheetJS ships without a filesystem, so readFile throws
// "Cannot access file" until you hand it one.
XLSX.set_fs(fs);

const args = process.argv.slice(2);
const deleteOnly = args.includes('--delete');
const dryRun = args.includes('--dry-run');
const file =
  args.find((a) => a.startsWith('--file='))?.slice('--file='.length) ??
  '/tmp/arpaios/PE_Airtable_Projects_Build_Workbook_v9.xlsx';

// --------------------------------------------------------------- the scenarios

interface Scenario {
  /** Why this fixture exists, printed so a run explains itself. */
  covers: string;
  stage: Stage;
  stage_status: StageStatus;
  next_step: string;
  /** Days from today. Negative on purpose for the one that should look late. */
  due_in_days: number;
  /** Deliverables already on file when the tester arrives. */
  docs: { doc_type: DocType; doc_status: DocStatus; title: string }[];
}

/**
 * Keyed by his fixture id. The order here is the order they are created in, so
 * the Pipeline board reads P1, P2, P3, P5, P6 left to right within a column.
 */
const SCENARIOS: Record<string, Scenario> = {
  // The happy path. Everything the Screening gate asks for is in place (QSS
  // approved, a thesis linked, a next step written), so the gate is OPEN and the
  // tester can walk all nine stages from here: QA-09, QA-10, QA-14, QA-16.
  P1: {
    covers: 'gate abierto en Screening, camino completo hasta Portfolio',
    stage: 'Screening',
    stage_status: 'Awaiting Decision',
    next_step: 'Registrar la decisión del gate de Screening',
    due_in_days: 7,
    docs: [{ doc_type: 'QSS', doc_status: 'Approved', title: 'QSS AgroIrrigation' }],
  },

  // The gate that must refuse. At Preliminary Financial Review with its PFR still
  // In Review, so: Advance is recorded as Blocked instead of moving the stage
  // (QA-06, QA-11), and 'Approve' is not even offered because it belongs to the
  // Final Investment Approval gate (QA-07). Its next step is already late, which
  // is also how the "vencidos" panel on Mi trabajo gets something real in it.
  P2: {
    covers: 'gate cerrado: Advance se graba como Blocked y "Approve" no existe aquí',
    stage: 'Preliminary Financial Review',
    stage_status: 'Blocked',
    next_step: 'Cerrar el PFR y pasarlo a Approved',
    due_in_days: -3,
    docs: [
      { doc_type: 'QSS', doc_status: 'Approved', title: 'QSS Packaging Norte' },
      { doc_type: 'OM', doc_status: 'Approved', title: 'OM Packaging Norte' },
      { doc_type: 'PFR', doc_status: 'In Review', title: 'PFR Packaging Norte v1' },
    ],
  },

  // Monitor and then Pass. Its QSS is only Drafting, so the gate is shut, and
  // that is the point: Hold and Stop decisions do not need an open gate, only
  // Advance does. QA-12 (Monitor sets a review date) and QA-13 (Pass asks for a
  // reason) are both reachable from a closed gate.
  P3: {
    covers: 'Monitor y Pass con el gate cerrado: parar nunca necesita el gate abierto',
    stage: 'Screening',
    stage_status: 'In Progress',
    next_step: 'Decidir si se monitoriza o se descarta',
    due_in_days: 2,
    docs: [{ doc_type: 'QSS', doc_status: 'Drafting', title: 'QSS Components Valencia' }],
  },

  // The errors on purpose. Portugal, no province, no thesis, no EBITDA. His
  // QA-20 is the whole reason the EBITDA column is nullable with no default: the
  // screens have to say "sin dato" here, never 0. Two separate things keep the
  // gate shut (no approved QSS and no thesis), which is also the case that proves
  // the gate panel lists every missing requirement instead of only the first.
  P5: {
    covers: 'blancos que siguen blancos: sin EBITDA, sin tesis, fuera de España',
    stage: 'Screening',
    stage_status: 'In Progress',
    next_step: 'Completar EBITDA y asignar tesis antes de seguir',
    due_in_days: 10,
    docs: [{ doc_type: 'QSS', doc_status: 'Not Started', title: 'QSS Seeded Errors' }],
  },

  // The build-up: a platform and two add-ons in one project. Gate open so the
  // perimeter can be worked through the stages. QA-21 to QA-27 live here, and
  // most of them need Portfolio or the Valuation screens, which are out of scope:
  // what this fixture does prove is the perimeter with roles and the project name
  // his sheet predicts, "+ 2".
  P6: {
    covers: 'build-up: plataforma y dos add-ons en un solo proyecto',
    stage: 'Screening',
    stage_status: 'Awaiting Decision',
    next_step: 'Confirmar el perímetro antes de pasar a Assessment',
    due_in_days: 5,
    docs: [{ doc_type: 'QSS', doc_status: 'Approved', title: 'QSS Champiñones Cuenca' }],
  },
};

/** His own project-name convention, en dash included: "Company + 2 – 2026". */
const NAME_DASH = '\u2013';
const FIXTURE_YEAR = 2026;

// ------------------------------------------------------------------ the sheet

const wb = XLSX.readFile(file);

type Row = Record<string, unknown>;

/**
 * `Seed_Fixtures` rows keyed by header name. Same shape as `scripts/ios-seed.ts`:
 * two preamble rows, header on the third, data from the fourth, and the first
 * header asserted so a layout change in v10 stops the run instead of loading the
 * header as a company.
 */
function fixtureRows(): { row: Row; row_no: number }[] {
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Seed_Fixtures, {
    header: 1,
    blankrows: false,
  });
  const header = (grid[2] as unknown[] | undefined)?.map((h) => String(h).trim());
  if (header?.[0] !== 'Fixture') {
    throw new Error(
      `Seed_Fixtures: expected first header "Fixture", got "${header?.[0]}". The sheet layout changed, stopping before anything is written.`,
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

/**
 * A single-select value from his sheet against his vocabulary, or stop.
 *
 * The catalogue seeder collects rejects and carries on, because it loads 1179
 * rows and a report beats an abort. Here there are eight rows of known data: if
 * one of them is outside the vocabulary the fixture itself is wrong, and loading
 * the other seven would just make the QA pass harder to trust.
 *
 * Only cells coming out of Excel go through this. The hard-coded scenario values
 * above are typed against the same lists, so tsc already refuses a bad stage.
 */
function must(allowed: readonly string[], value: unknown, field: string, row_no: number): string {
  const s = text(value);
  if (!allowed.includes(s)) {
    throw new Error(`Seed_Fixtures row ${row_no}: ${field} "${s}" is not in the v9 vocabulary`);
  }
  return s;
}

const iso = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

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

await client.connect();
try {
  await client.query('begin');

  // ---------------------------------------------------------------- the reset
  const goneProjects = await client.query(`delete from ios_projects where code like 'TEST-%'`);
  const goneCompanies = await client.query(
    `delete from ios_companies where name like '%(TEST)%'`,
  );
  console.log(
    `borrados: ${goneProjects.rowCount} proyecto(s), ${goneCompanies.rowCount} compañía(s)`,
  );

  if (deleteOnly) {
    if (dryRun) await client.query('rollback');
    else await client.query('commit');
    console.log(dryRun ? '--dry-run: rolled back.' : 'Fixtures fuera. V2 queda sin datos de prueba.');
  } else {
    // ------------------------------------------------------------ the lookups
    const industryId = new Map<string, string>(
      (await client.query<{ id: string; subsector: string }>(
        'select id, subsector from ios_industries',
      )).rows.map((r) => [r.subsector, r.id]),
    );
    const thesisId = new Map<string, string>(
      (await client.query<{ id: string; code: string }>('select id, code from ios_theses')).rows.map(
        (r) => [r.code, r.id],
      ),
    );

    // ----------------------------------------------------------- the fixtures
    const byFixture = new Map<string, { row: Row; row_no: number }[]>();
    for (const entry of fixtureRows()) {
      const key = text(entry.row.Fixture);
      if (!key) continue;
      byFixture.set(key, [...(byFixture.get(key) ?? []), entry]);
    }

    let companies = 0;
    let projects = 0;
    let docs = 0;
    let perimeter = 0;

    for (const [fixture, rows] of byFixture) {
      const scenario = SCENARIOS[fixture];
      if (!scenario) {
        console.log(
          `${fixture}: omitido. Es el fixture de importación masiva (detección de duplicados al subir un fichero), y el importador vive en V1, no en V2.`,
        );
        continue;
      }

      // The companies of this fixture, in sheet order. The first row is the
      // target or the platform, which is what names the project.
      const companyIds: { id: string; role: string }[] = [];
      for (const { row, row_no } of rows) {
        const name = text(row['Company Name']);
        const subsector = text(row['Primary Subsector']);
        const industry = industryId.get(subsector);
        if (!industry) {
          throw new Error(
            `Seed_Fixtures row ${row_no}: no subsector called "${subsector}" in ios_industries`,
          );
        }

        const { rows: inserted } = await client.query<{ id: string }>(
          `insert into ios_companies (
             name, website, country, province, industry_id, status, origin_type,
             ownership_type, revenue_estimate_eur_m, ebitda_estimate_eur_m, research_notes
           ) values ($1,$2,$3,$4,$5,'Active Project',$6,$7,$8,$9,$10)
           returning id`,
          [
            name,
            textOrNull(row.Website),
            text(row.Country) || 'Spain',
            textOrNull(row.Province),
            industry,
            must(ORIGIN_TYPES, row['Origin Type'], 'Origin Type', row_no),
            must(OWNERSHIP_TYPES, row['Ownership Type'], 'Ownership Type', row_no),
            numberOrNull(row['Revenue Estimate €M']),
            // P5's EBITDA is blank on purpose. That blank is the fixture.
            numberOrNull(row['EBITDA Estimate €M']),
            `Fixture ${fixture} de Ignasi (Seed_Fixtures, fila ${row_no}). Esperado: ${text(row.Expected)}`,
          ],
        );
        companies += 1;
        companyIds.push({
          id: inserted[0].id,
          role: must(PROJECT_COMPANY_ROLES, row['Role in Project'], 'Role in Project', row_no),
        });
      }

      const lead = rows[0];
      const leadIndustry = industryId.get(text(lead.row['Primary Subsector']))!;
      const addons = rows.length - 1;
      const name =
        `${text(lead.row['Company Name'])}` +
        (addons > 0 ? ` + ${addons}` : '') +
        ` ${NAME_DASH} ${FIXTURE_YEAR}`;

      const thesisCode = text(lead.row['Primary Thesis']);
      const thesis = thesisCode ? thesisId.get(thesisCode) : null;
      if (thesisCode && !thesis) {
        throw new Error(`Seed_Fixtures row ${lead.row_no}: no thesis with code "${thesisCode}"`);
      }

      const { rows: created } = await client.query<{ id: string }>(
        `insert into ios_projects (
           name, code, project_type, stage, stage_status, project_status, priority,
           owner, thesis_id, thesis_fit, industry_id, origin_type,
           next_step, next_step_due, notes
         ) values ($1,$2,$3,$4,$5,'Active',$6,$7,$8,$9,$10,$11,$12,$13,$14)
         returning id`,
        [
          name,
          `TEST-${fixture}`,
          must(PROJECT_TYPES, lead.row['Project Type'], 'Project Type', lead.row_no),
          scenario.stage,
          scenario.stage_status,
          text(lead.row.Priority) ? must(PRIORITY, lead.row.Priority, 'Priority', lead.row_no) : null,
          'Ignasi',
          thesis,
          must(THESIS_FIT, lead.row['Thesis Fit'], 'Thesis Fit', lead.row_no),
          leadIndustry,
          must(ORIGIN_TYPES, lead.row['Origin Type'], 'Origin Type', lead.row_no),
          scenario.next_step,
          iso(scenario.due_in_days),
          `Fixture ${fixture}: ${scenario.covers}. Datos de Seed_Fixtures, escenario leído de Test_Fixtures.`,
        ],
      );
      const projectId = created[0].id;
      projects += 1;

      for (const doc of scenario.docs) {
        await client.query(
          `insert into ios_documents (project_id, doc_type, doc_status, version, title, approved_at, approved_by)
           values ($1,$2,$3,1,$4,$5,$6)`,
          [
            projectId,
            doc.doc_type,
            doc.doc_status,
            doc.title,
            doc.doc_status === 'Approved' ? new Date().toISOString() : null,
            doc.doc_status === 'Approved' ? 'Ignasi' : null,
          ],
        );
        docs += 1;
      }

      for (const { id, role } of companyIds) {
        // The one being bought is in scope from the start; an add-on is a
        // candidate until somebody says otherwise, and saying otherwise is the
        // tester's job in his P6 scenario.
        await client.query(
          `insert into ios_project_companies (project_id, company_id, role, inclusion_status)
           values ($1,$2,$3,$4)`,
          [projectId, id, role, role === 'Add-on' ? 'Under Review' : 'In Scope'],
        );
        perimeter += 1;
      }

      console.log(`${fixture}: ${name} · ${scenario.stage} · ${scenario.covers}`);
    }

    if (dryRun) {
      await client.query('rollback');
      console.log('--dry-run: rolled back.');
    } else {
      await client.query('commit');
    }
    console.log(
      `compañías ${companies} · proyectos ${projects} · documentos ${docs} · perímetro ${perimeter}`,
    );
  }
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error(`FAILED: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
