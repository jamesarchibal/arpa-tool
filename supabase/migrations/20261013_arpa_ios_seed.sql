-- ─────────────────────────────────────────────────────────────────────────────
-- Demo content for the IOS v0.0.0 walkthrough, every row flagged as an example.
--
-- The temáticas and the subsector pre-scores are ARPA's own content and they
-- have not sent them yet. An empty demo cannot be clicked through, so this seeds
-- enough to walk the funnel, but marked: `is_example` is true on every row this
-- file writes, the screens label those rows, and Ajustes clears all of them in
-- one click. The flag is the whole point. A demo full of invented content that
-- looks real is how a wrong number ends up in a committee pack.
--
-- Only the two temáticas Ignasi named out loud are seeded as his, plus the
-- buy-and-build play that follows from "podries tenir un deal que sigui de tres
-- companyies". Nothing else is guessed.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.arpa_themes
  add column if not exists is_example boolean not null default false;
alter table public.arpa_taxonomy
  add column if not exists is_example boolean not null default false;

comment on column public.arpa_themes.is_example is
  'True for demo rows seeded by a migration. ARPA''s real temáticas are entered by hand with this false.';

-- ── Temáticas ────────────────────────────────────────────────────────────────
insert into public.arpa_themes (name, slug, thesis, fit_criteria, sort, is_example)
values
  (
    'Relevo generacional',
    'relevo-generacional',
    'Comprar una mayoría en una empresa rentable cuyo propietario se jubila y no tiene continuidad familiar clara.',
    'Propietario por encima de los 60. Sin segunda generación en el órgano de administración. EBITDA recurrente. Equipo directivo que puede seguir sin el dueño.',
    1,
    true
  ),
  (
    'Plan de expansión internacional',
    'expansion-internacional',
    'Entrar en una empresa con producto probado y ventas concentradas en España, y financiar su salida al exterior.',
    'Producto exportable. Menos del 20% de la facturación fuera de España. Margen que soporta la inversión comercial. Capacidad productiva no agotada.',
    2,
    true
  ),
  (
    'Consolidación sectorial',
    'consolidacion-sectorial',
    'Comprar una plataforma en un subsector fragmentado y añadirle competidores pequeños. Un solo deal sobre varias compañías.',
    'Subsector con fragmentación alta. Una plataforma con sistemas y dirección capaces de absorber. Dos o tres add-ons identificados antes de entrar.',
    3,
    true
  )
on conflict (slug) do nothing;

-- ── One subsector straight from the call ─────────────────────────────────────
--
-- Ignasi's own worked example: "Electrical Equipment > fabricantes de mecanismos
-- eléctricos". It is here to show the shape of a fully filled taxonomy row,
-- which none of the existing twenty are.
insert into public.arpa_taxonomy
  (sector, category, subsector, growth, fragmentation, consolidation,
   pre_score, margin_typical_pct, cnae_codes, keywords, notes, is_example)
select
  'Electrical Equipment',
  'Electrical Components',
  'Fabricantes de mecanismos eléctricos',
  'M', 'H', 'H',
  75, 14,
  array['2712', '2733'],
  array['mecanismos eléctricos', 'material eléctrico', 'aparamenta', 'cajas de empotrar', 'interruptores'],
  'Ejemplo trabajado en la reunión del 13-10-2026. El pre-score y el margen son de muestra, no de ARPA.',
  true
where not exists (
  select 1 from public.arpa_taxonomy
  where subsector = 'Fabricantes de mecanismos eléctricos'
);

-- ── A provisional pre-score for the twenty real subsectors ───────────────────
--
-- NOT invented: it is a transparent function of the three judgements already in
-- the table. High on an axis scores 100, medium 60, low 20, and the pre-score is
-- the mean of the three, rounded.
--
-- It is a starting value so the proactive origination path has something to sort
-- by on day one. The Ajustes screen says so, out loud, above the list. Ignasi
-- overwrites any row and his number is then the number.
with axis as (
  select
    t.id,
    (
      case t.growth        when 'H' then 100 when 'M' then 60 else 20 end +
      case t.fragmentation when 'H' then 100 when 'M' then 60 else 20 end +
      case t.consolidation when 'H' then 100 when 'M' then 60 else 20 end
    ) / 3.0 as score
  from public.arpa_taxonomy t
  where t.pre_score is null and not t.is_example
)
update public.arpa_taxonomy t
set pre_score = round(a.score)::smallint
from axis a
where a.id = t.id;
