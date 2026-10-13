import CopyButton from './_copy';
import ImportForm from './_import-form';
import TopNav from '../_topnav';

export const dynamic = 'force-dynamic';

/**
 * The prompt Marc pastes into his own Claude, with the SABI export attached.
 *
 * Written out in full rather than summarised, because the field names and the
 * units are the whole contract: get `units` wrong and every score downstream is
 * wrong by a factor of a million. The intake rejects implausible magnitudes for
 * exactly that reason, but it is better to not send them.
 */
const PROMPT = `Te adjunto un export de SABI (Bureau van Dijk) con empresas españolas.

Conviértelo a este JSON y no me des nada más que el JSON:

{
  "units": "eur",
  "label": "<describe el filtro que usé en SABI, p. ej. CNAE 17.x Cataluña>",
  "rows": [
    {
      "legal_name": "razón social exacta",
      "cif": "NIF, o null si no está",
      "city": "municipio o null",
      "region": "provincia o null",
      "country": "ES",
      "cnae": "código CNAE o null",
      "website": "o null",
      "employees": número entero o null,
      "founded_year": año de constitución o null,
      "ownership_type": "Founder-owned | Family-owned | Private equity | Corporate subsidiary | Public | Unknown",
      "subsector": "déjalo a null salvo que estés seguro",
      "revenue": [más antiguo, ..., más reciente],
      "ebitda": [más antiguo, ..., más reciente],
      "net_debt": número o null,
      "capex": número o null,
      "working_capital": número o null,
      "notes": "cualquier cosa del export que no encaje arriba, o null"
    }
  ]
}

Reglas, importantes:
- Importes en EUROS, tal cual vienen en el export. No los pases a millones, eso lo hago yo.
- "n.d.", celdas vacías y guiones son null, NUNCA cero. Son conceptos que esa cuenta no publicó.
- revenue y ebitda van en orden ascendente por año, el más reciente al final. Manda todos los
  años que haya, no solo tres.
- El export trae celdas combinadas y una columna por año. Deshazlo tú.
- Si una fila no tiene razón social, descártala y dime cuántas descartaste.
- No inventes ningún dato. Si no está en el export, es null.`;

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-bg-elevated text-[11px] font-semibold text-ink-soft">
        {n}
      </span>
      <div className="space-y-1">
        <div className="text-sm font-semibold text-ink">{title}</div>
        <div className="text-xs leading-relaxed text-ink-mute">{children}</div>
      </div>
    </li>
  );
}

export default function ImportarPage() {
  return (
    <div className="space-y-6">
      <TopNav active="importar" />

      <div>
        <h1 className="text-2xl font-bold text-ink">📥 ARPA · Importar de SABI</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-mute">
          Cada fila del export se convierte en una oportunidad con su puntuación, lista en la etapa
          Sourcing del pipeline. El scoring es el mismo motor de la ficha, así que un lote importado
          y una ficha rellenada a mano no pueden discrepar sobre el método.
        </p>
      </div>

      <ol className="space-y-4 rounded-lg border border-border bg-bg-card px-5 py-4">
        <Step n={1} title="Filtra y exporta en SABI">
          Búsqueda por filtros, CNAE y provincia, añade las columnas de ingresos y EBITDA de los
          últimos años, y exporta a Excel la lista entera.
        </Step>
        <Step n={2} title="Abre el Excel en tu Claude con este prompt">
          Lo lee él, incluidas las celdas combinadas y los <code>n.d.</code>. Corre en tu
          suscripción, así que no gasta tokens de API de nadie.
        </Step>
        <Step n={3} title="Pega aquí el JSON que te devuelva">
          Te digo fila por fila qué ha entrado, qué se ha actualizado y qué se ha rechazado y por
          qué, antes de que nada se dé por bueno.
        </Step>
      </ol>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-ink">Prompt para tu Claude</h2>
          <CopyButton text={PROMPT} label="Copiar prompt" />
        </div>
        <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-bg-elevated px-4 py-3 text-[11px] leading-relaxed text-ink-soft">
          {PROMPT}
        </pre>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">El JSON</h2>
        <ImportForm />
      </div>

      <p className="text-[11px] leading-relaxed text-ink-faint">
        Las cifras se guardan en millones de euros, que es la unidad de todo el modelo. El lote
        declara <code>units</code> y la conversión se hace aquí, no en el prompt: si un importe
        convertido sale absurdo para esta cartera, la fila se rechaza en vez de guardarse mal, porque
        un error de unidades no rompe nada visiblemente, solo falsea todas las puntuaciones.
      </p>
    </div>
  );
}
