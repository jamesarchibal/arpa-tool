import V2Nav from './_nav';

/**
 * V2's header, once, instead of an `active` prop on every page.
 *
 * No container of its own: `app/layout.tsx` already wraps everything in
 * `mx-auto max-w-[1400px] px-4 py-6`, and a nested one doubles the padding.
 *
 * The V1/V2 switch used to sit on the right. It is gone: ARPA now lands on V2
 * and there is one tool, not a choice between two. V1 still answers on its own
 * URLs for us, it just has no door from here.
 */
export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <V2Nav />
        <span className="font-mono text-xs uppercase tracking-[0.12em] text-ink-faint">
          IOS v9
        </span>
      </header>
      {children}
    </>
  );
}
