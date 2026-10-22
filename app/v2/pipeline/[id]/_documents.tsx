'use client';

import { useState, useTransition } from 'react';

import { CONFIDENTIALITY, DOC_STATUS, DOC_TYPES } from '@/lib/ios/lists';
import { PENDING_MICROSOFT, Pending } from '../../_pending';
import { saveIosDocument, updateIosProject } from '../../actions';

/**
 * The deliverables, each row editable in place, and the folder they live in.
 *
 * The status column is the one that matters: `Approved` is what opens a gate, so
 * this table is where a closed gate gets unblocked. A new version is a new row,
 * which is why the old one should be set to `Superseded` rather than edited: the
 * gate reads the latest non-Superseded document per type.
 *
 * The files themselves are NOT here and will not be. The original lives in
 * SharePoint, where ARPA already has the permissions, the versioning and the
 * search; this screen keeps the folder it lives in and, per row, the link. Two
 * copies of a document means two versions, and the good one is always the other
 * one. `docs/entrega-arpa.md`, step 5.
 */
export default function Documents({
  projectId,
  folderUrl,
  documents,
}: {
  projectId: string;
  folderUrl: string | null;
  documents: {
    id: string;
    doc_type: string;
    doc_status: string;
    version: number;
    title: string | null;
    confidentiality: string;
    url: string | null;
    approved_at: string | null;
  }[];
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  function save(id: string | undefined, form: FormData) {
    start(async () => {
      const result = await saveIosDocument({
        id,
        project_id: projectId,
        doc_type: String(form.get('doc_type') ?? ''),
        doc_status: String(form.get('doc_status') ?? ''),
        version: String(form.get('version') ?? '1'),
        title: String(form.get('title') ?? ''),
        confidentiality: String(form.get('confidentiality') ?? 'Internal'),
        url: String(form.get('url') ?? ''),
      });
      setMessage(result.message);
      if (result.ok && !id) setAdding(false);
    });
  }

  function saveFolder(form: FormData) {
    start(async () => {
      const result = await updateIosProject({
        id: projectId,
        sharepoint_folder_url: String(form.get('sharepoint_folder_url') ?? ''),
      });
      setMessage(result.message);
    });
  }

  const field =
    'rounded border border-border bg-bg px-2 py-1 text-xs text-ink outline-none focus:border-brand';

  return (
    <section className="rounded-lg border border-border bg-bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Entregables</h2>
          <p className="mt-0.5 text-xs text-ink-faint">
            El gate lee el último documento de cada tipo que no esté Superseded.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-ink hover:border-strong"
        >
          {adding ? 'Cancelar' : 'Añadir documento'}
        </button>
      </header>

      {/* The folder, not the files. Typed by hand until Graph can create it. */}
      <form
        action={saveFolder}
        className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3"
      >
        <span className="text-[11px] font-semibold text-ink-soft">Carpeta en SharePoint</span>
        <input
          name="sharepoint_folder_url"
          defaultValue={folderUrl ?? ''}
          placeholder="https://arpapartners.sharepoint.com/..."
          className={`${field} w-80`}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-ink hover:border-strong disabled:opacity-50"
        >
          Guardar
        </button>
        {folderUrl ? (
          <a
            href={folderUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-brand hover:border-strong"
          >
            Abrir carpeta
          </a>
        ) : null}
        <Pending needs={PENDING_MICROSOFT}>Crear la carpeta</Pending>
        <Pending needs={PENDING_MICROSOFT}>Subir fichero</Pending>
      </form>

      {adding ? (
        <form
          action={(form) => save(undefined, form)}
          className="flex flex-wrap items-end gap-2 border-b border-border bg-bg-elevated px-4 py-3"
        >
          <select name="doc_type" className={field} defaultValue="Other">
            {DOC_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select name="doc_status" className={field} defaultValue="Not Started">
            {DOC_STATUS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <input type="number" min={1} name="version" defaultValue={1} className={`${field} w-16`} />
          <input name="title" placeholder="Título" className={`${field} w-48`} />
          <input name="url" placeholder="URL" className={`${field} w-56`} />
          <select name="confidentiality" className={field} defaultValue="Internal">
            {CONFIDENTIALITY.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            Crear
          </button>
        </form>
      ) : null}

      {documents.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-faint">Sin entregables todavía.</p>
      ) : (
        <ul className="divide-y divide-border">
          {documents.map((d) => (
            <li key={d.id}>
              <form
                action={(form) => save(d.id, form)}
                className="flex flex-wrap items-end gap-2 px-4 py-2.5"
              >
                <select name="doc_type" defaultValue={d.doc_type} className={field}>
                  {DOC_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <select name="doc_status" defaultValue={d.doc_status} className={field}>
                  {DOC_STATUS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  name="version"
                  defaultValue={d.version}
                  className={`${field} w-16`}
                />
                <input
                  name="title"
                  defaultValue={d.title ?? ''}
                  placeholder="Título"
                  className={`${field} w-48`}
                />
                <input
                  name="url"
                  defaultValue={d.url ?? ''}
                  placeholder="URL"
                  className={`${field} w-56`}
                />
                <select name="confidentiality" defaultValue={d.confidentiality} className={field}>
                  {CONFIDENTIALITY.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-ink hover:border-strong disabled:opacity-50"
                >
                  Guardar
                </button>
                {d.approved_at ? (
                  <span className="text-[11px] text-emerald-700">
                    aprobado {d.approved_at.slice(0, 10)}
                  </span>
                ) : null}
              </form>
            </li>
          ))}
        </ul>
      )}

      {message ? (
        <p className="border-t border-border px-4 py-2 text-xs text-ink-soft">{message}</p>
      ) : null}
    </section>
  );
}
