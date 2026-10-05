# BORME origination signals

How ARPA finds companies that look like they are preparing to sell, using only
free public data.

Implemented in `scripts/borme-probe.mjs`. Every number on this page was measured
against real BORME publishing days, not estimated.

## What BORME is

The Boletin Oficial del Registro Mercantil is the official state bulletin where
every Spanish company's registry changes are published. When a company appoints a
director, changes capital, merges or hires an auditor, it must register that act
at the Registro Mercantil of its province, and the registry publishes it.

- Published every business day by the BOE. Free, no account, no API key.
- Electronic since 2009, served as structured XML.
- Covers essentially every active sociedad, because registering is not optional.
- We read **Section A** only ("Empresarios. Actos inscritos"). Sections B and C
  carry no pre-sale plumbing.

Reading it in bulk is legal. BORME is a bulletin published to be read, so the DGRN
Instruccion of 17 February 1998, which forbids mass extraction from the *registry*,
does not reach it.

## The funnel

Measured over September 2026, 22 publishing days:

```
38,234  acts published
 8,682  companies with at least one signal
   283  companies with two or more real signals   <- the shortlist
     9  companies with three or more
```

A "real" signal excludes `apoderado`, which fires about 300 times a day and means
nothing on its own.

## The eleven signals

| id | Signal | What it means | Weight | Sept |
|---|---|---|---|---|
| `holding_admin` | Corporate administrator appointed | A company, not a person, becomes administrator. The fingerprint of a holdco being slotted above the business, which is how a tax-efficient sale is set up | 5 | 443 |
| `escision_parcial` | Escision parcial / segregacion | A branch is carved out, usually the property. Owner keeps the building, sells the trading business | 5 | 55 |
| `escision_total` | Escision total | Company is split into pieces and dies. The beneficiaries are named in the same paragraph and are the new targets | 4 | 7 |
| `auditor` | Auditor appointed or changed | Either they crossed the legal audit threshold, or they are buying a clean audit nobody required. Both are useful. See "size proxy" below | 4 | 1,273 |
| `transformacion` | Transformacion de sociedad | SL becomes SA or back. Usually done to make the share structure fit a transaction | 4 | 45 |
| `reduccion_capital` | Reduccion de capital | Money leaving the company. Often the owner taking cash off the table | 3 | 487 |
| `consejo` | Consejero appointed or ceased | A board replaces a single administrator. Professionalising governance, which buyers ask for | 3 | 1,361 |
| `unipersonalidad_perdida` | Perdida del caracter de unipersonalidad | Stopped having a single shareholder, so a minority came in. Part of it already sold | 3 | 504 |
| `socio_unico_cambio` | Cambio de identidad del socio unico | The sole shareholder changed. The company already changed hands | 3 | 618 |
| `fusion_absorcion` | Fusion por absorcion | Absorbed by another company. The absorber is a consolidator, which feeds the consolidation map | 3 | 149 |
| `apoderado` | Apoderado appointed | Power of attorney. About 300 a day, pure noise. Tiebreak only | 1 | - |

### Two phases, never added together

Each rule carries a `phase`:

- **`prep`** (holding_admin, escision_parcial, auditor, transformacion,
  reduccion_capital, consejo). The owner is getting ready. There is still runway.
- **`done`** (socio_unico_cambio, fusion_absorcion, unipersonalidad_perdida,
  escision_total). A transaction already happened. **Not a lead.** Its value is
  that it points at whoever bought, which feeds the consolidation map.

The first version summed both, so a company that had already sold could outrank
one about to. `score` now covers `prep` only, `doneScore` covers `done`, and
`transacted` is a boolean. September splits as:

```
LEADS   preparing, 2+ acts, not sold    134
EARLY   preparing, 1 act, not sold    3,249   <- least contested
SOLD    already transacted            1,267   <- buyer feed
```

### Timing, and why a big cluster is not the best lead

Publication lag is **7 days median** from inscription (p90 = 8), so roughly 1 to 2
months from the original decision once the deed and the registrar's qualification
are counted.

The trap is the next step. An owner who has inserted a holdco **and** hired an
auditor has already decided to sell and has almost certainly already mandated an
advisor. You are early to the transaction but late to the mandate.

| Stage | In BORME? | Worth calling? |
|---|---|---|
| Owner has not decided | No, invisible | The real prize, unreachable for free |
| Plumbing just started, one act | Yes, `EARLY` | **Best window.** No advisor yet |
| 3+ acts clustered | Yes, loudly | Process well advanced, probably contested |
| Shareholder changed | Yes, `SOLD` | Gone. Chase the buyer instead |

So `firstPrepDate` matters more than the size of the cluster. Rank by **recency of
the first preparation act**, not by total score.

```
MASAMI SCHARA S.L, Barcelona
   4 Sept   reduccion de capital                      (3)
  28 Sept   consejo + holding_admin                   (3 + 5)
                                               score = 11
```

**The weights are a guess.** They were assigned by reasoning, not evidence. Until
they are calibrated against companies that actually sold, treat the score as a
sort order and not as a probability.

## Four signals that do NOT exist

Named from desk research, then measured at **zero occurrences**. Do not re-add
them without re-measuring.

| Expected | Why it is absent |
|---|---|
| `aportacion no dineraria` | Originally called the strongest single signal. A share-funded capital increase prints only as "Ampliacion de capital". The non-cash nature is not published |
| `fallecimiento` | Inheritance is never printed as a cause of cese |
| `director general` / `consejero delegado` | Not in BORME's cargo vocabulary, which is only Adm. Unico / Solid. / Mancom. / Consejero / Apoderado / Auditor / Liquidador |
| `prima de emision` | Not published |

Lesson: measure the vocabulary before designing rules on it.

## Exclusions

A company is dropped when it matches `constitucion`, `extincion`, `disolucion`,
`liquidacion`, `concursal` or `Fe de erratas`, but only if no rule marked
`survivesExclude` fired. So a restructuring split is kept while a plain
liquidation is not.

## Using the auditor signal as a free size proxy

Article 263 LSC forces an audit when a company exceeds two of three limits for two
consecutive years:

- total assets **EUR 2,850,000**
- revenue **EUR 5,700,000**
- average headcount **50**

So an auditor appearing in BORME means one of two things, and both are useful:

- **Mandatory**: the company is above those thresholds, so you have inferred a
  revenue floor from a free bulletin.
- **Voluntary**: nobody audits for fun. Buying an audit you do not legally need is
  a strong pre-sale signal.

A reform raising the limits to EUR 3,565,000 and EUR 7,125,000 is in progress but
is not yet published in the BOE. The current limits stand until it is.

## What BORME cannot give you

| Missing | Consequence |
|---|---|
| **CIF** | Not published. The durable key is the registry sheet (province + hoja), for example `H A 208326`. Joining to a bought XBRL deposit needs a name or hoja match |
| **Sector** | Section A publishes acts, not CNAE. `Objeto social` appears only on `Constitucion` and `Cambio de objeto social` |
| **Financials** | Never. Only capital, which is a weak size proxy |
| **The quiet company** | BORME is event-driven. A flat, profitable company with an ageing owner that files nothing is invisible, permanently |

### The sector blind spot, measured

`Objeto social` is published only at incorporation, and BORME is electronic only
since 2009. So a company incorporated in 1985 that never changed its purpose has
no objeto social anywhere in electronic BORME.

Of the 283 September movers, **128 (45%) were incorporated before 2009** and are
invisible to the sector harvest. 155 (55%) are visible.

Keyword matching on free-text objeto social also runs at roughly **40% precision**
(`FLORISTERIA MENCIA` was classified as fertilizers). Use it as a first pass only.

Better routes to sector, in order:

1. **CNAE from a SABI seat.** Covers 100% including pre-2009 companies, official
   codes. Licence permits internal use, not redistribution.
2. **Infer from the company name.** Free, instant, works on every vintage. Spanish
   SMEs often name themselves after what they do ("Conservas del Segura", "Famen
   Internacional Valves"). Roughly half of names are informative, the rest are
   surnames or invented words.
3. **The harvest.** Free and resumable, but 55% coverage at 40% precision. Low
   priority.

## Two patterns the incumbents do not sell

INFORMA D&B and Orbis record facts. They do not compute patterns over them. These
two are derived signals over public data, which is not resale of that data.

### 1. Clustering in time

71 companies in September fired two or more real signals on **separate publishing
days**. A single filing is administrative. A sequence is a process.

### 2. The consolidation map

Pull a buyer's acquisitions out of BORME, then list every company in the same
sector and province it has **not** bought. All of them are now candidates, and you
have a reason to call that is not "are you selling".

Visible live in September without any backfill:

```
IM2 ENERGIA SOLAR, Valencia
  13 separate SPVs, all: holding_admin + socio_unico_cambio, same month
```

An entire solar portfolio changing hands, for free. Whoever bought those 13 is now
a consolidator in Valencian solar.

The succession cohort self-identifies the same way:

```
"HIJOS DE ..."  6 family companies, 6 provinces, all appointed an AUDITOR
  Hijos de Jose Bassols . Hijos de R. Fernandez Balaguer
  Hijos de Francisco Nunez . Hijos de Francisco Piernas
```

Second-generation family businesses buying a clean audit in the same month.

## Running it

```bash
node scripts/borme-probe.mjs labels  --from 2026-09-01 --to 2026-09-30
node scripts/borme-probe.mjs tier1   --from 2026-09-01 --to 2026-09-30 \
     --province ALICANTE,VALENCIA --out /tmp/borme-tier1.json
node scripts/borme-probe.mjs sectors --from 2009-01-01 --to 2026-09-30 \
     --jsonl /tmp/borme-sectors.jsonl
```

Run `labels` first on any new period. It measures what BORME actually prints, so
the rules stay grounded in the vocabulary rather than in assumptions.

Raw XML is cached to `.borme-cache`, about 28 MB per month, gitignored. A full
2009 to date sector backfill is 6,482 publishing days and takes roughly 30 hours.
It resumes if interrupted.

## Privacy

Section A names natural persons. `redact()` strips everything after a cargo label,
so the probe records the **act** and the **company** only, never a personal name,
to disk or to the report.

Owner-age features, including the "administrador desde" proxy for succession, stay
out until ARPA's counsel signs a legitimate interest assessment. Tenure derived
that way must stay at company level. Do not build an age database.
