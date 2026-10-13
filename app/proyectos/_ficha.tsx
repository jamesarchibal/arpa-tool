import Link from 'next/link';

import type { ProjectDetail } from '@/lib/arpa/db';
import { derive } from '@/lib/arpa/scoring';
import StageSelect from '../pipeline/_stage-select';
import FocusSelect from './_focus';

// Mirrors `basePath` in next.config.mjs. A plain <a> downloads the route
// handler's body; next/link would try to client-navigate to it instead, and a
// bare href does not get the basePath prepended, so it is written out.
const BASE_PATH = '/arpa';

const OWNERSHIP: Record<string, string> = {
  family_founder: 'Familiar / fundador',
  family_succession: 'Familiar con relevo',
  private_other: 'Privada, otra',
  pe_backed: 'Con private equity',
  corporate_subsidiary: 'Filial de grupo',
  listed: 'Cotizada',
  public: 'Pública',
};

const CONC: Record<string, string> = { low: 'Baja', mid: 'Media', high: 'Alta' };

const MODEL_NAME: Record<string, string> = {
  qss: 'QSS · Screening',
  om: 'OM · Assessment',
  pfr: 'PFR · Financial Review',
};

const dash = '—';
const m = (v: number | null) => (v === null || v === undefined ? dash : `${Number(v).toFixed(1)} M€`);
const x = (v: number | null) => (v === null || v === undefined ? dash : `${Number(v).toFixed(1)}x`);
const p = (v: number | null) => (v === null || v === undefined ? dash : `${Math.round(v * 100)} %`);
const n = (v: number | null) => (v === null || v === undefined ? dash : String(v));
const d = (v: string | null) =>
  v ? new Date(v).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : dash;

function Block({ title, children, hint }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border px-5 py-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">{title}</h3>
      {hint ? <p className="mt-0.5 text-[11px] text-ink-faint">{hint}</p> : null}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/** Label over value, the densest honest way to show twenty figures at once. */
function Field({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div className="rounded border border-border bg-bg-card px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</div>
      <div
        className={`mt-0.5 text-sm tabular-nums ${
          value === dash ? 'text-ink-faint' : tone === 'warn' ? 'font-semibold text-amber-600' : 'text-ink'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Everything known about one deal, in a popup.
 *
 * A server component, so it reads the database directly and there is no second
 * data path to keep in sync with the board behind it. The only interactive
 * parts are the three selects, which are the existing client controls from the
 * pipeline and the card.
 *
 * It does not duplicate the scoring workbench or the ficha form. Those edit
 * dozens of fields and belong on a full page, which is what the link at the
 * bottom is for. This is the read, plus the three decisions that get taken
 * while looking at a board.
 */
export default function Ficha({
  detail,
  themes,
}: {
  detail: ProjectDetail;
  themes: { id: number; name: string }[];
}) {
  const { project, company, taxonomy, taxonomyList, scores, killFlags, stakeholders, interactions, documents } =
    detail;
  const f = derive(detail.scoringInput);
  const flagged = killFlags.filter((k) => k.flagged);

  const where = [company.city, company.region, company.country].filter(Boolean).join(', ');
  const head = [
    company.cif,
    where,
    company.employees ? `${company.employees} empleados` : null,
    company.founded_year ? `fundada ${company.founded_year}` : null,
    company.admin_since ? `administrador desde ${company.admin_since}` : null,
    company.ownership_type ? OWNERSHIP[company.ownership_type] ?? company.ownership_type : null,
  ].filter(Boolean);

  return (
    <div className="pb-2">
      <header className="px-5 pt-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-xl font-bold leading-tight text-ink">{company.legal_name}</h2>
          {project.code ? <span className="font-mono text-xs text-ink-faint">{project.code}</span> : null}
          {flagged.length > 0 ? (
            <span className="text-[10px] font-bold text-rose-600">
              VETO · {flagged.map((k) => k.kill_id).join(', ')}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-ink-mute">{head.join(' · ') || 'Sin datos de ficha'}</p>
        {taxonomy ? (
          <p className="mt-0.5 text-xs text-ink-soft">
            {taxonomy.sector} · {taxonomy.category} · {taxonomy.subsector}
            <span className="ml-2 text-ink-faint">
              crecimiento {taxonomy.growth} · fragmentación {taxonomy.fragmentation} · consolidación{' '}
              {taxonomy.consolidation}
            </span>
          </p>
        ) : null}
        {company.website ? (
          <a
            href={company.website}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-0.5 inline-block text-xs text-brand hover:underline"
          >
            {company.website.replace(/^https?:\/\//, '')}
          </a>
        ) : null}
      </header>

      <Block
        title="Decidir aquí mismo"
        hint="Etapa, temática e industria. Se guardan al soltar el desplegable; el tablero de detrás se mueve solo."
      >
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-faint">Etapa</div>
            <StageSelect id={project.id} stage={project.stage} />
          </div>
          <div className="sm:col-span-2">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-faint">
              Temática e industria
            </div>
            <FocusSelect
              projectId={project.id}
              themeId={project.theme_id}
              taxonomyId={project.taxonomy_id}
              themes={themes}
              industries={taxonomyList}
            />
          </div>
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">
          Responsable {project.owner ?? 'sin asignar'} · origen {project.source ?? 'sin registrar'} ·
          actualizado {d(project.updated_at)}
        </p>
      </Block>

      <Block
        title="Finanzas"
        hint="Millones de euros. Y3 es el último ejercicio depositado. Lo de abajo lo calcula el mismo motor que puntúa."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-[10px] uppercase tracking-wider text-ink-faint">
              <tr>
                <th className="pb-1 font-medium"></th>
                <th className="pb-1 text-right font-medium">Y1</th>
                <th className="pb-1 text-right font-medium">Y2</th>
                <th className="pb-1 text-right font-medium">Y3</th>
                <th className="pb-1 text-right font-medium">Normalizado</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr className="border-t border-border">
                <td className="py-1.5 text-ink-soft">Ventas</td>
                <td className="py-1.5 text-right text-ink">{m(project.revenue_y1)}</td>
                <td className="py-1.5 text-right text-ink">{m(project.revenue_y2)}</td>
                <td className="py-1.5 text-right font-semibold text-ink">{m(project.revenue_y3)}</td>
                <td className="py-1.5 text-right text-ink-faint">{dash}</td>
              </tr>
              <tr className="border-t border-border">
                <td className="py-1.5 text-ink-soft">EBITDA</td>
                <td className="py-1.5 text-right text-ink">{m(project.ebitda_y1)}</td>
                <td className="py-1.5 text-right text-ink">{m(project.ebitda_y2)}</td>
                <td className="py-1.5 text-right font-semibold text-ink">{m(project.ebitda_y3)}</td>
                <td className="py-1.5 text-right text-ink">{m(project.ebitda_norm)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <Field label="Margen EBITDA" value={p(f.ebitdaMargin)} />
          <Field label="CAGR ventas" value={p(f.revenueCagr)} />
          <Field label="Conversión en caja" value={p(f.cashConversion)} />
          <Field
            label="Deuda neta / EBITDA"
            value={x(f.leverage)}
            tone={f.leverage !== null && f.leverage > 3 ? 'warn' : undefined}
          />
          <Field label="Deuda neta" value={m(project.net_debt)} />
          <Field label="Capex" value={m(project.capex)} />
          <Field label="Circulante" value={m(project.working_capital)} />
          <Field
            label="Recurrente"
            value={project.recurring_pct === null ? dash : `${project.recurring_pct} %`}
          />
          <Field
            label="Concentración de clientes"
            value={project.customer_conc ? CONC[project.customer_conc] ?? project.customer_conc : dash}
            tone={project.customer_conc === 'high' ? 'warn' : undefined}
          />
          <Field
            label="Motivación del vendedor"
            value={project.seller_motiv === null ? dash : `${project.seller_motiv} / 5`}
          />
          <Field label="Fiabilidad del dato" value={project.data_confidence ?? dash} />
          <Field label="Fuente" value={project.financials_src ?? dash} />
        </div>
      </Block>

      <Block title="Valoración" hint="La cadena del workbook v4: EBITDA de referencia por múltiplo, menos deuda.">
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="EBITDA ref." value={m(f.ebitdaRef)} />
          <Field label="Múltiplo entrada" value={x(project.entry_multiple)} />
          <Field label="Enterprise value" value={m(f.enterpriseValue)} />
          <Field label="Equity value" value={m(f.equityValue)} />
          <Field label="Pide el vendedor" value={m(project.seller_exp_ev)} />
          <Field
            label="Diferencia"
            value={f.valuationGapM === null ? dash : `${f.valuationGapM > 0 ? '+' : ''}${f.valuationGapM.toFixed(1)} M€`}
            tone={f.valuationGapM !== null && f.valuationGapM > 0 ? 'warn' : undefined}
          />
        </div>
        {f.askMultiple !== null ? (
          <p className="mt-2 text-[11px] text-ink-faint">
            Lo que pide equivale a {x(f.askMultiple)} EBITDA
            {f.valuationGapPct !== null ? `, un ${Math.round(f.valuationGapPct * 100)} % sobre nuestro EV` : ''}.
          </p>
        ) : null}
      </Block>

      <Block title="Puntuaciones" hint="Una fila por puerta y por guardado. Nada se sobrescribe.">
        {scores.length === 0 ? (
          <p className="text-xs text-ink-faint">
            Todavía sin puntuar. Nadie ha mirado esta operación con el modelo.
          </p>
        ) : (
          <ul className="space-y-1">
            {scores.slice(0, 6).map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded border border-border bg-bg-card px-2.5 py-1.5 text-xs"
              >
                <span className="text-ink-soft">{MODEL_NAME[s.model] ?? s.model}</span>
                <span className="flex items-baseline gap-2">
                  <span className="font-semibold tabular-nums text-ink">{n(s.total_0_100)}</span>
                  <span className={s.vetoed ? 'font-semibold text-rose-600' : 'text-ink-soft'}>
                    {s.verdict}
                    {s.vetoed ? ' (veto)' : ''}
                  </span>
                  <span className="text-[11px] text-ink-faint">
                    {s.scored_by} · {d(s.scored_at)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title={`Personas (${stakeholders.length})`} hint="Las mismas fichas que hay en Contactos.">
        {stakeholders.length === 0 ? (
          <p className="text-xs text-ink-faint">Sin contactos registrados.</p>
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {stakeholders.map((s) => (
              <li key={s.link_id} className="rounded border border-border bg-bg-card px-2.5 py-1.5 text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <Link
                    href={`/crm?q=${encodeURIComponent(s.full_name)}`}
                    className="text-ink hover:text-brand hover:underline"
                    title="Ver la ficha en Contactos"
                  >
                    {s.full_name}
                  </Link>
                  <span className="text-[11px] text-ink-faint">{s.kind}</span>
                </div>
                <div className="text-[11px] text-ink-mute">
                  {[s.role, s.org, s.email].filter(Boolean).join(' · ') || dash}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title={`Documentos (${documents.length})`}>
        {documents.length === 0 ? (
          <p className="text-xs text-ink-faint">Sin documentos registrados.</p>
        ) : (
          <ul className="space-y-1">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded border border-border bg-bg-card px-2.5 py-1.5 text-xs"
              >
                <span className="text-ink">
                  {doc.external_url ? (
                    <a
                      href={doc.external_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-brand hover:underline"
                    >
                      {doc.title}
                    </a>
                  ) : (
                    doc.title
                  )}
                  <span className="ml-2 text-[11px] text-ink-faint">
                    {doc.doc_type}
                    {doc.period ? ` · ${doc.period}` : ''}
                  </span>
                </span>
                <span className="text-[11px] text-ink-faint">{d(doc.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      {interactions.length > 0 ? (
        <Block title="Últimas interacciones">
          <ul className="space-y-1">
            {interactions.slice(0, 5).map((r) => (
              <li key={r.id} className="rounded border border-border bg-bg-card px-2.5 py-1.5 text-xs">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-ink-soft">
                    <span className="text-ink">{r.kind}</span>
                    {r.stakeholder_name ? ` · ${r.stakeholder_name}` : ''}
                  </span>
                  <span className="text-[11px] text-ink-faint">{d(r.happened_at)}</span>
                </div>
                {r.summary ? <p className="mt-0.5 leading-relaxed text-ink-soft">{r.summary}</p> : null}
                {r.next_step ? (
                  <p className="mt-0.5 text-[11px] text-amber-600">
                    Siguiente paso: {r.next_step}
                    {r.next_step_due ? ` (${d(r.next_step_due)})` : ''}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      <footer className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-4">
        <a
          href={`${BASE_PATH}/export/proyecto?id=${project.id}`}
          download
          className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-hover"
          title="Un .xlsx con seis hojas: ficha, finanzas, scoring, personas, interacciones y documentos"
        >
          ⬇ Descargar Excel del proyecto
        </a>
        <Link
          href={`/${project.id}`}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-ink-mute transition hover:bg-bg-elevated hover:text-ink"
        >
          Abrir la ficha completa
        </Link>
        <span className="text-[11px] text-ink-faint">
          Para puntuar, editar las cifras o añadir personas y documentos, la ficha completa.
        </span>
      </footer>
    </div>
  );
}
