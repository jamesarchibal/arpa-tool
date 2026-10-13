# IOS v0.0.0 action plan

What ARPA asked for on the 2026-10-13 call, and the order to build it in.

Ignasi presented an Investment Operating System. The agreed deliverable is a demo
of that architecture as we understood it. The demo is not the product. Its only
job is to let ARPA choose between a custom build, Airtable, or a hybrid. So it
has to be narrow and sharp, not broad.

Two boundaries, stated up front:

- The custom vs Airtable decision is ARPA's, not ours.
- Portfolio management is out of scope for this version. Ignasi said so.
- They keep working in Excel. The demo has to assume that, not fight it.

## The model they described

Three core entities, all three static or near static:

1. **Companies.** The raw material. A company does not move.
2. **Temáticas.** The investment theses, for example relevo generacional or plan
   de expansión internacional. Only two or three plays. Pre-loaded.
3. **Industrias.** A taxonomy of industry > category > subsector, carrying ARPA's
   own pre-score of which subsectors interest them, plus typical margins, CNAE
   codes and keywords. Example: Electrical Equipment > fabricantes de mecanismos
   eléctricos.

Company + temática + industria = a **project**. The project is the thing that
moves. A dead project can be reactivated.

The important detail, easy to miss: **a project can hold several companies.**
Ignasi's words were "podries tenir un deal que sigui de tres companyies". A
buy-and-build is one deal over three targets. Today the schema says one project
has exactly one company, so this is the one structural change that cannot be
avoided or deferred.

Off a project hang: documents in and out, tasks, contacts, interactions, sources,
users with roles, valuations, due diligence.

## Where we are versus where that model is

| IOS concept | today | gap |
| --- | --- | --- |
| Companies | `arpa_companies`, 22 columns | fine as is |
| Temáticas | nothing | new table |
| Industrias | `arpa_taxonomy`, 20 rows, sector/category/subsector + growth/fragmentation/consolidation | needs pre-score, margins, CNAE, keywords |
| Project = company + temática + industria | `arpa_projects.company_id`, one company | needs a join table, plus `theme_id` and `taxonomy_id` |
| Funnel with approval gates | `arpa_projects.stage`, 11 values, no record of who approved what | needs a decision per gate |
| Kanban of cards | a table only | new view over the existing data |
| Proyectos tab | nothing, the project detail is reached from the pipeline table | new route |
| Documents in and out | `arpa_documents`, 0 rows | needs a direction and a stage |
| Interactions from email | CSV and ICS import, done 2026-10-13 | Outlook later |
| Multi-source ingest | SABI workbook parser, BORME loader | one standardisation screen, later |
| Agents per stage | nothing | last |

Three of the thirteen `arpa%` objects are views, not tables: `arpa_sourcing`
(Originación), `arpa_pipeline` (Pipeline) and `arpa_borme_signals`. `arpa_origination`
is the real BORME table, 4,993 rows, loaded by `scripts/borme-load.mjs`. Anything
that changes the shape of a project has to change those views in the same
migration or the two front tabs break.

## Phases

Ordered by structural weight, heaviest first. Each phase leaves the app working.

### Phase 1 · The three core tables

- `arpa_themes`: id, name, slug, description, active, sort. Pre-loaded.
- `arpa_taxonomy` gains `pre_score` (ARPA's own interest, not a computed score),
  `margin_typical_pct`, `cnae_codes text[]`, `keywords text[]`, `notes`.
- `arpa_projects` gains `theme_id` and keeps `taxonomy_id` resolved from its
  companies, so a project declares its own industry rather than inheriting it.

Additive only. Nothing breaks.

### Phase 2 · Project to company becomes many-to-many

The risky one, so it goes early while the database holds 1 company and 1 project.

- New `arpa_project_companies` (project_id, company_id, role, is_primary).
  `role` is which part the company plays in the deal: plataforma, add-on, target.
- Backfill from `arpa_projects.company_id`, one row each, `is_primary = true`.
- Keep `arpa_projects.company_id` for now as the primary company, so the views and
  every existing query keep working. Drop it only once nothing reads it.

That last point matters. A migration that drops the column and rewrites eleven
queries in one step has no safe half-way state.

### Phase 3 · The funnel with gates

Ignasi's funnel is five gates, not eleven stages: identified, screening (15
minutes, one page out), opportunity memo (3-4 pages), financial assessment,
investment case. Then closing, then portfolio.

- `arpa_stage_decisions`: project_id, stage, decision (pass/advance/park),
  decided_by, decided_at, rationale. One row per gate crossed.
- The stage can then be derived from the decisions instead of being typed in.
- Per-stage deliverable templates: the one-pager and the 3-4 pager.

### Phase 4 · The two views they asked to see

- A kanban board, columns as cards, like the Joblanders ATS board. Columns for
  screening, finanzas, caliente. Clicking a card opens the project.
- A Proyectos tab of filterable cards, filtered by temática, industria and stage.

This is the phase ARPA will actually look at. Phases 1-3 exist to make it honest.

### Phase 5 · The Excel bridge

They are not leaving Excel, so the demo has to meet it.

- Download the Excel per company and per project. **Done for the project**:
  `/export/proyecto?id=` writes a six-sheet `.xlsx` (ficha, finanzas, scoring,
  personas, interacciones, documentos) from `lib/arpa/project-xlsx.ts`. Figures
  go in as numbers, not as formatted text, and every derived one comes from the
  same `derive()` the screen uses, so the file cannot disagree with the app.
- A folder per project that syncs with SharePoint.
- Outlook into interactions.

### Phase 6 · Agents

Last, and only once a stage has a template and a deliverable to fill:

- A financial screening agent.
- A competitor benchmark agent.
- An agent that writes a stage's deliverable from its template.

## The one blocker

The temáticas and the enriched taxonomy are ARPA's own content. Ignasi has them
in his slides and an Excel and agreed to send them. We do not invent them.
Inventing plausible-looking demo content has already cost one round of rework on
this project.

Until those arrive, Phase 1 ships the empty tables and the screens to edit them.
That is useful on its own: it is the screen where Ignasi types his own two or
three plays in, which is a better demo than a list we guessed.
