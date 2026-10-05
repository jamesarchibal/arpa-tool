'use client';

import { useState } from 'react';

/**
 * Opens SABI and puts the exact legal name on the clipboard, so the lookup is
 * one click plus one paste.
 *
 * Why it does NOT deep-link the search: SABI is a session-based BvD app and we
 * have no documented query-string search endpoint for this seat. Inventing one
 * would produce a button that silently lands on a login page. So the target URL
 * is configurable through SABI_URL, and the day we learn the real deep link it
 * drops in as an env var with no code change.
 *
 * BORME publishes no CIF, so the match is by name and names are ambiguous
 * (SL vs SLU, accents, near-identical siblings). The registry sheet is the
 * unambiguous key, so it is copied too and shown in the tooltip for the
 * cross-check.
 */
export default function SabiButton({
  legalName,
  hoja,
  province,
  sabiUrl,
}: {
  legalName: string;
  hoja: string | null;
  province: string;
  sabiUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onClick() {
    // Clipboard first. If it throws we still want the tab to open, and the user
    // can always select the name by hand.
    try {
      await navigator.clipboard.writeText(legalName);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Non-secure contexts and denied permissions both land here. Not worth an
      // error state: the name is on screen right next to the button.
    }
    window.open(sabiUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Copia "${legalName}" y abre SABI. Contrasta con la hoja ${
        hoja ?? 'registral'
      } (${province}), porque el nombre solo no identifica a la empresa.`}
      className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700 transition hover:bg-sky-100"
    >
      {copied ? 'nombre copiado' : 'SABI'}
    </button>
  );
}
