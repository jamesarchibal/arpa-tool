import Link from 'next/link';

const TABS = [
  { href: '/', label: 'Pipeline', key: 'pipeline' },
  { href: '/origination', label: 'Originación', key: 'origination' },
] as const;

export default function TopNav({ active }: { active: 'pipeline' | 'origination' }) {
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
