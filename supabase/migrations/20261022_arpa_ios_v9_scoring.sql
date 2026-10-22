-- The three gate scores from his `Scoring_Model` sheet, which V2 was missing.
--
-- V1 has implemented these since 3-oct and `docs/ios-v9-diff.md` records that its
-- sixteen criteria and their weights match his sheet exactly. V2 shipped without
-- them: the build was organised around the gate, his gate rule reads a document
-- status and never a score, so the score never blocked anything and never got
-- ported. That was an order-of-work decision, not a scope decision, and it was
-- never written down as one. This closes it.
--
-- One row per project. The sixteen ratings live in a single jsonb object keyed
-- `<gate>_<criterion>` rather than sixteen columns or sixteen rows, because:
--   - the criteria are his and they will change when his sheet changes, and a
--     vocabulary change should not need a migration;
--   - a gate score is only valid when all of its criteria are rated, so the
--     ratings are read and written as one unit anyway.
-- The trade is that the database cannot check the keys. `lib/ios/scoring.ts` owns
-- that list and `RATING_KEYS` is what the server action validates against, so
-- there is still exactly one definition of what a valid key is.
--
-- No score is stored. 0-100 is derived in TypeScript from the ratings and the
-- weights, the same rule the industry tier follows: one implementation, so the
-- stored number can never disagree with the displayed one.
--
-- `kills` is his `Funnel_Stages` kill criteria as ticks. In V1 ten of the thirteen
-- had a detector that raised them from the financials. `ios_projects` has no
-- financial columns, so here a kill is something a person asserted, which is also
-- the only kind that should veto a deal.
--
-- Deliberately NOT done here: nothing in this file touches the gate. A low score
-- does not close a gate and a high one does not open it, because his
-- `Projects.Gate Ready?` formula does not mention the score. If ARPA wants the
-- score to gate, that is a change to his rule and he has to ask for it.

create table if not exists ios_project_scores (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references ios_projects (id) on delete cascade,
  ratings jsonb not null default '{}'::jsonb,
  kills text[] not null default '{}',
  notes text,
  scored_by text,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(ratings) = 'object'),
  check (cardinality(kills) <= 13)
);

comment on table ios_project_scores is
  'Scoring_Model. One row per project holding the sixteen 1-5 ratings across his
   three gates (QSS, OM, PFR) plus the ticked kill criteria. The 0-100 score is
   NOT stored: lib/ios/scoring.ts derives it from these ratings and his weights,
   so there is one implementation and the number cannot go stale.';

comment on column ios_project_scores.project_id is
  'Unique, so a project has exactly one scorecard. History of a score is not kept
   here on purpose: what the firm has to be able to replay is the decision, and
   ios_gate_decisions already freezes that with its own reasoning.';

comment on column ios_project_scores.ratings is
  'jsonb keyed <gate>_<criterion>, e.g. qss_ebit, value 1-5. A key that is absent
   means nobody has rated that criterion, which is different from a rating of 1.
   His Field_Dictionary rule is that a gate score stays blank until all of its
   criteria carry a value, so absence is load-bearing and must never default.';

comment on column ios_project_scores.kills is
  'Funnel_Stages kill criteria a person has ticked, as k1..k13. A tick vetoes its
   own gate regardless of the arithmetic.';

create index if not exists ios_project_scores_project_idx
  on ios_project_scores (project_id);
