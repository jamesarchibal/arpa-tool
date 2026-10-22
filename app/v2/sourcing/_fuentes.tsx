'use client';

import { Fragment, useState, useTransition } from 'react';

import type { IosSource } from '@/lib/ios/db';
import { DASH } from '../_ui';
import { saveIosSource } from '../actions';

/**
 * Their 22 sourcing channels, editable, and able to grow.
 *
 * This is the one table in the library that has to accept new rows from a
 * person rather than from their Excel. A source is a directory, a ranking, a
 * banker or a conference, and the firm finds a new one most weeks. Seeding it
 * once and locking it meant that every new channel had to wait for a migration.
 *
 * `source_type` is a free text input with the values already in use offered as
 * suggestions, not a dropdown. Their workbook has no closed list for it, so a
 * dropdown here would be us inventing their vocabulary, and the next type they
 * need would be the one we left out.
 */
export default function Fuentes({
  sources,
  counts,
}: {
  sources: IosSource[];
  counts: Record<string, number>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const types = [...new Set(sources.map((s) => s.source_type).filter((t): t is string => !!t))];

  function save(id: string | undefined, form: FormData) {
    const text = (k: string) => String(form.get(k) ?? '');
    start(async () => {
      const result = await saveIosSource({
        id,
        name: text('name'),
        source_type: text('source_type'),
        url: text('url'),
        notes: text('notes'),
      });
      setMessage(result.message);
      if (result.ok) {
        setOpen(null);
        setAdding(false);
      }
    });
  }

  const field =
    'rounded border border-border bg-bg px-2 py-1 text-xs text-ink outline-none focus:border-brand';

  const fields = (s?: IosSource) => (
    <>
      <input
        name="name"
        defaultValue={s?.name ?? ''}
        placeholder="Nombre"
        className={`${field} w-56`}
      />
      <input
        name="source_type"
        list="ios-source-types"
        defaultValue={s?.source_type ?? ''}
        placeholder="Tipo"
        className={`${field} w-56`}
      />
      <input
        name="url"
        defaultValue={s?.url ?? ''}
        placeholder="URL"
        className={`${field} w-64`}
      />
      <input
        name="notes"
        defaultValue={s?.notes ?? ''}
        placeholder="Notas"
        className={`${field} w-72`}
      />
    </>
  );

  return (
    <>
      <datalist id="ios-source-types">
        {types.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-ink hover:border-strong"
        >
          {adding ? 'Cancelar' : 'Añadir fuente'}
        </button>
      </div>

      {adding ? (
        <form
          action={(form) => save(undefined, form)}
          className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-3"
        >
          {fields()}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            Crear
          </button>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border bg-bg-card">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
              <th className="px-3 py-2">Fuente</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2 text-right">Empresas</th>
              <th className="px-3 py-2">Notas</th>
              <th className="px-3 py-2 text-right">Editar</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <Fragment key={s.id}>
                <tr className="border-b border-border last:border-0 hover:bg-bg-elevated">
                  <td className="px-3 py-2 font-medium text-ink">
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-brand hover:underline"
                      >
                        {s.name}
                      </a>
                    ) : (
                      s.name
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-mute">{s.source_type ?? DASH}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-ink">
                    {counts[s.name] ?? 0}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-faint">{s.notes ?? DASH}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setOpen((v) => (v === s.id ? null : s.id))}
                      className="rounded-md border border-border px-2.5 py-1 text-[11px] font-semibold text-ink-soft hover:border-strong"
                    >
                      {open === s.id ? 'Cerrar' : 'Editar'}
                    </button>
                  </td>
                </tr>
                {open === s.id ? (
                  <tr className="border-b border-border bg-bg-elevated">
                    <td colSpan={5} className="px-3 py-3">
                      <form
                        action={(form) => save(s.id, form)}
                        className="flex flex-wrap items-center gap-2"
                      >
                        {fields(s)}
                        <button
                          type="submit"
                          disabled={pending}
                          className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                        >
                          Guardar
                        </button>
                        <span className="text-[11px] text-ink-faint">
                          Las empresas apuntan a la fuente por su nombre: cambiarlo las deja
                          contadas en cero hasta que se vuelvan a asignar.
                        </span>
                      </form>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {message ? <p className="mt-2 text-xs text-ink-soft">{message}</p> : null}
    </>
  );
}
