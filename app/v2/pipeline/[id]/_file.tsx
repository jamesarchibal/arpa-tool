'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

import { MAX_FILE_BYTES, formatBytes } from '@/lib/ios/files';
import { attachIosDocumentFile, createIosDocumentUpload, removeIosDocumentFile } from '../../actions';

// Same reason as `app/v2/_export-button.tsx`: a bare href does not get the
// basePath prepended, so it is written out.
const BASE_PATH = '/arpa';

/**
 * The file attached to one deliverable: upload, download, replace, remove.
 *
 * The upload does NOT go through the server action. It asks the action for a
 * signed URL and then PUTs the bytes straight to Supabase storage, because a
 * Vercel request body stops at 4,5 MB and a scanned LOI or a financial model is
 * routinely bigger. Sending the `File` to the action would work in testing with
 * a small PDF and fail on the documents that actually matter.
 *
 * The size is checked here as well as in the action. Not for safety, the action
 * is the one that counts, but so that picking a 200 MB file says so instantly
 * instead of after the upload has been signed.
 *
 * Every button is `type="button"`. This renders inside the document row's form,
 * and a bare button there would submit it.
 */
export default function DocumentFile({
  documentId,
  projectId,
  storagePath,
  fileName,
  fileSize,
}: {
  documentId: string;
  projectId: string;
  storagePath: string | null;
  fileName: string | null;
  fileSize: number | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function onPick(file: File) {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError(`${formatBytes(file.size)} pasa del límite de 50 MB. Pega el enlace en su lugar.`);
      return;
    }

    setProgress(true);
    try {
      const signed = await createIosDocumentUpload({
        document_id: documentId,
        project_id: projectId,
        file_name: file.name,
        file_size: file.size,
      });
      if (!signed.ok || !signed.url || !signed.path) {
        setError(signed.message);
        return;
      }

      const put = await fetch(signed.url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!put.ok) {
        setError(`La subida ha fallado (${put.status}).`);
        return;
      }

      // Only now does the row learn about the file. The other order would leave
      // a document pointing at an object that may never have arrived.
      const attached = await attachIosDocumentFile({
        document_id: documentId,
        project_id: projectId,
        storage_path: signed.path,
        file_name: file.name,
        file_size: file.size,
      });
      if (!attached.ok) {
        setError(attached.message);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No he podido subir el fichero');
    } finally {
      setProgress(false);
    }
  }

  function remove() {
    start(async () => {
      const result = await removeIosDocumentFile({
        document_id: documentId,
        project_id: projectId,
      });
      if (!result.ok) setError(result.message);
      else router.refresh();
    });
  }

  const busy = pending || progress;
  const button =
    'rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:border-strong disabled:opacity-50';

  return (
    <span className="flex flex-wrap items-center gap-2">
      <input
        ref={input}
        type="file"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset so picking the same file again fires onChange, which is what
          // you do after re-exporting it.
          event.target.value = '';
          if (file) void onPick(file);
        }}
        className="hidden"
      />

      {storagePath ? (
        <>
          <a
            href={`${BASE_PATH}/v2/documentos/${documentId}/descargar`}
            className={`${button} text-brand`}
            title={fileName ?? undefined}
          >
            &#8595; {truncate(fileName ?? 'fichero')}
            {fileSize ? ` (${formatBytes(fileSize)})` : ''}
          </a>
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className={`${button} text-ink-mute`}
          >
            {progress ? 'Subiendo...' : 'Sustituir'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            className={`${button} text-rose-600`}
          >
            Quitar
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className={`${button} text-ink-mute`}
        >
          {progress ? 'Subiendo...' : 'Subir fichero'}
        </button>
      )}

      {error ? <span className="text-[11px] text-rose-600">{error}</span> : null}
    </span>
  );
}

/** Long names break the row. The full one stays in the title attribute. */
function truncate(name: string): string {
  return name.length > 28 ? `${name.slice(0, 25)}...` : name;
}
