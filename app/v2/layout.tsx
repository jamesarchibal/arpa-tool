import VersionSwitch from '../_version-switch';
import V2Nav from './_nav';

/**
 * V2's header, once, instead of an `active` prop on every page.
 *
 * No container of its own: `app/layout.tsx` already wraps everything in
 * `mx-auto max-w-[1400px] px-4 py-6`, and a nested one doubles the padding.
 */
export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <V2Nav />
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs uppercase tracking-[0.12em] text-ink-faint">
            IOS v9
          </span>
          <VersionSwitch current="v2" />
        </div>
      </header>
      {children}
    </>
  );
}
