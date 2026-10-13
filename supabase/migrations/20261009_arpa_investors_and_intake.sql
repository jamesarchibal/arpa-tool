-- ARPA Partners · investor profile on stakeholders, plus intake provenance.
--
-- Both come straight from the Marc call of 2026-10-08.
--
-- 1. Investors. Marc's words: "jo quan vaig a una reunió d'inversors, què surto?
--    Surto sabent quina és la seva tesi d'inversió, amb el que inverteixen i amb
--    què no, quins tickets normalment poden posar, i tot això ho hauríem de tenir
--    registrat perquè quan tinguem un deal i diguem, anem a buscar inversors,
--    saber a quins té sentit presentar-los i a quins no."
--    `kind in ('Investor','LP','Co-investor')` already existed; what was missing
--    is the three things he actually leaves a meeting knowing.
--    Sectors stay FREE TEXT on purpose. Forcing them onto arpa_taxonomy would
--    quietly drop every investor whose remit is wider than our 20 rows, and the
--    plan is to search this semantically, which works on prose.
--    Ticket size is in M€, like every other money column in this schema, so
--    nothing has to be guessed at read time.
--
-- 2. Intake provenance. A SABI batch can land hundreds of rows at once, so a bad
--    import has to be reversible without touching the rows a human has since
--    worked on. `intake_batch` is the undo key: delete where intake_batch = ...
--    and only that import goes away.
--
-- Idempotent on purpose: every statement is add/create ... if not exists, so
-- re-running is safe when it is unclear whether it already went through.

alter table public.arpa_stakeholders
  add column if not exists invest_thesis text,
  add column if not exists sectors_in    text,
  add column if not exists sectors_out   text,
  add column if not exists ticket_min    numeric(14,4),
  add column if not exists ticket_max    numeric(14,4);

comment on column public.arpa_stakeholders.ticket_min is 'M€, equity ticket they can write';
comment on column public.arpa_stakeholders.ticket_max is 'M€, equity ticket they can write';

-- "Who could fund a 4 M€ equity cheque" has to be one indexed question, because
-- it is the question that gets asked once a deal is live and time is short.
create index if not exists arpa_stakeholders_ticket_idx
  on public.arpa_stakeholders (ticket_min, ticket_max)
  where ticket_min is not null or ticket_max is not null;

alter table public.arpa_companies
  add column if not exists intake_batch text;

alter table public.arpa_projects
  add column if not exists intake_batch text;

create index if not exists arpa_companies_intake_idx
  on public.arpa_companies (intake_batch) where intake_batch is not null;

create index if not exists arpa_projects_intake_idx
  on public.arpa_projects (intake_batch) where intake_batch is not null;

-- 3. Closing a next step.
--
-- The agenda is built from arpa_interactions.next_step, so there was no way to
-- tick an item off: the list could only grow. Stamping a timestamp rather than
-- clearing the text keeps the trail, which matters because the next step is the
-- record of what was promised in that conversation.
alter table public.arpa_interactions
  add column if not exists next_step_done_at timestamptz;

-- The agenda query is "open next steps, soonest first", so the index that
-- serves it has to exclude the closed ones.
create index if not exists arpa_interactions_agenda_idx
  on public.arpa_interactions (next_step_due)
  where next_step is not null and next_step_done_at is null;
