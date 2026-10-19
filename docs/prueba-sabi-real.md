# Prueba con un SABI real: PROMOCIONS LLORENS DEL VALLES ORIENTAL SL

The first time the pipeline ran on a file ARPA actually downloaded, instead of on
the demo seed. One company, a "Complete" single-company SABI export, straight
through the real code path: parse, intake, scoring, screens.

File: `260224 SABI_Export_Promocions Llorens Complete.xlsx`.
Project created: `f67e1280-8e64-4173-bca8-fd11e88c449c`.

Nothing here was hand-fed. The intake script called `intakeBatchSchema.safeParse`
and then `runIntake(...)`, exactly as the import form does, with `units: 'eur'`.

## Result

| Gate | Score | Coverage | Verdict as shown |
| --- | --- | --- | --- |
| QSS | 75 | 65 % | thin, no verdict |
| OM | 80 | 60 % | thin, no verdict |
| PFR | 90 | 30 % | thin, no verdict |

Two kill criteria were detected from the data: k2 (EBITDA outside the 1-5 M€
mandate) and, once the sector fit is corrected, k3.

## Field by field against the raw cells

Every figure below was checked against the cell it was scraped from, not against
another run of the parser.

| Field | In the Excel | Stored | |
| --- | --- | --- | --- |
| Razón social | PROMOCIONS LLORENS DEL VALLES ORIENTAL SL | igual | ok |
| CIF | B62913454 | B62913454 | ok |
| Localidad y provincia | 08440 CARDEDEU (BARCELONA) | CARDEDEU / BARCELONA | ok |
| CNAE | 6820 primario, de cuatro | 6820 Alquiler de bienes inmobiliarios | ok |
| Constitución | 12/06/2002 | 2002 | ok |
| Empleados | 230 (2024) | 230 | ok |
| Ingresos 2022-24 | 54,959,799.51 / 49,576,618.47 / 56,148,524.03 | 54.9598 / 49.5766 / 56.1485 M€ | ok |
| EBITDA 2022-24 | 8,349,528.02 / 8,739,004.49 / 8,334,893.06 | 8.3495 / 8.7390 / 8.3349 M€ | ok |
| Fondo de maniobra | 10,006,969.54 | 10.0070 M€ | ok |
| Deuda neta | 6,527,512.14 + 13,997,654.73 - 8,220,057.90 | 12.3051 M€ | ok |
| Capex | no está en el export | null | ok |

Eight years parsed, three stored, which is what the scoring model consumes.
Derived without a human: CAGR a tres años 1.1 %, margen EBITDA 14.8 %,
apalancamiento 1.48x. The kill criterion for a company outside the mandate's
size band fired on its own.

The notes field also picked up the activity, the legal form, the share capital,
the last filing date, the BvD independence indicator and the Global Ultimate
Owner line, which is more context than a column model would have kept.

## Four real bugs the file found

### 0. The figures are the group's, and nothing said so

The worst of the four, found on a second pass over the raw cells. The accounts
block in this export is headed **Cuentas Consolidadas**, and row 12 says
`Cuentas disponibles: Cons. & No Cons.`. So 56.1 M€ of revenue and 8.3 M€ of
EBITDA are the group's, over the three companies SABI lists (the target plus
LLORENS GMR S.L. and TREE BOX S.L., both 100 % owned).

ARPA's mandate is 1-5 M€ of EBITDA. The deal was therefore sized, and killed on
k2 for being too big, on figures that are not the target's. The company's own
accounts exist in SABI and were simply not printed in this export.

The parser's regex accepted either basis, took the first block and threw the
answer away. It now records which basis it read and it travels with the figures
into `financials_src`, the field the ficha already prints as "Fuente". The notes
also carry `Cuentas disponibles`, so the reader can see that the other basis is
one re-export away. Same change added the `Presidente` line, which was being
dropped while the `Director ejecutivo` was kept.

This is not a scoring bug. The scoring was right about the numbers it was given.

## Three more

### 1. The parser read the years backwards

`sabi-xls.ts` assumed SABI prints newest year first. A single-company export
prints 2017 to 2024, left to right. The code did not fail, it handed the series
over reversed, so `latest()` returned the oldest year: employees came back 72
instead of 230, net debt 3.6 M€ instead of 12.3 M€, working capital 4.7 M€
instead of 10.0 M€.

The direction is now read off the year header row, and `series()` refuses a row
whose value count does not match the year count rather than aligning it by
guesswork. The test fixture was descending-only, which is exactly why the bug
survived; it now builds the same company both ways and asserts identical output.

### 2. A score built on 30 % of the weight looked like a verdict

PFR came out 90/100, "Build Investment Case", in green, from two cheap criteria
answered well and three expensive ones not asked at all. Next to a fully
diligenced deal at 82 it read as the better opportunity.

The renormalisation that causes this is correct: a blank criterion should not drag
a gate towards zero. The display was what lied. Every gate now carries its
coverage, computed from the `{w, score}` map `arpa_scores.criteria` already
stores, so no new column was needed. Under `MIN_COVERAGE_FOR_VERDICT` (70 %) the
pill goes grey, prints the percentage, and its tooltip says how much of the gate
is still unanswered. The score itself, the verdict and the thresholds are
untouched: the pass/monitor/proceed rule is ARPA's method, not ours to move.

This was invisible in the demo because every seeded deal is scored to 100 %
coverage on every gate.

### 3. The screens were serving stale data

Found while smoke testing the fix: a company renamed in Postgres kept showing its
old name on reload, and the newly imported company did not appear at all. Next
patches global fetch and caches GETs on disk, and a Supabase read is a GET, so
`export const dynamic = 'force-dynamic'` was not enough on its own. The server
client now passes `cache: 'no-store'`. In a pipeline several people edit, a stale
row is worse than a slow one.

Worth keeping in mind: this is why the first smoke test of this session looked
like the coverage work had not shipped. The page was fresh, the data was not.

## What the system does not do yet

- **`taxonomy_fit` defaults to `'in'` on import.** A real estate promoter
  therefore scored a flattering 5/5 on sector fit. Set to `'out'`, QSS drops from
  75 to 65 and kill criterion k3 fires. Nothing in the import asks the question.
- **`arpa_taxonomy.cnae_codes` exists but is empty except for one row.** The
  parser already extracts the CNAE, so the join that would set the fit
  automatically is one populated column away. The content is ARPA's and stays
  blocked.
- **Detected kill criteria are advisory.** `suggestedKills` runs with
  `blockOnSuggested: false`, so k2 and k3 did not stop the deal. Only a human tick
  vetoes. That is a deliberate choice, but it means a demo can show a deal
  reaching "Build Investment Case" with two kill criteria already visible in the
  data.
- **Ownership is not inferred.** This file is a textbook family succession:
  Cladellas Parera as president, Llorens Cladellas as CEO, Llorens Sierra as
  administrador, all appointed 01/06/2017, BvD independence indicator U, zero
  registered shareholders. All three names are now in the notes, but
  `ownership_type` is still null and nothing scores it.
- **The three officers are not extracted as stakeholders.** The
  `arpa_stakeholders` and `arpa_stakeholder_links` tables exist and this company
  has zero rows in them. The appointment dates would also fill `admin_since`,
  which the intake schema already has as the owner-age proxy.
- **The two subsidiaries are not captured.** LLORENS GMR S.L. and TREE BOX S.L.,
  both 100 %, with their own revenue and headcount in the export.
  `arpa_project_companies` is exactly the table for this.
- **No capex in the export**, so cash conversion cannot be computed.
- **The basis and the notes are on different screens.** The ficha popup prints
  `cuentas consolidadas` under "Fuente" but no notes; the project detail page
  prints the notes, including `Presidente` and `Cuentas disponibles`, but not the
  basis. Both checked against the live HTML. Nothing is lost, but a reader has to
  open two views to see that the figures are the group's and that the company's
  own accounts exist.
