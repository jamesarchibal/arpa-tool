-- ─────────────────────────────────────────────────────────────────────────────
-- Originación now starts from the SABI import, and the BORME becomes a SIGNAL
-- hung off those companies rather than a list of its own.
--
-- The whole problem is that the two sources never spell a company the same way.
-- Real values seen in the data:
--
--   SABI   VALENT PLANT SL                                      TARRAGONA
--   BORME  MECANIZADOS ... SOCIEDAD LIMITADA                    JAÉN
--   BORME  COMEGA CONSTRUCCIONES METALICAS SL(R.M. A CORUÑA)    A CORUÑA
--   BORME  CITRICOS GINERO SL                                   VALENCIA/VALÈNCIA
--
-- So there is no CIF to join on (the BORME does not publish one) and a plain
-- equality join finds almost nothing. These two functions fold both spellings
-- onto one key: accents, punctuation, spacing, the registry annotation in
-- parentheses, the long form of the legal type, and the bilingual province
-- names all collapse.
-- ─────────────────────────────────────────────────────────────────────────────

-- `unaccent` is an extension and is not enabled on this project, so do it by
-- hand. translate() is a straight character map and stays immutable, which is
-- what lets the key be used in an index later if 5k rows ever becomes 500k.
create or replace function public.arpa_strip_accents(p text)
returns text
language sql
immutable
parallel safe
as $$
  select translate(
    coalesce(p, ''),
    'ÁÀÄÂÃÅáàäâãåÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔÕóòöôõÚÙÜÛúùüûÑñÇçÝý',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCcYy'
  );
$$;

comment on function public.arpa_strip_accents(text) is
  'Folds Spanish and Catalan accents. Hand-rolled because the unaccent extension is not enabled.';

/*
 * A company name reduced to letters and digits only.
 *
 * Deliberately drops ALL whitespace: that is what makes "S.L.", "S L" and "SL"
 * the same key without a separate rule for each. Collision risk between two
 * genuinely different companies is accepted, because the alternative is missing
 * the match entirely, and a missing BORME signal is invisible while a wrong one
 * is obvious on screen next to the company name.
 */
create or replace function public.arpa_name_key(p text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(
    -- 5. a unipersonal suffix is the same company: SLU -> SL, SAU -> SA.
    regexp_replace(
      -- 4. everything that is not a letter or a digit goes, spaces included.
      regexp_replace(
        -- 3. long legal forms down to the short token.
        regexp_replace(
          regexp_replace(
            regexp_replace(
              -- 2. drop a trailing registry annotation: "...SL(R.M. A CORUÑA)".
              regexp_replace(
                -- 1. one case, no accents.
                upper(public.arpa_strip_accents(coalesce(p, ''))),
                '\s*\(.*$', '', 'g'
              ),
              'SOCIEDAD\s+LIMITADA(\s+UNIPERSONAL)?', 'SL', 'g'
            ),
            'SOCIEDAD\s+ANONIMA(\s+UNIPERSONAL)?', 'SA', 'g'
          ),
          'SOCIEDAD\s+COOPERATIVA(\s+(LIMITADA|CATALANA|ANDALUZA))?', 'SCOOP', 'g'
        ),
        '[^A-Z0-9]', '', 'g'
      ),
      '(SL|SA)U$', '\1'
    ),
    ''
  );
$$;

comment on function public.arpa_name_key(text) is
  'Join key for company names across SABI and BORME. Strips accents, punctuation, spaces, the (R.M. ...) annotation, and folds SOCIEDAD LIMITADA / S.L. / SLU onto SL.';

/*
 * Province reduced to one spelling.
 *
 * The BORME uses the bilingual official form, "VALENCIA/VALÈNCIA" and
 * "ALICANTE/ALACANT". SABI prints one language. Taking the text before the
 * slash picks the Spanish form, which is the one SABI emits.
 */
create or replace function public.arpa_province_key(p text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(
    regexp_replace(
      split_part(upper(public.arpa_strip_accents(coalesce(p, ''))), '/', 1),
      '[^A-Z0-9]', '', 'g'
    ),
    ''
  );
$$;

comment on function public.arpa_province_key(text) is
  'Join key for Spanish provinces. Takes the Spanish half of a bilingual BORME name and strips accents and spaces.';

-- ─────────────────────────────────────────────────────────────────────────────
-- One row per company key, merging every BORME act published for it.
--
-- A company can appear several times in arpa_origination, once per published
-- act, so the counts are rolled up and the signal names de-duplicated. The
-- phase takes the loudest value rather than the latest: if any act says the
-- company is already sold, "sold" is the fact that matters for originating.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.arpa_borme_signals as
with flat as (
  select
    public.arpa_name_key(o.legal_name)     as name_key,
    public.arpa_province_key(o.province)   as province_key,
    o.province,
    o.hoja,
    o.phase,
    o.prep_count,
    o.done_count,
    o.patrimonial,
    o.first_signal_at,
    o.last_signal_at,
    s.signal
  from public.arpa_origination o
  left join lateral unnest(coalesce(o.signals, '{}'::text[])) as s(signal) on true
)
select
  name_key,
  province_key,
  min(province)                                       as borme_province,
  min(hoja)                                           as borme_hoja,
  array_remove(array_agg(distinct signal), null)      as borme_signals,
  coalesce(max(prep_count), 0)                        as borme_prep_count,
  coalesce(max(done_count), 0)                        as borme_done_count,
  bool_or(patrimonial)                                as borme_patrimonial,
  min(first_signal_at)                                as borme_first_signal_at,
  max(last_signal_at)                                 as borme_last_signal_at,
  case
    when bool_or(phase = 'sold')  then 'sold'
    when bool_or(phase = 'lead')  then 'lead'
    when bool_or(phase = 'early') then 'early'
    else 'none'
  end                                                 as borme_phase
from flat
where name_key is not null
group by name_key, province_key;

comment on view public.arpa_borme_signals is
  'BORME acts rolled up to one row per company name key. Feeds arpa_sourcing.';

-- ─────────────────────────────────────────────────────────────────────────────
-- The Originación screen: every imported company, its score, and whatever the
-- BORME says about it.
--
-- Built on arpa_pipeline so the score columns stay defined in exactly one
-- place. The extra company fields that arpa_pipeline does not expose come
-- straight off arpa_companies.
--
-- The BORME join is on the name key, with the province used only to break a
-- tie. Requiring the province to match would drop every company whose SABI
-- region is null, which is the common case for a thin import.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.arpa_sourcing as
select
  v.*,
  c.cif,
  c.city,
  c.cnae,
  c.employees,
  c.founded_year,
  c.website,
  c.notes,
  c.intake_batch,
  c.enrich_source,
  b.borme_signals,
  b.borme_phase,
  b.borme_prep_count,
  b.borme_done_count,
  b.borme_patrimonial,
  b.borme_hoja,
  b.borme_first_signal_at,
  b.borme_last_signal_at
from public.arpa_pipeline v
join public.arpa_companies c on c.id = v.company_id
left join lateral (
  select s.*
  from public.arpa_borme_signals s
  where s.name_key = public.arpa_name_key(v.legal_name)
  order by (s.province_key = public.arpa_province_key(v.region)) desc nulls last
  limit 1
) b on true;

comment on view public.arpa_sourcing is
  'Imported companies with their latest scores and matched BORME signals. Backs the Originación tab.';
