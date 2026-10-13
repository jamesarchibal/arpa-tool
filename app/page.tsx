import Link from 'next/link';

import { getSourcing, type SourcingRow } from '@/lib/arpa/db';
import { ExportButton } from './_export-button';
import ImportForm from './_import-form';
import StageSelect from './pipeline/_stage-select';
import TopNav from './_topnav';

export const dynamic = 'force-dynamic';

/**
 * Originación: the whole front of the funnel on one screen.
 *
 * The list is born from the SABI import, not from the BORME. That is the
 * important part. A BORME act on its own is a company name, a province and a
 * registry sheet, with no accounts, so it cannot be scored and cannot be
 * ranked against ARPA's mandate. A SABI export has twenty years of figures.
 * So SABI defines WHO is on the list, and the BORME is reduced to a SIGNAL
 * hung onto the companies already there: "this one also filed an act that
 * looks like preparing a sale".
 *
 * The match is on a normalised company name plus province, because the BORME
 * does not publish a CIF. See arpa_name_key() in
 * 20261013_arpa_sourcing_and_borme_match.sql.
 */

// The Tier 1 rule ids that borme-probe.mjs emits, in plain Spanish. Anything
// not listed here still shows, with its raw id.
const SIGNAL_LABELS: Record<string, string> = {
  holding_admin: 'administrador persona jurídica',
  escision_parcial: 'escisión parcial',
  escision_total: 'escisión total',
  auditor: 'nombramiento de auditor',
  transformacion: 'transformación de sociedad',
  reduccion_capital: 'reducción de capital',
  consejo: 'cambio en el consejo',
  unipersonalidad_perdida: 'pérdida de unipersonalidad',
  socio_unico_cambio: 'cambio de socio único',
  fusion_absorcion: 'fusión por absorción',
  apoderado: 'nuevo apoderado',
};

// `early` is deliberately first: one recent preparation act is the best moment
// to call, because no advisor has been mandated yet. A loud cluster means the
// process is already advanced and contested.
const PHASES = [
  {
    key: 'early',
    label: 'Primer movimiento',
    hint: 'Una sola señal de preparación en el BORME. La mejor ventana: todavía no hay asesor mandatado.',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  {
    key: 'lead',
    label: 'Preparando',
    hint: 'Dos o más señales. Ya se está moviendo, pero probablemente ya hay asesor.',
    tone: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  {
    key: 'sold',
    label: 'Ya vendida',
    hint: 'La operación ya pasó. No es un lead: lo útil es quién compró.',
    tone: 'border-zinc-300 bg-zinc-100 text-zinc-600',
  },
  {
    key: 'none',
    label: 'Sin señal',
    hint: 'Nada publicado en el BORME. No significa que no esté en venta, solo que no lo ha anunciado.',
    tone: 'border-border bg-bg-elevated text-ink-mute',
  },
] as const;

const PHASE_BY_KEY = new Map(PHASES.map((p) => [p.key as string, p]));

const m = (v: number | null) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(2)} M€`);

function Chip({
  href,
  active,
  title,
  children,
}: {
  href: string;
  active: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      className={`rounded-md border px-3 py-1 text-xs transition ${
        active
          ? 'border-brand bg-brand-wash font-semibold text-brand'
          : 'border-border text-ink-mute hover:bg-bg-elevated hover:text-ink'
      }`}
    >
      {children}
    </Link>
  );
}

function ScorePill({ value, label }: { value: number | null; label: string }) {
  if (value === null || value === undefined) {
    return (
      <span className="inline-flex min-w-[46px] items-center justify-center rounded border border-border px-1.5 py-0.5 text-[11px] text-ink-faint">
        {label} —
      </span>
    );
  }
  const tone =
    value >= 80
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : value >= 60
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-rose-200 bg-rose-50 text-rose-700';
  return (
    <span
      className={`inline-flex min-w-[46px] items-center justify-center rounded border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`}
    >
      {label} {value}
    </span>
  );
}

function SignalCell({ row }: { row: SourcingRow }) {
  const phase = PHASE_BY_KEY.get(row.borme_phase ?? 'none');
  const signals = row.borme_signals ?? [];

  if (signals.length === 0) {
    return <span className="text-[11px] text-ink-faint">sin señal en el BORME</span>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {phase ? (
          <span
            className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${phase.tone}`}
            title={phase.hint}
          >
            {phase.label}
          </span>
        ) : null}
        <span className="text-[11px] tabular-nums text-ink-mute">
          {row.borme_prep_count ?? 0} prep
          {(row.borme_done_count ?? 0) > 0 ? ` · ${row.borme_done_count} hecho` : ''}
        </span>
      </div>
      <div className="mt-0.5 text-[11px] leading-snug text-ink-soft">
        {signals.map((s) => SIGNAL_LABELS[s] ?? s).join(', ')}
      </div>
      {row.borme_first_signal_at ? (
        <div className="mt-0.5 text-[10px] text-ink-faint">
          primera {row.borme_first_signal_at.slice(0, 10)}
          {row.borme_last_signal_at && row.borme_last_signal_at !== row.borme_first_signal_at
            ? ` · última ${row.borme_last_signal_at.slice(0, 10)}`
            : ''}
        </div>
      ) : null}
    </div>
  );
}

/** Build a filter URL that keeps the other filters, and clears the one passed as null. */
function withFilter(
  current: Record<string, string | undefined>,
  patch: Record<string, string | null>,
) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...patch })) {
    if (v) next.set(k, v);
  }
  const qs = next.toString();
  return qs ? `/?${qs}` : '/';
}

const TRIAGE = [
  { key: 'untriaged', label: 'Sin revisar' },
  { key: 'promoted', label: 'Ya en pipeline' },
] as const;

export default async function OriginacionPage({
  searchParams,
}: {
  searchParams: { region?: string; batch?: string; phase?: string; triaje?: string };
}) {
  const current = {
    region: searchParams.region,
    batch: searchParams.batch,
    phase: searchParams.phase,
    triaje: searchParams.triaje,
  };

  const triage =
    current.triaje === 'untriaged' || current.triaje === 'promoted' ? current.triaje : undefined;

  const view = await getSourcing({
    region: current.region,
    batch: current.batch,
    phase: current.phase,
    triage,
  });

  const filtered = Object.values(current).some(Boolean);
  const withSignal = view.total - view.phases.none;

  const stats: [string, string][] = [
    ['Importadas', String(view.total)],
    ['Sin revisar', String(view.untriaged)],
    ['Con señal BORME', String(withSignal)],
    ['Ya en pipeline', String(view.total - view.untriaged)],
  ];

  return (
    <div className="space-y-6">
      <TopNav active="origination" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">🧭 ARPA · Originación</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-mute">
            Sube el export de SABI y cada empresa entra aquí ya puntuada con el blueprint. Encima de
            eso se cruza el <strong className="font-semibold text-ink-soft">BORME</strong>, el
            boletín del Registro Mercantil, para marcar quién ha publicado actos que parecen
            preparar una venta. Decide en esta pantalla qué pasa al pipeline.
          </p>
        </div>
        <ExportButton kind="originacion" params={current} />
      </div>

      <details
        open={view.total === 0}
        className="rounded-lg border border-border bg-bg-card px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
      >
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          Importar de SABI
          <span className="ml-2 font-normal text-ink-faint">
            filtra en SABI, exporta a Excel, suéltalo aquí
          </span>
        </summary>
        <div className="mt-4">
          <ImportForm />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          El export de SABI es un dossier, una hoja por empresa, no una tabla. Se lee aquí mismo en
          el navegador y se mandan solo los campos que hacen falta. Las cifras vienen en euros y el
          modelo trabaja en millones: la conversión se hace en el servidor, y un importe que salga
          absurdo para esta cartera se rechaza en vez de guardarse mal.
        </p>
      </details>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-bg-card px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-ink-mute">{label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-ink">{value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 text-[11px] uppercase tracking-wider text-ink-faint">Señal</span>
          <Chip href={withFilter(current, { phase: null })} active={!current.phase}>
            Cualquiera
          </Chip>
          {PHASES.map((p) => (
            <Chip
              key={p.key}
              href={withFilter(current, { phase: current.phase === p.key ? null : p.key })}
              active={current.phase === p.key}
              title={p.hint}
            >
              {p.label} ({view.phases[p.key]})
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 text-[11px] uppercase tracking-wider text-ink-faint">Triaje</span>
          <Chip href={withFilter(current, { triaje: null })} active={!current.triaje}>
            Todas
          </Chip>
          {TRIAGE.map((t) => (
            <Chip
              key={t.key}
              href={withFilter(current, { triaje: current.triaje === t.key ? null : t.key })}
              active={current.triaje === t.key}
            >
              {t.label} ({t.key === 'untriaged' ? view.untriaged : view.total - view.untriaged})
            </Chip>
          ))}
        </div>

        {view.regions.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 text-[11px] uppercase tracking-wider text-ink-faint">
              Provincia
            </span>
            {view.regions.map((r) => (
              <Chip
                key={r}
                href={withFilter(current, { region: current.region === r ? null : r })}
                active={current.region === r}
              >
                {r}
              </Chip>
            ))}
          </div>
        ) : null}

        {view.batches.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 text-[11px] uppercase tracking-wider text-ink-faint">Lote</span>
            {view.batches.map((b) => (
              <Chip
                key={b}
                href={withFilter(current, { batch: current.batch === b ? null : b })}
                active={current.batch === b}
              >
                {b.replace(/^sabi:/, '')}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>

      {view.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-bg-card px-6 py-12 text-center">
          <p className="text-sm text-ink-soft">
            {view.total === 0 && !filtered
              ? 'Todavía no hay nada importado.'
              : 'Ninguna empresa con esos filtros.'}
          </p>
          {view.total === 0 && !filtered ? (
            <p className="mx-auto mt-2 max-w-md text-xs text-ink-faint">
              Abre «Importar de SABI» arriba y sube el Excel del export.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-bg-elevated text-left text-[11px] uppercase tracking-wider text-ink-mute">
              <tr>
                <th className="px-4 py-2.5 font-medium">Empresa</th>
                <th className="px-3 py-2.5 font-medium">Sector</th>
                <th className="px-3 py-2.5 text-right font-medium">EBITDA ref.</th>
                <th className="px-3 py-2.5 font-medium">Puertas</th>
                <th className="px-3 py-2.5 font-medium">Señal BORME</th>
                <th className="px-3 py-2.5 font-medium">Etapa</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-border align-top transition hover:bg-bg-elevated/60"
                >
                  <td className="px-4 py-2.5">
                    <Link href={`/${r.id}`} className="font-medium text-ink hover:text-brand">
                      {r.legal_name}
                    </Link>
                    <div className="text-[11px] text-ink-faint">
                      {[r.cif, r.city, r.region].filter(Boolean).join(' · ') || '—'}
                    </div>
                    <div className="text-[11px] text-ink-faint">
                      {[
                        r.cnae ? `CNAE ${r.cnae}` : null,
                        r.employees !== null ? `${r.employees} empleados` : null,
                        r.founded_year !== null ? `desde ${r.founded_year}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-ink-soft">
                    {r.subsector ?? <span className="text-ink-faint">sin clasificar</span>}
                    {r.sector ? <div className="text-[11px] text-ink-faint">{r.sector}</div> : null}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums text-ink">
                    {m(r.ebitda_ref)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1">
                      <ScorePill value={r.qss} label="QSS" />
                      <ScorePill value={r.om} label="OM" />
                      <ScorePill value={r.pfr} label="PFR" />
                    </div>
                    {r.decision_status ? (
                      <div className="mt-0.5 text-[11px] text-ink-mute">
                        {r.decision_status}
                        {r.has_veto ? (
                          <span
                            className="ml-1 font-bold text-rose-600"
                            title="Hay un kill criterion marcado"
                          >
                            VETO
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                  <td className="max-w-[300px] px-3 py-2.5">
                    <SignalCell row={r} />
                    {r.borme_patrimonial ? (
                      <span
                        className="mt-1 inline-block rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600"
                        title="El objeto social publicado menciona tenencia de participaciones o inmuebles. Puede ser un vehículo patrimonial, no una operativa."
                      >
                        patrimonial
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <StageSelect id={r.id} stage={r.stage} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-ink-faint">
        Ordenado por QSS, lo mejor arriba, y lo que no se ha podido puntuar al final. Mover una
        empresa de «Sourcing» a cualquier otra etapa es lo que la pasa al pipeline: es el mismo
        proyecto, no una copia. El EBITDA de referencia es el normalizado si existe, y si no el
        último depositado. Ninguna fila contiene el nombre de una persona física.
      </p>
    </div>
  );
}
