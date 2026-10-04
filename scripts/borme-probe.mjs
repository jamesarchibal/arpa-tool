#!/usr/bin/env node
//
// ARPA origination · BORME free probe.
//
// Question this answers: does the Spanish company registry publish enough
// pre-sale behaviour, for free, to rank 1.1M companies down to a shortlist?
//
// BORME (Boletin Oficial del Registro Mercantil) is an official bulletin that
// is published to be read, so reading it is not scraping and not the prohibited
// "peticion en masa" of the registry itself (DGRN Instruccion 17-feb-1998).
// It is served as structured XML, one document per province per publishing day:
//
//   sumario   GET https://www.boe.es/datosabiertos/api/borme/sumario/YYYYMMDD
//             (Accept: application/json)
//   seccion A GET https://www.boe.es/diario_borme/xml.php?id=BORME-A-YYYY-NNN-PP
//
// Section A is "Empresarios. Actos inscritos", which is the only section that
// carries the Tier 1 plumbing. Section B is other published acts, section C is
// legal notices.
//
// PRIVACY. Section A names natural persons (administrators, attorneys, the
// deceased). This probe never writes a personal name to disk or to the report.
// It records the ACT and the COMPANY only. Owner-age style features stay out
// until ARPA's counsel signs a legitimate interest assessment.
//
// Usage
//   node scripts/borme-probe.mjs labels  --from 2026-09-01 --to 2026-09-30
//   node scripts/borme-probe.mjs tier1   --from 2026-09-01 --to 2026-09-30
//   node scripts/borme-probe.mjs tier1   --from 2026-09-01 --to 2026-09-30 \
//        --province ALICANTE,VALENCIA --out /tmp/borme-tier1.json
//   node scripts/borme-probe.mjs sectors --from 2009-01-01 --to 2026-09-30 \
//        --jsonl /tmp/borme-sectors.jsonl --no-cache
//
// labels  = measure the act vocabulary, so the Tier 1 patterns are grounded in
//           what BORME actually prints instead of what we assume it prints.
// tier1   = score companies on pre-sale behaviour and report volume.
// sectors = build the company -> sector map. Tier 1 tells us a company is
//           moving, but not WHAT IT DOES: BORME prints `Objeto social` only on
//           `Constitucion` and `Cambio de objeto social`, so the sector has to
//           be harvested from those two acts across every year and remembered.
//           Streams day by day and appends JSONL, so a multi-year run is
//           resumable and does not need the 28MB-per-month XML cache.
//
// Cost: zero. No API key, no credits. Cached under .borme-cache/.

import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const CACHE = path.join(process.cwd(), '.borme-cache')
const SUMARIO = (ymd) => `https://www.boe.es/datosabiertos/api/borme/sumario/${ymd}`
const CONCURRENCY = 6

// ─────────────────────────────────────────────────────────────────────────────
// Tier 1 · pre-sale plumbing.
//
// EVERY rule below was measured against two real publishing days before it was
// kept, so the vocabulary is BORME's, not ours. Four signals from the original
// plan were DROPPED because BORME does not print them. Do not add them back
// without re-measuring:
//
//   aportacion no dineraria   0 occurrences. A capital increase funded with
//                             shares prints only as "Ampliacion de capital",
//                             the non-cash nature is not published. The plan
//                             called this "the strongest single signal". It is
//                             not observable here. `holding_admin` replaces it.
//   fallecimiento             0 occurrences. Inheritance is not published as a
//                             cause of cese. Not observable.
//   director general /        0 occurrences. Not in BORME's cargo vocabulary,
//   consejero delegado        which is Adm. Unico / Adm. Solid. / Adm. Mancom. /
//                             Consejero / Apoderado / Auditor / Liquidador.
//   prima de emision          0 occurrences. Not published.
//
// `weight` is a first guess. It must be recalibrated against real closed deals
// before anyone treats the score as a ranking rather than a sort order.
// ─────────────────────────────────────────────────────────────────────────────
const RULES = [
  // A LEGAL person appointed as sole or joint administrator. This is the
  // holding-insertion fingerprint that is actually observable: once the owner
  // puts a holdco above the opco, the holdco becomes the administrator.
  // It is also GDPR-safe, because the appointee is a company, not a person.
  { id: 'holding_admin', weight: 5, label: 'Corporate administrator appointed (holdco above the opco)',
    raw: true,
    re: /(?:Nombramientos|Reelecciones)\.\s*(?:Adm\.\s*(?:Unico|Solid\.|Mancom\.)|ADM\.UNICO|ADM\.SOLIDAR\.)\s*:\s*[^;.]*?\b(?:S\.?L\.?U?\.?|S\.?A\.?U?\.?|SOCIEDAD\s+(?:LIMITADA|ANONIMA|DE\s+RESPONSABILIDAD)|HOLDING)\b/i },

  // Opco survives and a branch (usually the property) is carved out.
  { id: 'escision_parcial', weight: 5, label: 'Escision parcial / segregacion (carve-out, opco survives)',
    re: /escisi[oó]n\s+parcial|segregaci[oó]n/i, survivesExclude: true },

  // Opco is split into beneficiary companies and dies. The BENEFICIARIES are
  // the new targets, and their names are printed in the same paragraph.
  { id: 'escision_total', weight: 4, label: 'Escision total (opco split, beneficiaries are the new targets)',
    re: /escisi[oó]n\s+total/i, survivesExclude: true },

  // Buying a clean audit before anyone asks for one.
  { id: 'auditor', weight: 4, label: 'Auditor appointed or changed',
    re: /\bauditor\b|AUDIT\.CUENT|\bAud\.\s*:/i },

  { id: 'transformacion', weight: 4, label: 'Transformacion de sociedad (SL to SA and back)',
    re: /transformaci[oó]n\s+de\s+sociedad/i },

  // Cash out. BORME rarely prints the cause, so this is capital reduction of
  // any kind and it needs a second signal to mean anything.
  { id: 'reduccion_capital', weight: 3, label: 'Reduccion de capital',
    re: /reducci[oó]n\s+de\s+capital/i },

  // Administrador unico becomes a board. Professionalising governance.
  { id: 'consejo', weight: 3, label: 'Consejero appointed or ceased (board governance)',
    re: /\bconsejer/i },

  // A minority entered, so somebody already sold part of it.
  { id: 'unipersonalidad_perdida', weight: 3, label: 'Perdida del caracter de unipersonalidad (minority came in)',
    re: /p[eé]rdida\s+del\s+car[aá]cter\s+de\s+unipersonalidad/i },

  { id: 'socio_unico_cambio', weight: 3, label: 'Cambio de identidad del socio unico (owner changed)',
    re: /cambio\s+de\s+identidad\s+del\s+socio/i },

  // The absorbing company is a consolidator. This is the feed for the
  // consolidation map, which is the highest-ROI play in the plan.
  { id: 'fusion_absorcion', weight: 3, label: 'Fusion por absorcion (absorber is a consolidator)',
    re: /fusi[oó]n\s+por\s+absorci[oó]n/i, survivesExclude: true },

  // Very common (about 300 a day), so on its own it is noise. Kept at weight 1
  // purely as a co-occurrence tiebreak. We never record WHO, because that
  // would be a natural person and would need the legitimate interest
  // assessment the plan flags.
  { id: 'apoderado', weight: 1, label: 'Apoderado appointed (noisy, tiebreak only)',
    re: /(?:Nombramientos|Reelecciones)\.\s*(?:Apoderado|Apo\.|APODERAD)/i },
]

// Acts that mean the opposite of a sale candidate. A company is dropped only
// when it matches one of these AND no rule marked survivesExclude fired, so a
// restructuring split is kept while a plain liquidation is not.
const EXCLUDE = [
  { id: 'constitucion', re: /^\s*constituci[oó]n\b/i },
  { id: 'extincion', re: /\bextinci[oó]n\b/i },
  { id: 'disolucion', re: /\bdisoluci[oó]n\b/i },
  { id: 'liquidacion', re: /\bliquidador\b/i },
  { id: 'concursal', re: /situaci[oó]n\s+concursal|concurso\s+de\s+acreedores|Administrador\s+Concursal/i },
  { id: 'erratas', re: /^\s*Fe\s+de\s+erratas/i },
]

// ─────────────────────────────────────────────────────────────────────────────
// Sector classifier · ARPA taxonomy (arpa_taxonomy, 20 subsectors).
//
// Matched against the `Objeto social` free text, NOT against CNAE. Measured on
// September 2026: 9,614 acts print an objeto social, but only 3,141 mention
// CNAE at all and only 1,982 give a 4-digit code, and the code is written four
// different ways. The prose is the field that is actually there.
//
// A company can match more than one row. We keep every match and report the
// first as the primary, because "valves AND filtration" is information, not an
// error.
// ─────────────────────────────────────────────────────────────────────────────
const TAXONOMY = [
  { sub: 'Olives / olive oil farming', sector: 'Agribusiness',
    re: /\bolivar|olivicultura|cultivo\s+del?\s+olivo/i },
  { sub: 'Citrus / fruit production', sector: 'Agribusiness',
    re: /c[ií]tricos|citr[ií]cola|cultivo\s+de\s+(?:naranj|mandarin|frutal)|explotaci[oó]n\s+frut[ií]cola/i },
  { sub: 'Fertilizers / soil enhancers', sector: 'Agribusiness',
    re: /fertilizante|abonos?\s+(?:agr[ií]cola|org[aá]nico|mineral|qu[ií]mico)|enmiendas?\s+del?\s+suelo/i },
  { sub: 'Biological inputs / biostimulants', sector: 'Agribusiness',
    re: /bioestimulante|bioplaguicida|control\s+biol[oó]gico\s+de\s+plagas|insumos?\s+biol[oó]gicos/i },
  { sub: 'Drip irrigation systems', sector: 'Agribusiness',
    re: /riego\s+(?:por\s+goteo|localizado)|sistemas?\s+de\s+riego|instalaciones?\s+de\s+riego/i },
  { sub: 'Pumps / filtration / dosing', sector: 'Agribusiness',
    re: /bombas?\s+(?:de\s+agua|hidr[aá]ulicas?)|equipos?\s+de\s+(?:filtraci[oó]n|dosificaci[oó]n)|dosificaci[oó]n\s+de\s+fertilizantes/i },
  { sub: 'Specialized farm machinery', sector: 'Agribusiness',
    re: /maquinaria\s+(?:agr[ií]cola|para\s+la\s+agricultura)|aperos\s+agr[ií]colas/i },
  { sub: 'Olive oil mills / processing', sector: 'Agribusiness',
    re: /almazara|molturaci[oó]n|extracci[oó]n\s+de\s+aceite|elaboraci[oó]n\s+de\s+aceite\s+de\s+oliva/i },
  { sub: 'Fruit / vegetable processing', sector: 'Agribusiness',
    re: /conservas\s+vegetales|(?:transformaci[oó]n|procesado|manipulaci[oó]n)\s+de\s+(?:frutas?|hortalizas?|verduras?)|central\s+hortofrut[ií]cola/i },
  { sub: 'Testing / certification / agronomic services', sector: 'Agribusiness',
    re: /asesoramiento\s+agron[oó]mico|servicios?\s+agron[oó]micos?|an[aá]lisis\s+(?:agr[ií]cola|de\s+suelos)|certificaci[oó]n\s+agroalimentaria/i },

  { sub: 'Precision machined parts', sector: 'Industrial Products',
    re: /mecanizad|decoletaje|piezas?\s+de\s+precisi[oó]n|torneado|fresado/i },
  { sub: 'Valves / pumps / hydraulic systems', sector: 'Industrial Products',
    re: /v[aá]lvulas?|sistemas?\s+(?:hidr[aá]ulicos?|neum[aá]ticos?)|bombas?\s+industriales/i },
  // NOT `carpinteria metalica` or `construcciones metalicas`. Measured: those
  // two phrases are the standard objeto of aluminium window fitters and small
  // builders, and they produced 3 of every 4 "makers" in the first pass. This
  // row means industrial metal forming, not a construction trade.
  { sub: 'Metal fabrication / stamping', sector: 'Industrial Products',
    re: /calder[ei]r[ií]a|estampaci[oó]n\s+(?:met[aá]lica|de\s+metal)|troquelad|chapa\s+met[aá]lica|plegado\s+de\s+chapa|corte\s+(?:por\s+)?l[aá]ser\s+de\s+metal/i },
  { sub: 'Technical plastics / injection molding', sector: 'Industrial Products',
    re: /inyecci[oó]n\s+de\s+(?:pl[aá]sticos?|pl[aá]stico)|pl[aá]sticos?\s+t[eé]cnicos?|moldeo\s+de\s+pl[aá]stico|transformaci[oó]n\s+de\s+materias\s+pl[aá]sticas/i },
  { sub: 'Industrial packaging', sector: 'Industrial Products',
    re: /embalajes?\s+industrial|cart[oó]n\s+ondulado|pal[eé]ts?\b|fabricaci[oó]n\s+de\s+(?:envases|embalajes)/i },
  { sub: 'Food/agri packaging', sector: 'Industrial Products',
    re: /envases?\s+(?:alimentari|para\s+la\s+alimentaci[oó]n)|packaging\s+alimentari/i },
  { sub: 'Food processing machinery', sector: 'Industrial Products',
    re: /maquinaria\s+(?:alimentaria|para\s+la\s+industria\s+alimentaria|de\s+procesado\s+de\s+alimentos)/i },
  { sub: 'Packaging machinery', sector: 'Industrial Products',
    re: /maquinaria\s+de\s+(?:envasado|embalaje)|m[aá]quinas?\s+envasadoras?/i },
  { sub: 'Filtration / recycling / waste systems', sector: 'Industrial Products',
    re: /tratamiento\s+de\s+(?:residuos|aguas)|reciclaje|depuraci[oó]n|gesti[oó]n\s+de\s+residuos/i },
  { sub: 'Electrical cabinets / solar mounting', sector: 'Industrial Products',
    re: /cuadros?\s+el[eé]ctricos?|estructuras?\s+(?:solares?|fotovoltaicas?)|soportes?\s+fotovoltaicos?/i },
]

// The >=3-signal shortlist was dominated by patrimonial and real-estate
// vehicles doing ordinary restructuring. This is the negative filter for them.
// It is a FLAG, not a drop, because a real opco can hold its own building.
const PATRIMONIAL = /tenencia\s+y\s+(?:administraci[oó]n|gesti[oó]n)\s+de\s+(?:acciones|participaciones|valores)|promoci[oó]n\s+inmobiliaria|arrendamiento\s+de\s+(?:bienes\s+)?inmuebles|sociedad\s+patrimonial|compraventa\s+de\s+(?:bienes\s+)?inmuebles/i

function classify (objeto) {
  const hits = TAXONOMY.filter((t) => t.re.test(objeto))
  return {
    subsectors: hits.map((t) => t.sub),
    sector: hits[0]?.sector || null,
    patrimonial: PATRIMONIAL.test(objeto),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// fetch helpers
// ─────────────────────────────────────────────────────────────────────────────
// A multi-year run would write about 6GB of XML we only read once, so
// `--no-cache` reads through without keeping it. Already-cached days are still
// served from disk, which makes a re-run of a cached month free.
let NOCACHE = false

async function getCached (url, key) {
  const file = path.join(CACHE, key)
  if (existsSync(file)) return readFile(file, 'utf8')
  const res = await fetch(url, {
    headers: { Accept: 'application/json, application/xml;q=0.9', 'User-Agent': 'arpa-borme-probe/1' },
  })
  if (!res.ok) throw Object.assign(new Error(`${res.status} ${url}`), { status: res.status })
  const body = await res.text()
  if (NOCACHE) return body
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, body)
  return body
}

async function pool (items, worker) {
  const out = []
  let next = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) {
      const i = next++
      try { out[i] = await worker(items[i]) } catch (err) { out[i] = { error: err } }
    }
  }))
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// parsing
// ─────────────────────────────────────────────────────────────────────────────
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decode (s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, n) => ENTITIES[n])
}

// One BORME section-A document becomes a list of { reg, name, text }.
// Layout is strictly alternating:
//   <p class="articulo">439716 - EQUELITE SL.</p>
//   <p class="parrafo">Ampliacion de capital. ... Datos registrales. S 8 , H A 12708, I/A 16 (25.09.26).</p>
function parseSectionA (xml) {
  const province = decode((xml.match(/<titulo>([\s\S]*?)<\/titulo>/) || [])[1] || '').trim()
  const date = (xml.match(/<fecha_publicacion>(\d{8})<\/fecha_publicacion>/) || [])[1] || ''
  const entries = []
  const re = /<p class="(articulo|parrafo)">([\s\S]*?)<\/p>/g
  let m
  let current = null
  while ((m = re.exec(xml))) {
    const body = decode(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
    if (m[1] === 'articulo') {
      const head = body.match(/^(\d+)\s*-\s*(.+?)\.?$/)
      current = { reg: head ? head[1] : null, name: head ? head[2] : body, province, date, text: '' }
      entries.push(current)
    } else if (current) {
      current.text = current.text ? `${current.text} ${body}` : body
    }
  }
  return entries
}

// `Datos registrales. S 8 , H A 208326, I/A 1 (25.09.26).`
// BORME does NOT publish the CIF. The durable key is the registry sheet
// (province + hoja), not the tax number. That is a correction to the plan:
// joining BORME to a bought XBRL deposit needs a name or hoja match, not a CIF.
function registryKey (text, province) {
  const m = text.match(/Datos registrales\.\s*S\s*(\d+)\s*,\s*H\s*([A-Z]{1,3})\s*(\d+)/i)
  if (!m) return null
  return { seccion: m[1], hoja: `${m[2]} ${m[3]}`, key: `${province}|${m[2]}${m[3]}` }
}

// `Objeto social: La fabricacion y venta de productos de pasteleria. Domicilio: ...`
// The objeto is free prose and contains its own full stops, so it is read up to
// the next act label rather than up to the next period.
const OBJETO_END = /\s(?:Domicilio|Capital|Datos registrales|Nombramientos|Ceses|Declaraci[oó]n\s+de\s+unipersonalidad|Socio\s+[UÚ]nico|Modificaciones|Cambio\s+de|Reelecciones|Revocaciones|Apoderado)\b/

function objetoSocial (text) {
  const i = text.search(/Objeto social\s*:/i)
  if (i < 0) return null
  const after = text.slice(i).replace(/^Objeto social\s*:\s*/i, '')
  const end = after.search(OBJETO_END)
  return (end > 0 ? after.slice(0, end) : after).trim().slice(0, 600) || null
}

// CNAE is printed four different ways and is missing from two acts in three,
// so it is recorded opportunistically and never relied on.
function cnae (text) {
  const m = text.match(/CNAE[^0-9]{0,40}(\d{4})/i) || text.match(/CNAE[^0-9]{0,10}(\d{2})\b/i)
  return m ? m[1] : null
}

// Strip anything that follows a cargo label, because that is a person's name.
// Keeps the act vocabulary and drops the natural persons.
function redact (text) {
  return text.replace(
    /((?:Adm\.?\s*(?:Unico|Solid\.?|Conj\.?|Mancom\.?)?|Consejero(?:\s+Delegado)?|Apoderado|Auditor|Liquidador|Secretario|Presidente|Vicepresident\w*|Vicesecretari\w*|Socio\s+Unico)\s*:\s*)[^.]*/gi,
    '$1[persona]',
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ingest
// ─────────────────────────────────────────────────────────────────────────────
function* dateRange (from, to) {
  for (const d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    yield d.toISOString().slice(0, 10)
  }
}

async function sectionADocs (iso) {
  const ymd = iso.replaceAll('-', '')
  let raw
  try {
    raw = await getCached(SUMARIO(ymd), path.join(ymd, 'sumario.json'))
  } catch (err) {
    if (err.status === 404) return []          // not a publishing day
    throw err
  }
  const json = JSON.parse(raw)
  if (json?.status?.code !== '200') return []
  const diarios = json?.data?.sumario?.diario || []
  const out = []
  for (const diario of diarios) {
    for (const sec of diario.seccion || []) {
      if (sec.codigo !== 'A') continue
      for (const item of [].concat(sec.item || [])) {
        out.push({ iso, ymd, id: item.identificador, titulo: item.titulo, url: item.url_xml })
      }
    }
  }
  return out
}

async function ingest (from, to, provinceFilter) {
  const days = [...dateRange(from, to)]
  process.stderr.write(`sumario: ${days.length} days ${from} to ${to}\n`)
  const perDay = await pool(days, (iso) => sectionADocs(iso))

  let docs = perDay.flatMap((d) => (Array.isArray(d) ? d : []))
  if (provinceFilter) {
    const want = provinceFilter.map((p) => p.toUpperCase())
    docs = docs.filter((d) => want.some((w) => d.titulo.toUpperCase().includes(w)))
  }
  const publishingDays = new Set(docs.map((d) => d.iso)).size
  process.stderr.write(`section A: ${docs.length} province docs over ${publishingDays} publishing days\n`)

  const parsed = await pool(docs, async (d) => {
    const xml = await getCached(d.url, path.join(d.ymd, `${d.id}.xml`))
    return parseSectionA(xml)
  })

  const entries = []
  let failed = 0
  for (const p of parsed) {
    if (!Array.isArray(p)) { failed++; continue }
    entries.push(...p)
  }
  if (failed) process.stderr.write(`WARNING: ${failed} documents failed to fetch or parse\n`)
  process.stderr.write(`entries: ${entries.length} inscribed acts\n\n`)
  return { entries, publishingDays }
}

// ─────────────────────────────────────────────────────────────────────────────
// mode: labels
// ─────────────────────────────────────────────────────────────────────────────
function runLabels (entries) {
  const counts = new Map()
  for (const e of entries) {
    // Act labels are a closed vocabulary printed as "Label. detail." segments.
    for (const m of redact(e.text).matchAll(/(?:^|\.\s|\.-\s{0,2})([A-ZÁÉÍÓÚÑ][^.;:]{2,58}?)[.:]/g)) {
      const label = m[1].trim()
      if (/\d/.test(label)) continue
      counts.set(label, (counts.get(label) || 0) + 1)
    }
  }
  const rows = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 90)
  console.log(`act label frequency, top ${rows.length} of ${counts.size} distinct\n`)
  const pad = Math.max(...rows.map((r) => r[0].length))
  for (const [label, n] of rows) console.log(`${String(n).padStart(7)}  ${label.padEnd(pad)}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// mode: tier1
// ─────────────────────────────────────────────────────────────────────────────
function runTier1 (entries, publishingDays, outFile) {
  const companies = new Map()
  let excluded = 0

  for (const e of entries) {
    const text = redact(e.text)
    // A rule marked `raw` is tested against the unredacted act, because telling
    // a company appointee from a natural person needs the appointee string.
    // Nothing from the raw text is ever stored or printed.
    const fired = RULES.filter((r) => r.re.test(r.raw ? e.text : text))
    if (!fired.length) continue

    if (EXCLUDE.some((x) => x.re.test(text)) && !fired.some((r) => r.survivesExclude)) {
      excluded++
      continue
    }
    const hit = fired.map((r) => r.id)

    const reg = registryKey(e.text, e.province)
    const key = reg ? reg.key : `${e.province}|name:${e.name}`
    const row = companies.get(key) || {
      name: e.name, province: e.province, hoja: reg?.hoja || null,
      rules: new Set(), events: [],
    }
    for (const h of hit) row.rules.add(h)
    row.events.push({ date: e.date, rules: hit })
    companies.set(key, row)
  }

  const ruleCount = new Map(RULES.map((r) => [r.id, 0]))
  const byProvince = new Map()
  const ranked = []

  for (const row of companies.values()) {
    for (const id of row.rules) ruleCount.set(id, ruleCount.get(id) + 1)
    const score = [...row.rules].reduce((s, id) => s + RULES.find((r) => r.id === id).weight, 0)
    const p = byProvince.get(row.province) || { total: 0, multi: 0 }
    p.total++
    if (row.rules.size >= 2) p.multi++
    byProvince.set(row.province, p)
    ranked.push({
      name: row.name, province: row.province, hoja: row.hoja,
      rules: [...row.rules], distinct: row.rules.size, score,
      dates: [...new Set(row.events.map((e) => e.date))].sort(),
    })
  }
  ranked.sort((a, b) => b.score - a.score || b.distinct - a.distinct)

  const multi2 = ranked.filter((r) => r.distinct >= 2)
  const multi3 = ranked.filter((r) => r.distinct >= 3)

  console.log('TIER 1 PRE-SALE SIGNAL · BORME seccion A\n')
  console.log(`publishing days          ${publishingDays}`)
  console.log(`inscribed acts read      ${entries.length}`)
  console.log(`dropped as wrong-way     ${excluded}  (constitucion / disolucion / extincion / concurso)`)
  console.log(`companies with >=1 rule  ${ranked.length}`)
  console.log(`companies with >=2 rules ${multi2.length}   <- "a process already running"`)
  console.log(`companies with >=3 rules ${multi3.length}   <- highest conviction\n`)

  console.log('by rule (companies, not events)\n')
  const rw = Math.max(...RULES.map((r) => r.label.length))
  for (const r of RULES) {
    console.log(`${String(ruleCount.get(r.id)).padStart(7)}  w${r.weight}  ${r.label.padEnd(rw)}`)
  }

  console.log('\ntop 15 provinces by companies with >=1 rule\n')
  const prov = [...byProvince].sort((a, b) => b[1].total - a[1].total).slice(0, 15)
  const pw = Math.max(...prov.map((p) => p[0].length))
  console.log(`${'province'.padEnd(pw)}   >=1    >=2`)
  for (const [name, p] of prov) {
    console.log(`${name.padEnd(pw)}  ${String(p.total).padStart(4)}  ${String(p.multi).padStart(5)}`)
  }

  console.log('\ntop 25 named candidates\n')
  for (const r of multi2.slice(0, 25)) {
    console.log(`${String(r.score).padStart(3)}  ${r.distinct}x  ${r.province.padEnd(18)} ${r.name}`)
    console.log(`          ${r.rules.join(', ')}`)
  }

  if (outFile) {
    const json = JSON.stringify({
      generated_at: new Date().toISOString(),
      publishing_days: publishingDays,
      acts_read: entries.length,
      rules: RULES.map((r) => ({ id: r.id, weight: r.weight, label: r.label })),
      companies: ranked,
    }, null, 2)
    return writeFile(outFile, json).then(() => {
      console.log(`\nwrote ${ranked.length} companies to ${outFile}`)
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// mode: sectors
//
// Runs its own day-by-day loop instead of `ingest`, because a 2009-to-today
// backfill is about 130,000 province documents and must not be held in memory
// or re-fetched after a crash. Each finished day is written to <jsonl>.days,
// and a restart skips those days.
// ─────────────────────────────────────────────────────────────────────────────
async function runSectors (from, to, provinceFilter, jsonlFile) {
  if (!jsonlFile) throw new Error('sectors mode needs --jsonl <file>')
  const daysFile = `${jsonlFile}.days`
  const done = existsSync(daysFile)
    ? new Set((await readFile(daysFile, 'utf8')).split('\n').filter(Boolean))
    : new Set()

  const days = [...dateRange(from, to)].filter((d) => !done.has(d))
  process.stderr.write(`sectors: ${days.length} days to do, ${done.size} already done\n`)

  const totals = { docs: 0, acts: 0, objetos: 0, matched: 0, patrimonial: 0 }
  const bySub = new Map()

  for (const iso of days) {
    let docs = await sectionADocs(iso)
    if (provinceFilter) {
      const want = provinceFilter.map((p) => p.toUpperCase())
      docs = docs.filter((d) => want.some((w) => d.titulo.toUpperCase().includes(w)))
    }
    const parsed = await pool(docs, async (d) => {
      const xml = await getCached(d.url, path.join(d.ymd, `${d.id}.xml`))
      return parseSectionA(xml)
    })

    const lines = []
    for (const p of parsed) {
      if (!Array.isArray(p)) continue
      totals.docs++
      for (const e of p) {
        totals.acts++
        const objeto = objetoSocial(e.text)
        if (!objeto) continue
        totals.objetos++
        const c = classify(objeto)
        if (c.subsectors.length) totals.matched++
        if (c.patrimonial) totals.patrimonial++
        for (const s of c.subsectors) bySub.set(s, (bySub.get(s) || 0) + 1)
        const reg = registryKey(e.text, e.province)
        lines.push(JSON.stringify({
          key: reg ? reg.key : `${e.province}|name:${e.name}`,
          name: e.name, province: e.province, hoja: reg?.hoja || null,
          date: e.date, cnae: cnae(e.text), objeto,
          sector: c.sector, subsectors: c.subsectors, patrimonial: c.patrimonial,
        }))
      }
    }
    if (lines.length) await appendFile(jsonlFile, `${lines.join('\n')}\n`)
    await appendFile(daysFile, `${iso}\n`)

    if (iso.endsWith('-01')) {
      process.stderr.write(`  ${iso.slice(0, 7)}  objetos ${totals.objetos}  matched ${totals.matched}\n`)
    }
  }

  console.log('\nSECTOR MAP · BORME objeto social\n')
  console.log(`province docs read       ${totals.docs}`)
  console.log(`inscribed acts read      ${totals.acts}`)
  console.log(`acts with objeto social  ${totals.objetos}`)
  console.log(`matched an ARPA subsector ${totals.matched}`)
  console.log(`flagged patrimonial      ${totals.patrimonial}\n`)
  if (bySub.size) {
    const rows = [...bySub].sort((a, b) => b[1] - a[1])
    const w = Math.max(...rows.map((r) => r[0].length))
    console.log('by subsector (acts)\n')
    for (const [sub, n] of rows) console.log(`${String(n).padStart(7)}  ${sub.padEnd(w)}`)
  }
  console.log(`\nappended to ${jsonlFile}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// mode: classify
//
// Re-scores the harvested JSONL offline. No network, so the regexes above can
// be re-tuned and re-run for free instead of re-fetching 17 years.
//
// The first pass scored a word match anywhere in the objeto, and Spanish
// `objeto social` is a kitchen-sink list, so a flower shop that SELLS
// fertilizer scored the same as a fertilizer plant. Two corrections:
//
//   1. WHERE the match sits. The principal activity is written first. A match
//      in the opening clause is worth more than one buried in the tail.
//   2. MAKER or TRADER. ARPA buys companies that make things. `fabricacion`
//      near the match means maker, `comercio al por menor` means shop.
// ─────────────────────────────────────────────────────────────────────────────
// `instalacion` is deliberately absent. An installer is a service business,
// not a manufacturer, and including it made fitters look like makers.
const MAKER = /fabricaci[oó]n|producci[oó]n|elaboraci[oó]n|mecanizad|transformaci[oó]n|manufactura|montaje\s+en\s+taller/i
const TRADER = /comercio\s+al\s+por\s+(?:menor|mayor)|compraventa|distribuci[oó]n|importaci[oó]n|exportaci[oó]n|representaci[oó]n|intermediaci[oó]n|venta\s+al\s+(?:por\s+menor|detall)/i

// The principal activity is whatever is written before the first full stop or
// lettered marker. Measured median objeto is 260 chars, so this is usually the
// first sentence rather than an arbitrary prefix.
function principalSpan (objeto) {
  const m = objeto.match(/^[\s\S]{40,}?(?:\.|\b[b-f]\)\s)/)
  return m ? m[0].length : Math.min(objeto.length, 200)
}

function scoreRow (row) {
  const head = principalSpan(row.objeto)
  const out = []
  for (const t of TAXONOMY) {
    const m = t.re.exec(row.objeto)
    if (!m) continue
    // Read the clause around the match to decide maker or trader.
    const ctx = row.objeto.slice(Math.max(0, m.index - 140), m.index + 60)
    const maker = MAKER.test(ctx)
    const trader = TRADER.test(ctx)
    out.push({
      sub: t.sub,
      sector: t.sector,
      principal: m.index < head,
      role: maker && !trader ? 'maker' : trader && !maker ? 'trader' : maker ? 'mixed' : 'unclear',
    })
  }
  return out
}

async function runClassify (jsonlFile, outFile) {
  if (!jsonlFile) throw new Error('classify mode needs --jsonl <file>')
  const raw = (await readFile(jsonlFile, 'utf8')).split('\n').filter(Boolean)

  // A kill between the two appends can repeat one day, so dedupe first.
  const seen = new Set()
  const rows = []
  for (const line of raw) {
    const r = JSON.parse(line)
    const id = `${r.key}|${r.date}|${r.objeto.slice(0, 60)}`
    if (seen.has(id)) continue
    seen.add(id)
    rows.push(r)
  }

  const tiers = { maker_principal: [], maker_secondary: [], other: [] }
  const bySub = new Map()

  for (const r of rows) {
    const hits = scoreRow(r)
    if (!hits.length) continue
    const best = hits.find((h) => h.principal && h.role === 'maker')
      || hits.find((h) => h.role === 'maker')
      || hits[0]
    const tier = best.principal && best.role === 'maker' ? 'maker_principal'
      : best.role === 'maker' ? 'maker_secondary'
      : 'other'
    const rec = {
      name: r.name, province: r.province, hoja: r.hoja, date: r.date,
      sector: best.sector, subsector: best.sub, role: best.role,
      principal: best.principal, patrimonial: r.patrimonial,
      all: hits.map((h) => h.sub),
    }
    tiers[tier].push(rec)
    if (tier !== 'other') bySub.set(best.sub, (bySub.get(best.sub) || 0) + 1)
  }

  console.log('SECTOR CLASSIFICATION · re-scored offline\n')
  console.log(`rows read                ${raw.length}`)
  console.log(`after dedupe             ${rows.length}`)
  console.log(`maker, principal activity ${tiers.maker_principal.length}   <- the usable list`)
  console.log(`maker, secondary activity ${tiers.maker_secondary.length}`)
  console.log(`trader or unclear        ${tiers.other.length}   <- dropped\n`)

  const rowsBySub = [...bySub].sort((a, b) => b[1] - a[1])
  if (rowsBySub.length) {
    const w = Math.max(...rowsBySub.map((r) => r[0].length))
    console.log('makers by subsector\n')
    for (const [sub, n] of rowsBySub) console.log(`${String(n).padStart(7)}  ${sub.padEnd(w)}`)
  }

  console.log('\nsample of 15 principal-activity makers\n')
  for (const r of tiers.maker_principal.slice(0, 15)) {
    console.log(`${r.province.padEnd(20)} ${r.name}`)
    console.log(`  ${r.subsector}${r.patrimonial ? '  [also patrimonial]' : ''}`)
  }

  if (outFile) {
    await writeFile(outFile, JSON.stringify({
      generated_at: new Date().toISOString(),
      source: jsonlFile,
      rows_read: raw.length,
      companies: tiers.maker_principal.concat(tiers.maker_secondary),
    }, null, 2))
    console.log(`\nwrote ${tiers.maker_principal.length + tiers.maker_secondary.length} makers to ${outFile}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
function args () {
  const [mode, ...rest] = process.argv.slice(2)
  const flags = {}
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('--')) continue
    const name = rest[i].replace(/^--/, '')
    const next = rest[i + 1]
    if (next === undefined || next.startsWith('--')) flags[name] = true
    else { flags[name] = next; i++ }
  }
  const needsRange = mode !== 'classify'
  if (!['labels', 'tier1', 'sectors', 'classify'].includes(mode) || (needsRange && (!flags.from || !flags.to))) {
    console.error('usage: node scripts/borme-probe.mjs <labels|tier1|sectors> --from YYYY-MM-DD --to YYYY-MM-DD')
    console.error('       node scripts/borme-probe.mjs classify --jsonl file.jsonl [--out file.json]')
    console.error('       [--province A,B] [--out file.json] [--jsonl file.jsonl] [--no-cache]')
    process.exit(1)
  }
  return {
    mode, from: flags.from, to: flags.to, out: flags.out, jsonl: flags.jsonl,
    province: typeof flags.province === 'string' ? flags.province.split(',') : undefined,
    noCache: flags['no-cache'] === true,
  }
}

const { mode, from, to, out, jsonl, province, noCache } = args()
NOCACHE = noCache

if (mode === 'classify') {
  await runClassify(jsonl, out)
} else if (mode === 'sectors') {
  await runSectors(from, to, province, jsonl)
} else {
  const { entries, publishingDays } = await ingest(from, to, province)
  if (mode === 'labels') runLabels(entries)
  else await runTier1(entries, publishingDays, out)
}
