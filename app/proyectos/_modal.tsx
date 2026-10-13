'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * The shell of the card popup. Nothing but chrome: the content is rendered on
 * the server and passed in as children.
 *
 * Which state a popup is open in lives in the URL (`?ficha=<id>`) and not in a
 * useState, for the same reason a camino does. Marc can send Ignasi the card he
 * is looking at, the back button closes it, and the body stays a server
 * component, so there is no second data path to keep in sync with the page.
 */
export default function Modal({ closeTo, children }: { closeTo: string; children: React.ReactNode }) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);

  // `scroll: false` so closing does not jump the board back to the top, which
  // on a wide board means losing the column you were reading.
  const close = () => router.push(closeTo, { scroll: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    // The popup is tall and scrolls on its own. Without this the page behind it
    // scrolls instead once the inner list reaches its end.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeTo]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
      onClick={close}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        // The backdrop closes on click, so the panel has to stop the event or
        // every click inside the popup would close it.
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl rounded-xl border border-border bg-bg shadow-2xl outline-none"
      >
        <button
          type="button"
          onClick={close}
          aria-label="Cerrar"
          className="float-right m-3 rounded px-2 py-0.5 text-lg leading-none text-ink-faint transition hover:bg-bg-elevated hover:text-ink"
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
}
