/**
 * Naming and sizing for attached files. Pure, so it can be tested and so the
 * same answer comes out on the server and in the browser.
 *
 * The storage key is built here and nowhere else. It is the one part of the
 * upload a caller could get dangerously wrong: a file called
 * `../../otro-proyecto/LOI.pdf` would otherwise write outside its own folder,
 * and a name with a `#` or a `?` in it comes back unreadable through a signed
 * URL. So the person's file name never reaches storage as typed. It is kept
 * verbatim in `ios_documents.file_name`, which is what the link shows and what
 * the download is called, and only the sanitised form is used as a key.
 */

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/**
 * A file name safe to use as a storage key segment.
 *
 * Accents are folded rather than dropped, because half these papers are called
 * `Valoración` or `Due Diligence Champiñones` and `Valoracin.pdf` is a worse
 * answer than `Valoracion.pdf`. Everything outside letters, digits, dot, dash
 * and underscore becomes a dash, runs of dashes collapse, and the result is
 * capped. The extension is preserved separately so a long name cannot eat it.
 */
export function safeFileName(name: string): string {
  const trimmed = name.split(/[\\/]/).pop()?.trim() ?? '';
  const dot = trimmed.lastIndexOf('.');
  const hasExt = dot > 0 && dot < trimmed.length - 1;
  const stem = hasExt ? trimmed.slice(0, dot) : trimmed;
  const ext = hasExt ? trimmed.slice(dot + 1) : '';

  const clean = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '');

  const safeStem = clean(stem).slice(0, 80) || 'fichero';
  const safeExt = clean(ext).slice(0, 12);
  return safeExt ? `${safeStem}.${safeExt}` : safeStem;
}

/**
 * Where one file lives inside the bucket.
 *
 * Project first, then document, so the whole folder of a project can be removed
 * with one prefix when a deal is deleted. The timestamp is what makes replacing
 * a file safe: the new object is written before the old one is deleted, so a
 * failed delete leaves an orphan instead of a document row pointing at nothing.
 */
export function storageKey(projectId: string, documentId: string, fileName: string): string {
  return `${projectId}/${documentId}/${Date.now()}-${safeFileName(fileName)}`;
}

/** Bytes as a short Spanish label. Comma decimal, because the whole app is in Spanish. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 ? Math.round(value).toString() : value.toFixed(1).replace('.', ',');
  return `${rounded} ${units[unit]}`;
}
