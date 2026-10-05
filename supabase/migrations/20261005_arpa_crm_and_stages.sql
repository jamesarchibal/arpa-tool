-- ARPA Partners · widen two controlled lists.
--
-- 1. arpa_stakeholders.kind
--    Marc asked for a database of INVESTORS plus legal and financial advisers.
--    The original list only had 'Co-investor', which is a different thing: a
--    co-investor sits beside ARPA in a deal, an investor is someone whose money
--    ARPA may raise. 'LP' is the fund-level version of the same relationship.
--
-- 2. arpa_projects.stage
--    The blueprint (section 4) names nine stages. We shipped six. The missing
--    four are the whole second half of a deal, so a project could never be
--    recorded past the Investment Case. 'Sourcing' and 'Closed' are kept because
--    rows already use them: origination promotes into Sourcing, and Closed is a
--    terminal state the blueprint expresses as a separate Decision field.

alter table public.arpa_stakeholders
  drop constraint if exists arpa_stakeholders_kind_check;

alter table public.arpa_stakeholders
  add constraint arpa_stakeholders_kind_check check (kind in (
    'Owner','Family member','Management','Advisor','Banker','Broker',
    'Lawyer','Accountant','Lender','Investor','LP','Co-investor',
    'Intermediary','Other'));

alter table public.arpa_projects
  drop constraint if exists arpa_projects_stage_check;

alter table public.arpa_projects
  add constraint arpa_projects_stage_check check (stage in (
    'Sourcing','Screening','Assessment','Preliminary Financial Review',
    'Investment Case','LOI & Exclusivity','Full Due Diligence',
    'Final Investment Approval','Closing','Portfolio','Closed'));

-- The CRM list filters by kind and searches by name or organisation.
create index if not exists arpa_stakeholders_kind_idx
  on public.arpa_stakeholders (kind, full_name);
