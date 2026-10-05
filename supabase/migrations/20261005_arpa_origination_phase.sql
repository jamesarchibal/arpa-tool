-- ARPA Partners · split the BORME signals by phase.
--
-- The first version summed every signal into one score, so a company that had
-- ALREADY been sold could outrank one that is about to be. Those are opposite
-- facts and must never be added together.
--
--   prep  the owner is getting the company ready. There is still runway.
--   done  a transaction already happened. NOT a lead. Its value is that it
--         points at whoever bought, which is what feeds the consolidation map.
--
-- `apoderado` is excluded from prep_count on purpose: it fires about 300 times
-- a day and means nothing on its own. It still counts in signal_score.

alter table public.arpa_origination
  add column if not exists prep_count integer not null default 0,
  add column if not exists done_count integer not null default 0;

comment on column public.arpa_origination.prep_count is
  'Distinct pre-sale preparation signals, excluding apoderado.';
comment on column public.arpa_origination.done_count is
  'Distinct signals showing the transaction already happened.';

-- Backfill from the signals array already stored, so no reload is needed.
update public.arpa_origination set
  prep_count = (
    select count(distinct s) from unnest(signals) s
    where s in ('holding_admin','escision_parcial','auditor',
                'transformacion','reduccion_capital','consejo')
  ),
  done_count = (
    select count(distinct s) from unnest(signals) s
    where s in ('escision_total','unipersonalidad_perdida',
                'socio_unico_cambio','fusion_absorcion')
  );

-- The bucket the feed is read by. Generated, so it can never drift from the
-- two counts the loader writes.
--
--   sold   already transacted. Chase the buyer, not this company.
--   lead   two or more preparation acts, not sold.
--   early  exactly one preparation act. The BEST window, because no advisor has
--          been mandated yet. A loud cluster means the process is well advanced
--          and probably contested.
alter table public.arpa_origination
  drop column if exists phase;

alter table public.arpa_origination
  add column phase text generated always as (
    case
      when done_count > 0  then 'sold'
      when prep_count >= 2 then 'lead'
      when prep_count = 1  then 'early'
      else 'none'
    end
  ) stored;

-- Ranked by RECENCY of the first signal, not by cluster size. For a `lead` or
-- an `early` row there are no `done` signals, so first_signal_at is exactly the
-- first preparation act. For a `sold` row it is not, which does not matter
-- because a sold company is not a lead.
create index if not exists arpa_origination_phase_idx
  on public.arpa_origination (phase, first_signal_at desc nulls last);
