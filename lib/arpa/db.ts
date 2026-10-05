import { createClient } from '@/lib/supabase/server';
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
  last_scored_at: string | null;
  has_veto: boolean | null;
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
  code: string | null;
  stage: string;
  decision_status: string | null;
  pass_reason: PassReason | null;
  source: string | null;
  owner: string | null;
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

export interface OriginationRow {
  id: number;
  reg_key: string;
  legal_name: string;
  province: string;
  hoja: string | null;
  sector: string | null;
  subsector: string | null;
  objeto: string | null;
  objeto_date: string | null;
  cnae: string | null;
  role: string | null;
  principal: boolean;
  patrimonial: boolean;
  signals: string[];
  signal_count: number;
  signal_score: number;
  prep_count: number;
  done_count: number;
  /** sold | lead | early | none. Generated in the database from the two counts. */
  phase: string;
  first_signal_at: string | null;
  last_signal_at: string | null;
  status: string;
  project_id: string | null;
  note: string | null;
}

export interface OriginationFilters {
  province?: string;
  subsector?: string;
  status?: string;
  /** lead | early | sold. Omitted shows every phase. */
  phase?: string;
}

export interface OriginationView {
  rows: OriginationRow[];
  total: number;
  provinces: string[];
  subsectors: string[];
  /** Row counts per phase over the whole table, not just the page. */
  phases: { lead: number; early: number; sold: number; none: number };
}

const ORIGINATION_PAGE = 300;
const FACET_PAGE = 1000;

/**
 * The origination feed, loaded by scripts/borme-load.mjs out of BORME.
 *
 * Ranked by RECENCY of the first preparation act, not by how many signals
 * fired. The publication lag is 7 days median, so a company whose first act
 * appeared last week has probably not mandated an advisor yet. By the time
 * three acts have clustered the process is well advanced and contested, so a
 * loud row is a WORSE lead than a quiet recent one.
 *
 * The facet lists come from a separate thin select rather than from `rows`,
 * because `rows` is capped and the filter chips must still show every option.
 */
export async function getOrigination(filters: OriginationFilters = {}): Promise<OriginationView> {
  const supabase = createClient();

  let q = supabase
    .from('arpa_origination')
    .select('*', { count: 'exact' })
    .order('first_signal_at', { ascending: false, nullsFirst: false })
    .order('prep_count', { ascending: false })
    .order('legal_name')
    .limit(ORIGINATION_PAGE);

  if (filters.province) q = q.eq('province', filters.province);
  if (filters.subsector) q = q.eq('subsector', filters.subsector);
  if (filters.status) q = q.eq('status', filters.status);
  if (filters.phase) q = q.eq('phase', filters.phase);

  // PostgREST caps an unbounded select at 1,000 rows, so the single facet read
  // only saw a fifth of the table and the province list came out different on
  // every request. Page through it. The three columns are small, and this also
  // gives the "con señal" count without a separate `head: true` request, which
  // returned 0 in production because the count only travels in the
  // `Content-Range` response header and nothing guarantees it survives a HEAD
  // through the proxy.
  const facetRows: { province: string; subsector: string | null; phase: string }[] = [];
  for (let from = 0; ; from += FACET_PAGE) {
    const page = await supabase
      .from('arpa_origination')
      .select('province, subsector, phase')
      .range(from, from + FACET_PAGE - 1);
    if (page.error) throw new Error(`arpa_origination facets: ${page.error.message}`);
    const rows = (page.data ?? []) as typeof facetRows;
    facetRows.push(...rows);
    if (rows.length < FACET_PAGE) break;
  }

  const list = await q;
  if (list.error) throw new Error(`arpa_origination: ${list.error.message}`);

  const count = (p: string) => facetRows.filter((r) => r.phase === p).length;

  return {
    rows: (list.data ?? []) as OriginationRow[],
    total: list.count ?? 0,
    provinces: [...new Set(facetRows.map((r) => r.province))].sort(),
    subsectors: [...new Set(facetRows.map((r) => r.subsector).filter((s): s is string => Boolean(s)))].sort(),
    phases: { lead: count('lead'), early: count('early'), sold: count('sold'), none: count('none') },
  };
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
    .select('id, full_name, org, kind, email, phone, linkedin, city, notes')
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

/** Companies and their project, for the "link to" picker on the CRM page. */
export async function getLinkTargets(): Promise<{ company_id: string; project_id: string | null; legal_name: string }[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('arpa_companies')
    .select('id, legal_name, arpa_projects(id)')
    .order('legal_name');

  if (error) throw new Error(`arpa_companies targets: ${error.message}`);

  return ((data ?? []) as unknown as { id: string; legal_name: string; arpa_projects: { id: string }[] }[]).map((c) => ({
    company_id: c.id,
    project_id: c.arpa_projects[0]?.id ?? null,
    legal_name: c.legal_name,
  }));
}
