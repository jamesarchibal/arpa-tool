import Link from 'next/link';

import { getOrigination, type OriginationRow } from '@/lib/arpa/db';
import RowActions from './_row-actions';

export const dynamic = 'force-dynamic';

// The Tier 1 rule ids that borme-probe.mjs emits, in plain Spanish. Anything not
// listed here still shows, with its raw id.
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

const ROLE_LABELS: Record<string, string> = {
  maker: 'fabrica',
  trader: 'comercializa',
  mixed: 'mixta',
  unclear: 'sin determinar',
};

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded border px-3 py-1 text-xs transition ${
        active ? 'border-brand text-white' : 'border-border text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {children}
    </Link>
  );
}

function SignalCell({ row }: { row: OriginationRow }) {
  if (row.signal_count === 0) {
    return <span className="text-[11px] text-zinc-600">sin señal</span>;
  }
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="inline-flex min-w-[22px] items-center justify-center rounded border border-emerald-700 bg-emerald-950/50 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-300">
          {row.signal_count}
        </span>
        <span className="text-[11px] text-zinc-500 tabular-nums">peso {row.signal_score}</span>
      </div>
      <div className="mt-0.5 text-[11px] leading-snug text-zinc-400">
        {row.signals.map((s) => SIGNAL_LABELS[s] ?? s).join(', ')}
      </div>
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
  return qs ? `/origination?${qs}` : '/origination';
}

export default async function OriginationPage({
  searchParams,
}: {
  searchParams: { province?: string; subsector?: string; status?: string; moving?: string };
}) {
  const current = {
    province: searchParams.province,
    subsector: searchParams.subsector,
    status: searchParams.status,
    moving: searchParams.moving,
  };

  const view = await getOrigination({
    province: searchParams.province,
    subsector: searchParams.subsector,
    status: searchParams.status,
    moving: searchParams.moving === '1',
  });

  const filtered = Object.values(current).some(Boolean);

  const stats: [string, string][] = [
    ['En la lista', String(view.total)],
    ['Con señal', String(view.moving)],
    ['Provincias', String(view.provinces.length)],
    ['Subsectores', String(view.subsectors.length)],
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <Link href="/" className="text-zinc-500 transition hover:text-zinc-300">
            ← Pipeline
          </Link>
          <span className="text-zinc-700">|</span>
          <span className="text-zinc-300">Originación</span>
        </div>
        <h1 className="mt-2 text-2xl font-bold text-white">🧭 ARPA · Originación</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          Empresas sacadas del BORME, el boletín oficial del Registro Mercantil. Entra en la lista
          una empresa que (1) declara una actividad de los 20 subsectores de ARPA y (2) la fabrica,
          no solo la comercializa. Se ordena por cuántas señales distintas de pre-venta ha
          publicado. El BORME no publica CIF, así que la clave es provincia más hoja registral.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-bg-card px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-white">{value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 text-[11px] uppercase tracking-wider text-zinc-600">Estado</span>
          <Chip href={withFilter(current, { status: null, moving: null })} active={!filtered}>
            Todas
          </Chip>
          <Chip href={withFilter(current, { moving: current.moving === '1' ? null : '1' })} active={current.moving === '1'}>
            Se mueve ahora
          </Chip>
          {['new', 'shortlisted', 'discarded', 'promoted'].map((s) => (
            <Chip
              key={s}
              href={withFilter(current, { status: current.status === s ? null : s })}
              active={current.status === s}
            >
              {{ new: 'Sin revisar', shortlisted: 'En lista', discarded: 'Descartadas', promoted: 'En pipeline' }[s]}
            </Chip>
          ))}
        </div>

        {view.subsectors.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 text-[11px] uppercase tracking-wider text-zinc-600">Subsector</span>
            {view.subsectors.map((s) => (
              <Chip
                key={s}
                href={withFilter(current, { subsector: current.subsector === s ? null : s })}
                active={current.subsector === s}
              >
                {s}
              </Chip>
            ))}
          </div>
        ) : null}

        {view.provinces.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 text-[11px] uppercase tracking-wider text-zinc-600">Provincia</span>
            {view.provinces.map((p) => (
              <Chip
                key={p}
                href={withFilter(current, { province: current.province === p ? null : p })}
                active={current.province === p}
              >
                {p}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>

      {view.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-bg-card px-6 py-12 text-center">
          <p className="text-sm text-zinc-400">
            {view.total === 0 && !filtered
              ? 'La lista está vacía.'
              : 'Ninguna empresa con esos filtros.'}
          </p>
          {view.total === 0 && !filtered ? (
            <p className="mx-auto mt-2 max-w-md text-xs text-zinc-600">
              Se carga con <code className="text-zinc-400">scripts/borme-load.mjs</code>, que une la
              pasada de sectores y la de señales del BORME.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-bg-elevated text-left text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Empresa</th>
                <th className="px-3 py-2.5 font-medium">Subsector</th>
                <th className="px-3 py-2.5 font-medium">Actividad declarada</th>
                <th className="px-3 py-2.5 font-medium">Señales de pre-venta</th>
                <th className="px-3 py-2.5 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((r) => (
                <tr key={r.id} className="border-t border-border align-top transition hover:bg-bg-elevated/60">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-white">{r.legal_name}</div>
                    <div className="text-[11px] text-zinc-600">
                      {[r.province, r.hoja ? `hoja ${r.hoja}` : null, r.cnae ? `CNAE ${r.cnae}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    {r.patrimonial ? (
                      <span className="mt-1 inline-block rounded border border-amber-800 bg-amber-950/40 px-1.5 py-0.5 text-[10px] text-amber-400" title="El objeto social menciona tenencia de participaciones o inmuebles. Puede ser un vehículo patrimonial, no una operativa.">
                        patrimonial
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-400">
                    {r.subsector ?? <span className="text-zinc-600">sin clasificar</span>}
                    {r.sector ? <div className="text-[11px] text-zinc-600">{r.sector}</div> : null}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.role ? (
                        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-zinc-500">
                          {ROLE_LABELS[r.role] ?? r.role}
                        </span>
                      ) : null}
                      {r.principal ? (
                        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-zinc-400" title="La coincidencia está en la primera cláusula del objeto social, es decir es la actividad principal.">
                          principal
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="max-w-[420px] px-3 py-2.5 text-[11px] leading-snug text-zinc-500">
                    {r.objeto ? (
                      <>
                        {r.objeto.length > 260 ? `${r.objeto.slice(0, 260)}…` : r.objeto}
                        {r.objeto_date ? (
                          <div className="mt-0.5 text-zinc-600">publicado {r.objeto_date}</div>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-zinc-600">sin objeto social publicado</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <SignalCell row={r} />
                    {r.last_signal_at ? (
                      <div className="mt-0.5 text-[10px] text-zinc-600">última {r.last_signal_at}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <RowActions regKey={r.reg_key} status={r.status} projectId={r.project_id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-zinc-600">
        Se muestran como máximo 300 filas por vista, así que filtra por provincia o subsector para
        ver el resto. Ninguna fila contiene el nombre de una persona física: el probe borra toda la
        línea de cargos antes de guardar, y la señal más fuerte, un administrador que es una
        sociedad, se refiere a una empresa.
      </p>
    </div>
  );
}
