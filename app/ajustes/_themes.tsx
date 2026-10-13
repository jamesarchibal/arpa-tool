'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { ThemeRow } from '@/lib/arpa/db';
import { deleteTheme, saveTheme } from '../actions';

const field =
  'w-full rounded border border-border bg-bg px-2 py-1 text-xs text-ink outline-none focus:border-brand';
const label = 'mb-0.5 block text-[10px] uppercase tracking-wider text-ink-mute';

/**
 * The temáticas, the investment theses a deal can be.
 *
 * Ignasi said two or three plays, so this is a short hand-kept list, not a
 * paginated table. Editing happens in place: with three rows, a separate edit
 * screen is more clicks than the whole list is worth.
 */
export default function Themes({ themes }: { themes: ThemeRow[] }) {
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>, id: number | null) {
    e.preventDefault();
    setError(null);
    const raw = Object.fromEntries(new FormData(e.currentTarget).entries());
    startTransition(async () => {
      const res = await saveTheme({
        id,
        name: String(raw.name ?? '').trim(),
        thesis: raw.thesis ? String(raw.thesis) : null,
        fit_criteria: raw.fit_criteria ? String(raw.fit_criteria) : null,
        sort: raw.sort ? Number(raw.sort) : 0,
        active: raw.active === 'on',
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setEditing(null);
      router.refresh();
    });
  }

  function onDelete(id: number, name: string, projects: number) {
    const warn = projects
      ? `${name}: ${projects} proyecto(s) se quedarán sin temática. ¿Borrar?`
      : `¿Borrar "${name}"?`;
    if (!window.confirm(warn)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteTheme({ id });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.refresh();
    });
  }

  function Form({ theme }: { theme: ThemeRow | null }) {
    return (
      <form onSubmit={(e) => onSubmit(e, theme?.id ?? null)} className="space-y-2">
        <div className="grid grid-cols-[1fr_72px] gap-2">
          <div>
            <label className={label}>Nombre</label>
            <input
              name="name"
              required
              minLength={2}
              defaultValue={theme?.name ?? ''}
              placeholder="Relevo generacional"
              className={field}
            />
          </div>
          <div>
            <label className={label}>Orden</label>
            <input name="sort" type="number" min={0} defaultValue={theme?.sort ?? 0} className={field} />
          </div>
        </div>
        <div>
          <label className={label}>Tesis</label>
          <textarea
            name="thesis"
            rows={2}
            defaultValue={theme?.thesis ?? ''}
            placeholder="Qué compramos y por qué funciona esta jugada."
            className={field}
          />
        </div>
        <div>
          <label className={label}>Criterios de encaje</label>
          <textarea
            name="fit_criteria"
            rows={2}
            defaultValue={theme?.fit_criteria ?? ''}
            placeholder="Qué tiene que ser verdad de la empresa para que la jugada aplique."
            className={field}
          />
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          <input type="checkbox" name="active" defaultChecked={theme?.active ?? true} />
          Activa
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-brand px-3 py-1 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {pending ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="rounded border border-border px-3 py-1 text-xs text-ink-mute hover:text-ink"
          >
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">Temáticas</h2>
        <p className="mt-1 max-w-2xl text-xs text-ink-mute">
          Las jugadas de inversión. Una operación es una empresa, una temática y una industria, así que
          esta lista es un tercio de la definición de un proyecto. Son dos o tres, no veinte.
        </p>
      </div>

      {error ? <p className="text-xs text-rose-600">{error}</p> : null}

      <ul className="space-y-2">
        {themes.map((t) => (
          <li key={t.id} className="rounded border border-border bg-bg p-2.5">
            {editing === t.id ? (
              <Form theme={t} />
            ) : (
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{t.name}</span>
                  {t.is_example ? (
                    <span
                      className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700"
                      title="Puesta por nosotros para la demo. Edítala y pasa a ser vuestra."
                    >
                      ejemplo
                    </span>
                  ) : null}
                  {!t.active ? (
                    <span className="text-[10px] uppercase tracking-wider text-ink-faint">inactiva</span>
                  ) : null}
                  <span className="text-[11px] text-ink-faint">
                    {t.project_count} proyecto{t.project_count === 1 ? '' : 's'}
                  </span>
                  <span className="ml-auto flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(t.id)}
                      className="text-[11px] text-brand hover:underline"
                    >
                      editar
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => onDelete(t.id, t.name, t.project_count)}
                      className="text-[11px] text-ink-faint hover:text-rose-600 disabled:opacity-40"
                    >
                      borrar
                    </button>
                  </span>
                </div>
                {t.thesis ? <p className="text-xs text-ink-soft">{t.thesis}</p> : null}
                {t.fit_criteria ? (
                  <p className="text-[11px] text-ink-mute">Encaje: {t.fit_criteria}</p>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ul>

      {editing === 'new' ? (
        <div className="rounded border border-brand/40 bg-bg p-2.5">
          <Form theme={null} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="text-xs font-semibold text-brand hover:underline"
        >
          + Nueva temática
        </button>
      )}
    </section>
  );
}
