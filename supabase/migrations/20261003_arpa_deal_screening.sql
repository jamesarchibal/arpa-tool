-- ARPA Partners · deal screening and scoring.
--
-- Own Postgres. No Airtable, no Microsoft, no SABI. Decided 2026-10-03.
-- Financials are entered by hand or pasted, or loaded from a Registro Mercantil
-- XBRL deposit bought per company. There is no bulk provider feed.
--
-- Every table is prefixed arpa_ so the whole module can be lifted into its own
-- Supabase project later without renaming anything.
--
-- Scoring runs on the 0-100 scale (decision 4). The 1-5 criterion scores the
-- blueprint defines are kept as the input unit, because the Scoring_Model sheet
-- is built on 1-5; the 0-100 total is derived as weighted_1_5 * 20. Storing both
-- means neither scale has to be reverse engineered later.

-- ─────────────────────────────────────────────────────────────────────────────
-- Reference: Industry_Taxonomy, 20 rows, verbatim from the workbook v4.
-- growth / fragmentation / consolidation are the sheet's own H/M/L ratings and
-- feed the OM "market attractiveness" auto score.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.arpa_taxonomy (
  id             serial primary key,
  sector         text not null,          -- Agribusiness | Industrial Products
  category       text not null,
  subsector      text not null,
  growth         text not null check (growth in ('H','M','L')),
  fragmentation  text not null check (fragmentation in ('H','M','L')),
  consolidation  text not null check (consolidation in ('H','M','L')),
  unique (sector, category, subsector)
);

insert into public.arpa_taxonomy (sector, category, subsector, growth, fragmentation, consolidation) values
  ('Agribusiness','Primary Agriculture','Olives / olive oil farming','M','M','M'),
  ('Agribusiness','Primary Agriculture','Citrus / fruit production','M','H','M'),
  ('Agribusiness','Agricultural Inputs','Fertilizers / soil enhancers','M','M','H'),
  ('Agribusiness','Agricultural Inputs','Biological inputs / biostimulants','H','M','H'),
  ('Agribusiness','Irrigation & Water','Drip irrigation systems','H','M','H'),
  ('Agribusiness','Irrigation & Water','Pumps / filtration / dosing','H','M','H'),
  ('Agribusiness','Agri Equipment','Specialized farm machinery','M','H','M'),
  ('Agribusiness','Agri Processing','Olive oil mills / processing','M','M','M'),
  ('Agribusiness','Agri Processing','Fruit / vegetable processing','M','M','M'),
  ('Agribusiness','Agri Services','Testing / certification / agronomic services','H','M','H'),
  ('Industrial Products','Industrial Components','Precision machined parts','M','H','M'),
  ('Industrial Products','Industrial Components','Valves / pumps / hydraulic systems','M','M','H'),
  ('Industrial Products','Manufacturing','Metal fabrication / stamping','L','H','M'),
  ('Industrial Products','Manufacturing','Technical plastics / injection molding','M','M','M'),
  ('Industrial Products','Packaging','Industrial packaging','M','M','H'),
  ('Industrial Products','Packaging','Food/agri packaging','M','M','H'),
  ('Industrial Products','Specialized Machinery','Food processing machinery','M','M','H'),
  ('Industrial Products','Specialized Machinery','Packaging machinery','M','M','H'),
  ('Industrial Products','Environmental Products','Filtration / recycling / waste systems','H','M','H'),
  ('Industrial Products','Energy Products','Electrical cabinets / solar mounting','M','M','M')
on conflict (sector, category, subsector) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Companies. The durable entity. A company can be revisited years later, so it
-- outlives any one project. CIF is the natural key for Spain and is what ties a
-- row to BORME events and to a Registro Mercantil deposit.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.arpa_companies (
  id              uuid primary key default gen_random_uuid(),
  legal_name      text not null,
  trade_name      text,
  cif             text unique,            -- null allowed: often unknown at first contact
  website         text,
  country         text not null default 'ES',
  region          text,                   -- comunidad autónoma / province
  city            text,
  taxonomy_id     integer references public.arpa_taxonomy (id),
  -- when the business sits outside the 20 rows, say so instead of forcing a fit
  taxonomy_fit    text not null default 'in' check (taxonomy_fit in ('in','adjacent','out')),
  cnae            text,
  employees       integer,
  founded_year    integer,
  -- Lists · Ownership Type, verbatim
  ownership_type  text check (ownership_type in (
                    'Founder-owned','Family-owned','Private equity',
                    'Corporate subsidiary','Public','Unknown')),
  -- free proxy for owner age: year the current administrador was first appointed
  admin_since     integer,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists arpa_companies_name_idx on public.arpa_companies (lower(legal_name));
create index if not exists arpa_companies_tax_idx  on public.arpa_companies (taxonomy_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Projects. One assessment of one company at one point in time. This is what
-- moves through the funnel and what carries the financials and the valuation.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.arpa_projects (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.arpa_companies (id) on delete cascade,
  code            text unique,             -- human handle, e.g. ARPA-2026-014
  -- Funnel_Stages, verbatim
  stage           text not null default 'Sourcing' check (stage in (
                    'Sourcing','Screening','Assessment',
                    'Preliminary Financial Review','Investment Case','Closed')),
  -- Lists · Decision Status, verbatim. Union of the three gate vocabularies.
  decision_status text check (decision_status in (
                    'Proceed','Continue','Monitor','Pass',
                    'Build Investment Case','Reprice')),
  -- Projects · Pass / Lost Reason, the 7 allowed values
  pass_reason     text check (pass_reason in (
                    'Too small','Weak business','Price gap','Financial issue',
                    'Seller not ready','Lost to competitor','Other')),
  source          text,                    -- who or what brought it in
  owner           text,                    -- ARPA-side lead, e.g. Marc

  -- Financials. Units are millions of EUR, always, so nothing has to be guessed.
  -- y1 is the oldest of the three years, y3 the most recent.
  revenue_y1      numeric(14,4),
  revenue_y2      numeric(14,4),
  revenue_y3      numeric(14,4),
  ebitda_y1       numeric(14,4),
  ebitda_y2       numeric(14,4),
  ebitda_y3       numeric(14,4),
  ebitda_norm     numeric(14,4),           -- normalised EBITDA, the reference figure
  capex           numeric(14,4),
  working_capital numeric(14,4),
  net_debt        numeric(14,4),
  recurring_pct   numeric(5,2),            -- 0-100
  customer_conc   text check (customer_conc in ('low','mid','high')),
  seller_motiv    smallint check (seller_motiv between 1 and 5),
  -- Lists · Confidence, verbatim
  data_confidence text check (data_confidence in ('Low','Medium','High')),
  financials_src  text,                    -- 'Registro Mercantil XBRL 2025', 'seller deck', ...

  -- Valuation chain, workbook v4: ev = ebitda_ref * entry_multiple,
  -- equity = ev - net_debt, gap = seller_expectation - ev.
  entry_multiple  numeric(6,2),
  seller_exp_ev   numeric(14,4),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists arpa_projects_company_idx on public.arpa_projects (company_id);
create index if not exists arpa_projects_stage_idx   on public.arpa_projects (stage, updated_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Scores. One row per (project, model) scoring event, never overwritten.
-- Marc scores when the team decides to (decision 3), so who and when are part
-- of the record and the history is auditable.
--
-- criteria holds the per-criterion detail as
--   { "<criterion_id>": { "w": 20, "score": 4, "auto": 4, "manual": null } }
-- so a later weight change does not silently rewrite past verdicts.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.arpa_scores (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.arpa_projects (id) on delete cascade,
  model          text not null check (model in ('qss','om','pfr')),
  total_1_5      numeric(4,2),             -- weighted mean on the blueprint's own scale
  total_0_100    smallint,                 -- what ARPA reads, = total_1_5 * 20
  verdict        text not null,            -- the gate text, e.g. 'Proceed' / 'Reprice'
  vetoed         boolean not null default false,
  criteria       jsonb not null default '{}'::jsonb,
  scored_by      text not null,
  scored_at      timestamptz not null default now(),
  note           text
);

create index if not exists arpa_scores_project_idx on public.arpa_scores (project_id, scored_at desc);
-- the current score for a model is simply the most recent row
create index if not exists arpa_scores_model_idx   on public.arpa_scores (project_id, model, scored_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Kill criteria. The 13 verbatim Kill Criteria from Funnel_Stages, as vetoes.
-- A ticked box forces that stage's gate to Pass regardless of the score.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.arpa_kill_flags (
  project_id  uuid not null references public.arpa_projects (id) on delete cascade,
  kill_id     text not null,               -- k1 .. k13, see lib/arpa/scoring.ts
  flagged     boolean not null default false,
  flagged_by  text,
  flagged_at  timestamptz not null default now(),
  note        text,
  primary key (project_id, kill_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Stakeholders. A light CRM, not a child table of projects (decision 5).
-- A banker or an advisor shows up across several deals, so the person is the
-- entity and the link carries the role. That is the difference he asked for.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.arpa_stakeholders (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  email       text,
  phone       text,
  linkedin    text,
  org         text,                        -- their employer, free text
  -- what they are to ARPA in general, independent of any one deal
  kind        text not null default 'Other' check (kind in (
                'Owner','Family member','Management','Advisor','Banker','Broker',
                'Lawyer','Accountant','Lender','Co-investor','Intermediary','Other')),
  city        text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists arpa_stakeholders_name_idx on public.arpa_stakeholders (lower(full_name));

-- A stakeholder links to a company, a project, or both. At least one is required.
create table if not exists public.arpa_stakeholder_links (
  id              uuid primary key default gen_random_uuid(),
  stakeholder_id  uuid not null references public.arpa_stakeholders (id) on delete cascade,
  company_id      uuid references public.arpa_companies (id) on delete cascade,
  project_id      uuid references public.arpa_projects (id) on delete cascade,
  role            text,                    -- role in THIS context, e.g. 'Seller', 'Sell-side advisor'
  is_primary      boolean not null default false,
  created_at      timestamptz not null default now(),
  constraint arpa_link_target check (company_id is not null or project_id is not null)
);

create index if not exists arpa_links_stakeholder_idx on public.arpa_stakeholder_links (stakeholder_id);
create index if not exists arpa_links_company_idx     on public.arpa_stakeholder_links (company_id);
create index if not exists arpa_links_project_idx     on public.arpa_stakeholder_links (project_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Interactions. Every touch, so the CRM half actually works.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.arpa_interactions (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid references public.arpa_projects (id) on delete cascade,
  company_id      uuid references public.arpa_companies (id) on delete cascade,
  stakeholder_id  uuid references public.arpa_stakeholders (id) on delete set null,
  kind            text not null default 'Note' check (kind in (
                    'Call','Meeting','Email','Message','Note','Site visit')),
  direction       text check (direction in ('inbound','outbound')),
  happened_at     timestamptz not null default now(),
  summary         text,
  detail          text,
  next_step       text,
  next_step_due   date,
  logged_by       text,
  created_at      timestamptz not null default now()
);

create index if not exists arpa_interactions_project_idx on public.arpa_interactions (project_id, happened_at desc);
create index if not exists arpa_interactions_due_idx     on public.arpa_interactions (next_step_due)
  where next_step_due is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Documents. Supabase Storage, not SharePoint. storage_path points at a bucket
-- object; nothing here reads inside the file, it only registers and links it.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.arpa_documents (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references public.arpa_projects (id) on delete cascade,
  company_id    uuid references public.arpa_companies (id) on delete cascade,
  title         text not null,
  doc_type      text not null default 'Other' check (doc_type in (
                  'Teaser','NDA','Info memo','Annual accounts','XBRL deposit',
                  'Management accounts','Valuation','LOI','Report','Other')),
  storage_path  text,                      -- bucket object key
  external_url  text,                      -- for things that live elsewhere
  period        text,                      -- e.g. 'FY2025'
  uploaded_by   text,
  created_at    timestamptz not null default now(),
  constraint arpa_doc_location check (storage_path is not null or external_url is not null)
);

create index if not exists arpa_documents_project_idx on public.arpa_documents (project_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at triggers
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.arpa_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists arpa_companies_touch    on public.arpa_companies;
drop trigger if exists arpa_projects_touch     on public.arpa_projects;
drop trigger if exists arpa_stakeholders_touch on public.arpa_stakeholders;

create trigger arpa_companies_touch    before update on public.arpa_companies
  for each row execute function public.arpa_touch_updated_at();
create trigger arpa_projects_touch     before update on public.arpa_projects
  for each row execute function public.arpa_touch_updated_at();
create trigger arpa_stakeholders_touch before update on public.arpa_stakeholders
  for each row execute function public.arpa_touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Pipeline view: one row per project with the latest score per model and the
-- derived valuation. Keeps the list page to a single query.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.arpa_pipeline as
with latest as (
  select distinct on (project_id, model)
    project_id, model, total_0_100, verdict, vetoed, scored_at, scored_by
  from public.arpa_scores
  order by project_id, model, scored_at desc
)
select
  p.id,
  p.code,
  p.stage,
  p.decision_status,
  p.pass_reason,
  p.owner,
  p.updated_at,
  c.id            as company_id,
  c.legal_name,
  c.region,
  c.ownership_type,
  t.sector,
  t.subsector,
  coalesce(p.ebitda_norm, p.ebitda_y3)                      as ebitda_ref,
  coalesce(p.ebitda_norm, p.ebitda_y3) * p.entry_multiple    as ev,
  coalesce(p.ebitda_norm, p.ebitda_y3) * p.entry_multiple
    - p.net_debt                                            as equity,
  p.seller_exp_ev - coalesce(p.ebitda_norm, p.ebitda_y3) * p.entry_multiple
                                                            as valuation_gap,
  max(case when l.model = 'qss' then l.total_0_100 end)      as qss,
  max(case when l.model = 'om'  then l.total_0_100 end)      as om,
  max(case when l.model = 'pfr' then l.total_0_100 end)      as pfr,
  max(l.scored_at)                                           as last_scored_at,
  bool_or(l.vetoed)                                          as has_veto
from public.arpa_projects p
join public.arpa_companies c on c.id = p.company_id
left join public.arpa_taxonomy t on t.id = c.taxonomy_id
left join latest l on l.project_id = p.id
group by p.id, c.id, t.sector, t.subsector;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS. Same shape as the rest of the dashboard: any authenticated user.
-- Tighten to an ARPA-specific role when the client gets their own logins.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.arpa_taxonomy          enable row level security;
alter table public.arpa_companies         enable row level security;
alter table public.arpa_projects          enable row level security;
alter table public.arpa_scores            enable row level security;
alter table public.arpa_kill_flags        enable row level security;
alter table public.arpa_stakeholders      enable row level security;
alter table public.arpa_stakeholder_links enable row level security;
alter table public.arpa_interactions      enable row level security;
alter table public.arpa_documents         enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'arpa_taxonomy','arpa_companies','arpa_projects','arpa_scores',
    'arpa_kill_flags','arpa_stakeholders','arpa_stakeholder_links',
    'arpa_interactions','arpa_documents'
  ]
  loop
    execute format('drop policy if exists "arpa read %1$s" on public.%1$I', t);
    execute format('drop policy if exists "arpa write %1$s" on public.%1$I', t);
    execute format(
      'create policy "arpa read %1$s" on public.%1$I for select to authenticated using (true)', t);
    execute format(
      'create policy "arpa write %1$s" on public.%1$I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
