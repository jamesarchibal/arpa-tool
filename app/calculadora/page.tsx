import TopNav from '../_topnav';
import Calculator from './_calculator';

/**
 * The scoring method on its own, with no company attached.
 *
 * This page reads NOTHING from the database: the taxonomy, the weights and the
 * kill criteria are all compiled into `lib/arpa/scoring.ts`. So it is static,
 * it cannot break because of a bad import or a connection, and it is the same
 * engine that scores a SABI batch and a hand-filled ficha. One method, three
 * places it shows up.
 */
export default function CalculadoraPage() {
  return (
    <div className="space-y-6">
      <TopNav active="scoring" />

      <div>
        <h1 className="text-2xl font-bold text-ink">🧮 ARPA · Scoring</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-mute">
          Vuestro método, suelto, sin empresa de por medio. Teclea las cifras y responde el mismo
          motor que puntúa un lote importado de SABI y una ficha rellenada a mano, así que los tres
          caminos no pueden discrepar. Las puertas se evalúan en orden y la operación se para en la
          primera que diga Pass.
        </p>
      </div>

      <Calculator />
    </div>
  );
}
