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

export interface ProjectDetail {
  project: ProjectRecord;
  company: CompanyRecord;
  taxonomy: TaxonomyRow | null;
  scores: ScoreRecord[];
  killFlags: KillFlagRecord[];
  stakeholders: StakeholderRecord[];
  interactions: InteractionRecord[];
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

  const [taxRows, scores, flags, links, interactions] = await Promise.all([
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
  ]);

  const taxonomy = taxonomyById(company.taxonomy_id, (taxRows.data ?? []) as { id: number; subsector: string }[]);

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
    scoringInput: toScoringInput(project as ProjectRecord, company as CompanyRecord, taxonomy),
  };
}
