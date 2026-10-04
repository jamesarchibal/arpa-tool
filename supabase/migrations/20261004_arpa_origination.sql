-- ARPA Partners · origination (block 5).
--
-- The screening tables answer "is this company worth buying". This one answers
-- the question before it: "which companies should we even look at".
--
-- Source is BORME, the official Registro Mercantil bulletin. It is free,
-- structured XML, and published to be read, so parsing it is not the prohibited
-- "peticion en masa" of the registry (DGRN Instruccion 17-feb-1998). Loaded by
-- scripts/borme-load.mjs, which joins two passes of scripts/borme-probe.mjs:
--
--   sectors + classify  what the company DOES, from the Objeto social printed
--                       on Constitucion and Cambio de objeto social
--   tier1               whether the company is MOVING, from pre-sale acts
--
-- PRIVACY. BORME seccion A names natural persons. Nothing here holds one. The
-- probe redacts every cargo line before anything is stored, and the strongest
-- signal (holding_admin) fires on a COMPANY being named administrator, so it
-- needs no legitimate interest assessment. Owner-age features stay out until
-- ARPA's counsel signs one.

create table if not exists public.arpa_origination (
  id              bigserial primary key,

  -- BORME publishes no CIF. The durable key is the registry sheet, so it is
  -- province + hoja, as printed in "Datos registrales. S 8 , H A 208326".
  reg_key         text not null unique,
  legal_name      text not null,
  province        text not null,
  hoja            text,

  -- What it does. Null until a Constitucion or Cambio de objeto is seen, which
  -- is why the backfill goes to 2009: a company that only filed a capital
  -- reduction prints no sector at all.
  sector          text,
  subsector       text,
  objeto          text,
  objeto_date     date,
  cnae            text,
  -- maker | trader | mixed | unclear. ARPA buys companies that make things.
  role            text,
  -- true when the match sits in the opening clause, ie the principal activity.
  principal       boolean not null default false,
  -- real-estate and holding vehicles doing ordinary restructuring. A flag, not
  -- a drop, because a real opco can hold its own building.
  patrimonial     boolean not null default false,

  -- Whether it is moving. Tier 1 rule ids, eg {holding_admin,auditor}.
  signals         text[] not null default '{}',
  signal_count    integer not null default 0,
  signal_score    integer not null default 0,
  first_signal_at date,
  last_signal_at  date,

  -- Workflow. `promoted` means it became a real project.
  status          text not null default 'new'
                  check (status in ('new','shortlisted','discarded','promoted')),
  project_id      uuid references public.arpa_projects(id) on delete set null,
  note            text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- The list is read province-first and subsector-first, and sorted by how many
-- distinct pre-sale signals fired.
create index if not exists arpa_origination_province_idx  on public.arpa_origination (province);
create index if not exists arpa_origination_subsector_idx on public.arpa_origination (subsector);
create index if not exists arpa_origination_rank_idx      on public.arpa_origination (signal_count desc, signal_score desc);
create index if not exists arpa_origination_status_idx    on public.arpa_origination (status);

-- This app authenticates with a single shared password and reads with the
-- service role key, so RLS is belt and braces: deny by default, like the rest
-- of the arpa_ tables.
alter table public.arpa_origination enable row level security;

drop policy if exists arpa_origination_rw on public.arpa_origination;
create policy arpa_origination_rw on public.arpa_origination
  for all to authenticated using (true) with check (true);
