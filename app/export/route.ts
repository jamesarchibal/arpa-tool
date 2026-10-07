import { csvResponse, stamp, toCsv } from '@/lib/arpa/csv';
import { getOriginationAll, getPipeline, getStakeholders } from '@/lib/arpa/db';

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
    // The filters the user had applied on screen, so the file matches the view.
    const rows = await getOriginationAll({
      province: params.get('province') ?? undefined,
      subsector: params.get('subsector') ?? undefined,
      status: params.get('status') ?? undefined,
      phase: params.get('phase') ?? undefined,
    });

    const csv = toCsv(
      [
        'Empresa',
        'Provincia',
        'Hoja registral',
        'Sector',
        'Subsector',
        'CNAE',
        'Fase',
        'Señales BORME',
        'Actos de preparación',
        'Actos de cierre',
        'Primera señal',
        'Última señal',
        'Estado',
        'Objeto social',
        'Nota',
      ],
      rows.map((r) => [
        r.legal_name,
        r.province,
        r.hoja,
        r.sector,
        r.subsector,
        r.cnae,
        PHASE_LABEL[r.phase] ?? r.phase,
        r.signals,
        r.prep_count,
        r.done_count,
        day(r.first_signal_at),
        day(r.last_signal_at),
        r.status,
        r.objeto,
        r.note,
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
