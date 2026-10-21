/**
 * Reads for V2. Every `ios_*` query the `app/v2` screens make lives here.
 *
 * Same shape as `lib/arpa/db.ts`: exported row interfaces, errors thrown with the
 * table name in front, and an explicit paging loop because PostgREST caps an
 * unbounded select at 1,000 rows and says nothing about it. The catalogue is
 * 1,179 rows today, so the cap is not hypothetical: without the loop the Sourcing
 * screen would be short and the facet counts would be wrong.
 *
 * The weighted score and the A/B/C tier are attached here by calling
 * `industryScore` and `industryTier`, not read from a column, because
 * `ios_industries` deliberately stores neither. One implementation, pinned to
 * ARPA's own numbers by `industries.test.ts`.
 */
import { createClient } from '@/lib/supabase/server';

import { industryScore, industryTier, type IndustryTier } from './industries.ts';
import type { GateFacts } from './gates.ts';
import type {
  ClosingStatus,
  DocStatus,
  DocType,
  FullDdStatus,
  GateDecision,
  GateDecisionStatus,
  LoiStatus,
  Stage,
} from './lists.ts';

const PAGE = 1000;

/** Every row of a table or view, in pages of 1,000. */
async function fetchAll<T>(
  table: string,
  select: string,
  order: { column: string; ascending?: boolean },
): Promise<T[]> {
  const supabase = createClient();
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await supabase
      .from(table)
      .select(select)
      .order(order.column, { ascending: order.ascending ?? true })
      .range(from, from + PAGE - 1);
    if (page.error) throw new Error(`${table}: ${page.error.message}`);
    const got = (page.data ?? []) as T[];
    all.push(...got);
    if (got.length < PAGE) break;
  }
  return all;
}

// ---------------------------------------------------------------- industries

export interface IosIndustry {
  id: string;
  subsector: string;
  industry: string;
  sector: string;
  growth_attractiveness: string | null;
  fragmentation: string | null;
  consolidation_potential: string | null;
  market_growth: number;
  fragmentation_addons: number;
  target_density: number;
  margin_profile: number;
  recurring_revenue: number;
  barriers: number;
  succession: number;
  risk_low_is_5: number;
  source_rank: number | null;
  investment_thesis: string | null;
  key_risks: string | null;
  spanish_clusters: string | null;
  /** Derived, never stored. */
  score: number;
  tier: IndustryTier;
}

/** The 100 subsectors, best score first. */
export async function getIosIndustries(): Promise<IosIndustry[]> {
  const rows = await fetchAll<Omit<IosIndustry, 'score' | 'tier'>>(
    'ios_industries',
    '*',
    { column: 'subsector' },
  );
  return rows
    .map((r) => {
      const score = industryScore(r);
      return { ...r, score, tier: industryTier(score) };
    })
    .sort((a, b) => b.score - a.score || a.subsector.localeCompare(b.subsector, 'es'));
}

// -------------------------------------------------------------------- theses

export interface IosThesis {
  id: string;
  code: string;
  name: string;
  scope: string;
  category: string | null;
  structural_driver: string | null;
  primary_strategy: string | null;
  description: string | null;
  value_creation_levers: string[];
  ideal_target_profile: string | null;
  key_screening_risks: string | null;
  priority: string | null;
  status: string;
  mandate_fit: string | null;
  geographic_focus: string | null;
  target_ebitda_eur_m: string | null;
  target_revenue_eur_m: string | null;
  evidence_status: string | null;
  /** Subsector names, sorted. Empty for the 17 Cross-sector theses. */
  subsectors: string[];
}

/**
 * The 140 theses with their subsectors. The 17 Cross-sector ones come back with
 * an empty array, which is their sheet's intent, so the screen must show them
 * rather than treat the gap as missing data.
 */
export async function getIosTheses(): Promise<IosThesis[]> {
  type Raw = Omit<IosThesis, 'subsectors'> & {
    ios_thesis_subsectors: { ios_industries: { subsector: string } | null }[];
  };
  const rows = await fetchAll<Raw>(
    'ios_theses',
    '*, ios_thesis_subsectors(ios_industries(subsector))',
    { column: 'code' },
  );
  return rows.map(({ ios_thesis_subsectors, ...t }) => ({
    ...t,
    subsectors: ios_thesis_subsectors
      .map((l) => l.ios_industries?.subsector)
      .filter((s): s is string => !!s)
      .sort((a, b) => a.localeCompare(b, 'es')),
  }));
}

// ---------------------------------------------------------------- archetypes

export interface IosArchetype {
  id: string;
  name: string;
  industry_id: string;
  archetype_no: number | null;
  what_it_does: string | null;
  revenue_model: string | null;
  typical_ebitda_margin: number | null;
  pe_role: string | null;
  cnae_codes: string[];
  sabi_keywords: string[];
  subsector: string | null;
  sector: string | null;
}

export async function getIosArchetypes(): Promise<IosArchetype[]> {
  type Raw = Omit<IosArchetype, 'subsector' | 'sector'> & {
    ios_industries: { subsector: string; sector: string } | null;
  };
  const rows = await fetchAll<Raw>(
    'ios_archetypes',
    '*, ios_industries(subsector, sector)',
    { column: 'name' },
  );
  return rows.map(({ ios_industries, ...a }) => ({
    ...a,
    subsector: ios_industries?.subsector ?? null,
    sector: ios_industries?.sector ?? null,
  }));
}

// ------------------------------------------------------------- the long list

export interface IosCompany {
  id: string;
  name: string;
  country: string;
  autonomous_community: string | null;
  province: string | null;
  status: string;
  origin_type: string | null;
  ownership_type: string | null;
  website: string | null;
  revenue_estimate_eur_m: number | null;
  ebitda_estimate_eur_m: number | null;
  source_confidence: string | null;
  research_notes: string | null;
  subsector: string | null;
  archetype: string | null;
  source: string | null;
}

export async function getIosLongList(): Promise<IosCompany[]> {
  type Raw = Omit<IosCompany, 'subsector' | 'archetype' | 'source'> & {
    ios_industries: { subsector: string } | null;
    ios_archetypes: { name: string } | null;
    ios_sources: { name: string } | null;
  };
  const rows = await fetchAll<Raw>(
    'ios_companies',
    '*, ios_industries(subsector), ios_archetypes(name), ios_sources(name)',
    { column: 'name' },
  );
  return rows.map(({ ios_industries, ios_archetypes, ios_sources, ...c }) => ({
    ...c,
    subsector: ios_industries?.subsector ?? null,
    archetype: ios_archetypes?.name ?? null,
    source: ios_sources?.name ?? null,
  }));
}

export interface IosSource {
  id: string;
  name: string;
  source_type: string | null;
  url: string | null;
  notes: string | null;
}

export async function getIosSources(): Promise<IosSource[]> {
  return fetchAll<IosSource>('ios_sources', '*', { column: 'name' });
}

// ------------------------------------------------------------------ projects

export interface IosProject {
  id: string;
  name: string;
  code: string | null;
  project_type: string;
  stage: Stage;
  stage_status: string;
  stage_entered_at: string;
  project_status: string;
  priority: string | null;
  owner: string | null;
  thesis_id: string | null;
  thesis_fit: string | null;
  primary_strategy: string | null;
  industry_id: string | null;
  origin_type: string | null;
  loi_status: LoiStatus;
  full_dd_status: FullDdStatus;
  closing_status: ClosingStatus;
  open_required_dd_items: number;
  next_step: string | null;
  next_step_due: string | null;
  review_date: string | null;
  pass_lost_reason: string | null;
  decisive_evidence: string | null;
  notes: string | null;
  updated_at: string;
  thesis_code: string | null;
  thesis_name: string | null;
  subsector: string | null;
}

type RawProject = Omit<IosProject, 'thesis_code' | 'thesis_name' | 'subsector'> & {
  ios_theses: { code: string; name: string } | null;
  ios_industries: { subsector: string } | null;
};

const PROJECT_SELECT = '*, ios_theses(code, name), ios_industries(subsector)';

function flattenProject(r: RawProject): IosProject {
  const { ios_theses, ios_industries, ...p } = r;
  return {
    ...p,
    thesis_code: ios_theses?.code ?? null,
    thesis_name: ios_theses?.name ?? null,
    subsector: ios_industries?.subsector ?? null,
  };
}

export async function getIosProjects(): Promise<IosProject[]> {
  const rows = await fetchAll<RawProject>('ios_projects', PROJECT_SELECT, {
    column: 'updated_at',
    ascending: false,
  });
  return rows.map(flattenProject);
}

export interface IosDocument {
  id: string;
  project_id: string;
  doc_type: DocType;
  doc_status: DocStatus;
  version: number;
  title: string | null;
  confidentiality: string;
  url: string | null;
  notes: string | null;
  approved_at: string | null;
  approved_by: string | null;
  updated_at: string;
}

export interface IosPerimeterRow {
  id: string;
  company_id: string;
  role: string;
  inclusion_status: string;
  notes: string | null;
  company_name: string;
  subsector: string | null;
  province: string | null;
  revenue_estimate_eur_m: number | null;
}

export interface IosDecision {
  id: string;
  project_id: string;
  gate: Stage;
  decision: GateDecision;
  decision_type: string;
  status: GateDecisionStatus;
  rationale: string;
  decided_at: string;
  decided_by: string | null;
  gate_ready_at_decision: boolean;
  gate_ready_detail: { id: string; label: string; ok: boolean }[] | null;
  blocked_reason: string | null;
  stage_before: string;
  stage_after: string | null;
  project_status_before: string;
  project_status_after: string | null;
  pass_lost_reason: string | null;
  decisive_evidence: string | null;
}

export interface IosProjectDetail {
  project: IosProject;
  facts: GateFacts;
  documents: IosDocument[];
  perimeter: IosPerimeterRow[];
  decisions: IosDecision[];
}

/** Null when the id is not a project, so the page can call notFound(). */
export async function getIosProjectDetail(id: string): Promise<IosProjectDetail | null> {
  const supabase = createClient();

  const project = await supabase
    .from('ios_projects')
    .select(PROJECT_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (project.error) throw new Error(`ios_projects: ${project.error.message}`);
  if (!project.data) return null;

  const [facts, documents, perimeter, decisions] = await Promise.all([
    getGateFacts(id),
    supabase
      .from('ios_documents')
      .select('*')
      .eq('project_id', id)
      .order('doc_type')
      .order('version', { ascending: false }),
    supabase
      .from('ios_project_companies')
      .select('*, ios_companies(name, province, revenue_estimate_eur_m, ios_industries(subsector))')
      .eq('project_id', id)
      .order('role'),
    supabase
      .from('ios_gate_decisions')
      .select('*')
      .eq('project_id', id)
      .order('decided_at', { ascending: false }),
  ]);

  if (documents.error) throw new Error(`ios_documents: ${documents.error.message}`);
  if (perimeter.error) throw new Error(`ios_project_companies: ${perimeter.error.message}`);
  if (decisions.error) throw new Error(`ios_gate_decisions: ${decisions.error.message}`);
  if (!facts) throw new Error(`ios_project_gate_facts: no row for project ${id}`);

  type RawPerimeter = Omit<
    IosPerimeterRow,
    'company_name' | 'subsector' | 'province' | 'revenue_estimate_eur_m'
  > & {
    ios_companies: {
      name: string;
      province: string | null;
      revenue_estimate_eur_m: number | null;
      ios_industries: { subsector: string } | null;
    } | null;
  };

  return {
    project: flattenProject(project.data as unknown as RawProject),
    facts,
    documents: (documents.data ?? []) as IosDocument[],
    perimeter: ((perimeter.data ?? []) as unknown as RawPerimeter[]).map(
      ({ ios_companies, ...p }) => ({
        ...p,
        company_name: ios_companies?.name ?? '(sin nombre)',
        province: ios_companies?.province ?? null,
        revenue_estimate_eur_m: ios_companies?.revenue_estimate_eur_m ?? null,
        subsector: ios_companies?.ios_industries?.subsector ?? null,
      }),
    ),
    decisions: (decisions.data ?? []) as IosDecision[],
  };
}

/**
 * The gate's inputs for one project, straight from `ios_project_gate_facts`.
 * Pass the result to `gateReady()`: the view holds no rule and this function adds
 * none.
 */
export async function getGateFacts(projectId: string): Promise<GateFacts | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('ios_project_gate_facts')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw new Error(`ios_project_gate_facts: ${error.message}`);
  return (data as GateFacts | null) ?? null;
}

/** Every project's gate inputs at once, for the Mi trabajo screen. */
export async function getAllGateFacts(): Promise<(GateFacts & { project_id: string })[]> {
  return fetchAll<GateFacts & { project_id: string }>('ios_project_gate_facts', '*', {
    column: 'project_id',
  });
}

export interface IosDocumentWithProject extends IosDocument {
  project_name: string;
}

/** Documents sitting at one status, newest first. Mi trabajo asks for In Review. */
export async function getIosDocumentsByStatus(
  status: DocStatus,
): Promise<IosDocumentWithProject[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('ios_documents')
    .select('*, ios_projects(name)')
    .eq('doc_status', status)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`ios_documents: ${error.message}`);
  type Raw = IosDocument & { ios_projects: { name: string } | null };
  return ((data ?? []) as unknown as Raw[]).map(({ ios_projects, ...d }) => ({
    ...d,
    project_name: ios_projects?.name ?? '(proyecto borrado)',
  }));
}

export interface IosDecisionLogRow extends IosDecision {
  project_name: string;
}

/** The decision log, newest first, Blocked rows included on purpose. */
export async function getIosDecisions(limit = 200): Promise<IosDecisionLogRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('ios_gate_decisions')
    .select('*, ios_projects(name)')
    .order('decided_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`ios_gate_decisions: ${error.message}`);
  type Raw = IosDecision & { ios_projects: { name: string } | null };
  return ((data ?? []) as unknown as Raw[]).map(({ ios_projects, ...d }) => ({
    ...d,
    project_name: ios_projects?.name ?? '(proyecto borrado)',
  }));
}
