// Mirrors `basePath` in next.config.mjs. A plain <a> is deliberate: next/link
// would client-navigate to the route handler instead of downloading its body,
// and a bare href does not get the basePath prepended, so it is written out.
const BASE_PATH = '/arpa';

export type V2ExportKind =
  | 'industrias'
  | 'tesis'
  | 'arquetipos'
  | 'empresas'
  | 'fuentes'
  | 'pipeline'
  | 'decisiones';

/**
 * Downloads what the screen is showing as CSV.
 *
 * Separate from V1's `app/_export-button.tsx` on purpose. It is twenty lines, and
 * the alternative is widening V1's `ExportKind` union and its hardcoded `/export`
 * path, which couples the two versions at the one place V2 was built not to
 * touch. The duplication is cheaper than the coupling.
 *
 * `params` must carry every filter the screen applied, or the file will have more
 * rows than the list that asked for it.
 */
export default function ExportCsv({
  kind,
  params,
  label = 'Descargar CSV',
}: {
  kind: V2ExportKind;
  params?: Record<string, string | undefined>;
  label?: string;
}) {
  const qs = new URLSearchParams({ kind });
  for (const [key, value] of Object.entries(params ?? {})) {
    // `v` is the Sourcing view switch, not a filter, and the route has no use
    // for it: the view is already encoded in the kind.
    if (value && key !== 'v') qs.set(key, value);
  }

  return (
    <a
      href={`${BASE_PATH}/v2/export?${qs.toString()}`}
      download
      className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs text-ink-mute transition hover:bg-bg-elevated hover:text-ink"
      title="CSV con separador de punto y coma, se abre directo en Excel. Sirve también para importar en Airtable."
    >
      &#8595; {label}
    </a>
  );
}
