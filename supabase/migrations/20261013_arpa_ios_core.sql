-- ─────────────────────────────────────────────────────────────────────────────
-- IOS v0.0.0, phases 1 and 2. See docs/ios-v0.md.
--
-- Ignasi's model has three static entities, not one: companies, TEMÁTICAS (the
-- investment theses) and INDUSTRIAS (the taxonomy). A project is what you get
-- when you put one of each together, and a project is the only thing that
-- moves.
--
-- Two shapes change here:
--
--   1. Temáticas get a table, and the taxonomy gets the columns ARPA actually
--      reasons with: their own pre-score of a subsector, its typical margin,
--      the CNAE codes that find it in SABI, and the keywords that find it on
--      the web.
--   2. A project stops being about exactly one company. "Podries tenir un deal
--      que sigui de tres companyies": a buy-and-build is one deal over several
--      targets.
--
-- Everything here is additive. `arpa_projects.company_id` SURVIVES as the
-- primary company, so the two views and all eleven existing queries keep
-- working. Dropping it is a later migration, once nothing reads it. A migration
-- that drops the column and rewrites every query at once has no safe half-way
-- state, and this database is live.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Temáticas ────────────────────────────────────────────────────────────────
--
-- Deliberately small. Ignasi said "dues o tres jugades", so this is a short,
-- fairly static list that ARPA maintains by hand, closer to the taxonomy than
-- to a transactional table. Hence a serial id, matching arpa_taxonomy, rather
-- than a uuid.
--
-- No seed rows. The temáticas are ARPA's own content and they are sending them.
-- Inventing plausible-looking ones has already cost a round of rework here.
create table if not exists public.arpa_themes (
  id          serial primary key,
  name        text not null,
  slug        text not null,
  thesis      text,
  -- What has to be true of a company for this play to work on it. Free text on
  -- purpose: it is the screening prompt, not a filter.
  fit_criteria text,
  active      boolean not null default true,
  sort        smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists arpa_themes_slug_key on public.arpa_themes (slug);

comment on table public.arpa_themes is
  'Investment theses (temáticas), for example relevo generacional. Two or three, maintained by hand. One third of what defines a project.';

-- ── The taxonomy learns what ARPA thinks ─────────────────────────────────────
--
-- It already carries the market's shape (growth, fragmentation, consolidation).
-- What was missing is ARPA's own opinion and the two things that make a
-- subsector findable.
alter table public.arpa_taxonomy
  -- 0-100, typed by ARPA, NOT computed. It is the prior they bring to a
  -- subsector before any company is attached, which is exactly what makes the
  -- proactive origination path possible: pick the subsector first, then go
  -- looking for names.
  add column if not exists pre_score          smallint,
  add column if not exists margin_typical_pct numeric,
  -- Finds the subsector in a SABI or Orbis query.
  add column if not exists cnae_codes         text[],
  -- Finds it on the open web, and feeds the comparables search.
  add column if not exists keywords           text[],
  add column if not exists notes              text,
  add column if not exists active             boolean not null default true;

alter table public.arpa_taxonomy
  drop constraint if exists arpa_taxonomy_pre_score_check;
alter table public.arpa_taxonomy
  add constraint arpa_taxonomy_pre_score_check
  check (pre_score is null or pre_score between 0 and 100);

comment on column public.arpa_taxonomy.pre_score is
  'ARPA''s own interest in the subsector, 0-100, typed by hand. Not derived from any company.';

-- ── A project declares its own temática and its own industria ────────────────
--
-- The industry was being read off the primary company. That breaks the moment a
-- project holds three companies, and it is backwards anyway: in the proactive
-- path ARPA chooses the subsector BEFORE it knows the companies.
alter table public.arpa_projects
  add column if not exists theme_id    integer references public.arpa_themes (id) on delete set null,
  add column if not exists taxonomy_id integer references public.arpa_taxonomy (id) on delete set null;

-- Backfill from the primary company, so no project loses the industry it
-- already showed on screen.
update public.arpa_projects p
set taxonomy_id = c.taxonomy_id
from public.arpa_companies c
where c.id = p.company_id
  and p.taxonomy_id is null
  and c.taxonomy_id is not null;

create index if not exists arpa_projects_theme_id_idx on public.arpa_projects (theme_id);
create index if not exists arpa_projects_taxonomy_id_idx on public.arpa_projects (taxonomy_id);

-- ── A project can hold several companies ─────────────────────────────────────
create table if not exists public.arpa_project_companies (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.arpa_projects (id) on delete cascade,
  company_id uuid not null references public.arpa_companies (id) on delete cascade,
  -- Which part the company plays in the deal.
  role       text not null default 'Target'
             check (role in ('Platform', 'Add-on', 'Target', 'Carve-out', 'Comparable')),
  -- Exactly one per project, the one whose name the deal is known by. Enforced
  -- by the partial unique index below, not by convention.
  is_primary boolean not null default false,
  note       text,
  created_at timestamptz not null default now()
);

create unique index if not exists arpa_project_companies_pair_key
  on public.arpa_project_companies (project_id, company_id);

create unique index if not exists arpa_project_companies_one_primary_key
  on public.arpa_project_companies (project_id) where is_primary;

create index if not exists arpa_project_companies_company_idx
  on public.arpa_project_companies (company_id);

comment on table public.arpa_project_companies is
  'The many-to-many between a deal and its companies. A buy-and-build is one project over several targets. arpa_projects.company_id still names the primary one until every query reads this table instead.';

-- Backfill: one row per existing project, its current company, primary.
insert into public.arpa_project_companies (project_id, company_id, role, is_primary)
select p.id, p.company_id, 'Target', true
from public.arpa_projects p
where p.company_id is not null
on conflict (project_id, company_id) do nothing;

-- ── The pipeline view carries the temática ───────────────────────────────────
--
-- Appended at the end and with every existing column left in place, because
-- arpa_sourcing is built on this view and CREATE OR REPLACE only tolerates new
-- columns at the end.
--
-- sector and subsector now prefer the PROJECT's industry and fall back to the
-- primary company's, which is the whole point of the column added above.
create or replace view public.arpa_pipeline as
with latest as (
  select distinct on (s.project_id, s.model)
    s.project_id, s.model, s.total_0_100, s.verdict, s.vetoed, s.scored_at, s.scored_by
  from public.arpa_scores s
  order by s.project_id, s.model, s.scored_at desc
)
select
  p.id,
  p.code,
  p.stage,
  p.decision_status,
  p.pass_reason,
  p.owner,
  p.updated_at,
  c.id as company_id,
  c.legal_name,
  c.region,
  c.ownership_type,
  coalesce(pt.sector, t.sector) as sector,
  coalesce(pt.subsector, t.subsector) as subsector,
  coalesce(p.ebitda_norm, p.ebitda_y3) as ebitda_ref,
  coalesce(p.ebitda_norm, p.ebitda_y3) * p.entry_multiple as ev,
  coalesce(p.ebitda_norm, p.ebitda_y3) * p.entry_multiple - p.net_debt as equity,
  p.seller_exp_ev - coalesce(p.ebitda_norm, p.ebitda_y3) * p.entry_multiple as valuation_gap,
  max(case when l.model = 'qss' then l.total_0_100 end) as qss,
  max(case when l.model = 'om'  then l.total_0_100 end) as om,
  max(case when l.model = 'pfr' then l.total_0_100 end) as pfr,
  max(l.scored_at) as last_scored_at,
  bool_or(l.vetoed) as has_veto,
  p.theme_id,
  th.name as theme_name,
  coalesce(p.taxonomy_id, c.taxonomy_id) as taxonomy_id,
  coalesce(pt.pre_score, t.pre_score) as industry_pre_score,
  (select count(*)::int from public.arpa_project_companies pc where pc.project_id = p.id) as company_count
from public.arpa_projects p
join public.arpa_companies c on c.id = p.company_id
left join public.arpa_taxonomy t on t.id = c.taxonomy_id
left join public.arpa_taxonomy pt on pt.id = p.taxonomy_id
left join public.arpa_themes th on th.id = p.theme_id
left join latest l on l.project_id = p.id
group by p.id, c.id, t.sector, t.subsector, t.pre_score, pt.sector, pt.subsector, pt.pre_score, th.name;

comment on view public.arpa_pipeline is
  'One row per project with its latest scores, its temática and its industry. Backs the Pipeline tab and arpa_sourcing.';
