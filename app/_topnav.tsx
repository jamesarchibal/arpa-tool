import Link from 'next/link';

// Originación leads, because finding the companies is the step before judging
// them, and it is the part ARPA asked for first.
const TABS = [
  { href: '/', label: 'Originación', key: 'origination' },
  { href: '/pipeline', label: 'Pipeline', key: 'pipeline' },
  { href: '/crm', label: 'Contactos', key: 'crm' },
] as const;

export default function TopNav({ active }: { active: 'origination' | 'pipeline' | 'crm' }) {
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
      {/* Absolute, and a plain anchor: /arpa sits outside this app's basePath, so
          next/link would resolve it to /arpa/app/arpa. */}
      <a
        href="https://www.joblanders.ai/arpa"
        className="font-mono text-xs uppercase tracking-[0.12em] text-ink-faint transition hover:text-ink"
      >
        ← joblanders.ai/arpa
      </a>
    </header>
  );
}
