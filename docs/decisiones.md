# Decision ledger

Every explicit instruction James gave on this project, in the order he gave it,
with what state it is in now. Written because the instructions arrived across
many sessions and several of them silently replaced an earlier one.

Status words: **hecho**, **parcial**, **pendiente**, **sustituido** (a later
instruction overrode it), **permanente** (a standing rule, never "finished").

## Open now, in build order

These are the live actions. Everything below this section is history.

| # | Action | Comes from | State |
| --- | --- | --- | --- |
| A1 | A flagged demo dataset: several companies, projects spread across the funnel lanes, with financials, people, interactions and documents. All `is_example`, all clearable in one click. | "ni abre los cards de empresa con la info aunqeu sea de demo fake" | **hecho**. `20261014_arpa_demo_seed.sql`: 10 companies, 8 projects, 10 people, 13 interactions, 9 documents. Scores come from `scripts/seed-demo-scores.ts`, which runs ARPA's own engine over those figures, because a score typed by hand is a number nobody computed. |
| A2 | Change a project's stage from the board card itself. | "ni se cambian las tarjetas de estado" | **hecho**. The board card reuses the pipeline's `StageSelect`, and the lane is derived from the stage, so changing it moves the card. |
| A3 | Make a deal's people visibly the same people as Contactos, in both directions. | "ni veo los stakeholders de la empresa guardarse tambien en la otra pestaña" | **hecho**. The wiring already existed in both directions. What was missing was rows, and a link: the name on a deal's Personas tab now opens that person in Contactos. |
| A4 | Rebuild Originación to Ignasi's dual model: an opportunistic path (an advisor sends an infomemo) and a proactive path that starts from a temática plus a subsector, analyses the industry and comparables, and only then names companies. | "la pestaña originacion no tiene que ver con lo que decia el" | **hecho**. Two doors on `/`. The proactive one is a URL (`?tema=&sub=`), so a camino is shareable. The SABI plus BORME list is still there, but underneath the proactive path, because it is a tool of that path and not the path itself. |
| A5 | Gates: `arpa_stage_decisions` (project, stage, decision, who, when, why), stage derived from decisions, plus the one-pager and the 3-4 pager deliverables. | Phase 3 of `ios-v0.md` | **pendiente**. Ignasi's funnel is gates, not stages. |
| A6 | Project detail UI for `arpa_project_companies`, so a buy-and-build over three companies can be shown. | "podries tenir un deal que sigui de tres companyies" | **pendiente**. The table exists since the 2026-10-13 migration, and the demo has a three-company deal in it (ARPA-26-006). Only the board's "+ 2 empresa(s) más" line reads it. |
| A7 | A card opens as a popup with everything known about the deal: ficha, three years of figures, the derived ratios, the valuation chain, scores, people, documents, and a downloadable Excel. Stage, temática and industria editable from inside it. | "me falta ver cards con toda la informacion de empresas como pide ignais, con las finanzes, con excel decargable", "el card debe abrirse en un popup con toda esa info", "y poder editar los estados" | **hecho**. `?ficha=<id>` on `/proyectos`, so the popup is a URL and the body stays a server component. The Excel is a real six-sheet `.xlsx` at `/export/proyecto?id=`, which is the per-project half of Phase 5. |
| A8 | The scoring has to be visible on the screens that list deals, not only inside a ficha. | "en la pestaña originacion y en proyectos tampoco tienen scoring pero ya tenias lo que necesitabamos para el scoring" | **hecho**. This was my regression: A4 pushed the SABI list, which carried the pills, under a collapsed `details`, and the camino table that replaced it on screen had no score column. Fixed with one shared `app/_gates.tsx` used by all three screens, its thresholds read from the engine's own `DEFAULT_PROCEED_AT` / `DEFAULT_MONITOR_AT`, so a colour cannot mean two things. `getCamino` reads the gates from the `arpa_pipeline` view rather than re-deriving them. |
| A9 | Run a real SABI export end to end and fix whatever it breaks. | "can you use this excel to try and do the process we deisgned for them? test our system use the scoring and do it all aiwhtout asking me" | **hecho**. Full write-up in `prueba-sabi-real.md`. Three bugs, none of which the demo seed could have surfaced: the parser read the years backwards on a single-company export, a gate scored off 30 % of its weight was painted green as a verdict, and every screen was serving Next-cached Supabase reads. |
| A10 | A SABI export can carry the GROUP’s accounts instead of the company’s, and the import has to say which. | Second pass over the same file, cell by cell | **hecho**. This export is headed `Cuentas Consolidadas` and SABI says both bases exist. So 56 M€ of revenue and 8.3 M€ of EBITDA belong to three companies, and the 1-5 M€ mandate was tested against a number that is not the target’s. The basis now rides in `financials_src`, which the ficha prints as Fuente. |
| A11 | Originación was two screens for one thing. The camino is a filter, so it belongs on top of the list, not above its own copy of it. | "si es un buscador/filtro no deberia estar separado de la lista de debajo. el cuadro vacio es la lista de abajo" | **hecho**. The temática and the subsector are now two more filter rows of the single list, which shows the whole history by default. The picker card, its duplicate table and the `<details>` are gone. `arpa_sourcing` had to expose `theme_id`, `theme_name` and `taxonomy_id`, which `SourcingRow extends PipelineRow` already claimed it returned. |
| A12 | An upload should produce a NAMED project, and you should choose which companies go inside it. Originación should then list projects, not companies. | "al hacer una subida de una emrpesa o varias, eso se convirte en proyecto... crear el nombre del pryecto y decidir qué va dentro" | **a medias**. Done: a project has its own `name`, nullable so nothing had to be backfilled with invented text (null means "called after its primary company", read through `projectTitle()`), and both doors of Originación plus the Proyectos button ask for it. `arpa_project_companies` is now backfilled and written by all four creation paths through `linkPrimaryCompany()`, so `company_count` stopped being 0 on every real project. Still open: the import creates one project per company and never asks, so there is no step where you name the project and pick which companies go inside. |
| A13 | Pipeline and Proyectos are one tab. | "luego pipeline y proyectos me parece el mismo tab, porque los dejarias separados?" | **hecho**. They were provably the same rows: `getProjects()` wraps `getPipeline()` and both read `arpa_pipeline`. The only difference was that one painted the money columns. Pipeline is now `?v=tabla`, a third view next to Tablero and Tarjetas, and its money summary is computed over the FILTERED rows instead of always over everything. `/pipeline` 307s to `/proyectos?v=tabla` because that URL was live for weeks. Side effect worth having: a table row and a board card now open the same popup, which is part of why the two tabs felt unrelated. |

Blocked, and stays blocked: the real temáticas and the real pre-scores are
ARPA's content. Ignasi agreed to send his slides and Excel. We do not invent
them. Inventing plausible content has already cost one round of rework here.

## Standing rules

| Rule | Instruction |
| --- | --- |
| "despliega" means live on joblanders.ai | "subejo en joblanders.ai siempre que digo despliega ya me refiero a eso" |
| Keep replies short | "can you reply much shorter my man?" |
| No Airtable, no Microsoft dependency | decision 2 of five: "LETS BUILD SOMETHING THAT DONT DEPEDN ON AIRTABLE OR MICROSFOT" |
| Scores are 0-100, not 1-5 | decision 4 of five: "THE SECOND" |
| No SABI API. Manual now, API-shaped later | decision 1 of five: "NO ACESS TO API JUT NOW" |
| Marc scores, timing decided together | decision 3 of five |
| Stakeholders is a light CRM | decision 5 of five: "WHATEVER IS BEST FOR WHAT HE WANTS" |
| Orchestrated by ARPA through their own Claude account, not our API tokens | "este sistema idealmente estaria orquestrado por ellos a través de su cuenta de claude no de api y consumo de tokens" |

That last one is **pendiente** and nothing in the app addresses it yet. It
matters more than it looks: it decides whether the agents of Phase 6 run on our
key or inside their Claude seat.

## The ledger

### Hosting and shape of the deliverable

| Instruction | State |
| --- | --- |
| Put it at `joblanders.ai/arpa`, password `arpapartners` | hecho |
| Copy the password page from the other pages | hecho |
| Remove the first tab, then the second, leave only the calculator | sustituido |
| The tool is the whole deliverable, not a landing page. Replace `/arpa` with the app | hecho |

### Scoring

| Instruction | State |
| --- | --- |
| Build their scoring model interactively: upload a P&L, their own variable criteria, and it says whether the company is good | hecho |
| Use their real Kill Criteria as vetoes, their controlled lists verbatim, their valuation model, their field names | hecho |
| The scoring engine is the calculator built from their variables. Reuse it, do not rewrite it | hecho |
| Scoring stops being the headline | hecho |
| The scoring tab disappears, because scoring now happens inside Originación | hecho |

### Origination, three generations of it

| Instruction | State |
| --- | --- |
| Gen 1. Origination feed from BORME is the ask. Order: origination, pipeline, stakeholder CRM, scoring | sustituido |
| Document the signals, and split them pre-transaction versus post-transaction | hecho |
| Gen 2. Everything starts from THEIR SABI export. Import, order, score, choose what goes to Pipeline | hecho |
| SABI pulls the BORME signals of the selected companies. Unattached BORME rows are not needed | hecho |
| Merge Importación and Originación into one tab | hecho |
| Remove the prompt and the JSON paste flow | hecho |
| A button that looks up a company in SABI and populates its card. Manual now, shaped for the API later | parcial |
| Gen 3. Dual origination: opportunistic infomemo, and proactive from subsector to comparables to named companies | hecho |

Three generations in three weeks is not churn. Gen 1 came from Marc's emails,
Gen 2 from the call with Marc, Gen 3 from Ignasi's architecture. Each one came
from a different person with more authority over the answer.

### Pipeline and CRM

| Instruction | State |
| --- | --- |
| Open opportunities in a CRM with states you can move | hecho |
| A page with stakeholders plus a general agenda, with info per person | hecho |
| Add contacts of the companies selected in Pipeline | hecho |
| Upload contacts from email and calendar. CSV and ICS files, not an OAuth connector | hecho |
| Internet scraping beyond SABI | pendiente, explicitly later |

### The three partner-level gaps

Raised as my own closing bullets, and James said "si" to resolving them.

| Gap | State |
| --- | --- |
| Eloi's only explicit requirement: export the whole database to Excel | hecho, CSV export |
| Ignasi's Quick Snapshot template | hecho |
| Ignasi's Opportunity Memo template | pendiente, folds into A5 |
| Ignasi's standard projections Excel | pendiente, folds into A5 |
| Their plan B is real: Airtable plus a freelance. Compete only where it cannot reach | permanente |

### IOS v0.0.0, from the 2026-10-13 meeting

The current version. Full plan in `ios-v0.md`.

| Instruction | State |
| --- | --- |
| Build a demo of Ignasi's architecture so ARPA can choose custom, Airtable or hybrid | en curso |
| Assume they keep working in Excel | permanente |
| Portfolio management is out of scope for this version | permanente |
| A separate Proyectos tab, not a kanban folded into Pipeline | hecho |
| Demo data must be seeded but flagged as an example, and clearable | hecho as a mechanism, **A1 is the missing content** |
| The two master lists get their own Ajustes tab | hecho |
