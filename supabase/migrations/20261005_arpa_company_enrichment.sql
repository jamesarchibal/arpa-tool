-- Provenance for the company record, so we can tell typed-in facts apart from
-- facts copied out of a licensed database.
--
-- This is not bookkeeping for its own sake. One of the open questions to Palà is
-- whether data extracted from SABI may be stored in a system of our own. If the
-- answer is no, we have to be able to find and delete exactly those rows:
--   delete / null out where enrich_source = 'SABI'
-- Without a marker that request would be impossible to honour, and "we cannot
-- tell which data came from your product" is not an answer we want to give.
--
-- No financial columns are added here on purpose. Revenue and EBITDA already
-- live on arpa_projects and are already hand-editable in the scoring workbench,
-- so the licence answer does not block today's workflow.

alter table public.arpa_companies
  add column if not exists enrich_source text,
  add column if not exists enriched_at   timestamptz,
  add column if not exists enriched_by   text;

comment on column public.arpa_companies.enrich_source is
  'Where the ficha data came from: SABI, BORME, manual, web. Drives deletion if a licence forbids storage.';

-- Partial, because most rows will never be enriched and the index only exists
-- to answer "which rows came from source X".
create index if not exists arpa_companies_enrich_source_idx
  on public.arpa_companies (enrich_source)
  where enrich_source is not null;
