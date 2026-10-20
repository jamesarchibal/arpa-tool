-- A project gets a name of its own, and the many-to-many starts being true.
--
-- WHY: James' model is "un proyecto que puede tener 1 o N empresas". Today the
-- project has no name at all: every screen prints the PRIMARY company's
-- `legal_name` and calls it the project. That works right up to the first
-- buy-and-build, where three companies share one deal and the deal is named
-- after whichever of them happened to be imported first.
--
-- Two separate problems, fixed together because fixing one alone is worse:
--
-- 1. No name. `name` is NULLABLE on purpose. A null means "called after its
--    company", which is what every existing row means today, so nothing has to
--    be backfilled with invented text and no screen changes behaviour until
--    somebody types a name.
--
-- 2. `arpa_project_companies` exists since 2026-10-13 and NOTHING has ever
--    written to it. So `company_count` in `arpa_pipeline` returns 0 for every
--    real project, and the board's "+ N empresa(s) más" line could only ever
--    fire for the demo seed. The backfill below makes the table say what
--    `arpa_projects.company_id` already says: one primary company per project.
--    After this, the join table is the truth and `company_id` is a cached
--    pointer to the primary, which is the order it should have been in.

alter table public.arpa_projects
  add column if not exists name text;

comment on column public.arpa_projects.name is
  'The deal name. Null means it is called after its primary company, which is what every project meant before this column existed.';

-- Every project that has no membership rows gets one for its primary company.
-- `on conflict do nothing` plus the index below makes this safe to re-run.
insert into public.arpa_project_companies (project_id, company_id, role, is_primary, is_example)
select p.id, p.company_id, 'Target', true, p.is_example
from public.arpa_projects p
where not exists (
  select 1 from public.arpa_project_companies pc where pc.project_id = p.id
);

-- The same company twice in one project is never meaningful, and without this
-- a double-click on "añadir empresa" would quietly create a duplicate that
-- inflates `company_count`.
create unique index if not exists arpa_project_companies_unique
  on public.arpa_project_companies (project_id, company_id);

-- Appended, never slotted in: `create or replace view` only tolerates new
-- columns at the end, and dropping this view takes every screen with it.
create or replace view arpa_pipeline as
 with latest as (
   select distinct on (s.project_id, s.model)
     s.project_id, s.model, s.total_0_100, s.verdict, s.vetoed,
     s.scored_at, s.scored_by,
     (
       select round(
         100.0
         * coalesce(sum((v ->> 'w')::numeric) filter (
             where v ->> 'score' is not null and v ->> 'score' <> 'null'
           ), 0)
         / nullif(sum((v ->> 'w')::numeric), 0)
       )
       from jsonb_each(s.criteria) as e(k, v)
     )::smallint as coverage_pct
   from arpa_scores s
   order by s.project_id, s.model, s.scored_at desc
 )
 select
   p.id, p.code, p.stage, p.decision_status, p.pass_reason, p.owner, p.updated_at,
   c.id as company_id, c.legal_name, c.region, c.ownership_type,
   coalesce(pt.sector, t.sector) as sector,
   coalesce(pt.subsector, t.subsector) as subsector,
   coalesce(p.ebitda_norm, p.ebitda_y3) as ebitda_ref,
   coalesce(p.ebitda_norm, p.ebitda_y3) * p.entry_multiple as ev,
   coalesce(p.ebitda_norm, p.ebitda_y3) * p.entry_multiple - p.net_debt as equity,
   p.seller_exp_ev - coalesce(p.ebitda_norm, p.ebitda_y3) * p.entry_multiple as valuation_gap,
   max(case when l.model = 'qss' then l.total_0_100 else null::smallint end) as qss,
   max(case when l.model = 'om'  then l.total_0_100 else null::smallint end) as om,
   max(case when l.model = 'pfr' then l.total_0_100 else null::smallint end) as pfr,
   max(l.scored_at) as last_scored_at,
   bool_or(l.vetoed) as has_veto,
   p.theme_id, th.name as theme_name,
   coalesce(p.taxonomy_id, c.taxonomy_id) as taxonomy_id,
   coalesce(pt.pre_score, t.pre_score) as industry_pre_score,
   (select count(*)::integer from arpa_project_companies pc where pc.project_id = p.id) as company_count,
   max(case when l.model = 'qss' then l.coverage_pct else null::smallint end) as qss_cov,
   max(case when l.model = 'om'  then l.coverage_pct else null::smallint end) as om_cov,
   max(case when l.model = 'pfr' then l.coverage_pct else null::smallint end) as pfr_cov,
   -- Raw, NOT coalesced to the company name. The caller needs to tell apart "no
   -- lo han nombrado" from "se llama igual que la empresa", because only the
   -- first one should keep following the company if the primary ever changes.
   p.name as project_name
 from arpa_projects p
   join arpa_companies c on c.id = p.company_id
   left join arpa_taxonomy t on t.id = c.taxonomy_id
   left join arpa_taxonomy pt on pt.id = p.taxonomy_id
   left join arpa_themes th on th.id = p.theme_id
   left join latest l on l.project_id = p.id
 group by p.id, c.id, t.sector, t.subsector, t.pre_score,
          pt.sector, pt.subsector, pt.pre_score, th.name;

-- Same trap as always: `SourcingRow extends PipelineRow`, so TypeScript will
-- believe `project_name` is here the moment it is added upstream.
create or replace view arpa_sourcing as
 select
   v.id, v.code, v.stage, v.decision_status, v.pass_reason, v.owner, v.updated_at,
   v.company_id, v.legal_name, v.region, v.ownership_type, v.sector, v.subsector,
   v.ebitda_ref, v.ev, v.equity, v.valuation_gap,
   v.qss, v.om, v.pfr, v.last_scored_at, v.has_veto,
   c.cif, c.city, c.cnae, c.employees, c.founded_year, c.website, c.notes,
   c.intake_batch, c.enrich_source,
   b.borme_signals, b.borme_phase, b.borme_prep_count, b.borme_done_count,
   b.borme_patrimonial, b.borme_hoja, b.borme_first_signal_at, b.borme_last_signal_at,
   v.qss_cov, v.om_cov, v.pfr_cov,
   v.theme_id, v.theme_name, v.taxonomy_id,
   v.project_name, v.company_count
 from arpa_pipeline v
   join arpa_companies c on c.id = v.company_id
   left join lateral (
     select
       s.borme_hoja, s.borme_signals, s.borme_prep_count, s.borme_done_count,
       s.borme_patrimonial, s.borme_first_signal_at, s.borme_last_signal_at,
       s.borme_phase
     from arpa_borme_signals s
     where s.name_key = arpa_name_key(v.legal_name)
     order by (s.province_key = arpa_province_key(v.region)) desc nulls last
     limit 1
   ) b on true;
