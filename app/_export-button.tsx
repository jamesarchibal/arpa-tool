// Mirrors `basePath` in next.config.mjs.
//
// A plain <a> is deliberate here. next/link would try to client-navigate to the
// route handler rather than download its body, and unlike next/link a bare href
// does not get the basePath prepended, so it has to be written out.
const BASE_PATH = '/arpa/app';

export type ExportKind = 'originacion' | 'pipeline' | 'contactos';

/**
 * Downloads the current list as CSV.
 *
 * `params` should carry whatever filters the screen has applied, so the file
 * matches what the user is looking at rather than the whole table.
 */
export function ExportButton({
  kind,
  params,
  label = 'Descargar Excel',
}: {
  kind: ExportKind;
  params?: Record<string, string | undefined>;
  label?: string;
}) {
  const qs = new URLSearchParams({ kind });
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) qs.set(key, value);
  }

  return (
    <a
      href={`${BASE_PATH}/export?${qs.toString()}`}
      download
      className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs text-ink-mute transition hover:bg-bg-elevated hover:text-ink"
      title="CSV con separador de punto y coma, se abre directo en Excel. Sirve también para importar en Airtable."
    >
      ⬇ {label}
    </a>
  );
}
