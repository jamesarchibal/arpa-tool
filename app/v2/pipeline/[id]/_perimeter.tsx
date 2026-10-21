'use client';

import { useState, useTransition } from 'react';

import { PROJECT_COMPANY_ROLES } from '@/lib/ios/lists';
import { addIosPerimeterCompany } from '../../actions';

/** Add one long-list company to the project's perimeter. */
export default function AddPerimeter({
  projectId,
  companies,
}: {
  projectId: string;
  companies: { id: string; name: string; subsector: string | null }[];
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function submit(form: FormData) {
    start(async () => {
      const result = await addIosPerimeterCompany({
        project_id: projectId,
        company_id: String(form.get('company_id') ?? ''),
        role: String(form.get('role') ?? 'Target'),
      });
      setMessage(result.message);
    });
  }

  const field =
    'rounded border border-border bg-bg px-2 py-1 text-xs text-ink outline-none focus:border-brand';

  return (
    <form action={submit} className="flex flex-wrap items-end gap-2">
      <select name="company_id" required defaultValue="" className={`${field} w-72`}>
        <option value="">Empresa de la long list…</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.subsector ? ` · ${c.subsector}` : ''}
          </option>
        ))}
      </select>
      <select name="role" defaultValue="Target" className={field}>
        {PROJECT_COMPANY_ROLES.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-ink hover:border-strong disabled:opacity-50"
      >
        Añadir al perímetro
      </button>
      {message ? <span className="text-xs text-ink-faint">{message}</span> : null}
    </form>
  );
}
