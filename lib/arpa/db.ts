import { createClient } from '@/lib/supabase/server';
import { STAGES } from './lists';
import {
  TAXONOMY,
  toScoringInput,
  type Concentration,
  type Confidence,
  type OwnershipType,
  type PassReason,
  type ScoringInput,
  type TaxonomyFit,
  type TaxonomyRow,
} from './scoring';

/** PostgREST's own hard cap on an unbounded select. Our page size, so the loop
 *  that works around it always asks for exactly as much as it can get. */
const PAGE = 1000;

export interface PipelineRow {
  id: string;
  code: string | null;
  stage: string;
  decision_status: string | null;
  pass_reason: string | null;
  owner: string | null;
  updated_at: string;
  company_id: string;
  legal_name: string;
  region: string | null;
  ownership_type: OwnershipType | null;
  sector: string | null;
  subsector: string | null;
  ebitda_ref: number | null;
  ev: number | null;
  equity: number | null;
  valuation_gap: number | null;
  qss: number | null;
  om: number | null;
  pfr: number | null;
  /**
   * Share of each gate's weight that had a score, 0-100. A gate is renormalised
   * over the criteria that had data, so the score alone cannot tell a thorough
   * 90 from a 90 built on two of five criteria. Always read them as a pair.
   */
  qss_cov: number | null;
  om_cov: number | null;
  pfr_cov: number | null;
  last_scored_at: string | null;
  has_veto: boolean | null;
  /** The temática. Null until somebody says which play this deal is. */
  theme_id: number | null;
  theme_name: string | null;
  /** The project's own industry, falling back to the primary company's. */
  taxonomy_id: number | null;
  industry_pre_score: number | null;
  /** How many companies hang off the project. One for a plain deal. */
  company_count: number;
  /**
   * The deal's own name. NULL means it is called after its primary company,
   * which is what every project meant before the column existed. Read it
   * through `projectTitle()` so the fallback lives in one place.
   */
  project_name: string | null;
}

/** What to call a project on screen: its own name, or its company's. */
export function projectTitle(r: { project_name: string | null; legal_name: string }): string {
  return r.project_name?.trim() || r.legal_name;
}

/**
 * A row of the Originación tab: an imported company, its latest scores, and
 * whatever the BORME published about it. Backed by the `arpa_sourcing` view, so
 * the score columns are defined in SQL in exactly one place.
 */
export interface SourcingRow extends PipelineRow {
  cif: string | null;
  city: string | null;
  cnae: string | null;
  employees: number | null;
  founded_year: number | null;
  website: string | null;
  notes: string | null;
  intake_batch: string | null;
  enrich_source: string | null;
  /** Null when the name key matched nothing in the BORME. */
  borme_signals: string[] | null;
  /** sold | lead | early | none */
  borme_phase: string | null;
  borme_prep_count: number | null;
  borme_done_count: number | null;
  borme_patrimonial: boolean | null;
  borme_hoja: string | null;
  borme_first_signal_at: string | null;
  borme_last_signal_at: string | null;
}

export interface SourcingFilters {
  /**
   * `untriaged` is still sitting in Sourcing, `promoted` has been moved on.
   * Expressed as triage and not as a stage name because the question this
   * screen answers is "what have I not looked at yet", and that is one choice
   * rather than one of eleven stages.
   */
  triage?: 'untriaged' | 'promoted';
  region?: string;
  batch?: string;
  /** lead | early | sold | none */
  phase?: string;
  /**
   * The camino: a temática and a subsector. They are filters over this same
   * list and not a separate screen, because the proactive path never looked
   * anything up, it only narrowed what was already imported.
   *
   * The subsector matches the PROJECT's industry or, when the project has none,
   * the primary company's. `arpa_pipeline` already resolves that fallback into
   * `taxonomy_id`, so this reads one column instead of repeating the rule.
   */
  themeId?: number;
  taxonomyId?: number;
}

export interface SourcingView {
  rows: SourcingRow[];
  regions: string[];
  batches: string[];
  total: number;
  /** Companies still sitting in Sourcing, i.e. not yet triaged. */
  untriaged: number;
  /** Row counts per BORME phase over the whole import, not just the filtered page. */
  phases: { lead: number; early: number; sold: number; none: number };
  /**
   * How many companies sit in each subsector and each temática, keyed by id.
   * The picker renders these next to the options so you can see a subsector is
   * empty BEFORE choosing it. Without them the dropdown lists twenty-one
   * subsectors that all look equally promising and twenty of them return
   * nothing.
   */
  byTaxonomy: Record<number, number>;
  byTheme: Record<number, number>;
}

/**
 * Reads Originación.
 *
 * Filtering happens in JS rather than in the query because the row count here
 * is the size of one SABI export, hundreds not millions, and the facet counts
 * on screen have to be computed over the UNFILTERED set anyway. One read is
 * cheaper than one read per facet.
 */
export async function getSourcing(filters: SourcingFilters = {}): Promise<SourcingView> {
  const supabase = createClient();

  // PostgREST caps an unbounded select at 1,000 rows and says nothing about it,
  // so an import of 1,200 companies would silently lose 200 of them and the
  // facet counts would be wrong too. Page explicitly.
  const all: SourcingRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await supabase
      .from('arpa_sourcing')
      .select('*')
      .order('updated_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (page.error) throw new Error(`arpa_sourcing: ${page.error.message}`);
    const got = (page.data ?? []) as SourcingRow[];
    all.push(...got);
    if (got.length < PAGE) break;
  }

  const triaged = (r: SourcingRow) => r.stage !== 'Sourcing';

  const rows = all.filter(
    (r) =>
      (!filters.triage || triaged(r) === (filters.triage === 'promoted')) &&
      (!filters.region || r.region === filters.region) &&
      (!filters.batch || r.intake_batch === filters.batch) &&
      (!filters.phase || (r.borme_phase ?? 'none') === filters.phase) &&
      (!filters.themeId || r.theme_id === filters.themeId) &&
      (!filters.taxonomyId || r.taxonomy_id === filters.taxonomyId),
  );

  // Highest conviction first, missing scores last: an import drops hundreds of
  // rows in at once and the order they came out of SABI means nothing.
  rows.sort((a, b) => {
    if (a.qss === null && b.qss === null) return a.legal_name.localeCompare(b.legal_name, 'es');
    if (a.qss === null) return 1;
    if (b.qss === null) return -1;
    return Number(b.qss) - Number(a.qss);
  });

  const uniq = (xs: (string | null)[]) =>
    [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'es'));

  const phase = (p: string) => all.filter((r) => (r.borme_phase ?? 'none') === p).length;

  const tally = (pick: (r: SourcingRow) => number | null) => {
    const out: Record<number, number> = {};
    for (const r of all) {
      const k = pick(r);
      if (k !== null) out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  };

  return {
    rows,
    regions: uniq(all.map((r) => r.region)),
    batches: uniq(all.map((r) => r.intake_batch)),
    total: all.length,
    untriaged: all.filter((r) => r.stage === 'Sourcing').length,
    phases: { lead: phase('lead'), early: phase('early'), sold: phase('sold'), none: phase('none') },
    byTaxonomy: tally((r) => r.taxonomy_id),
    byTheme: tally((r) => r.theme_id),
  };
}

export interface CompanyRecord {
  id: string;
  legal_name: string;
  trade_name: string | null;
  cif: string | null;
  website: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  taxonomy_id: number | null;
  taxonomy_fit: TaxonomyFit;
  cnae: string | null;
  employees: number | null;
  founded_year: number | null;
  ownership_type: OwnershipType | null;
  admin_since: number | null;
  notes: string | null;
  /** Provenance of the ficha data. See 20261005_arpa_company_enrichment.sql. */
  enrich_source: string | null;
  enriched_at: string | null;
  enriched_by: string | null;
}

export interface ProjectRecord {
  id: string;
  company_id: string;
  /** The deal's own name. Null means "called after its primary company". */
  name: string | null;
  code: string | null;
  stage: string;
  decision_status: string | null;
  pass_reason: PassReason | null;
  source: string | null;
  owner: string | null;
  /** The temática. Null until somebody says which play this deal is. */
  theme_id: number | null;
  /** The project's own industry. Declared here rather than inherited from the
   *  primary company, because a buy-and-build can span two subsectors. */
  taxonomy_id: number | null;
  revenue_y1: number | null;
  revenue_y2: number | null;
  revenue_y3: number | null;
  ebitda_y1: number | null;
  ebitda_y2: number | null;
  ebitda_y3: number | null;
  ebitda_norm: number | null;
  capex: number | null;
  working_capital: number | null;
  net_debt: number | null;
  recurring_pct: number | null;
  customer_conc: Concentration | null;
  seller_motiv: number | null;
  data_confidence: Confidence | null;
  financials_src: string | null;
  entry_multiple: number | null;
  seller_exp_ev: number | null;
  updated_at: string;
}

export interface ScoreRecord {
  id: string;
  model: string;
  total_1_5: number | null;
  total_0_100: number | null;
  verdict: string;
  vetoed: boolean;
  scored_by: string;
  scored_at: string;
  note: string | null;
}

export interface KillFlagRecord {
  kill_id: string;
  flagged: boolean;
  flagged_by: string | null;
  note: string | null;
}

export interface StakeholderRecord {
  link_id: string;
  stakeholder_id: string;
  full_name: string;
  org: string | null;
  kind: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_primary: boolean;
}

export interface InteractionRecord {
  id: string;
  kind: string;
  direction: string | null;
  happened_at: string;
  summary: string | null;
  next_step: string | null;
  next_step_due: string | null;
  logged_by: string | null;
  stakeholder_name: string | null;
}

export interface DocumentRecord {
  id: string;
  title: string;
  doc_type: string;
  external_url: string | null;
  storage_path: string | null;
  period: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface ProjectDetail {
  project: ProjectRecord;
  company: CompanyRecord;
  taxonomy: TaxonomyRow | null;
  /** Every subsector, so the ficha can assign one. Keyed on the database id. */
  taxonomyList: { id: number; subsector: string }[];
  scores: ScoreRecord[];
  killFlags: KillFlagRecord[];
  stakeholders: StakeholderRecord[];
  interactions: InteractionRecord[];
  documents: DocumentRecord[];
  scoringInput: ScoringInput;
}

/** Look a taxonomy row up by its database id, falling back to the seeded list. */
function taxonomyById(id: number | null, rows: { id: number; subsector: string }[]): TaxonomyRow | null {
  if (id === null) return null;
  const hit = rows.find((r) => r.id === id);
  if (!hit) return null;
  return TAXONOMY.find((t) => t.subsector === hit.subsector) ?? null;
}

export async function getPipeline(): Promise<PipelineRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('arpa_pipeline')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`arpa_pipeline: ${error.message}`);
  return (data ?? []) as PipelineRow[];
}

/** A temática: one of the two or three plays ARPA runs. */
export interface ThemeRow {
  id: number;
  name: string;
  slug: string;
  thesis: string | null;
  fit_criteria: string | null;
  active: boolean;
  sort: number;
  is_example: boolean;
  /** Projects currently running this play. */
  project_count: number;
}

/** A taxonomy row with everything ARPA reasons about a subsector. */
export interface IndustryRow {
  id: number;
  sector: string;
  category: string;
  subsector: string;
  growth: string | null;
  fragmentation: string | null;
  consolidation: string | null;
  pre_score: number | null;
  margin_typical_pct: number | null;
  cnae_codes: string[] | null;
  keywords: string[] | null;
  notes: string | null;
  active: boolean;
  is_example: boolean;
}

export async function getThemes(): Promise<ThemeRow[]> {
  const supabase = createClient();
  const [themes, projects] = await Promise.all([
    supabase
      .from('arpa_themes')
      .select('id, name, slug, thesis, fit_criteria, active, sort, is_example')
      .order('sort')
      .order('name'),
    supabase.from('arpa_projects').select('theme_id').not('theme_id', 'is', null),
  ]);

  if (themes.error) throw new Error(`arpa_themes: ${themes.error.message}`);
  if (projects.error) throw new Error(`arpa_projects themes: ${projects.error.message}`);

  const counts = new Map<number, number>();
  for (const p of (projects.data ?? []) as { theme_id: number }[]) {
    counts.set(p.theme_id, (counts.get(p.theme_id) ?? 0) + 1);
  }

  return ((themes.data ?? []) as Omit<ThemeRow, 'project_count'>[]).map((t) => ({
    ...t,
    project_count: counts.get(t.id) ?? 0,
  }));
}

export async function getIndustries(): Promise<IndustryRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('arpa_taxonomy')
    .select(
      'id, sector, category, subsector, growth, fragmentation, consolidation, pre_score, margin_typical_pct, cnae_codes, keywords, notes, active, is_example',
    )
    .order('sector')
    .order('category')
    .order('subsector');

  if (error) throw new Error(`arpa_taxonomy: ${error.message}`);
  return (data ?? []) as IndustryRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Origination, the proactive path.
//
// Ignasi described two doors into the funnel. The opportunistic one is a
// document: an advisor sends an infomemo about one company. The proactive one
// starts the other way round, from a temática and a subsector, looks at the
// industry and its comparables, and only names companies at the end.
//
// This read serves the second door. It is deliberately NOT built on
// `arpa_sourcing`, because that view hangs off projects: a company nobody has
// opened a deal on yet would be invisible, and those are exactly the ones a
// camino exists to find.
// ─────────────────────────────────────────────────────────────────────────────

export interface CaminoCompany {
  id: string;
  legal_name: string;
  city: string | null;
  region: string | null;
  employees: number | null;
  /** Year of the first director appointment. ARPA's proxy for owner age. */
  admin_since: number | null;
  ownership_type: OwnershipType | null;
  /** Null means no deal has been opened on this company yet. */
  project_id: string | null;
  project_code: string | null;
  stage: string | null;
  /** M€, like every other money field here. Last deposited year. */
  revenue: number | null;
  ebitda: number | null;
  /** The three gates, 0-100. Null where that gate has not been scored. */
  qss: number | null;
  om: number | null;
  pfr: number | null;
  /** Share of each gate's weight that was actually scored, 0-100. */
  qss_cov: number | null;
  om_cov: number | null;
  pfr_cov: number | null;
  has_veto: boolean | null;
}

export interface CaminoView {
  companies: CaminoCompany[];
  /** Companies in the subsector with no project on them yet. */
  untouched: number;
  /**
   * The comparables, over the companies of this subsector that have figures.
   * Medians and not averages: one outlier in a set of six would move a mean
   * enough to misdescribe the subsector.
   */
  comparables: {
    n: number;
    revenue: number | null;
    ebitda: number | null;
    /** EBITDA over revenue, as a percentage. */
    margin: number | null;
  };
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};

export async function getCamino(taxonomyId: number): Promise<CaminoView> {
  const supabase = createClient();

  const { data: companyRows, error: cErr } = await supabase
    .from('arpa_companies')
    .select('id, legal_name, city, region, employees, admin_since, ownership_type')
    .eq('taxonomy_id', taxonomyId)
    .order('legal_name');

  if (cErr) throw new Error(`arpa_companies camino: ${cErr.message}`);

  const companies = (companyRows ?? []) as Omit<
    CaminoCompany,
    | 'project_id'
    | 'project_code'
    | 'stage'
    | 'revenue'
    | 'ebitda'
    | 'qss'
    | 'om'
    | 'pfr'
    | 'qss_cov'
    | 'om_cov'
    | 'pfr_cov'
    | 'has_veto'
  >[];

  if (companies.length === 0) {
    return {
      companies: [],
      untouched: 0,
      comparables: { n: 0, revenue: null, ebitda: null, margin: null },
    };
  }

  const { data: projectRows, error: pErr } = await supabase
    .from('arpa_projects')
    .select('id, company_id, code, stage, revenue_y3, ebitda_norm, ebitda_y3')
    .in(
      'company_id',
      companies.map((c) => c.id),
    );

  if (pErr) throw new Error(`arpa_projects camino: ${pErr.message}`);

  type Row = {
    id: string;
    company_id: string;
    code: string | null;
    stage: string;
    revenue_y3: number | null;
    ebitda_norm: number | null;
    ebitda_y3: number | null;
  };
  const rows = (projectRows ?? []) as Row[];
  const byCompany = new Map<string, Row>();
  for (const r of rows) if (!byCompany.has(r.company_id)) byCompany.set(r.company_id, r);

  // The gates come from `arpa_pipeline` and not from `arpa_scores`, because the
  // view already defines "the latest score per gate" in SQL. Recomputing that
  // here is how two screens end up quoting different numbers for one deal.
  type Gates = {
    id: string;
    qss: number | null;
    om: number | null;
    pfr: number | null;
    qss_cov: number | null;
    om_cov: number | null;
    pfr_cov: number | null;
    has_veto: boolean | null;
  };
  const gates = new Map<string, Gates>();
  if (rows.length > 0) {
    const { data: gateRows, error: gErr } = await supabase
      .from('arpa_pipeline')
      .select('id, qss, om, pfr, qss_cov, om_cov, pfr_cov, has_veto')
      .in(
        'id',
        rows.map((r) => r.id),
      );
    if (gErr) throw new Error(`arpa_pipeline camino: ${gErr.message}`);
    for (const g of (gateRows ?? []) as Gates[]) gates.set(g.id, g);
  }

  const n = (v: number | null) => (v === null || v === undefined ? null : Number(v));

  const merged: CaminoCompany[] = companies.map((c) => {
    const p = byCompany.get(c.id);
    const g = p ? gates.get(p.id) : undefined;
    return {
      ...c,
      project_id: p?.id ?? null,
      project_code: p?.code ?? null,
      stage: p?.stage ?? null,
      revenue: p ? n(p.revenue_y3) : null,
      ebitda: p ? n(p.ebitda_norm ?? p.ebitda_y3) : null,
      qss: g?.qss ?? null,
      om: g?.om ?? null,
      pfr: g?.pfr ?? null,
      qss_cov: g?.qss_cov ?? null,
      om_cov: g?.om_cov ?? null,
      pfr_cov: g?.pfr_cov ?? null,
      has_veto: g?.has_veto ?? null,
    };
  });

  const withFigures = merged.filter((c) => c.revenue !== null && c.ebitda !== null);

  return {
    companies: merged,
    untouched: merged.filter((c) => c.project_id === null).length,
    comparables: {
      n: withFigures.length,
      revenue: median(withFigures.map((c) => c.revenue as number)),
      ebitda: median(withFigures.map((c) => c.ebitda as number)),
      margin: median(
        withFigures
          .filter((c) => (c.revenue as number) > 0)
          .map((c) => ((c.ebitda as number) / (c.revenue as number)) * 100),
      ),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Origination, the opportunistic path.
//
// A deal that arrived as a document from somebody. The word "infomemo" in
// `source` is the marker, matched loosely because that field is free text and
// already holds things like "Verdegí (infomemo)". The sender is read from the
// stakeholder link and not parsed out of that text, so the person is in
// Contactos and reappears on the next deal they send.
// ─────────────────────────────────────────────────────────────────────────────

export interface InboundRow {
  id: string;
  code: string | null;
  legal_name: string;
  stage: string;
  theme_name: string | null;
  created_at: string;
  /** Who sent it. Null if the link was removed by hand afterwards. */
  sender: string | null;
  sender_org: string | null;
}

export async function getInbound(): Promise<InboundRow[]> {
  const supabase = createClient();

  const { data: projectRows, error } = await supabase
    .from('arpa_projects')
    .select('id, code, stage, created_at, company_id, theme_id, arpa_companies(legal_name)')
    .ilike('source', '%infomemo%')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(`arpa_projects inbound: ${error.message}`);

  const projects = (projectRows ?? []) as unknown as {
    id: string;
    code: string | null;
    stage: string;
    created_at: string;
    company_id: string;
    theme_id: number | null;
    arpa_companies: { legal_name: string } | null;
  }[];

  if (projects.length === 0) return [];

  const [links, themes] = await Promise.all([
    supabase
      .from('arpa_stakeholder_links')
      .select('project_id, arpa_stakeholders(full_name, org, kind)')
      .in(
        'project_id',
        projects.map((p) => p.id),
      ),
    supabase.from('arpa_themes').select('id, name'),
  ]);

  if (links.error) throw new Error(`arpa_stakeholder_links inbound: ${links.error.message}`);
  if (themes.error) throw new Error(`arpa_themes inbound: ${themes.error.message}`);

  // Only the kinds that send deals. A deal has an owner and a lawyer linked to
  // it too, and whichever row came back first is not the sender.
  const SENDER_KINDS = ['Intermediary', 'Banker', 'Broker', 'Advisor'];

  const sender = new Map<string, { full_name: string; org: string | null }>();
  for (const l of (links.data ?? []) as unknown as {
    project_id: string | null;
    arpa_stakeholders: { full_name: string; org: string | null; kind: string } | null;
  }[]) {
    if (!l.project_id || !l.arpa_stakeholders) continue;
    if (!SENDER_KINDS.includes(l.arpa_stakeholders.kind)) continue;
    if (!sender.has(l.project_id)) sender.set(l.project_id, l.arpa_stakeholders);
  }

  const themeName = new Map(((themes.data ?? []) as { id: number; name: string }[]).map((t) => [t.id, t.name]));

  return projects.map((p) => ({
    id: p.id,
    code: p.code,
    legal_name: p.arpa_companies?.legal_name ?? '—',
    stage: p.stage,
    theme_name: p.theme_id === null ? null : themeName.get(p.theme_id) ?? null,
    created_at: p.created_at,
    sender: sender.get(p.id)?.full_name ?? null,
    sender_org: sender.get(p.id)?.org ?? null,
  }));
}

/**
 * How much demo content is in the database, by table.
 *
 * The clear button used to count only temáticas and subsectores, which under-
 * reported the moment the demo deals arrived: it would offer to remove 4 rows
 * and quietly take 60. The button has to name what it deletes.
 */
export async function getExampleCounts(): Promise<{ label: string; count: number }[]> {
  const supabase = createClient();
  const tables: [string, string][] = [
    ['arpa_themes', 'temáticas'],
    ['arpa_taxonomy', 'subsectores'],
    ['arpa_companies', 'empresas'],
    ['arpa_projects', 'proyectos'],
    ['arpa_stakeholders', 'personas'],
    ['arpa_interactions', 'interacciones'],
    ['arpa_documents', 'documentos'],
    ['arpa_scores', 'puntuaciones'],
  ];

  const results = await Promise.all(
    tables.map(([table]) =>
      supabase.from(table).select('*', { count: 'exact', head: true }).eq('is_example', true),
    ),
  );

  return results
    .map((r, i) => ({ label: tables[i][1], count: r.count ?? 0 }))
    .filter((r) => r.count > 0);
}

export interface ProjectsView {
  rows: PipelineRow[];
  themes: { id: number; name: string; count: number }[];
  /** Subsectors that actually have a project on them, with their counts. */
  industries: { id: number; subsector: string; count: number }[];
  stages: { stage: string; count: number }[];
  total: number;
  /** Projects with no temática assigned. The gap worth seeing on screen. */
  unthemed: number;
}

/**
 * Reads Proyectos: the same rows as Pipeline, faceted by temática, industria and
 * etapa instead of listed in one table.
 *
 * Faceted in JS for the same reason as Originación: the counts have to be over
 * the unfiltered set, so one read is cheaper than one read per facet, and a
 * pipeline is hundreds of rows, not millions.
 */
export async function getProjects(
  filters: { theme?: string; industry?: string; stage?: string } = {},
): Promise<ProjectsView> {
  const all = await getPipeline();
  const industryNames = new Map<number, string>();
  for (const i of await getTaxonomyOptions()) industryNames.set(i.id, i.subsector);

  // Comma separated, because each filter now takes several values at once:
  // "¿qué tengo en Sourcing y en Screening?" is one question, and before this it
  // took two page loads and a mental sum. An empty set means no filter, so the
  // default URL still shows everything.
  const set = (v: string | undefined) => {
    const parts = (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return parts.length ? new Set(parts) : null;
  };
  const themeIds = set(filters.theme);
  const industryIds = set(filters.industry);
  const stages = set(filters.stage);

  const rows = all.filter(
    (r) =>
      (themeIds === null || (r.theme_id !== null && themeIds.has(String(r.theme_id)))) &&
      (industryIds === null || (r.taxonomy_id !== null && industryIds.has(String(r.taxonomy_id)))) &&
      (stages === null || stages.has(r.stage)),
  );

  const tally = <K>(pick: (r: PipelineRow) => K | null) => {
    const out = new Map<K, number>();
    for (const r of all) {
      const k = pick(r);
      if (k !== null) out.set(k, (out.get(k) ?? 0) + 1);
    }
    return out;
  };

  const byTheme = tally((r) => r.theme_id);
  const byIndustry = tally((r) => r.taxonomy_id);
  const byStage = tally((r) => r.stage);
  const themeNames = new Map<number, string>();
  for (const r of all) if (r.theme_id !== null && r.theme_name) themeNames.set(r.theme_id, r.theme_name);

  return {
    rows,
    themes: [...byTheme.entries()]
      .map(([id, count]) => ({ id, name: themeNames.get(id) ?? `#${id}`, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    industries: [...byIndustry.entries()]
      .map(([id, count]) => ({ id, subsector: industryNames.get(id) ?? `#${id}`, count }))
      .sort((a, b) => a.subsector.localeCompare(b.subsector, 'es')),
    // Funnel order, not alphabetical: a stage list sorted by name is unreadable.
    stages: STAGES.filter((s) => byStage.has(s)).map((s) => ({ stage: s, count: byStage.get(s) ?? 0 })),
    total: all.length,
    unthemed: all.filter((r) => r.theme_id === null).length,
  };
}

export async function getTaxonomyOptions() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('arpa_taxonomy')
    .select('id, sector, category, subsector')
    .order('sector')
    .order('category')
    .order('subsector');

  if (error) throw new Error(`arpa_taxonomy: ${error.message}`);
  return (data ?? []) as { id: number; sector: string; category: string; subsector: string }[];
}

export async function getProjectDetail(id: string): Promise<ProjectDetail | null> {
  const supabase = createClient();

  const { data: project, error: pErr } = await supabase
    .from('arpa_projects')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (pErr) throw new Error(`arpa_projects: ${pErr.message}`);
  if (!project) return null;

  const { data: company, error: cErr } = await supabase
    .from('arpa_companies')
    .select('*')
    .eq('id', project.company_id)
    .maybeSingle();

  if (cErr) throw new Error(`arpa_companies: ${cErr.message}`);
  if (!company) return null;

  const [taxRows, scores, flags, links, interactions, documents] = await Promise.all([
    supabase.from('arpa_taxonomy').select('id, subsector'),
    supabase
      .from('arpa_scores')
      .select('id, model, total_1_5, total_0_100, verdict, vetoed, scored_by, scored_at, note')
      .eq('project_id', id)
      .order('scored_at', { ascending: false }),
    supabase.from('arpa_kill_flags').select('kill_id, flagged, flagged_by, note').eq('project_id', id),
    supabase
      .from('arpa_stakeholder_links')
      .select('id, role, is_primary, arpa_stakeholders(id, full_name, org, kind, email, phone)')
      .or(`project_id.eq.${id},company_id.eq.${project.company_id}`),
    supabase
      .from('arpa_interactions')
      .select('id, kind, direction, happened_at, summary, next_step, next_step_due, logged_by, arpa_stakeholders(full_name)')
      .eq('project_id', id)
      .order('happened_at', { ascending: false })
      .limit(30),
    // Documents of the project OR of its company: an annual accounts deposit
    // belongs to the company and stays relevant if the deal is reopened.
    supabase
      .from('arpa_documents')
      .select('id, title, doc_type, external_url, storage_path, period, uploaded_by, created_at')
      .or(`project_id.eq.${id},company_id.eq.${project.company_id}`)
      .order('created_at', { ascending: false })
      .limit(60),
  ]);

  const taxonomyList = ((taxRows.data ?? []) as { id: number; subsector: string }[]).sort((a, b) =>
    a.subsector.localeCompare(b.subsector, 'es'),
  );
  const taxonomy = taxonomyById(company.taxonomy_id, taxonomyList);

  type LinkJoin = {
    id: string;
    role: string | null;
    is_primary: boolean;
    arpa_stakeholders: { id: string; full_name: string; org: string | null; kind: string; email: string | null; phone: string | null } | null;
  };

  type InteractionJoin = Omit<InteractionRecord, 'stakeholder_name'> & {
    arpa_stakeholders: { full_name: string } | null;
  };

  return {
    project: project as ProjectRecord,
    company: company as CompanyRecord,
    taxonomy,
    taxonomyList,
    scores: (scores.data ?? []) as ScoreRecord[],
    killFlags: (flags.data ?? []) as KillFlagRecord[],
    stakeholders: ((links.data ?? []) as unknown as LinkJoin[])
      .filter((l) => l.arpa_stakeholders)
      .map((l) => ({
        link_id: l.id,
        stakeholder_id: l.arpa_stakeholders!.id,
        full_name: l.arpa_stakeholders!.full_name,
        org: l.arpa_stakeholders!.org,
        kind: l.arpa_stakeholders!.kind,
        email: l.arpa_stakeholders!.email,
        phone: l.arpa_stakeholders!.phone,
        role: l.role,
        is_primary: l.is_primary,
      })),
    interactions: ((interactions.data ?? []) as unknown as InteractionJoin[]).map((r) => ({
      id: r.id,
      kind: r.kind,
      direction: r.direction,
      happened_at: r.happened_at,
      summary: r.summary,
      next_step: r.next_step,
      next_step_due: r.next_step_due,
      logged_by: r.logged_by,
      stakeholder_name: r.arpa_stakeholders?.full_name ?? null,
    })),
    documents: (documents.data ?? []) as DocumentRecord[],
    scoringInput: toScoringInput(project as ProjectRecord, company as CompanyRecord, taxonomy),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stakeholder CRM.
//
// The blueprint calls this Contacts + Sources. It is modelled as one person
// table plus a link table, because a banker or a lawyer shows up across several
// deals: the person is the entity and the link carries the role in that deal.
// A stakeholder with no link at all is valid, which is what makes it usable for
// investors and advisors who are not attached to any one company yet.
// ─────────────────────────────────────────────────────────────────────────────

export interface StakeholderLink {
  id: string;
  role: string | null;
  is_primary: boolean;
  company_id: string | null;
  project_id: string | null;
  company_name: string | null;
  /** The project to open. Null when the link is only to a company. */
  project_id_for_link: string | null;
}

export interface StakeholderRow {
  id: string;
  full_name: string;
  org: string | null;
  kind: string;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  city: string | null;
  notes: string | null;
  /**
   * The investor profile. Null on everyone who is not an investor, which is
   * most of the table, so the UI has to tolerate an all-null block rather than
   * assume it is there.
   */
  invest_thesis: string | null;
  sectors_in: string | null;
  sectors_out: string | null;
  /** Ticket size in M€, the unit of every other money field in this schema. */
  ticket_min: number | null;
  ticket_max: number | null;
  links: StakeholderLink[];
  interaction_count: number;
  last_interaction_at: string | null;
}

export interface StakeholderView {
  rows: StakeholderRow[];
  total: number;
  /** Every `kind` present, for the filter chips. */
  kinds: { kind: string; count: number }[];
}

/**
 * The whole CRM, read in three flat selects and joined in memory.
 *
 * PostgREST can nest these, but the nested shape has to be unpicked anyway and
 * two of the three tables are small, so flat selects keep the types honest.
 */
export async function getStakeholders(filters: { kind?: string; q?: string } = {}): Promise<StakeholderView> {
  const supabase = createClient();

  let people = supabase
    .from('arpa_stakeholders')
    .select(
      'id, full_name, org, kind, email, phone, linkedin, city, notes, invest_thesis, sectors_in, sectors_out, ticket_min, ticket_max',
    )
    .order('full_name');

  if (filters.kind) people = people.eq('kind', filters.kind);
  if (filters.q) {
    // `.or()` takes a PostgREST filter EXPRESSION, not a bound parameter, so a
    // comma or a bracket in the search box would inject filters of the caller's
    // choosing. Strip every character that has meaning in that grammar.
    const q = filters.q.replace(/[,()*%\\"'.]/g, ' ').trim().slice(0, 60);
    if (q) people = people.or(`full_name.ilike.%${q}%,org.ilike.%${q}%`);
  }

  const [list, links, interactions, kindRows] = await Promise.all([
    people,
    supabase
      .from('arpa_stakeholder_links')
      .select('id, stakeholder_id, company_id, project_id, role, is_primary'),
    supabase
      .from('arpa_interactions')
      .select('stakeholder_id, happened_at'),
    supabase.from('arpa_stakeholders').select('kind'),
  ]);

  if (list.error) throw new Error(`arpa_stakeholders: ${list.error.message}`);
  if (links.error) throw new Error(`arpa_stakeholder_links: ${links.error.message}`);
  if (interactions.error) throw new Error(`arpa_interactions: ${interactions.error.message}`);
  if (kindRows.error) throw new Error(`arpa_stakeholders kinds: ${kindRows.error.message}`);

  const people_ = (list.data ?? []) as Omit<StakeholderRow, 'links' | 'interaction_count' | 'last_interaction_at'>[];
  const linkRows = (links.data ?? []) as {
    id: string;
    stakeholder_id: string;
    company_id: string | null;
    project_id: string | null;
    role: string | null;
    is_primary: boolean;
  }[];

  // Resolve the company name for every linked company and project in one pass,
  // so the list does not issue a query per row.
  const companyIds = new Set(linkRows.map((l) => l.company_id).filter((v): v is string => Boolean(v)));
  const projectIds = new Set(linkRows.map((l) => l.project_id).filter((v): v is string => Boolean(v)));

  const [companies, projects] = await Promise.all([
    companyIds.size
      ? supabase.from('arpa_companies').select('id, legal_name').in('id', [...companyIds])
      : Promise.resolve({ data: [], error: null }),
    projectIds.size
      ? supabase.from('arpa_projects').select('id, company_id, arpa_companies(legal_name)').in('id', [...projectIds])
      : Promise.resolve({ data: [], error: null }),
  ]);

  const companyName = new Map(
    ((companies.data ?? []) as { id: string; legal_name: string }[]).map((c) => [c.id, c.legal_name]),
  );
  const projectName = new Map(
    ((projects.data ?? []) as unknown as { id: string; arpa_companies: { legal_name: string } | null }[]).map((p) => [
      p.id,
      p.arpa_companies?.legal_name ?? null,
    ]),
  );

  const touches = new Map<string, { n: number; last: string | null }>();
  for (const r of (interactions.data ?? []) as { stakeholder_id: string | null; happened_at: string }[]) {
    if (!r.stakeholder_id) continue;
    const cur = touches.get(r.stakeholder_id) ?? { n: 0, last: null };
    cur.n += 1;
    if (!cur.last || r.happened_at > cur.last) cur.last = r.happened_at;
    touches.set(r.stakeholder_id, cur);
  }

  const kindCounts = new Map<string, number>();
  for (const r of (kindRows.data ?? []) as { kind: string }[]) {
    kindCounts.set(r.kind, (kindCounts.get(r.kind) ?? 0) + 1);
  }

  return {
    rows: people_.map((p) => {
      const t = touches.get(p.id);
      return {
        ...p,
        links: linkRows
          .filter((l) => l.stakeholder_id === p.id)
          .map((l) => ({
            id: l.id,
            role: l.role,
            is_primary: l.is_primary,
            company_id: l.company_id,
            project_id: l.project_id,
            company_name: l.project_id
              ? projectName.get(l.project_id) ?? null
              : l.company_id
                ? companyName.get(l.company_id) ?? null
                : null,
            project_id_for_link: l.project_id,
          })),
        interaction_count: t?.n ?? 0,
        last_interaction_at: t?.last ?? null,
      };
    }),
    total: people_.length,
    kinds: [...kindCounts.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Agenda.
//
// There is no separate task table. An agenda item IS the `next_step` of an
// interaction, which is the only way a next step can never disagree with the
// conversation that produced it. The cost is that a next step is closed by
// stamping `next_step_done_at`, not by deleting anything, so the trail survives.
// ─────────────────────────────────────────────────────────────────────────────

export interface AgendaItem {
  id: string;
  next_step: string;
  /** Date only, so comparisons must be on `YYYY-MM-DD` strings, not Date objects. */
  next_step_due: string | null;
  happened_at: string;
  summary: string | null;
  stakeholder_id: string | null;
  stakeholder_name: string | null;
  project_id: string | null;
  company_name: string | null;
  /** True when the due date is today or has passed. Null dates are never overdue. */
  overdue: boolean;
}

export async function getAgenda(): Promise<AgendaItem[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('arpa_interactions')
    .select(
      'id, next_step, next_step_due, happened_at, summary, stakeholder_id, project_id, company_id, arpa_stakeholders(full_name)',
    )
    .not('next_step', 'is', null)
    .is('next_step_done_at', null)
    .order('next_step_due', { ascending: true, nullsFirst: false })
    .limit(200);

  if (error) throw new Error(`arpa_interactions agenda: ${error.message}`);

  const rows = (data ?? []) as unknown as {
    id: string;
    next_step: string | null;
    next_step_due: string | null;
    happened_at: string;
    summary: string | null;
    stakeholder_id: string | null;
    project_id: string | null;
    company_id: string | null;
    arpa_stakeholders: { full_name: string } | null;
  }[];

  // One extra pass for the company name, which is what a person reading the
  // agenda actually recognises. The project id alone is unreadable.
  const projectIds = [...new Set(rows.map((r) => r.project_id).filter((v): v is string => Boolean(v)))];
  const companyIds = [...new Set(rows.map((r) => r.company_id).filter((v): v is string => Boolean(v)))];

  const [projects, companies] = await Promise.all([
    projectIds.length
      ? supabase.from('arpa_projects').select('id, arpa_companies(legal_name)').in('id', projectIds)
      : Promise.resolve({ data: [], error: null }),
    companyIds.length
      ? supabase.from('arpa_companies').select('id, legal_name').in('id', companyIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const byProject = new Map(
    ((projects.data ?? []) as unknown as { id: string; arpa_companies: { legal_name: string } | null }[]).map((p) => [
      p.id,
      p.arpa_companies?.legal_name ?? null,
    ]),
  );
  const byCompany = new Map(
    ((companies.data ?? []) as { id: string; legal_name: string }[]).map((c) => [c.id, c.legal_name]),
  );

  const today = new Date().toISOString().slice(0, 10);

  return rows
    .filter((r): r is typeof r & { next_step: string } => Boolean(r.next_step?.trim()))
    .map((r) => ({
      id: r.id,
      next_step: r.next_step,
      next_step_due: r.next_step_due,
      happened_at: r.happened_at,
      summary: r.summary,
      stakeholder_id: r.stakeholder_id,
      stakeholder_name: r.arpa_stakeholders?.full_name ?? null,
      project_id: r.project_id,
      company_name:
        (r.project_id ? byProject.get(r.project_id) : null) ??
        (r.company_id ? byCompany.get(r.company_id) : null) ??
        null,
      overdue: r.next_step_due !== null && r.next_step_due <= today,
    }));
}

/**
 * Companies and their project, for the "link to" picker on the CRM page.
 *
 * `stage` comes along so the picker can put the companies already in the
 * pipeline above the ones that were only just imported. After a SABI upload the
 * list is hundreds of names long and the handful being worked on are the ones
 * anybody is adding a contact to.
 */
export async function getLinkTargets(): Promise<
  { company_id: string; project_id: string | null; legal_name: string; stage: string | null }[]
> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('arpa_companies')
    .select('id, legal_name, arpa_projects(id, stage)')
    .order('legal_name');

  if (error) throw new Error(`arpa_companies targets: ${error.message}`);

  type Row = { id: string; legal_name: string; arpa_projects: { id: string; stage: string }[] };

  return ((data ?? []) as unknown as Row[]).map((c) => ({
    company_id: c.id,
    project_id: c.arpa_projects[0]?.id ?? null,
    legal_name: c.legal_name,
    stage: c.arpa_projects[0]?.stage ?? null,
  }));
}
