'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * ARPA's own structure, in their order, with Spanish labels.
 *
 * Their spec has 33 screens; this is six. The reduction is not laziness, it is
 * the same lesson as V1's A11 and A13: their S13 Pipeline board, S14 Stage queues
 * and S18 Projects are three screens over one list with three filters, and their
 * four library screens are one catalogue with a view switch. Sourcing therefore
 * carries arquetipos, empresas and fuentes as `?v=`.
 *
 * Docs and QA are deliberately not among them. They are the manual and the
 * acceptance grade, not a seventh and eighth dataset, so they sit past a divider
 * in a different shape: outlined round pills instead of solid tabs. Giving them
 * the same shape would invite people to read them as data.
 */
const TABS = [
  { href: '/v2', label: 'Mi trabajo' },
  { href: '/v2/industrias', label: 'Industrias' },
  { href: '/v2/tesis', label: 'Tesis' },
  { href: '/v2/sourcing', label: 'Sourcing' },
  { href: '/v2/pipeline', label: 'Pipeline' },
  { href: '/v2/decisiones', label: 'Decisiones' },
] as const;

const PILLS = [
  { href: '/v2/qa', label: 'QA 27', mark: '\u2713' },
  { href: '/v2/docs', label: 'Docs', mark: '?' },
] as const;

export default function V2Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-2">
      {TABS.map((t) => {
        // `/v2` matches only itself; the others match their own subtree, so a
        // project page keeps Pipeline lit.
        const active = t.href === '/v2' ? pathname === '/v2' : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-md px-3.5 py-2 text-sm font-semibold transition ${
              active
                ? 'bg-brand text-white'
                : 'text-ink-mute hover:bg-bg-elevated hover:text-ink'
            }`}
          >
            {t.label}
          </Link>
        );
      })}

      <span aria-hidden className="mx-1 h-5 w-px bg-border" />

      {PILLS.map((p) => (
        <Link
          key={p.href}
          href={p.href}
          className={`inline-flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] transition ${
            pathname.startsWith(p.href)
              ? 'border-brand bg-brand-wash text-brand'
              : 'border-strong text-ink-faint hover:border-brand hover:text-brand'
          }`}
        >
          <span aria-hidden>{p.mark}</span>
          {p.label}
        </Link>
      ))}
    </nav>
  );
}
