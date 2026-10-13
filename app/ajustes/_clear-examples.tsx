'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { clearExamples } from '../actions';

/**
 * Removes every row a seed migration wrote.
 *
 * One button for the whole lot, on purpose. The demo content exists so the
 * screens are not empty in front of ARPA, and the only honest way to ship it is
 * if leaving takes one action instead of remembering which of thirty rows was
 * ours.
 */
export default function ClearExamples({ count }: { count: number }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (count === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-xs text-amber-800">
        Hay <strong className="font-semibold">{count}</strong> fila(s) marcadas como{' '}
        <strong className="font-semibold">ejemplo</strong>. Las pusimos nosotros para que la demo no
        saliera en blanco. Editar una la convierte en vuestra; este botón borra las que queden.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm('¿Borrar todas las filas de ejemplo?')) return;
          startTransition(async () => {
            const res = await clearExamples();
            setMessage(res.message);
            router.refresh();
          });
        }}
        className="ml-auto rounded border border-amber-300 bg-bg px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
      >
        {pending ? 'Borrando…' : 'Borrar los ejemplos'}
      </button>
      {message ? <p className="w-full text-xs text-amber-900">{message}</p> : null}
    </div>
  );
}
