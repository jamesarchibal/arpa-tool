-- ─────────────────────────────────────────────────────────────────────────────
-- Contactos can now be bulk-loaded from an address book export and a calendar
-- export. Both of those are things you upload MORE THAN ONCE: you export again
-- next month and drop the new file in. So both need a key that makes a second
-- upload an update instead of a duplicate. Without that, the feature is worse
-- than nothing, because the CRM slowly fills with the same people twice.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.arpa_stakeholders
  add column if not exists import_source text;

comment on column public.arpa_stakeholders.import_source is
  'Where this person came from: null for hand-entered, otherwise the uploaded file name. Same purpose as arpa_companies.enrich_source: imported data stays findable.';

-- Email is the only identifier an address book reliably carries, so it is the
-- dedupe key. Partial and on lower(), because:
--   - plenty of real contacts have no email at all, and those must not collide
--     with each other on null;
--   - the same person is exported as J.Riera@... from one tool and
--     j.riera@... from another.
create unique index if not exists arpa_stakeholders_email_key
  on public.arpa_stakeholders (lower(email))
  where email is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- A calendar event carries its own stable identifier, the iCalendar UID, which
-- survives the event being edited and re-exported. That is a better dedupe key
-- than (date, title), which changes the moment someone renames the meeting.
--
-- The same UID can legitimately produce several rows here, one per attendee we
-- recognise, so the index is on the pair and not on the UID alone.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.arpa_interactions
  add column if not exists external_uid text;

comment on column public.arpa_interactions.external_uid is
  'iCalendar UID of the event this was imported from. Null for anything logged by hand.';

create unique index if not exists arpa_interactions_external_uid_key
  on public.arpa_interactions (external_uid, stakeholder_id)
  where external_uid is not null;
