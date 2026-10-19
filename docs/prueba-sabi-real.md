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

## What the system got right

Identity and CIF, city and region, CNAE, founding year, and all eight years of
accounts. The derived figures came out of the parser and the intake without a
human touching them: revenue CAGR 1.1 %, EBITDA margin 14.8 %, leverage 1.48x.
The kill criterion for a company outside the mandate's size band fired on its own.

## Three real bugs the file found

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
  administrador, all appointed 01/06/2017, BvD independence indicator U. The
  parser leaves it in the notes, unread.
- **The three administradores are not extracted as stakeholders**, even though
  the stakeholders table exists.
- **No capex in the export**, so cash conversion cannot be computed.
