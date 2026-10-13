'use client';

import { useState } from 'react';

export default function CopyButton({ text, label = 'Copiar' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          // Clipboard access needs a secure context and a user gesture. If the
          // browser refuses, say so instead of pretending it worked: the text is
          // on screen and can still be selected by hand.
          setDone(false);
          window.alert('El navegador no ha dejado copiar. Selecciona el texto a mano.');
        }
      }}
      className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs text-ink-mute transition hover:bg-bg-elevated hover:text-ink"
    >
      {done ? '✓ Copiado' : label}
    </button>
  );
}
