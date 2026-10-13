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
 * Proyectos and Pipeline are the same rows seen two ways: Pipeline is the table
 * you work a deal from, Proyectos is the board you look at a portfolio of deals
 * from. Ajustes sits last and quiet because its two lists are typed once.
 */
const TABS = [
  { href: '/', label: 'Originación', key: 'origination' },
  { href: '/pipeline', label: 'Pipeline', key: 'pipeline' },
  { href: '/proyectos', label: 'Proyectos', key: 'projects' },
  { href: '/crm', label: 'Contactos', key: 'crm' },
  { href: '/ajustes', label: 'Ajustes', key: 'settings' },
] as const;

export default function TopNav({
  active,
}: {
  active: 'origination' | 'pipeline' | 'projects' | 'crm' | 'settings';
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
      <span className="font-mono text-xs uppercase tracking-[0.12em] text-ink-faint">
        ARPA Partners
      </span>
    </header>
  );
}
