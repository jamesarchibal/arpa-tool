-- Originación stops being two screens stacked on top of each other.
--
-- The temática and the subsector were a PICKER that opened its own table, with
-- the real imported list hidden under a <details> below it. They are the same
-- thing: a filter over the companies already in the base. getCamino() is
-- literally `where taxonomy_id = ?`, it queries nothing external. So the picker
-- becomes the filter bar of the one list, and for that the list's view has to
-- expose what it is being filtered on.
--
-- Appended at the end, not slotted next to `sector`: `create or replace view`
-- can only add columns last, and dropping the view takes the screens with it.
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
   -- `SourcingRow extends PipelineRow`, so TypeScript already believed these
   -- three were here. They were not, which is the same trap the coverage
   -- columns fell into: the type promises what the SQL does not return.
   v.theme_id, v.theme_name, v.taxonomy_id
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
