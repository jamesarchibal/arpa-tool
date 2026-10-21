import { TIER_FLOOR } from '@/lib/ios/industries';
import { gateReady, type GateFacts } from '@/lib/ios/gates';
import { GATE_ALLOWED, STAGE_LABEL, STAGES } from '@/lib/ios/lists';
import { DASH } from '../_ui';

/**
 * The manual, one section per thing you might need to do.
 *
 * It is a screen and not a README because the people who have to run this read
 * the app, not the repository. Everything procedural about V2 lives here so that
 * a question like "how do I move a deal forward" has one answer in one place.
 *
 * The gate table is DERIVED from `gateReady()` and `GATE_ALLOWED`, not typed out.
 * A manual that restates the rules in prose is a manual that goes stale the first
 * time a rule changes; this one cannot disagree with the code because it asks the
 * code. The blank facts make every check fail, which is exactly how you get the
 * full list of requirements out of a function that only reports what is missing.
 */

const BLANK: GateFacts = {
  stage: 'Screening',
  thesis_code: null,
  loi_status: 'Not Started',
  full_dd_status: 'Not Started',
  closing_status: 'Not Started',
  open_required_dd_items: 1,
  next_step: '',
  approved_doc_types: [],
};

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-2.5 text-sm leading-relaxed text-ink-soft">{children}</p>
);

const UL = ({ children }: { children: React.ReactNode }) => (
  <ul className="mb-2.5 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-soft">
    {children}
  </ul>
);

const OL = ({ children }: { children: React.ReactNode }) => (
  <ol className="mb-2.5 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink-soft">
    {children}
  </ol>
);

const H = ({ children }: { children: React.ReactNode }) => (
  <h3 className="mb-2 mt-5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-faint">
    {children}
  </h3>
);

const C = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-bg-elevated px-1 py-0.5 font-mono text-[12px] text-ink">
    {children}
  </code>
);

const Pre = ({ children }: { children: React.ReactNode }) => (
  <pre className="mb-2.5 overflow-x-auto rounded-md border border-border bg-bg-elevated px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-soft">
    {children}
  </pre>
);

/** The thing you want to be told twice, in the colour of a warning. */
const Note = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-2.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
    {children}
  </p>
);

function GateTable() {
  return (
    <div className="mb-2.5 overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-elevated text-left font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
            <th className="px-3 py-2">Etapa</th>
            <th className="px-3 py-2">Qué exige el gate</th>
            <th className="px-3 py-2">Decisiones posibles</th>
          </tr>
        </thead>
        <tbody>
          {STAGES.map((stage) => {
            const requirements = gateReady({ ...BLANK, stage }).checks.map((c) => c.label);
            const allowed = GATE_ALLOWED[stage];
            return (
              <tr key={stage} className="border-b border-border align-top last:border-0">
                <td className="px-3 py-2">
                  <div className="font-medium text-ink">{STAGE_LABEL[stage]}</div>
                  <div className="font-mono text-[10px] text-ink-faint">{stage}</div>
                </td>
                <td className="px-3 py-2 text-xs text-ink-soft">{requirements.join(' · ')}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-ink-mute">
                  {allowed.length > 0 ? allowed.join(', ') : DASH}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const SECTIONS: { id: string; title: string; hint: string; body: React.ReactNode }[] = [
  {
    id: 'empezar',
    title: 'Por dónde empezar',
    hint: 'Qué hay en cada pestaña',
    body: (
      <>
        <UL>
          <li>
            <b className="text-ink">Mi trabajo.</b> Lo que espera una decisión, los documentos en
            revisión y los próximos pasos vencidos. Si solo va a mirar una pantalla al día, es esta.
          </li>
          <li>
            <b className="text-ink">Industrias.</b> Los 100 subsectores con sus ocho criterios, su
            nota y su tier. Responde a &laquo;este sector nos interesa&raquo;.
          </li>
          <li>
            <b className="text-ink">Tesis.</b> Las 140 tesis con su código, su driver y su
            estrategia. Responde a &laquo;por qué compraríamos aquí&raquo;.
          </li>
          <li>
            <b className="text-ink">Sourcing.</b> Tres vistas sobre la misma cadena: arquetipos (qué
            tipo de empresa buscar), empresas (las 258 de la long list) y fuentes (de dónde salió
            cada una).
          </li>
          <li>
            <b className="text-ink">Pipeline.</b> Los proyectos en las nueve etapas. Cada tarjeta
            abre el espacio de trabajo del proyecto.
          </li>
          <li>
            <b className="text-ink">Decisiones.</b> El registro de todas las decisiones de gate, la
            última arriba, incluidos los intentos bloqueados.
          </li>
        </UL>
        <Note>
          La regla que ordena todo lo demás: la etapa de un proyecto no se edita en ningún sitio. Se
          gana con una decisión de gate aprobada. Si busca un desplegable de etapa, no existe a
          propósito.
        </Note>
      </>
    ),
  },
  {
    id: 'gate',
    title: 'Cómo mover un proyecto de etapa',
    hint: 'El gate es la única puerta',
    body: (
      <>
        <OL>
          <li>Abra el proyecto desde Pipeline.</li>
          <li>
            El panel <i>Qué pide este gate</i> trae la etiqueta Abierto o Cerrado y la lista de
            requisitos, cada uno con un visto o una cruz. La cruz dice exactamente qué falta.
          </li>
          <li>
            Complete lo que falte. El próximo paso, la tesis principal, el responsable y los estados
            de LOI, DD y cierre se editan en ese mismo panel con <i>Guardar datos del gate</i>. El
            documento de la etapa se aprueba en la pestaña Documentos.
          </li>
          <li>
            Cuando la etiqueta pase a Abierto, rellene <i>Registrar decisión</i>: la decisión, la
            justificación (obligatoria) y quién decide.
          </li>
          <li>
            Pulse Registrar. El proyecto se mueve, se sella la fecha de entrada en la etapa nueva y
            se crea su entregable en Not Started v1.
          </li>
        </OL>
        <Note>
          Un intento de avanzar con el gate cerrado no se descarta: se guarda con estado Blocked y
          con los requisitos que fallaron. Ese intento es auditoría y aparece en Decisiones.
        </Note>
        <H>Qué exige cada gate</H>
        <GateTable />
        <P>
          El próximo paso se exige en los nueve. El cierre es el único que no pide ningún documento
          aprobado, solo su estado: así está escrito en su fórmula <C>Projects.Gate Ready?</C>, y la
          nota de cabecera de <C>Stage_Gates</C>, que dice lo contrario, está incompleta. La cartera
          es terminal y no tiene gate de salida.
        </P>
        <P>
          <b className="text-ink">Falta una pieza.</b> Su automatización A16 pide además que quien
          aprueba sea Partner. V2 no tiene roles, así que <i>Quién decide</i> es texto libre. Lo
          arreglan los pasos 1 y 2 de Entrega.
        </P>
      </>
    ),
  },
  {
    id: 'documentos',
    title: 'Cómo registrar un documento',
    hint: 'Tipo, estado y versión',
    body: (
      <>
        <OL>
          <li>Proyecto, pestaña Documentos.</li>
          <li>
            Elija el tipo de los quince del v9 (QSS, OM, PFR, IC, LOI, DD Summary, FIM y el resto),
            ponga el título y, si el fichero vive en SharePoint o en una carpeta compartida, pegue el
            enlace.
          </li>
          <li>
            El estado recorre Not Started, Drafting, In Review, Approved, Rejected y Superseded.
          </li>
          <li>
            Una versión nueva no se escribe encima de la anterior: suba el número de versión y marque
            la vieja como Superseded.
          </li>
        </OL>
        <Note>
          El gate solo mira la versión vigente de cada tipo. Un QSS en Superseded no abre Screening
          aunque estuviera aprobado antes.
        </Note>
      </>
    ),
  },
  {
    id: 'descartar',
    title: 'Cómo descartar un proyecto',
    hint: 'Pass, Lost y seguimiento',
    body: (
      <>
        <P>
          <b className="text-ink">Pass</b> es que nosotros decidimos no seguir.{' '}
          <b className="text-ink">Lost</b> es que lo perdimos, por ejemplo porque se vendió a otro.
          Al elegir cualquiera de las dos aparecen dos campos más: el motivo, de la lista de doce del
          v9, y la evidencia decisiva. El motivo es obligatorio.
        </P>
        <P>
          <b className="text-ink">Monitor, Pause y Hold</b> no descartan nada: dejan el proyecto en
          seguimiento con una fecha de revisión a 90 días.
        </P>
        <P>
          Un descarte no borra nada. El proyecto queda en Passed o Closed Lost con su historia
          completa en Decisiones, que es justo lo que hace falta cuando la misma empresa vuelve a
          aparecer dos años después.
        </P>
        <P>
          Diferencia a propósito con su diseño: su A12 crea una tarea de Data Quality cuando falta el
          motivo. Aquí el campo es obligatorio en el formulario, así que esa tarea no necesita
          existir.
        </P>
      </>
    ),
  },
  {
    id: 'catalogo',
    title: 'Cómo leer el catálogo',
    hint: 'Industrias, Tesis y Sourcing',
    body: (
      <>
        <P>
          <b className="text-ink">Industrias.</b> La nota es la media ponderada de los ocho criterios,
          de 1 a 5, con los pesos de su hoja <C>Scoring_Model</C> (15, 15, 15, 15, 10, 10, 10 y 10).
          El tier sale de la nota: A desde {TIER_FLOOR.A.toFixed(2).replace('.', ',')}, B desde{' '}
          {TIER_FLOOR.B.toFixed(2).replace('.', ',')} y el resto C. Salen 21 A, 36 B y 43 C, los
          mismos números de su Excel en las 100 filas. El cálculo vive en el código y no en la base
          de datos, para que haya una sola implementación y esté cubierta por tests.
        </P>
        <P>
          <b className="text-ink">Tesis.</b> Son 140. Las 17 que no tienen subsector asignado no son
          un error de carga, son Cross-sector, y por eso se muestran siempre en vez de desaparecer al
          filtrar.
        </P>
        <P>
          <b className="text-ink">Sourcing.</b> Las tres vistas son la misma cadena leída a tres
          profundidades, así que los filtros se mantienen al cambiar de vista. En Empresas, una celda
          en blanco es un dato que no tenemos y nunca un cero: 252 de las 258 no traen ventas
          estimadas en su Excel y se ven en blanco.
        </P>
        <P>
          Los filtros llevan el recuento al lado y se acumulan. La cuenta de arriba a la derecha dice
          siempre cuántas filas está viendo del total.
        </P>
      </>
    ),
  },
  {
    id: 'datos',
    title: 'Cómo recargar los datos del Excel',
    hint: 'Catálogo: 100, 140, 486, 173, 22, 258',
    body: (
      <>
        <Pre>
          {`node scripts/migrate.mjs supabase/migrations/20261021_arpa_ios_v9_catalogue.sql
node --experimental-strip-types scripts/ios-seed.ts --dry-run
node --experimental-strip-types scripts/ios-seed.ts`}
        </Pre>
        <P>
          El sembrador lee su libro de Excel y espera 100 subsectores, 140 tesis, 486 pares
          tesis-subsector, 173 arquetipos, 22 fuentes y 258 empresas. Es idempotente: ejecútelo dos
          veces y los números no cambian.
        </P>
        <UL>
          <li>
            La cabecera real de cada hoja <C>Seed_*</C> es la tercera fila, no la primera. El script
            lo comprueba por nombre y aborta si cambia, en vez de cargar basura en silencio.
          </li>
          <li>
            Ninguna fila se tira sin dejar rastro. Lo que no cuadre se escribe en{' '}
            <C>ios_seed_rejects</C> con su hoja, su número de fila y el motivo, y el script sale con
            error. Con el libro de hoy esa tabla queda vacía.
          </li>
          <li>
            <C>--file=otro.xlsx</C> para una versión nueva del libro, <C>--dry-run</C> para contar sin
            escribir.
          </li>
        </UL>
      </>
    ),
  },
  {
    id: 'probar',
    title: 'Cómo probar que funciona',
    hint: 'Sus propias fixtures y su checklist',
    body: (
      <>
        <P>
          Su libro ya traía la prueba de aceptación en tres hojas que nadie había usado:{' '}
          <C>Test_Fixtures</C>, <C>Seed_Fixtures</C> y <C>QA_Checklist</C>.
        </P>
        <Pre>{`node --experimental-strip-types scripts/ios-seed-fixtures.ts`}</Pre>
        <P>
          Crea seis proyectos de prueba, todos con código <C>TEST-</C> y con <C>(TEST)</C> en el
          nombre de la empresa, y los borra antes de volver a escribirlos, así que se puede ejecutar
          tantas veces como haga falta. Cada uno cubre un caso:
        </P>
        <UL>
          <li>
            <b className="text-ink">P1</b> Screening con el QSS aprobado y la tesis enlazada: el gate
            tiene que salir Abierto.
          </li>
          <li>
            <b className="text-ink">P2</b> revisión financiera con el PFR en In Review y el próximo
            paso vencido: gate Cerrado, y el proyecto tiene que aparecer en Mi trabajo.
          </li>
          <li>
            <b className="text-ink">P3</b> QSS en Drafting, el caso normal de trabajo en curso.
          </li>
          <li>
            <b className="text-ink">P5</b> sin tesis, QSS en Not Started y EBITDA vacío: es el caso
            que demuestra que un blanco no se convierte en un cero.
          </li>
          <li>
            <b className="text-ink">P6</b> un proyecto con dos add-ons, para ver el perímetro.
          </li>
        </UL>
        <P>
          El estado medido de sus 27 comprobaciones está en <C>docs/qa-v9.md</C>. Los tests del
          código se lanzan con <C>npm test</C>: son 85 y pasan los 85, incluida la rejilla entera de
          nueve etapas por dieciséis decisiones en los dos sentidos, lo permitido y lo prohibido.
        </P>
      </>
    ),
  },
  {
    id: 'entrega',
    title: 'Cómo llevarlo a su casa',
    hint: 'Ocho pasos, en este orden',
    body: (
      <>
        <P>
          Hoy esto corre en nuestra cuenta con un login compartido. Para que lo operen ellos, con su
          Microsoft y sus grabadores de reuniones, en este orden:
        </P>
        <OL>
          <li>
            <b className="text-ink">Login con Microsoft (Entra ID).</b> Va primero porque además trae
            los roles, y los roles son lo único que falta para cerrar A16 y su comprobación QA-08.
            Una app registration en su tenant y el correo de cada persona viene firmado en vez de
            escrito a mano.
          </li>
          <li>
            <b className="text-ink">Aplicar el rol al gate.</b> Con el rol disponible,{' '}
            <i>Quién decide</i> deja de ser texto libre y el avance queda restringido a Partner, que
            es lo que pide su A16.
          </li>
          <li>
            <b className="text-ink">Mover el alojamiento a sus cuentas, no a un servidor suyo.</b>{' '}
            Vercel y Supabase en la organización de ARPA, región de la UE, con el DPA firmado. Una
            máquina propia añade parches, copias y certificados sin aportar nada aquí.
          </li>
          <li>
            <b className="text-ink">Copias de seguridad con una restauración probada.</b> Una copia
            que nunca se ha restaurado no es una copia.
          </li>
          <li>
            <b className="text-ink">Documentos en SharePoint.</b> El fichero vive en su SharePoint;
            aquí se guarda el enlace, el tipo, la versión y el estado. Una carpeta por empresa y otra
            por proyecto. No duplicamos ficheros.
          </li>
          <li>
            <b className="text-ink">Outlook.</b> El próximo paso y su fecha, como evento o
            recordatorio en el calendario de quien lo tiene asignado. Es el bucle que cierra Mi
            trabajo.
          </li>
          <li>
            <b className="text-ink">Transcripciones de reuniones.</b> Jamie y los grabadores encajan
            en su tabla Interactions: la llamada entra como interacción y lo que el modelo saque de
            ella entra como Needs Review, nunca como dato aprobado. Antes hay que decidir el
            consentimiento y el plazo de conservación, porque es dato personal.
          </li>
          <li>
            <b className="text-ink">Registro de auditoría general.</b> Hoy auditamos las decisiones
            de gate, que es lo que de verdad importa. Falta el resto de los cambios.
          </li>
        </OL>
        <P>
          El detalle técnico de cada paso, con lo que hay que pedirle a su IT, está en{' '}
          <C>docs/entrega-arpa.md</C>.
        </P>
      </>
    ),
  },
  {
    id: 'limites',
    title: 'Qué no hace, a propósito',
    hint: 'Tres motivos distintos, no uno',
    body: (
      <>
        <P>
          V2 es su arquitectura v9 reducida a las reglas, no a las 33 pantallas. Lo que falta, falta
          por tres motivos que conviene no mezclar:
        </P>
        <UL>
          <li>
            <b className="text-ink">Acordado fuera de alcance:</b> Portfolio, KPIs, DD Tracker,
            valoración por casos, iniciativas de creación de valor, el formulario externo de
            asesores, los financieros por periodo y los agentes de IA.
          </li>
          <li>
            <b className="text-ink">Hueco real, no una decisión:</b> los roles. Son los pasos 1 y 2
            de Entrega.
          </li>
          <li>
            <b className="text-ink">Hecho distinto a propósito:</b> su A12 crea una tarea cuando
            falta el motivo de descarte; aquí el campo es obligatorio y la tarea no hace falta.
          </li>
        </UL>
        <P>
          Y un muñón a la vista: <i>Puntos DD abiertos</i> es un número que teclea una persona,
          porque el DD Tracker está fuera de alcance, y el gate de due diligence no abre hasta que
          sea 0. Está visible en el panel en vez de escondido.
        </P>
        <P>
          La comparación completa entre Airtable y desarrollo propio está en{' '}
          <C>docs/airtable-vs-propio.md</C>, y el estado medido de sus 27 comprobaciones en{' '}
          <C>docs/qa-v9.md</C>.
        </P>
      </>
    ),
  },
];

export default function DocsPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav className="lg:sticky lg:top-6 lg:self-start">
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
          Apartados
        </h2>
        <ol className="space-y-0.5">
          {SECTIONS.map((s, i) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="flex gap-2 rounded px-2 py-1 text-xs text-ink-mute hover:bg-bg-elevated hover:text-ink"
              >
                <span className="font-mono text-ink-faint">{i + 1}</span>
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="max-w-[760px]">
        <header className="mb-6">
          <h1 className="text-lg font-semibold text-ink">Cómo se hace cada cosa</h1>
          <p className="mt-1 text-sm text-ink-mute">
            El manual de V2: la operación, la carga de datos, las pruebas y lo que falta para que
            ARPA lo opere en su propia casa.
          </p>
        </header>

        {SECTIONS.map((s, i) => (
          // scroll-mt so the anchor does not land under the sticky header.
          <section key={s.id} id={s.id} className="mb-8 scroll-mt-6">
            <header className="mb-3 border-b border-border pb-2">
              <h2 className="text-base font-semibold text-ink">
                <span className="mr-2 font-mono text-xs text-ink-faint">{i + 1}</span>
                {s.title}
              </h2>
              <p className="mt-0.5 text-xs text-ink-faint">{s.hint}</p>
            </header>
            {s.body}
          </section>
        ))}
      </div>
    </div>
  );
}
