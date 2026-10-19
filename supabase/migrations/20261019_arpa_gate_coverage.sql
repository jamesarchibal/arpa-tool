-- Coverage per gate, so a score can never be read without knowing how much of
-- the question it answers.
--
-- WHY: `scoreProject` renormalises each gate over the weight that actually had
-- data behind it. That is the right call (a missing criterion should not drag a
-- score towards zero) but it means the number alone is not a verdict. A real
-- SABI import of a company nobody has looked at scored PFR 90/100 "Build
-- Investment Case" off 30 of 100 weight: two cheap criteria, both good, and
-- the three expensive ones unanswered. Rendered as a green 90 that reads as
-- higher conviction than a diligenced deal at 82.
--
-- No new column is needed. `arpa_scores.criteria` already stores `{w, score}`
-- per criterion, so coverage is a fact about rows we have, not data we lack.

create or replace view arpa_pipeline as
 with latest as (
   select distinct on (s.project_id, s.model)
     s.project_id, s.model, s.total_0_100, s.verdict, s.vetoed,
     s.scored_at, s.scored_by,
     -- Share of this gate's weight that had a score. `score` is stored as JSON
     -- null for an unanswered criterion, hence the text comparison: `->> 'score'`
     -- yields SQL NULL for JSON null, so a plain IS NOT NULL is enough, but the
     -- explicit <> 'null' keeps it correct if a writer ever stores the string.
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
   -- Appended rather than slotted next to their gate: `create or replace view`
   -- can only add columns at the end, and dropping the view would take the
   -- screens reading it down with it.
   max(case when l.model = 'qss' then l.coverage_pct else null::smallint end) as qss_cov,
   max(case when l.model = 'om'  then l.coverage_pct else null::smallint end) as om_cov,
   max(case when l.model = 'pfr' then l.coverage_pct else null::smallint end) as pfr_cov
 from arpa_projects p
   join arpa_companies c on c.id = p.company_id
   left join arpa_taxonomy t on t.id = c.taxonomy_id
   left join arpa_taxonomy pt on pt.id = p.taxonomy_id
   left join arpa_themes th on th.id = p.theme_id
   left join latest l on l.project_id = p.id
 group by p.id, c.id, t.sector, t.subsector, t.pre_score,
          pt.sector, pt.subsector, pt.pre_score, th.name;

-- Originación reads `arpa_sourcing`, which lists its columns one by one instead
-- of selecting *. Adding coverage upstream was therefore not enough: its pills
-- kept rendering a confident colour and no coverage while Pipeline and Proyectos
-- showed the thin-score warning for the same deal. TypeScript did not catch it
-- because `SourcingRow extends PipelineRow`, so the type promises columns the
-- SQL does not return.
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
   -- Appended, same constraint as above.
   v.qss_cov, v.om_cov, v.pfr_cov
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
