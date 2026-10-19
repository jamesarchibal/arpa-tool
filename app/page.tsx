import Link from 'next/link';

import { getCamino, getInbound, getIndustries, getThemes } from '@/lib/arpa/db';
import CaminoPicker from './_camino-picker';
import CaminoStart from './_camino-start';
import { Gates } from './_gates';
import InboundForm from './_inbound-form';
import SabiList, { type SabiParams } from './_sabi-list';
import TopNav from './_topnav';

export const dynamic = 'force-dynamic';

/**
 * Originación: the two doors into the funnel.
 *
 * Ignasi described origination as two paths, not one list. The OPPORTUNISTIC
 * path starts from a document: an advisor sends an infomemo about one company,
 * and the job is to record who sent it and decide fast. The PROACTIVE path runs
 * the other way round: pick a temática and a subsector, look at the industry
 * and its comparables, and only then name companies.
 *
 * The screen before this one was upload, filter, score. That is a tool of the
 * proactive path, not the path itself, so it now lives under it.
 */

const VIAS = [
  {
    key: 'proactiva',
    label: 'Proactiva',
    hint: 'De la temática al subsector, del subsector a las empresas.',
  },
  {
    key: 'oportunista',
    label: 'Oportunista',
    hint: 'Llega un infomemo de un asesor. Una empresa, un documento, un remitente.',
  },
] as const;

const m = (v: number | null) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(1)} M€`);
const pct = (v: number | null) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(0)} %`);

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-ink-faint">{label}</div>
      <div className="mt-0.5 text-sm text-ink" title={hint}>
        {value}
      </div>
    </div>
  );
}

export default async function OriginacionPage({
  searchParams,
}: {
  searchParams: SabiParams;
}) {
  const via = searchParams.via === 'oportunista' ? 'oportunista' : 'proactiva';

  const themeId = searchParams.tema ? Number(searchParams.tema) : null;
  const taxonomyId = searchParams.sub ? Number(searchParams.sub) : null;

  const [themes, industries] = await Promise.all([getThemes(), getIndustries()]);

  const theme = themeId === null ? null : themes.find((t) => t.id === themeId) ?? null;
  const industry = taxonomyId === null ? null : industries.find((t) => t.id === taxonomyId) ?? null;

  // Only read the camino once both halves of it are chosen. A subsector without
  // a temática is a list of companies with no reason to be looking at it.
  const camino = theme && industry ? await getCamino(industry.id) : null;
  const inbound = via === 'oportunista' ? await getInbound() : [];

  const viaHref = (key: string) => {
    const qs = new URLSearchParams();
    if (key !== 'proactiva') qs.set('via', key);
    if (searchParams.tema) qs.set('tema', searchParams.tema);
    if (searchParams.sub) qs.set('sub', searchParams.sub);
    return qs.toString() ? `/?${qs.toString()}` : '/';
  };

  return (
    <div className="space-y-6">
      <TopNav active="origination" />

      <div>
        <h1 className="text-2xl font-bold text-ink">🧭 ARPA · Originación</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-mute">
          Dos puertas de entrada, y son distintas. En la{' '}
          <strong className="font-semibold text-ink-soft">oportunista</strong> llega un infomemo y lo
          único que hace falta es registrar quién lo manda y decidir rápido. En la{' '}
          <strong className="font-semibold text-ink-soft">proactiva</strong> se elige antes la
          temática y el subsector, se mira la industria y sus comparables, y las empresas salen al
          final.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {VIAS.map((v) => (
          <Link
            key={v.key}
            href={viaHref(v.key)}
            title={v.hint}
            className={`rounded-md border px-4 py-2 text-sm transition ${
              via === v.key
                ? 'border-brand bg-brand-wash font-semibold text-brand'
                : 'border-border text-ink-mute hover:bg-bg-elevated hover:text-ink'
            }`}
          >
            {v.label}
          </Link>
        ))}
      </div>

      {via === 'proactiva' ? (
        <div className="space-y-5">
          <CaminoPicker
            themes={themes.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }))}
            industries={industries
              .filter((t) => t.active)
              .map((t) => ({
                id: t.id,
                sector: t.sector,
                category: t.category,
                subsector: t.subsector,
                pre_score: t.pre_score,
              }))}
            themeId={themeId}
            taxonomyId={taxonomyId}
          />

          {!theme || !industry ? (
            <div className="rounded-lg border border-dashed border-border bg-bg-card px-6 py-10 text-center">
              <p className="text-sm text-ink-soft">
                Elige una temática y un subsector para abrir el camino.
              </p>
              <p className="mx-auto mt-2 max-w-md text-xs text-ink-faint">
                Esto no es un filtro sobre una lista que ya existe. Es el orden al revés: primero la
                tesis, después la industria, y las empresas al final.
              </p>
            </div>
          ) : (
            <>
              <section className="space-y-3 rounded-lg border border-border bg-bg-card px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold text-ink">
                    {theme.name} · {industry.subsector}
                  </h2>
                  <span className="text-[11px] text-ink-faint">
                    {industry.sector} · {industry.category}
                  </span>
                </div>

                {theme.thesis ? (
                  <p className="max-w-3xl text-xs leading-relaxed text-ink-mute">{theme.thesis}</p>
                ) : null}

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                  <Field
                    label="Interés ARPA"
                    value={industry.pre_score === null ? '—' : String(industry.pre_score)}
                    hint="El pre-score de ARPA sobre el subsector, no un número calculado por nosotros."
                  />
                  <Field label="Margen típico" value={pct(industry.margin_typical_pct)} />
                  <Field label="Crecimiento" value={industry.growth ?? '—'} />
                  <Field label="Fragmentación" value={industry.fragmentation ?? '—'} />
                  <Field label="Consolidación" value={industry.consolidation ?? '—'} />
                  <Field
                    label="CNAE"
                    value={industry.cnae_codes?.length ? industry.cnae_codes.join(', ') : '—'}
                  />
                </div>

                {industry.keywords?.length ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] uppercase tracking-wider text-ink-faint">
                      Palabras clave
                    </span>
                    {industry.keywords.map((k) => (
                      <span
                        key={k}
                        className="rounded border border-border bg-bg-elevated px-1.5 py-0.5 text-[11px] text-ink-soft"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                ) : null}

                {industry.notes ? (
                  <p className="max-w-3xl text-[11px] leading-relaxed text-ink-faint">
                    {industry.notes}
                  </p>
                ) : null}
              </section>

              <section className="space-y-3 rounded-lg border border-border bg-bg-card px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold text-ink">Comparables del subsector</h2>
                  <span className="text-[11px] text-ink-faint">
                    {camino?.comparables.n ?? 0} empresa(s) con cifras
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Ventas (mediana)" value={m(camino?.comparables.revenue ?? null)} />
                  <Field label="EBITDA (mediana)" value={m(camino?.comparables.ebitda ?? null)} />
                  <Field label="Margen (mediana)" value={pct(camino?.comparables.margin ?? null)} />
                </div>
                <p className="text-[11px] leading-relaxed text-ink-faint">
                  Medianas y no medias: con seis empresas, un atípico mueve la media lo bastante
                  para describir mal el subsector. Salen de las cifras que ya hay en la base, no de
                  un informe de mercado.
                </p>
              </section>

              <section className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold text-ink">
                    Empresas de {industry.subsector}
                  </h2>
                  <span className="text-[11px] text-ink-faint">
                    {camino?.companies.length ?? 0} en la base · {camino?.untouched ?? 0} sin
                    proyecto
                  </span>
                </div>

                {!camino || camino.companies.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-bg-card px-6 py-10 text-center">
                    <p className="text-sm text-ink-soft">
                      Ninguna empresa clasificada en este subsector todavía.
                    </p>
                    <p className="mx-auto mt-2 max-w-md text-xs text-ink-faint">
                      El camino ya está definido. Lo que falta es materia prima: importa un export
                      de SABI con los CNAE de arriba, o da de alta la empresa a mano.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full min-w-[1040px] text-sm">
                      <thead className="bg-bg-elevated text-left text-[11px] uppercase tracking-wider text-ink-mute">
                        <tr>
                          <th className="px-4 py-2.5 font-medium">Empresa</th>
                          <th className="px-3 py-2.5 font-medium">Propiedad</th>
                          <th className="px-3 py-2.5 text-right font-medium">Ventas</th>
                          <th className="px-3 py-2.5 text-right font-medium">EBITDA</th>
                          <th className="px-3 py-2.5 font-medium">Puertas</th>
                          <th className="px-3 py-2.5 font-medium">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {camino.companies.map((c) => (
                          <tr key={c.id} className="border-t border-border align-top">
                            <td className="px-4 py-2.5">
                              {c.project_id ? (
                                <Link
                                  href={`/${c.project_id}`}
                                  className="font-medium text-ink hover:text-brand"
                                >
                                  {c.legal_name}
                                </Link>
                              ) : (
                                <span className="font-medium text-ink">{c.legal_name}</span>
                              )}
                              <div className="text-[11px] text-ink-faint">
                                {[
                                  c.city,
                                  c.region,
                                  c.employees === null ? null : `${c.employees} empleados`,
                                ]
                                  .filter(Boolean)
                                  .join(' · ') || '—'}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-ink-soft">
                              {c.ownership_type ?? '—'}
                              {c.admin_since === null ? null : (
                                <div
                                  className="text-[11px] text-ink-faint"
                                  title="Año del primer nombramiento de administrador. El sustituto gratuito de la edad del propietario."
                                >
                                  administra desde {c.admin_since}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right text-xs tabular-nums text-ink">
                              {m(c.revenue)}
                            </td>
                            <td className="px-3 py-2.5 text-right text-xs tabular-nums text-ink">
                              {m(c.ebitda)}
                            </td>
                            {/* The score belongs on this screen and not only in
                                the ficha: the camino's whole job is to rank a
                                subsector, and a ranking with the judgement
                                hidden one click away is just a list. A company
                                with no project cannot have one, which is the
                                honest answer rather than a zero. */}
                            <td className="px-3 py-2.5">
                              {c.project_id ? (
                                <Gates
                                  qss={c.qss}
                                  om={c.om}
                                  pfr={c.pfr}
                                  qssCov={c.qss_cov}
                                  omCov={c.om_cov}
                                  pfrCov={c.pfr_cov}
                                  veto={c.has_veto}
                                />
                              ) : (
                                <span className="text-[11px] text-ink-faint">
                                  sin proyecto, nada que puntuar
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {c.project_id ? (
                                <span className="text-[11px] text-ink-soft">
                                  {c.project_code ? `${c.project_code} · ` : ''}
                                  {c.stage}
                                </span>
                              ) : (
                                <CaminoStart
                                  companyId={c.id}
                                  themeId={theme.id}
                                  taxonomyId={industry.id}
                                />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-[11px] leading-relaxed text-ink-faint">
                  Abrir el proyecto desde aquí le pone ya la temática y el subsector del camino, que
                  es la diferencia con darlo de alta a mano: la tesis estaba elegida antes que la
                  empresa.
                </p>
              </section>
            </>
          )}

          <details className="rounded-lg border border-border bg-bg px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
            <summary className="cursor-pointer text-sm font-semibold text-brand hover:underline">
              Toda la lista importada (SABI + BORME)
            </summary>
            <div className="mt-4">
              <SabiList current={searchParams} />
            </div>
          </details>
        </div>
      ) : (
        <div className="space-y-5">
          <InboundForm
            themes={themes.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }))}
            industries={industries
              .filter((t) => t.active)
              .map((t) => ({
                id: t.id,
                sector: t.sector,
                category: t.category,
                subsector: t.subsector,
              }))}
          />

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-ink">Lo que ha llegado así</h2>
            {inbound.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-bg-card px-6 py-10 text-center">
                <p className="text-sm text-ink-soft">Todavía no hay ningún deal entrante.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-bg-elevated text-left text-[11px] uppercase tracking-wider text-ink-mute">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Empresa</th>
                      <th className="px-3 py-2.5 font-medium">Lo mandó</th>
                      <th className="px-3 py-2.5 font-medium">Temática</th>
                      <th className="px-3 py-2.5 font-medium">Etapa</th>
                      <th className="px-3 py-2.5 font-medium">Entró</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inbound.map((r) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="px-4 py-2.5">
                          <Link href={`/${r.id}`} className="font-medium text-ink hover:text-brand">
                            {r.legal_name}
                          </Link>
                          {r.code ? (
                            <div className="text-[11px] text-ink-faint">{r.code}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-ink-soft">
                          {r.sender ?? <span className="text-ink-faint">sin registrar</span>}
                          {r.sender_org ? (
                            <div className="text-[11px] text-ink-faint">{r.sender_org}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-ink-soft">
                          {r.theme_name ?? <span className="text-ink-faint">por decidir</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-ink-soft">{r.stage}</td>
                        <td className="px-3 py-2.5 text-xs tabular-nums text-ink-faint">
                          {r.created_at.slice(0, 10)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] leading-relaxed text-ink-faint">
              Entra en Screening y no en Sourcing: un infomemo ya es una empresa descrita, así que la
              siguiente puerta es el screening de quince minutos, no identificarla.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
