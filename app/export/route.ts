import { csvResponse, stamp, toCsv } from '@/lib/arpa/csv';
import { getPipeline, getSourcing, getStakeholders } from '@/lib/arpa/db';

// Reads live data on every request, so it must not be cached or prerendered.
export const dynamic = 'force-dynamic';

const KINDS = ['originacion', 'pipeline', 'contactos'] as const;
type Kind = (typeof KINDS)[number];

function isKind(value: string | null): value is Kind {
  return value !== null && (KINDS as readonly string[]).includes(value);
}

const PHASE_LABEL: Record<string, string> = {
  lead: 'Preparando venta',
  early: 'Señal temprana',
  sold: 'Operación cerrada',
  none: 'Sin señal',
};

/** `2026-03-14T...` to `2026-03-14`, leaving anything unexpected alone. */
function day(value: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}

/**
 * CSV export for the three list screens.
 *
 * It exists because the client asked to keep working in Excel and Airtable:
 * both import CSV, so this is the cheapest way to stop the tool being an
 * all-or-nothing replacement for what they already use.
 *
 * Covered by middleware.ts like every other route, so no auth check here.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const kind = params.get('kind');

  if (!isKind(kind)) {
    return new Response(`kind debe ser uno de: ${KINDS.join(', ')}`, {
      status: 400,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  if (kind === 'originacion') {
    // The same reader the screen uses, with the same filters, so the file is
    // exactly what the user was looking at. It pages internally, so there is no
    // truncated-export trap here.
    const triaje = params.get('triaje');
    // `tema` and `sub` are filters like any other since the camino stopped being
    // its own screen. Leaving them out here is the exact failure this comment
    // claims cannot happen: a file with more rows than the screen that asked
    // for it.
    const num = (k: string) => {
      const v = Number(params.get(k));
      return Number.isFinite(v) && v > 0 ? v : undefined;
    };
    const { rows } = await getSourcing({
      region: params.get('region') ?? undefined,
      batch: params.get('batch') ?? undefined,
      phase: params.get('phase') ?? undefined,
      triage: triaje === 'untriaged' || triaje === 'promoted' ? triaje : undefined,
      themeId: num('tema'),
      taxonomyId: num('sub'),
    });

    const csv = toCsv(
      [
        'Empresa',
        'NIF',
        'Municipio',
        'Provincia',
        'CNAE',
        'Empleados',
        'Constitución',
        'Sector',
        'Subsector',
        'Etapa',
        'Decisión',
        'EBITDA ref (M€)',
        'QSS',
        'OM',
        'PFR',
        'Veto',
        'Señal BORME',
        'Señales BORME',
        'Actos de preparación',
        'Actos de cierre',
        'Primera señal',
        'Última señal',
        'Lote',
        'Web',
      ],
      rows.map((r) => [
        r.legal_name,
        r.cif,
        r.city,
        r.region,
        r.cnae,
        r.employees,
        r.founded_year,
        r.sector,
        r.subsector,
        r.stage,
        r.decision_status,
        r.ebitda_ref,
        r.qss,
        r.om,
        r.pfr,
        r.has_veto === true,
        PHASE_LABEL[r.borme_phase ?? 'none'] ?? r.borme_phase,
        r.borme_signals ?? [],
        r.borme_prep_count,
        r.borme_done_count,
        day(r.borme_first_signal_at),
        day(r.borme_last_signal_at),
        r.intake_batch,
        r.website,
      ]),
    );

    return csvResponse(`arpa-originacion-${stamp()}.csv`, csv);
  }

  if (kind === 'pipeline') {
    const rows = await getPipeline();

    const csv = toCsv(
      [
        'Código',
        'Empresa',
        'Etapa',
        'Decisión',
        'Motivo de descarte',
        'Responsable',
        'Región',
        'Propiedad',
        'Sector',
        'Subsector',
        'EBITDA ref (M€)',
        'EV (M€)',
        'Equity (M€)',
        'Gap de valoración (M€)',
        'QSS',
        'OM',
        'PFR',
        'Veto',
        'Último scoring',
        'Actualizado',
      ],
      rows.map((r) => [
        r.code,
        r.legal_name,
        r.stage,
        r.decision_status,
        r.pass_reason,
        r.owner,
        r.region,
        r.ownership_type,
        r.sector,
        r.subsector,
        r.ebitda_ref,
        r.ev,
        r.equity,
        r.valuation_gap,
        r.qss,
        r.om,
        r.pfr,
        r.has_veto === true,
        day(r.last_scored_at),
        day(r.updated_at),
      ]),
    );

    return csvResponse(`arpa-pipeline-${stamp()}.csv`, csv);
  }

  const { rows } = await getStakeholders({
    kind: params.get('tipo') ?? undefined,
    q: params.get('q') ?? undefined,
  });

  const csv = toCsv(
    [
      'Nombre',
      'Tipo',
      'Organización',
      'Email',
      'Teléfono',
      'LinkedIn',
      'Ciudad',
      'Empresas vinculadas',
      'Roles',
      'Interacciones',
      'Última interacción',
      'Notas',
    ],
    rows.map((r) => [
      r.full_name,
      r.kind,
      r.org,
      r.email,
      r.phone,
      r.linkedin,
      r.city,
      r.links.map((l) => l.company_name).filter(Boolean),
      r.links.map((l) => l.role).filter(Boolean),
      r.interaction_count,
      day(r.last_interaction_at),
      r.notes,
    ]),
  );

  return csvResponse(`arpa-contactos-${stamp()}.csv`, csv);
}
