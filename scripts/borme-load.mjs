#!/usr/bin/env node
//
// ARPA origination · load the BORME shortlist into Postgres.
//
// Joins the two passes of borme-probe.mjs and upserts arpa_origination:
//
//   --makers  what the company DOES   (probe classify --out)
//   --tier1   whether it is MOVING    (probe tier1 --out)
//
// The join key is the registry sheet, "PROVINCIA|A208326", because BORME
// publishes no CIF. Both files carry it as `key`.
//
// The universe is the makers file. A Tier 1 signal with no known sector is not
// loaded: there are about 8,700 of those a month and no way to tell whether
// they are in ARPA's taxonomy, so they would drown the list.
//
// Usage
//   node scripts/borme-load.mjs --makers /tmp/makers.json --tier1 /tmp/tier1.json
//   node scripts/borme-load.mjs --makers /tmp/makers.json --dry-run

import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

const BATCH = 500

function env () {
  const raw = process.env
  if (raw.SUPABASE_URL && raw.SUPABASE_SERVICE_ROLE_KEY) return raw
  return null
}

async function envFromFile () {
  const text = await readFile(new URL('../.env.local', import.meta.url), 'utf8')
  return Object.fromEntries(
    text.split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
      }),
  )
}

// BORME prints the publication date as YYYYMMDD.
const toDate = (ymd) => (/^\d{8}$/.test(ymd || '') ? `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6)}` : null)

function args () {
  const rest = process.argv.slice(2)
  const flags = {}
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('--')) continue
    const name = rest[i].replace(/^--/, '')
    const next = rest[i + 1]
    if (next === undefined || next.startsWith('--')) flags[name] = true
    else { flags[name] = next; i++ }
  }
  if (!flags.makers) {
    console.error('usage: node scripts/borme-load.mjs --makers makers.json [--tier1 tier1.json] [--dry-run]')
    process.exit(1)
  }
  return flags
}

const flags = args()

const makersFile = JSON.parse(await readFile(flags.makers, 'utf8'))
const makers = makersFile.companies || []

// A company can print an objeto more than once: once at Constitucion and again
// at every Cambio de objeto social. Keep the most recent, because that is what
// it does now.
const rows = new Map()
for (const m of makers) {
  if (!m.key) continue
  const prev = rows.get(m.key)
  if (prev && (prev.date || '') >= (m.date || '')) continue
  rows.set(m.key, m)
}
process.stderr.write(`makers: ${makers.length} records, ${rows.size} distinct companies\n`)

// Tier 1 annotates. It never adds a company.
let signals = new Map()
if (typeof flags.tier1 === 'string') {
  const t = JSON.parse(await readFile(flags.tier1, 'utf8'))
  signals = new Map((t.companies || []).filter((c) => c.key).map((c) => [c.key, c]))
  process.stderr.write(`tier1:  ${signals.size} companies with >=1 pre-sale signal\n`)
}

const payload = []
let withSignal = 0
for (const [key, m] of rows) {
  const s = signals.get(key)
  if (s) withSignal++
  const dates = (s?.dates || []).map(toDate).filter(Boolean).sort()
  payload.push({
    reg_key: key,
    legal_name: m.name,
    province: m.province,
    hoja: m.hoja,
    sector: m.sector,
    subsector: m.subsector,
    objeto: m.objeto,
    objeto_date: toDate(m.date),
    cnae: m.cnae,
    role: m.role,
    principal: Boolean(m.principal),
    patrimonial: Boolean(m.patrimonial),
    signals: s?.rules || [],
    signal_count: s?.distinct || 0,
    signal_score: s?.score || 0,
    first_signal_at: dates[0] || null,
    last_signal_at: dates[dates.length - 1] || null,
    updated_at: new Date().toISOString(),
  })
}

console.log(`\nto load                  ${payload.length}`)
console.log(`of those, moving now     ${withSignal}   <- sector AND a pre-sale signal`)
console.log(`principal activity       ${payload.filter((p) => p.principal).length}`)
console.log(`flagged patrimonial      ${payload.filter((p) => p.patrimonial).length}`)

if (flags['dry-run']) {
  console.log('\ndry run, nothing written')
  process.exit(0)
}

const e = env() || (await envFromFile())
const db = createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// `status`, `project_id` and `note` are left out of the update on purpose:
// re-running the loader must not undo a decision Marc already made.
let done = 0
for (let i = 0; i < payload.length; i += BATCH) {
  const chunk = payload.slice(i, i + BATCH)
  const { error } = await db.from('arpa_origination').upsert(chunk, { onConflict: 'reg_key' })
  if (error) throw new Error(`upsert at ${i}: ${error.message}`)
  done += chunk.length
  process.stderr.write(`  upserted ${done} / ${payload.length}\n`)
}

console.log(`\nloaded ${done} companies into arpa_origination`)
