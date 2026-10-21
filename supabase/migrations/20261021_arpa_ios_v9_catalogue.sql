-- V2 catalogue: ARPA's own IOS v9 library, seeded only from their workbook.
--
-- This is the read-only half of V2. Seven tables, all prefixed `ios_`, holding
-- the 1179 rows of `PE_Airtable_Projects_Build_Workbook_v9.xlsx`: 100 subsectors,
-- 140 theses, 486 thesis-subsector pairs, 173 target archetypes, 22 sources and
-- 258 long-list companies.
--
-- Why new tables instead of loading their content into `arpa_taxonomy` and
-- friends: V2 exists to be compared against V1 side by side. Merging their 100
-- subsectors into V1's taxonomy would mutate the thing we are comparing against
-- and make the comparison dishonest. Nothing here touches any `arpa_*` table.
--
-- Two rules this file follows on purpose:
--
--   1. Every table has a natural key with a unique index, so `scripts/ios-seed.ts`
--      can upsert and a second run changes nothing. The seed is a reload of their
--      Excel, not an append.
--   2. `ios_industries` stores the eight 1-5 ratings and NO weighted score and NO
--      tier. Both are derived in `lib/ios/industries.ts`, which is pinned to their
--      own `Check:` columns by test on all 100 rows. A stored copy would be a
--      second implementation, and two implementations drift.
--
-- No RLS: the app talks to Postgres with the service role through
-- `lib/supabase/server.ts` and does its own authorisation in `middleware.ts`,
-- exactly as V1 does.

-- ---------------------------------------------------------------- industries

create table if not exists ios_industries (
  id uuid primary key default gen_random_uuid(),
  subsector text not null,
  industry text not null,
  sector text not null,

  -- Their three editorial letters, kept because the Industrias screen shows them
  -- next to the numbers. They are commentary, not inputs to the score.
  growth_attractiveness text,
  fragmentation text,
  consolidation_potential text,

  -- The eight rated criteria, in the sheet's column order. 1 to 5, integers.
  -- `risk_low_is_5` is spelled out because their column is "Risk (5 = low)" and
  -- the inversion is the kind of thing that gets silently flipped.
  market_growth smallint not null,
  fragmentation_addons smallint not null,
  target_density smallint not null,
  margin_profile smallint not null,
  recurring_revenue smallint not null,
  barriers smallint not null,
  succession smallint not null,
  risk_low_is_5 smallint not null,

  source_rank integer,
  investment_thesis text,
  key_risks text,
  spanish_clusters text,
  notes text,
  research_status text not null default 'Not Started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ios_industries_industry_check
    check (industry in ('Agribusiness', 'Industrial Products')),
  constraint ios_industries_growth_check
    check (growth_attractiveness is null
           or growth_attractiveness in ('High', 'Medium', 'Low', 'Unknown')),
  constraint ios_industries_fragmentation_check
    check (fragmentation is null
           or fragmentation in ('High', 'Medium', 'Low', 'Unknown')),
  constraint ios_industries_consolidation_check
    check (consolidation_potential is null
           or consolidation_potential in ('High', 'Medium', 'Low', 'Unknown')),
  constraint ios_industries_research_status_check
    check (research_status in ('Not Started', 'Requested', 'In Progress',
                              'Needs Review', 'Current', 'Outdated')),
  constraint ios_industries_ratings_check
    check (market_growth between 1 and 5
       and fragmentation_addons between 1 and 5
       and target_density between 1 and 5
       and margin_profile between 1 and 5
       and recurring_revenue between 1 and 5
       and barriers between 1 and 5
       and succession between 1 and 5
       and risk_low_is_5 between 1 and 5)
);

create unique index if not exists ios_industries_subsector_key
  on ios_industries (subsector);

comment on table ios_industries is
  'IOS v9 Industry Library: 100 subsectors with ARPA''s eight 1-5 ratings. The weighted score and the A/B/C tier are NOT stored: lib/ios/industries.ts derives them and lib/ios/industries.test.ts pins that derivation to the workbook''s own Check: columns.';
comment on column ios_industries.risk_low_is_5 is
  'Their "Risk (5 = low)". A 5 means LOW risk, so high is good, like the other seven.';
comment on column ios_industries.source_rank is
  'Their "Rank" column, their own ordering of the 100. Kept for traceability, never used to sort.';

-- -------------------------------------------------------------------- theses

create table if not exists ios_theses (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  scope text not null,
  category text,
  structural_driver text,
  primary_strategy text,
  description text,
  value_creation_levers text[] not null default '{}',
  ideal_target_profile text,
  key_screening_risks text,
  priority text,
  status text not null default 'Proposed',
  mandate_fit text,
  geographic_focus text,

  -- Text, not numeric. All 140 rows read like "1-5 (core 1-3)", so a numeric
  -- column would need a parser that throws away half their meaning.
  target_ebitda_eur_m text,
  target_revenue_eur_m text,
  evidence_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ios_theses_scope_check
    check (scope in ('Cross-sector', 'Agribusiness', 'Industrial Products')),
  constraint ios_theses_status_check
    check (status in ('Proposed', 'Validated', 'Active', 'Monitor', 'Retired')),
  constraint ios_theses_priority_check
    check (priority is null or priority in ('High', 'Medium', 'Low'))
);

create unique index if not exists ios_theses_code_key on ios_theses (code);

comment on table ios_theses is
  'IOS v9 Thesis Library: 140 investment theses, codes ARPA-TH-001 onwards.';
comment on column ios_theses.target_ebitda_eur_m is
  'Text on purpose. Their cells are ranges with notes ("1-5 (core 1-3)"), not numbers.';
comment on column ios_theses.scope is
  'Cross-sector theses (17 of 140) link to no subsector at all. That is deliberate in their sheet, so the Tesis screen must show them rather than filter them out.';

-- The N:N comes from their `Industries` column, where 486 of 486 tokens match
-- `Seed_Industries.Subsector` exactly. Their other column, `Applicable Subsectors
-- (library text)`, looks like the right one and is not: 0 of its 425 tokens match
-- anything, they are 16 distinct tags like "MRO" and "Medtech".
create table if not exists ios_thesis_subsectors (
  thesis_id uuid not null references ios_theses (id) on delete cascade,
  industry_id uuid not null references ios_industries (id) on delete cascade,
  primary key (thesis_id, industry_id)
);

create index if not exists ios_thesis_subsectors_industry_idx
  on ios_thesis_subsectors (industry_id);

comment on table ios_thesis_subsectors is
  'Thesis to subsector, 486 pairs from Seed_Theses.Industries. The seeder deletes and reinserts per thesis rather than upserting, so a thesis that loses a subsector in v10 loses the row.';

-- ---------------------------------------------------------------- archetypes

create table if not exists ios_archetypes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry_id uuid not null references ios_industries (id) on delete restrict,
  archetype_no integer,
  what_it_does text,
  revenue_model text,
  typical_ebitda_margin numeric(5, 4),
  pe_role text,

  -- Arrays, not comma-joined text, because these two are the actual search input
  -- for a SABI query.
  cnae_codes text[] not null default '{}',
  sabi_keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ios_archetypes_pe_role_check
    check (pe_role is null or pe_role in ('Platform', 'Add-on', 'Either')),
  constraint ios_archetypes_margin_check
    check (typical_ebitda_margin is null
           or typical_ebitda_margin between 0 and 1)
);

create unique index if not exists ios_archetypes_name_subsector_key
  on ios_archetypes (industry_id, lower(btrim(name)));

comment on table ios_archetypes is
  'IOS v9 Target Archetype Library: 173 archetypes, each inside exactly one subsector.';
comment on column ios_archetypes.typical_ebitda_margin is
  'A fraction, as in their sheet: 0.15 means 15 per cent. Not a percentage.';
comment on column ios_archetypes.sabi_keywords is
  'Spanish search terms for SABI. This column is the point of the whole table: it is what turns a thesis into a list of companies to call.';

-- ------------------------------------------------------------------- sources

create table if not exists ios_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type text,
  url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ios_sources_name_key
  on ios_sources (lower(btrim(name)));

comment on table ios_sources is
  'IOS v9 Sources: 22 rows (docs/ios-v9-diff.md said 24, that was wrong). Where each long-list company came from.';

-- ----------------------------------------------------------------- companies

create table if not exists ios_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null default 'Spain',
  autonomous_community text,
  province text,
  industry_id uuid references ios_industries (id) on delete set null,
  archetype_id uuid references ios_archetypes (id) on delete set null,
  status text not null default 'Mapped',
  origin_type text,

  -- Numeric on 6 of their 258 rows. The other 252 are blank and must stay NULL:
  -- a 0 here would read as "we checked and it is tiny", which is a lie.
  revenue_estimate_eur_m numeric(12, 2),
  source_id uuid references ios_sources (id) on delete set null,
  source_confidence text,
  ai_enrichment_status text not null default 'Not Run',
  research_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ios_companies_status_check
    check (status in ('Mapped', 'Watching', 'Active Project', 'Passed',
                      'Portfolio', 'Exited', 'Archived')),
  constraint ios_companies_confidence_check
    check (source_confidence is null
           or source_confidence in ('High', 'Medium', 'Low')),
  constraint ios_companies_ai_status_check
    check (ai_enrichment_status in ('Not Run', 'Running', 'Needs Review',
                                    'Approved', 'Rejected', 'Failed'))
);

create unique index if not exists ios_companies_name_key
  on ios_companies (lower(btrim(name)));
create index if not exists ios_companies_industry_idx
  on ios_companies (industry_id);
create index if not exists ios_companies_archetype_idx
  on ios_companies (archetype_id);

comment on table ios_companies is
  'IOS v9 long list: 258 Spanish companies mapped to a subsector, an archetype and a source. This is their sourcing output, not V1''s arpa_companies, and the two are deliberately unconnected.';
comment on column ios_companies.revenue_estimate_eur_m is
  'NULL for the 252 rows where their sheet is blank. Never 0.';

-- --------------------------------------------------------------------- rejects

-- The seeder writes here instead of skipping a row quietly, then exits non-zero.
-- With today's workbook this table ends up empty, because all five joins resolve
-- 100 per cent. It exists for the next workbook.
create table if not exists ios_seed_rejects (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  sheet text not null,
  row_no integer not null,
  reason text not null,
  payload jsonb
);

create index if not exists ios_seed_rejects_run_idx
  on ios_seed_rejects (run_at desc);

comment on table ios_seed_rejects is
  'Rows scripts/ios-seed.ts could not load, with the sheet, the row number in the file and why. A silent skip in a seeder is how 258 companies quietly become 251.';
