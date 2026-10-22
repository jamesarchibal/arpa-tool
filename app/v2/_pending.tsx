/**
 * The slot for a connection we cannot build yet.
 *
 * Three things in their design need an app registration in ARPA's Microsoft
 * tenant: creating the SharePoint folder, pushing the next step to Outlook, and
 * pulling mail and meeting notes into Interactions. We do not have that
 * registration, so the work cannot be done; what CAN be done is to put the
 * control where it belongs and say out loud what it is waiting for.
 *
 * It renders as a visibly disabled button with the reason attached, never as a
 * button that looks alive. A control that does nothing when clicked is worse
 * than an empty space, because the person stops trusting the other buttons too.
 * `aria-disabled` plus `disabled` keeps that honest for a screen reader as well.
 *
 * When the credentials land, each of these becomes a real form action and this
 * component disappears from that spot. That is the whole point of having one
 * component instead of three ad-hoc greyed-out buttons: there is a single list
 * of what is pending, and it is the list of usages.
 */
export const PENDING_MICROSOFT =
  'Necesita la conexión con Microsoft (registro de aplicación en el tenant de ARPA). Paso 1 de la entrega.';

export function Pending({ children, needs }: { children: React.ReactNode; needs: string }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title={needs}
      className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs font-semibold text-ink-faint"
    >
      <span aria-hidden className="text-[10px]">
        ○
      </span>
      {children}
    </button>
  );
}
