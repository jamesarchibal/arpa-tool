import Link from 'next/link';

/**
 * V1 and V2, side by side.
 *
 * V1 is this repo's own tool, nine months of decisions in `docs/decisiones.md`.
 * V2 is ARPA's IOS v9 architecture built as they specified it: their nine
 * stages, their 100 subsectors, their gate rules. The two share a login and a
 * database and nothing else, so the only honest way to pick one is to use both.
 *
 * It lives in `app/` and not in `app/v2/` because both sides import it, and the
 * V1 half must not have to reach into a V2 folder for a component.
 */
export default function VersionSwitch({ current }: { current: 'v1' | 'v2' }) {
  const tab = (href: string, label: string, mine: 'v1' | 'v2', hint: string) => (
    <Link
      href={href}
      title={hint}
      className={`rounded px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] transition ${
        current === mine
          ? 'bg-brand text-white'
          : 'text-ink-faint hover:bg-bg-elevated hover:text-ink'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-bg-card p-1">
      {tab('/', 'V1', 'v1', 'La herramienta actual')}
      {tab('/v2', 'V2', 'v2', 'La arquitectura IOS v9 de ARPA')}
    </div>
  );
}
