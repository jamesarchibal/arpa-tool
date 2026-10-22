import Link from 'next/link';

/**
 * The tabs, in the order the work actually happens.
 *
 * Importar folded into Originación because they were one step read twice: the
 * import IS where the list comes from, so a separate tab made you upload on one
 * screen and look at the result on another. Scoring folded in too, because
 * every imported company is scored on the way in and the scores are already on
 * the Originación and Pipeline rows.
 *
 * Pipeline folded into Proyectos for the same reason: they read the same view
 * and listed the same deals, so the table is a view of Proyectos (`?v=tabla`)
 * and not a tab of its own. Ajustes sits last and quiet because its two lists
 * are typed once.
 */
const TABS = [
  { href: '/', label: 'Originación', key: 'origination' },
  { href: '/proyectos', label: 'Proyectos', key: 'projects' },
  { href: '/crm', label: 'Contactos', key: 'crm' },
  { href: '/ajustes', label: 'Ajustes', key: 'settings' },
] as const;

export default function TopNav({
  active,
}: {
  active: 'origination' | 'projects' | 'crm' | 'settings';
}) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
      <nav className="flex items-center gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={`rounded-md px-4 py-2 text-base font-semibold transition ${
              active === t.key
                ? 'bg-brand text-white'
                : 'text-ink-mute hover:bg-bg-elevated hover:text-ink'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs uppercase tracking-[0.12em] text-ink-faint">
          ARPA Partners
        </span>
      </div>
    </header>
  );
}
