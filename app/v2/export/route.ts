import { csvResponse, stamp, toCsv } from '@/lib/arpa/csv';
import {
  getIosArchetypes,
  getIosDecisions,
  getIosIndustries,
  getIosLongList,
  getIosProjects,
  getIosSources,
  getIosTheses,
} from '@/lib/ios/db';
import {
  filterArchetypes,
  filterCompanies,
  filterIndustries,
  filterTheses,
} from '@/lib/ios/filters';
import { INDUSTRY_CRITERIA } from '@/lib/ios/industries';
import { STAGE_LABEL } from '@/lib/ios/lists';

// Reads live data on every request, so it must not be cached or prerendered.
export const dynamic = 'force-dynamic';

/**
 * CSV download for the V2 screens.
 *
 * This is the one place Airtable beats us for free: any view downloads as CSV.
 * Their own data arrived as an Excel workbook, so the first thing they will want
 * is to get it back out, filtered, and the absence of this button was the honest
 * gap in the comparison.
 *
 * Every kind re-applies the screen's filters through `lib/ios/filters.ts`, the
 * same functions the pages call. That shared module is the point: an export with
 * its own copy of the filters silently hands over more rows than the list asked
 * for.
 *
 * `lib/arpa/csv.ts` is reused rather than reimplemented. It is V1 code, but it is
 * a pure writer with no V1 data in it, and it already handles the two things that
 * break a CSV in Spanish Excel (semicolon separator, BOM) plus formula
 * injection. Writing a second one would be a second set of those bugs.
 *
 * Covered by middleware.ts like every other route, so no auth check here.
 */

const KINDS = [
  'industrias',
  'tesis',
  'arquetipos',
  'empresas',
  'fuentes',
  'pipeline',
  'decisiones',
] as const;
type Kind = (typeof KINDS)[number];

function isKind(value: string | null): value is Kind {
  return value !== null && (KINDS as readonly string[]).includes(value);
}

/** `2026-03-14T...` to `2026-03-14`, leaving anything unexpected alone. */
const day = (value: string | null) => (value ? value.slice(0, 10) : null);

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const kind = params.get('kind');
  const get = (key: string) => params.get(key) ?? undefined;

  if (!isKind(kind)) {
    return new Response(`kind debe ser uno de: ${KINDS.join(', ')}`, {
      status: 400,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  if (kind === 'industrias') {
    const rows = filterIndustries(await getIosIndustries(), {
      tier: get('tier'),
      industry: get('industry'),
      sector: get('sector'),
    });

    const csv = toCsv(
      [
        'Subsector',
        'Industria',
        'Sector',
        'Score',
        'Tier',
        ...INDUSTRY_CRITERIA.map((c) => `${c.label} (peso ${c.weight})`),
        'Clusters en España',
        'Tesis de inversión',
        'Riesgos clave',
      ],
      rows.map((r) => [
        r.subsector,
        r.industry,
        r.sector,
        r.score,
        r.tier,
        ...INDUSTRY_CRITERIA.map((c) => r[c.key]),
        r.spanish_clusters,
        r.investment_thesis,
        r.key_risks,
      ]),
    );

    return csvResponse(`arpa-ios-industrias-${stamp()}.csv`, csv);
  }

  if (kind === 'tesis') {
    const rows = filterTheses(await getIosTheses(), {
      scope: get('scope'),
      strategy: get('strategy'),
      priority: get('priority'),
      subsector: get('subsector'),
    });

    const csv = toCsv(
      [
        'Código',
        'Tesis',
        'Ámbito',
        'Categoría',
        'Driver estructural',
        'Estrategia principal',
        'Descripción',
        'Palancas de valor',
        'Perfil objetivo',
        'Riesgos de screening',
        'Prioridad',
        'Estado',
        'Encaje con el mandato',
        'EBITDA objetivo (M€)',
        'Ventas objetivo (M€)',
        'Subsectores',
      ],
      rows.map((t) => [
        t.code,
        t.name,
        t.scope,
        t.category,
        t.structural_driver,
        t.primary_strategy,
        t.description,
        t.value_creation_levers,
        t.ideal_target_profile,
        t.key_screening_risks,
        t.priority,
        t.status,
        t.mandate_fit,
        // Text in all 140 rows of their sheet ("1–5 (core 1–3)"), not a number.
        t.target_ebitda_eur_m,
        t.target_revenue_eur_m,
        t.subsectors,
      ]),
    );

    return csvResponse(`arpa-ios-tesis-${stamp()}.csv`, csv);
  }

  if (kind === 'arquetipos') {
    const rows = filterArchetypes(await getIosArchetypes(), {
      subsector: get('subsector'),
      role: get('role'),
    });

    const csv = toCsv(
      [
        'Arquetipo',
        'Subsector',
        'Sector',
        'Rol PE',
        'Qué hace',
        'Modelo de ingresos',
        'Margen EBITDA típico',
        'CNAE',
        'Palabras clave SABI',
      ],
      rows.map((a) => [
        a.name,
        a.subsector,
        a.sector,
        a.pe_role,
        a.what_it_does,
        a.revenue_model,
        a.typical_ebitda_margin,
        a.cnae_codes,
        a.sabi_keywords,
      ]),
    );

    return csvResponse(`arpa-ios-arquetipos-${stamp()}.csv`, csv);
  }

  if (kind === 'empresas') {
    const rows = filterCompanies(await getIosLongList(), {
      subsector: get('subsector'),
      archetype: get('archetype'),
      province: get('province'),
      source: get('source'),
    });

    const csv = toCsv(
      [
        'Empresa',
        'País',
        'Comunidad autónoma',
        'Provincia',
        'Subsector',
        'Arquetipo',
        'Estado',
        'Tipo de origen',
        'Propiedad',
        // Blank when unknown, never 0. 252 of their 258 rows are blank here.
        'Ventas est. (M€)',
        'EBITDA est. (M€)',
        'Fuente',
        'Confianza de la fuente',
        'Web',
        'Notas',
      ],
      rows.map((c) => [
        c.name,
        c.country,
        c.autonomous_community,
        c.province,
        c.subsector,
        c.archetype,
        c.status,
        c.origin_type,
        c.ownership_type,
        c.revenue_estimate_eur_m,
        c.ebitda_estimate_eur_m,
        c.source,
        c.source_confidence,
        c.website,
        c.research_notes,
      ]),
    );

    return csvResponse(`arpa-ios-empresas-${stamp()}.csv`, csv);
  }

  if (kind === 'fuentes') {
    const [sources, companies] = await Promise.all([getIosSources(), getIosLongList()]);

    const csv = toCsv(
      ['Fuente', 'Tipo', 'URL', 'Empresas', 'Notas'],
      sources.map((s) => [
        s.name,
        s.source_type,
        s.url,
        companies.filter((c) => c.source === s.name).length,
        s.notes,
      ]),
    );

    return csvResponse(`arpa-ios-fuentes-${stamp()}.csv`, csv);
  }

  if (kind === 'pipeline') {
    const rows = await getIosProjects();

    const csv = toCsv(
      [
        'Código',
        'Proyecto',
        'Tipo',
        'Etapa',
        'Etapa (es)',
        'Estado de la etapa',
        'En la etapa desde',
        'Estado del proyecto',
        'Prioridad',
        'Responsable',
        'Tesis',
        'Tesis (nombre)',
        'Encaje con la tesis',
        'Subsector',
        'Origen',
        'Estado LOI',
        'Estado DD',
        'Estado de cierre',
        'Puntos DD abiertos',
        'Próximo paso',
        'Fecha del próximo paso',
        'Fecha de revisión',
        'Motivo de descarte',
        'Evidencia decisiva',
        'Actualizado',
      ],
      rows.map((p) => [
        p.code,
        p.name,
        p.project_type,
        p.stage,
        STAGE_LABEL[p.stage],
        p.stage_status,
        day(p.stage_entered_at),
        p.project_status,
        p.priority,
        p.owner,
        p.thesis_code,
        p.thesis_name,
        p.thesis_fit,
        p.subsector,
        p.origin_type,
        p.loi_status,
        p.full_dd_status,
        p.closing_status,
        p.open_required_dd_items,
        p.next_step,
        p.next_step_due,
        p.review_date,
        p.pass_lost_reason,
        p.decisive_evidence,
        day(p.updated_at),
      ]),
    );

    return csvResponse(`arpa-ios-pipeline-${stamp()}.csv`, csv);
  }

  const rows = await getIosDecisions(1000);

  const csv = toCsv(
    [
      'Fecha',
      'Proyecto',
      'Gate',
      'Decisión',
      'Tipo',
      'Estado',
      'Quién decide',
      'Justificación',
      'Gate abierto al decidir',
      // The frozen checklist. It is why an audit can answer "why did this
      // advance" without re-deriving it from documents since superseded.
      'Comprobaciones del gate',
      'Motivo del bloqueo',
      'Etapa antes',
      'Etapa después',
      'Estado antes',
      'Estado después',
      'Motivo de descarte',
      'Evidencia decisiva',
    ],
    rows.map((d) => [
      d.decided_at,
      d.project_name,
      d.gate,
      d.decision,
      d.decision_type,
      d.status,
      d.decided_by,
      d.rationale,
      d.gate_ready_at_decision,
      (d.gate_ready_detail ?? []).map((c) => `${c.ok ? 'OK' : 'FALTA'}: ${c.label}`),
      d.blocked_reason,
      d.stage_before,
      d.stage_after,
      d.project_status_before,
      d.project_status_after,
      d.pass_lost_reason,
      d.decisive_evidence,
    ]),
  );

  return csvResponse(`arpa-ios-decisiones-${stamp()}.csv`, csv);
}
