-- V2 pipeline: ARPA's nine stages, where a stage only moves through a gate.
--
-- The transactional half of V2. Five tables, one view and one function. The
-- catalogue migration loads from their Excel; everything here is created by
-- people using the app.
--
-- The one idea this file is built around: in V2 there is no way to set a stage.
-- `app/v2/actions.ts` exports no `setStage`, there is no stage dropdown, and the
-- only writer is `ios_record_gate_decision`. A project advances because a gate
-- decision of type Advance was approved while the gate was open, or it does not
-- advance. That is their automation A16, and it is the single difference between
-- a pipeline you can trust and a column of free text.
--
-- A16 is enforced here, in the database, and not only in the action:
--
--   check (decision_type <> 'Advance' or status <> 'Approved'
--          or gate_ready_at_decision)
--
-- so a bug in the action, a future second code path, or someone typing an insert
-- into `scripts/q.mjs` all hit the same wall.
--
-- Where the logic is NOT: the view `ios_project_gate_facts` returns the facts a
-- gate needs (which documents are approved, is there a thesis, what are the LOI,
-- DD and Closing statuses, is there a next step) and never a verdict. The verdict
-- is `gateReady()` in `lib/ios/gates.ts`, a pure function with a test per rule.
-- A gate rule expressed in SQL is a gate rule nobody can unit test.
--
-- No RLS, same as V1 and same as the catalogue migration.

-- ------------------------------------------------------------------ projects

create table if not exists ios_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  project_type text not null default 'Single Company',

  -- Stage and status are two columns on purpose (their D02). A passed deal keeps
  -- the stage it died in, which is what makes the funnel countable: "we lose 60
  -- per cent at Assessment" is only answerable if Passed is not itself a stage.
  stage text not null default 'Screening',
  stage_status text not null default 'Not Started',
  stage_entered_at timestamptz not null default now(),
  project_status text not null default 'Active',

  priority text,
  owner text,
  thesis_id uuid references ios_theses (id) on delete set null,
  thesis_fit text,
  primary_strategy text,
  industry_id uuid references ios_industries (id) on delete set null,
  origin_type text,

  loi_status text not null default 'Not Started',
  full_dd_status text not null default 'Not Started',
  closing_status text not null default 'Not Started',

  -- Typed by a person, because the DD Tracker is out of V2's scope. A visible
  -- stump: the Full DD gate reads it and will not open until it is 0.
  open_required_dd_items integer not null default 0,

  next_step text,
  next_step_due date,
  review_date date,

  pass_lost_reason text,
  decisive_evidence text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ios_projects_stage_check
    check (stage in ('Screening', 'Assessment', 'Preliminary Financial Review',
                     'Investment Case', 'LOI & Exclusivity', 'Full Due Diligence',
                     'Final Investment Approval', 'Closing', 'Portfolio')),
  constraint ios_projects_stage_status_check
    check (stage_status in ('Not Started', 'In Progress', 'Blocked',
                            'Awaiting Decision', 'Complete')),
  constraint ios_projects_status_check
    check (project_status in ('Active', 'Monitor', 'Paused', 'Passed',
                              'Closed Won', 'Closed Lost')),
  constraint ios_projects_type_check
    check (project_type in ('Single Company', 'Build-up', 'Merger')),
  constraint ios_projects_priority_check
    check (priority is null or priority in ('High', 'Medium', 'Low')),
  constraint ios_projects_thesis_fit_check
    check (thesis_fit is null
           or thesis_fit in ('Core Thesis', 'Adjacent Thesis', 'Opportunistic',
                             'New Thesis Candidate')),
  constraint ios_projects_loi_status_check
    check (loi_status in ('Not Started', 'Drafting', 'Submitted', 'Accepted',
                          'Rejected', 'Withdrawn')),
  constraint ios_projects_full_dd_status_check
    check (full_dd_status in ('Not Started', 'In Progress', 'On Hold', 'Complete')),
  constraint ios_projects_closing_status_check
    check (closing_status in ('Not Started', 'In Progress', 'Delayed', 'Closed',
                              'Aborted')),
  constraint ios_projects_dd_items_check
    check (open_required_dd_items >= 0),
  constraint ios_projects_pass_lost_reason_check
    check (pass_lost_reason is null
           or pass_lost_reason in ('Valuation Gap', 'Size Outside Mandate',
             'Sector / Thesis Fit', 'Business Quality',
             'Financials / EBITDA Quality', 'DD Finding (Legal / Tax / Other)',
             'Ownership Not Ready', 'No Response', 'Lost to Other Buyer',
             'Seller Withdrew', 'Financing', 'Other'))
);

create index if not exists ios_projects_stage_idx on ios_projects (stage);
create index if not exists ios_projects_status_idx on ios_projects (project_status);
create unique index if not exists ios_projects_code_key
  on ios_projects (code) where code is not null;

comment on table ios_projects is
  'IOS v9 Projects. The stage is written by ios_record_gate_decision and by nothing else: there is no setStage action and no stage dropdown in app/v2.';
comment on column ios_projects.open_required_dd_items is
  'Hand-typed, because the DD Tracker table is out of V2 scope. The Full Due Diligence gate requires 0.';
comment on column ios_projects.project_status is
  'Separate from stage (their D02). Passed and Closed Lost are statuses, so a dead deal keeps the stage it died in and the funnel stays countable.';

-- ---------------------------------------------------------- project perimeter

create table if not exists ios_project_companies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references ios_projects (id) on delete cascade,
  company_id uuid not null references ios_companies (id) on delete restrict,
  role text not null default 'Target',
  inclusion_status text not null default 'Under Review',
  notes text,
  created_at timestamptz not null default now(),

  constraint ios_project_companies_role_check
    check (role in ('Target', 'Platform', 'Add-on', 'Merger Partner')),
  constraint ios_project_companies_status_check
    check (inclusion_status in ('Under Review', 'In Scope', 'Dropped', 'Acquired'))
);

create unique index if not exists ios_project_companies_key
  on ios_project_companies (project_id, company_id);

comment on table ios_project_companies is
  'The perimeter: which long-list companies this project is about, and in what role. A build-up has one Platform and several Add-ons, which is why this is a table and not a column.';

-- ----------------------------------------------------------------- documents

create table if not exists ios_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references ios_projects (id) on delete cascade,
  doc_type text not null,
  doc_status text not null default 'Not Started',
  version integer not null default 1,
  title text,
  confidentiality text not null default 'Internal',
  url text,
  notes text,
  approved_at timestamptz,
  approved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ios_documents_type_check
    check (doc_type in ('QSS', 'OM', 'PFR', 'IC', 'LOI', 'DD Summary', 'FIM',
                        'Closing Package', '100-Day Plan', 'Teaser / CIM',
                        'Financial Data', 'Industry Snapshot', 'Market Study',
                        'Thesis Paper', 'Other')),
  constraint ios_documents_status_check
    check (doc_status in ('Not Started', 'Drafting', 'In Review', 'Approved',
                          'Rejected', 'Superseded')),
  constraint ios_documents_confidentiality_check
    check (confidentiality in ('Internal', 'Confidential (data room only)',
                               'Shareable')),
  constraint ios_documents_version_check check (version >= 1)
);

create index if not exists ios_documents_project_idx
  on ios_documents (project_id, doc_type, version desc);

comment on table ios_documents is
  'Project deliverables with a status. The status is what makes a gate possible: V1''s arpa_documents has none, so V1 cannot tell a draft QSS from an approved one.';
comment on column ios_documents.doc_status is
  'Superseded is how an old version stops counting. The gate facts view ignores Superseded rows entirely.';

-- ------------------------------------------------------------ gate decisions

create table if not exists ios_gate_decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references ios_projects (id) on delete cascade,

  -- The gate the decision belongs to, not the project's stage today. A16 requires
  -- them to be equal at the moment of the decision; this column is what lets the
  -- log still read correctly after the project has moved on.
  gate text not null,
  decision text not null,
  decision_type text not null,
  status text not null default 'Approved',

  rationale text not null,
  decided_at timestamptz not null default now(),
  decided_by text,

  -- Was the gate open when this was recorded, and why. The boolean is what the
  -- check constraint reads; the jsonb is the frozen output of gateReady().checks,
  -- so in six months an audit can see which requirement was met and which was not
  -- without re-deriving it from data that has since changed.
  gate_ready_at_decision boolean not null,
  gate_ready_detail jsonb,
  blocked_reason text,

  stage_before text not null,
  stage_after text,
  project_status_before text not null,
  project_status_after text,

  pass_lost_reason text,
  decisive_evidence text,
  created_at timestamptz not null default now(),

  constraint ios_gate_decisions_gate_check
    check (gate in ('Screening', 'Assessment', 'Preliminary Financial Review',
                    'Investment Case', 'LOI & Exclusivity', 'Full Due Diligence',
                    'Final Investment Approval', 'Closing', 'Portfolio')),
  constraint ios_gate_decisions_decision_check
    check (decision in ('Proceed', 'Continue', 'Build Investment Case',
                        'Submit LOI', 'Launch Full DD', 'Approve', 'Closed',
                        'Monitor', 'Pause', 'Reprice', 'Delayed', 'Pass',
                        'Reject', 'Walk Away', 'Lost', 'Aborted')),
  constraint ios_gate_decisions_type_check
    check (decision_type in ('Advance', 'Hold', 'Rework', 'Stop', 'Lost')),
  constraint ios_gate_decisions_status_check
    check (status in ('Proposed', 'Approved', 'Blocked', 'Withdrawn')),

  -- A16, in the database. An approved Advance is impossible unless the gate was
  -- open. Blocked attempts are still recorded, which is the point: a refused
  -- advance is audit, not an error to swallow.
  constraint ios_gate_decisions_advance_needs_ready
    check (decision_type <> 'Advance' or status <> 'Approved'
           or gate_ready_at_decision)
);

create index if not exists ios_gate_decisions_project_idx
  on ios_gate_decisions (project_id, decided_at desc);
create index if not exists ios_gate_decisions_log_idx
  on ios_gate_decisions (decided_at desc);

comment on table ios_gate_decisions is
  'The decision log, append-only in practice. Blocked rows are kept deliberately: an attempt to advance through a closed gate is the most interesting thing in the table.';
comment on constraint ios_gate_decisions_advance_needs_ready on ios_gate_decisions is
  'Their automation A16 as a constraint, so no code path at all can advance a stage with the gate closed.';
comment on column ios_gate_decisions.gate_ready_detail is
  'Frozen gateReady().checks at the moment of the decision. Recomputing it later would read today''s documents, not the ones the decision was actually made on.';

-- Which documents the decision was taken on, with the status they had then.
create table if not exists ios_gate_decision_documents (
  decision_id uuid not null references ios_gate_decisions (id) on delete cascade,
  document_id uuid not null references ios_documents (id) on delete cascade,
  doc_type text not null,
  doc_status text not null,
  version integer not null,
  primary key (decision_id, document_id)
);

comment on table ios_gate_decision_documents is
  'Evidence snapshot. The document can later be superseded and re-versioned; this row still says what the committee read.';

-- ---------------------------------------------------------------- gate facts

-- Facts, never a verdict. One row per project.
create or replace view ios_project_gate_facts as
with live as (
  -- The current document of each type: highest version among the rows that are
  -- not Superseded. A Superseded QSS must not open the Screening gate, which is
  -- exactly the case lib/ios/gates.test.ts covers.
  select distinct on (d.project_id, d.doc_type)
    d.project_id,
    d.doc_type,
    d.doc_status,
    d.version
  from ios_documents d
  where d.doc_status <> 'Superseded'
  order by d.project_id, d.doc_type, d.version desc, d.updated_at desc
)
select
  p.id as project_id,
  p.stage,
  p.project_status,
  p.thesis_id,
  t.code as thesis_code,
  p.loi_status,
  p.full_dd_status,
  p.closing_status,
  p.open_required_dd_items,
  coalesce(btrim(p.next_step), '') as next_step,
  coalesce(
    (select array_agg(l.doc_type order by l.doc_type)
       from live l
      where l.project_id = p.id and l.doc_status = 'Approved'),
    '{}'::text[]
  ) as approved_doc_types,
  coalesce(
    (select jsonb_object_agg(l.doc_type, l.doc_status)
       from live l
      where l.project_id = p.id),
    '{}'::jsonb
  ) as doc_status_by_type
from ios_projects p
left join ios_theses t on t.id = p.thesis_id;

comment on view ios_project_gate_facts is
  'The inputs gateReady() needs, one row per project. Deliberately contains no rule: whether QSS Approved plus a thesis opens Screening is decided in lib/ios/gates.ts, where it can be tested.';

-- ------------------------------------------------------- the atomic recording

-- Why this exists at all: supabase-js has no transactions. Recording a decision
-- is three writes (the decision row, the project patch, the next deliverable) and
-- the failure mode of doing them as three calls is the worst one available: the
-- decision is logged and the project never moves, so the log and the board
-- disagree and nobody knows which is right.
--
-- There is no business logic in here on purpose. Everything, including which
-- stage comes next and what the patch contains, is computed in TypeScript by
-- lib/ios/gates.ts and passed in. This function only writes.
create or replace function ios_record_gate_decision(
  decision jsonb,
  project_patch jsonb default '{}'::jsonb,
  new_docs jsonb default '[]'::jsonb
) returns uuid
language plpgsql
as $$
declare
  v_project uuid := (decision->>'project_id')::uuid;
  v_decision_id uuid;
begin
  if v_project is null then
    raise exception 'ios_record_gate_decision: decision.project_id is required';
  end if;

  insert into ios_gate_decisions (
    project_id, gate, decision, decision_type, status, rationale,
    decided_by, gate_ready_at_decision, gate_ready_detail, blocked_reason,
    stage_before, stage_after, project_status_before, project_status_after,
    pass_lost_reason, decisive_evidence
  ) values (
    v_project,
    decision->>'gate',
    decision->>'decision',
    decision->>'decision_type',
    coalesce(decision->>'status', 'Approved'),
    decision->>'rationale',
    decision->>'decided_by',
    coalesce((decision->>'gate_ready_at_decision')::boolean, false),
    decision->'gate_ready_detail',
    decision->>'blocked_reason',
    decision->>'stage_before',
    decision->>'stage_after',
    decision->>'project_status_before',
    decision->>'project_status_after',
    decision->>'pass_lost_reason',
    decision->>'decisive_evidence'
  )
  returning id into v_decision_id;

  -- The evidence snapshot, from document ids the caller already read.
  insert into ios_gate_decision_documents (decision_id, document_id, doc_type, doc_status, version)
  select v_decision_id, d.id, d.doc_type, d.doc_status, d.version
    from ios_documents d
   where d.id in (
     select (value #>> '{}')::uuid
       from jsonb_array_elements(coalesce(decision->'evidence_document_ids', '[]'::jsonb))
   );

  -- Only the keys actually present are written, so the caller can set a column to
  -- NULL (clearing a review date when a hold ends) without that being the same
  -- thing as leaving the column alone.
  if project_patch <> '{}'::jsonb then
    update ios_projects set
      stage = case when project_patch ? 'stage'
        then project_patch->>'stage' else stage end,
      stage_status = case when project_patch ? 'stage_status'
        then project_patch->>'stage_status' else stage_status end,
      stage_entered_at = case when project_patch ? 'stage_entered_at'
        then (project_patch->>'stage_entered_at')::timestamptz else stage_entered_at end,
      project_status = case when project_patch ? 'project_status'
        then project_patch->>'project_status' else project_status end,
      loi_status = case when project_patch ? 'loi_status'
        then project_patch->>'loi_status' else loi_status end,
      full_dd_status = case when project_patch ? 'full_dd_status'
        then project_patch->>'full_dd_status' else full_dd_status end,
      closing_status = case when project_patch ? 'closing_status'
        then project_patch->>'closing_status' else closing_status end,
      open_required_dd_items = case when project_patch ? 'open_required_dd_items'
        then (project_patch->>'open_required_dd_items')::integer
        else open_required_dd_items end,
      next_step = case when project_patch ? 'next_step'
        then project_patch->>'next_step' else next_step end,
      next_step_due = case when project_patch ? 'next_step_due'
        then (project_patch->>'next_step_due')::date else next_step_due end,
      review_date = case when project_patch ? 'review_date'
        then (project_patch->>'review_date')::date else review_date end,
      pass_lost_reason = case when project_patch ? 'pass_lost_reason'
        then project_patch->>'pass_lost_reason' else pass_lost_reason end,
      decisive_evidence = case when project_patch ? 'decisive_evidence'
        then project_patch->>'decisive_evidence' else decisive_evidence end,
      updated_at = now()
    where id = v_project;
  end if;

  -- The next gate's deliverable, created at Not Started so the new stage shows
  -- what it is waiting for instead of an empty document list.
  insert into ios_documents (project_id, doc_type, doc_status, version, title)
  select
    v_project,
    doc->>'doc_type',
    coalesce(doc->>'doc_status', 'Not Started'),
    coalesce((doc->>'version')::integer, 1),
    doc->>'title'
  from jsonb_array_elements(coalesce(new_docs, '[]'::jsonb)) as doc
  where not exists (
    select 1 from ios_documents e
     where e.project_id = v_project
       and e.doc_type = doc->>'doc_type'
       and e.doc_status <> 'Superseded'
  );

  return v_decision_id;
end;
$$;

comment on function ios_record_gate_decision(jsonb, jsonb, jsonb) is
  'Writes a gate decision, the project patch and any new deliverables in one transaction. Contains no gate rules: lib/ios/gates.ts decides, this only records. Exists because supabase-js cannot open a transaction.';
