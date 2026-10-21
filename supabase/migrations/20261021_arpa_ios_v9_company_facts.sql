-- Three Companies fields the v9 Field_Dictionary has and the catalogue load did
-- not need.
--
-- `Seed_Companies` carries no website, no ownership and no EBITDA, so loading his
-- 258 long-list rows never asked for these columns. His test fixtures do ask:
-- `Seed_Fixtures` gives all three per company, and two of his own QA checks are
-- about them. QA-19 reads the mandate band off EBITDA, and QA-20 exists to prove
-- that a blank EBITDA stays Unknown instead of turning into 0.
--
-- So EBITDA is nullable numeric with no default. The whole point of QA-20 is that
-- "we have not measured it" and "it is zero" are different facts, and a column
-- with `default 0` cannot tell them apart.
--
-- `Ownership Type` is one of his vocabularies (8 values, field `Companies.Ownership
-- Type`), so it gets the same treatment as the other single-selects here: a CHECK
-- in the database, the list mirrored in `lib/ios/lists.ts`, and a test that keeps
-- the two in step.

alter table ios_companies
  add column if not exists website text,
  add column if not exists ownership_type text,
  add column if not exists ebitda_estimate_eur_m numeric(12, 2);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ios_companies_ownership_check'
  ) then
    alter table ios_companies
      add constraint ios_companies_ownership_check
      check (ownership_type is null
             or ownership_type in ('Founder-owned', 'Family-owned',
                                   'Management-owned', 'PE-backed', 'Corporate',
                                   'Cooperative', 'Other', 'Unknown'));
  end if;
end $$;

comment on column ios_companies.website is
  'Companies.Website. His import fixture P4 matches on the domain of this, not on
   the company name, which is why it is worth storing separately from the notes.';
comment on column ios_companies.ownership_type is
  'Companies.Ownership Type, 8 values from his Vocabulary sheet.';
comment on column ios_companies.ebitda_estimate_eur_m is
  'Companies.EBITDA Estimate EUR M. NULL means not measured, and it has to stay
   distinguishable from 0: that difference is what his QA-20 check tests.';
