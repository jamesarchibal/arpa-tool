/**
 * One project as a real Excel workbook.
 *
 * The CSV export in `csv.ts` serves the three list screens: many rows, one
 * shape. A project is the opposite, a handful of rows in six different shapes,
 * so a single flat file would either lose most of it or become unreadable. Six
 * sheets instead, which is also how the ARPA team already works: they said they
 * are not leaving Excel, so the deliverable per deal has to be a workbook they
 * can open, extend and send on.
 *
 * Numbers go in as NUMBERS, not as pre-formatted text. A figure typed as
 * "13,1 M€" cannot be summed, and the first thing anyone does with a deal sheet
 * is sum it. Units are stated in the row label instead (M€, %, x).
 *
 * Every derived figure comes from `derive()`, the same function the scoring
 * workbench uses on screen. Recomputing margins here with a second formula is
 * how a workbook ends up disagreeing with the app that produced it.
 */

import * as XLSX from 'xlsx';

import type { ProjectDetail } from './db';
import { derive } from './scoring';

type Cell = string | number | boolean | null;

/** A two-column label/value sheet, which is what most of these are. */
const pairs = (rows: [string, Cell][]): Cell[][] => [['Campo', 'Valor'], ...rows];

const pct = (v: number | null): number | null => (v === null ? null : Math.round(v * 1000) / 10);
const round1 = (v: number | null): number | null => (v === null ? null : Math.round(v * 10) / 10);
const round2 = (v: number | null): number | null => (v === null ? null : Math.round(v * 100) / 100);

/** `2026-03-14T09:12:00Z` to `2026-03-14 09:12`, which Excel reads as a date. */
const dt = (v: string | null): string | null => (v ? v.slice(0, 16).replace('T', ' ') : null);
const day = (v: string | null): string | null => (v ? v.slice(0, 10) : null);

const OWNERSHIP: Record<string, string> = {
  family_founder: 'Familiar / fundador',
  family_succession: 'Familiar con relevo',
  private_other: 'Privada, otra',
  pe_backed: 'Con private equity',
  corporate_subsidiary: 'Filial de grupo',
  listed: 'Cotizada',
  public: 'Pública',
};

const FIT: Record<string, string> = {
  in: 'Dentro del foco',
  adjacent: 'Adyacente',
  out: 'Fuera del foco',
};

const CONC: Record<string, string> = { low: 'Baja', mid: 'Media', high: 'Alta' };

const MODEL_NAME: Record<string, string> = {
  qss: 'QSS · Screening',
  om: 'OM · Assessment',
  pfr: 'PFR · Financial Review',
};

function sheet(wb: XLSX.WorkBook, name: string, rows: Cell[][], widths: number[]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = widths.map((w) => ({ wch: w }));
  // Excel caps sheet names at 31 characters and rejects : \ / ? * [ ]. Every
  // name here is a literal we control, but the slice keeps a future one safe.
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}

export function projectWorkbook(detail: ProjectDetail): ArrayBuffer {
  const { project, company, taxonomy, scores, killFlags, stakeholders, interactions, documents } =
    detail;
  const d = derive(detail.scoringInput);
  const wb = XLSX.utils.book_new();

  sheet(
    wb,
    'Ficha',
    pairs([
      ['Razón social', company.legal_name],
      ['Nombre comercial', company.trade_name],
      ['CIF', company.cif],
      ['Web', company.website],
      ['Población', company.city],
      ['Provincia', company.region],
      ['País', company.country],
      ['CNAE', company.cnae],
      ['Empleados', company.employees],
      ['Año de fundación', company.founded_year],
      ['Administrador desde', company.admin_since],
      ['Tipo de propiedad', company.ownership_type ? OWNERSHIP[company.ownership_type] ?? company.ownership_type : null],
      ['Encaje en el foco', FIT[company.taxonomy_fit] ?? company.taxonomy_fit],
      ['Sector', taxonomy?.sector ?? null],
      ['Categoría', taxonomy?.category ?? null],
      ['Subsector', taxonomy?.subsector ?? null],
      ['Crecimiento del subsector', taxonomy?.growth ?? null],
      ['Fragmentación del subsector', taxonomy?.fragmentation ?? null],
      ['Consolidación del subsector', taxonomy?.consolidation ?? null],
      ['', ''],
      ['Código de proyecto', project.code],
      ['Etapa', project.stage],
      ['Decisión', project.decision_status],
      ['Motivo del descarte', project.pass_reason],
      ['Origen', project.source],
      ['Responsable', project.owner],
      ['Actualizado', dt(project.updated_at)],
      ['', ''],
      ['Ficha completada desde', company.enrich_source],
      ['Completada por', company.enriched_by],
      ['Completada el', dt(company.enriched_at)],
      ['Notas', company.notes],
    ]),
    [30, 60],
  );

  // Years are labelled Y1..Y3 and not 2023..2025 because the database stores
  // the series without its years. Inventing calendar labels would make an
  // undated figure look dated.
  sheet(
    wb,
    'Finanzas',
    [
      ['Concepto', 'Y1', 'Y2', 'Y3 (último)'],
      ['Ventas (M€)', project.revenue_y1, project.revenue_y2, project.revenue_y3],
      ['EBITDA (M€)', project.ebitda_y1, project.ebitda_y2, project.ebitda_y3],
      ['', '', '', ''],
      ['Concepto', 'Valor', '', ''],
      ['EBITDA normalizado (M€)', project.ebitda_norm, '', ''],
      ['EBITDA de referencia (M€)', round2(d.ebitdaRef), '', ''],
      ['Capex (M€)', project.capex, '', ''],
      ['Circulante (M€)', project.working_capital, '', ''],
      ['Deuda neta (M€)', project.net_debt, '', ''],
      ['Ingresos recurrentes (%)', project.recurring_pct, '', ''],
      ['Concentración de clientes', project.customer_conc ? CONC[project.customer_conc] ?? project.customer_conc : null, '', ''],
      ['Motivación del vendedor (1-5)', project.seller_motiv, '', ''],
      ['Fiabilidad del dato', project.data_confidence, '', ''],
      ['Fuente de las cifras', project.financials_src, '', ''],
      ['', '', '', ''],
      ['Calculado', 'Valor', '', ''],
      ['CAGR de ventas (%)', pct(d.revenueCagr), '', ''],
      ['Margen EBITDA (%)', pct(d.ebitdaMargin), '', ''],
      ['Ajuste de normalización (%)', pct(d.normalisationGap), '', ''],
      ['Conversión en caja (%)', pct(d.cashConversion), '', ''],
      ['Apalancamiento (x EBITDA)', round2(d.leverage), '', ''],
      ['', '', '', ''],
      ['Valoración', 'Valor', '', ''],
      ['Múltiplo de entrada (x)', project.entry_multiple, '', ''],
      ['Enterprise value (M€)', round1(d.enterpriseValue), '', ''],
      ['Equity value (M€)', round1(d.equityValue), '', ''],
      ['Expectativa del vendedor (M€)', project.seller_exp_ev, '', ''],
      ['Múltiplo implícito que pide (x)', round2(d.askMultiple), '', ''],
      ['Diferencia de precio (M€)', round1(d.valuationGapM), '', ''],
      ['Diferencia de precio (%)', pct(d.valuationGapPct), '', ''],
    ],
    [34, 16, 16, 16],
  );

  sheet(
    wb,
    'Scoring',
    [
      ['Puerta', 'Puntuación 0-100', 'Veredicto', 'Veto', 'Firmado por', 'Fecha', 'Nota'],
      ...scores.map((s) => [
        MODEL_NAME[s.model] ?? s.model,
        s.total_0_100,
        s.verdict,
        s.vetoed,
        s.scored_by,
        dt(s.scored_at),
        s.note,
      ]),
      ...(scores.length === 0 ? [['Todavía sin puntuar', null, null, null, null, null, null]] : []),
      ['', '', '', '', '', '', ''],
      ['Kill criteria marcados a mano', '', '', '', '', '', ''],
      ...(killFlags.filter((f) => f.flagged).length === 0
        ? [['Ninguno', null, null, null, null, null, null]]
        : killFlags
            .filter((f) => f.flagged)
            .map((f) => [f.kill_id, f.note, null, null, f.flagged_by, null, null])),
    ] as Cell[][],
    [28, 16, 14, 8, 18, 18, 50],
  );

  sheet(
    wb,
    'Personas',
    [
      ['Nombre', 'Tipo', 'Organización', 'Papel en la operación', 'Email', 'Teléfono', 'Principal'],
      ...stakeholders.map((s) => [s.full_name, s.kind, s.org, s.role, s.email, s.phone, s.is_primary]),
    ] as Cell[][],
    [28, 16, 26, 26, 30, 18, 10],
  );

  sheet(
    wb,
    'Interacciones',
    [
      ['Fecha', 'Tipo', 'Sentido', 'Con quién', 'Resumen', 'Siguiente paso', 'Fecha límite', 'Anotado por'],
      ...interactions.map((r) => [
        dt(r.happened_at),
        r.kind,
        r.direction,
        r.stakeholder_name,
        r.summary,
        r.next_step,
        day(r.next_step_due),
        r.logged_by,
      ]),
    ] as Cell[][],
    [18, 14, 12, 24, 60, 40, 14, 16],
  );

  sheet(
    wb,
    'Documentos',
    [
      ['Título', 'Tipo', 'Periodo', 'Archivo', 'Enlace', 'Subido por', 'Fecha'],
      ...documents.map((doc) => [
        doc.title,
        doc.doc_type,
        doc.period,
        doc.storage_path,
        doc.external_url,
        doc.uploaded_by,
        day(doc.created_at),
      ]),
    ] as Cell[][],
    [42, 18, 12, 36, 36, 16, 14],
  );

  // `array` and not `buffer`: an ArrayBuffer is a Response body as it stands,
  // while a Node Buffer types as Uint8Array<ArrayBufferLike> and is rejected by
  // the fetch BodyInit union. Same bytes, no copy at the boundary.
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

/** `ARPA-26-004 Conservas del Segura 2026-10-14.xlsx`, safe on every OS. */
export function projectFilename(detail: ProjectDetail): string {
  const parts = [detail.project.code, detail.company.legal_name, new Date().toISOString().slice(0, 10)];
  return `${parts
    .filter(Boolean)
    .join(' ')
    .replace(/[\\/:*?"<>|]/g, '-')
    .slice(0, 120)}.xlsx`;
}
