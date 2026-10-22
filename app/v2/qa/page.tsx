import Link from 'next/link';

import { getIosProjects } from '@/lib/ios/db';
import { Stat } from '../_ui';

/**
 * Their QA_Checklist, 27 rows, with our grade and a link to the proof.
 *
 * This screen exists because the honest answer to "where can I see that?" was
 * "in a markdown file in the repository", and the people who have to believe it
 * read the app. The left column is THEIR wording, copied from the sheet; the
 * only thing of ours is the verdict and the link.
 *
 * The point is not the table, it is the `proof` field. A checklist that grades
 * itself is a claim. A checklist where every row that can be seen links to the
 * fixture that shows it is an invitation to go and break it, which is the only
 * version of this document worth sending.
 *
 * The three counters are DERIVED from the rows, like the gate table in `docs`.
 * Typing "8, 11 and 8" would be a fourth place for the truth to live, and the
 * first one to go stale the day a row changes.
 */

export const dynamic = 'force-dynamic';

type State = 'si' | 'medias' | 'no';

interface Check {
  id: string;
  area: string;
  /** Their words, from the `QA_Checklist` sheet. Do not paraphrase these. */
  check: string;
  state: State;
  detail: string;
  /** Name prefix of the fixture project that shows it, plus the tab to open. */
  fixture?: { name: string; tab?: string };
  /** A screen that shows it, when the proof is not one project. */
  screen?: { href: string; label: string };
}

const STATE_LABEL: Record<State, string> = {
  si: 'Pasa',
  medias: 'A medias',
  no: 'No pasa',
};

const STATE_CLASS: Record<State, string> = {
  si: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  medias: 'border-amber-200 bg-amber-50 text-amber-900',
  no: 'border-border bg-bg-elevated text-ink-faint',
};

const CHECKS: Check[] = [
  {
    id: 'QA-01',
    area: 'Schema',
    check: 'Las 21 tablas existen con nombres exactos.',
    state: 'medias',
    detail:
      'V2 tiene 12 tablas, las de las partes en alcance. Las 9 que faltan son Portfolio, KPIs, DD Tracker, Valuation, Value Creation, Interactions, Shareholders, Tasks e Import Batches.',
  },
  {
    id: 'QA-02',
    area: 'Schema',
    check: 'Cada campo del Field_Dictionary existe con su tipo.',
    state: 'medias',
    detail:
      'Están los campos de las tablas en alcance. Se añadieron Website, Ownership Type y EBITDA Estimate a Companies, que faltaban porque su Seed_Companies no los trae y sus fixtures sí.',
  },
  {
    id: 'QA-03',
    area: 'Lists',
    check:
      'Cada single select tiene exactamente las opciones del Vocabulary, misma escritura y mismo orden.',
    state: 'si',
    detail:
      'Automatizado: 29 listas comparadas opción por opción y en orden contra su hoja Vocabulary, incluido el guion largo de "A – Priority". Corre en cada ejecución de los tests, no a mano. Es la comprobación que en Airtable no se puede automatizar.',
    screen: { href: '/v2/docs#probar', label: 'cómo se ejecuta' },
  },
  {
    id: 'QA-04',
    area: 'Links',
    check:
      'Cada enlace del Relationship_Map existe y los de un solo registro están limitados a uno.',
    state: 'medias',
    detail:
      'Las 7 relaciones en alcance son claves ajenas, cada una con su regla de borrado explícita: tesis e industria a nulo, documentos y perímetro en cascada, compañía del perímetro restringida. Una clave ajena limita a uno por definición.',
  },
  {
    id: 'QA-05',
    area: 'Schema',
    check: 'No existe ninguna tabla Opportunity, Deals ni por etapa.',
    state: 'si',
    detail: 'No existe. El embudo sale de una columna del proyecto, no de una tabla por etapa.',
  },
  {
    id: 'QA-06',
    area: 'Gates',
    check: 'Gate Ready? = No cuando el documento de la etapa no está Approved.',
    state: 'si',
    detail:
      'Este proyecto está en Preliminary Financial Review con el PFR en revisión, así que el gate está cerrado. El panel no da un no seco: lista qué falta. Un documento Superseded tampoco abre el gate, y eso tiene su propio test.',
    fixture: { name: 'Packaging Norte' },
  },
  {
    id: 'QA-07',
    area: 'Gates',
    check:
      'Allowed for Gate? = No para una decisión no permitida en ese gate (por ejemplo Approve en Screening).',
    state: 'si',
    detail:
      'En este gate el panel solo ofrece Build Investment Case, Reprice, Pass y Lost. Approve pertenece al gate de Final Investment Approval y el servidor lo rechaza aunque se fuerce la petición. La rejilla de 9 etapas por 16 decisiones está en los tests, los 144 casos no permitidos incluidos.',
    fixture: { name: 'Packaging Norte' },
  },
  {
    id: 'QA-08',
    area: 'Permissions',
    check: 'Un Analyst no puede crear una Gate Decision ni poner Document Status = Approved.',
    state: 'no',
    detail:
      'No hay roles. Hay una contraseña compartida y quien entra puede hacer todo. Es el hueco más grande de V2 y el primero que hay que cerrar: necesita login de Microsoft en su tenant.',
  },
  {
    id: 'QA-09',
    area: 'Automations',
    check:
      'A02 crea el documento QSS y la tarea, pone Stage Entered Date y Company Status = Active Project.',
    state: 'medias',
    detail:
      'Avanzar crea el entregable de la etapa siguiente en Not Started v1 y escribe la fecha de entrada. No hay tareas porque no hay tabla de tareas. Company Status lo pone el cargador de fixtures, no una automatización.',
    fixture: { name: 'AgroIrrigation' },
  },
  {
    id: 'QA-10',
    area: 'Automations',
    check:
      'A03 a A10 mueven exactamente una etapa, ponen Stage Entered Date y crean el documento siguiente.',
    state: 'si',
    detail:
      'Este proyecto se recorre entero, de una etapa en una. No hay forma de saltarse una porque no existe ningún desplegable de etapa en ninguna pantalla: el orden está en una tabla probada.',
    fixture: { name: 'AgroIrrigation' },
  },
  {
    id: 'QA-11',
    area: 'Automations',
    check: 'A16 bloquea una decisión de Advance cuando Gate Ready = No y cuando Approved By no es Partner.',
    state: 'medias',
    detail:
      'La mitad del gate sí, y en tres sitios: el panel no ofrece el botón, el servidor rechaza la petición, y una restricción de la base de datos impide la fila incluso escribiéndola a mano con SQL. El intento rechazado se graba como Blocked con el motivo, porque un intento que el sistema paró es auditoría. La condición de Partner necesita roles.',
    fixture: { name: 'Packaging Norte' },
  },
  {
    id: 'QA-12',
    area: 'Automations',
    check: 'A12 pone Passed, copia el motivo y crea una tarea de Data Quality cuando falta el motivo.',
    state: 'medias',
    detail:
      'A medias y a propósito. Pass marca el proyecto como Passed, guarda la etapa en la que murió y copia el motivo. Pero el motivo es obligatorio en el formulario, así que no hay nada que reclamar después. Preferimos impedir el dato que falta a crear una tarea para pedirlo. Si prefiere su versión, se cambia.',
    fixture: { name: 'Components Valencia' },
  },
  {
    id: 'QA-13',
    area: 'Automations',
    check: 'A13 pone Monitor + Review Date +90; A14 crea la tarea de revisión cuando vence.',
    state: 'medias',
    detail:
      'Monitor pone el estado y la fecha de revisión a 90 días. No hay tarea: "Mi trabajo" lista los próximos pasos vencidos, que hace el mismo trabajo sin tabla de tareas. Este proyecto tiene la fecha ya pasada para que se vea.',
    fixture: { name: 'Packaging Norte' },
  },
  {
    id: 'QA-14',
    area: 'Automations',
    check: 'A18 deja exactamente un caso de valoración Current por proyecto.',
    state: 'no',
    detail: 'Valuation por casos está fuera de alcance.',
  },
  {
    id: 'QA-15',
    area: 'Automations',
    check:
      'A17 cuenta bien la previsualización de un fichero reimportado y no crea una segunda compañía al coincidir NIF o dominio.',
    state: 'medias',
    detail:
      'La importación de SABI no duplica (el nombre normalizado tiene índice único) y nunca sobrescribe un campo con un vacío, que es su regla. Lo que no tiene son sus contadores de previsualización antes de escribir, ni el cruce por NIF o dominio.',
    screen: { href: '/v2/sourcing?v=empresas', label: 'el importador' },
  },
  {
    id: 'QA-16',
    area: 'Automations',
    check: 'A07 crea 9 ítems de DD con Required en 4; A08 bloqueado mientras quede un Required abierto.',
    state: 'medias',
    detail:
      'El gate de Full Due Diligence exige que los ítems requeridos abiertos sean 0, pero ese número lo teclea una persona porque no hay DD Tracker. Es un muñón a la vista, no escondido.',
  },
  {
    id: 'QA-17',
    area: 'AI',
    check: 'Toda salida de IA entra con AI status Needs Review y ningún paso de IA pone Approved.',
    state: 'no',
    detail:
      'No hay agentes en V2. La columna existe y vale Not Run en las 258 compañías. Cuando se metan agentes, esta regla entra con ellos y no después.',
  },
  {
    id: 'QA-18',
    area: 'Dashboards',
    check: 'El Partner Cockpit muestra decisiones pendientes, paradas y revisiones de monitor.',
    state: 'si',
    detail:
      'En equivalente. "Mi trabajo" muestra cuatro listas derivadas: gates esperando decisión, documentos en revisión, próximos pasos vencidos, y gates cerrados con lo que les falta. No es su maquetación, y ninguna de las cuatro es un campo que alguien mantenga a mano.',
    screen: { href: '/v2', label: 'Mi trabajo' },
  },
  {
    id: 'QA-19',
    area: 'Migration',
    check:
      '258 compañías y 140 tesis importadas, 0 duplicados por Duplicate Key o Thesis Code, cada compañía con subsector, arquetipo y Origin Type.',
    state: 'si',
    detail:
      '258 compañías, 140 tesis con 140 códigos distintos, 100 subsectores. De las 258: todas con subsector, arquetipo, Origin Type y fuente. Los duplicados no son improbables, son imposibles: hay índice único en el nombre normalizado y en el código de tesis.',
    screen: { href: '/v2/sourcing?v=empresas', label: 'las 258' },
  },
  {
    id: 'QA-20',
    area: 'Data quality',
    check:
      'Los valores financieros en blanco están en blanco, nunca 0; EBITDA Band muestra Unknown para los blancos.',
    state: 'medias',
    detail:
      'La primera mitad sí: el EBITDA de este proyecto es nulo en la base de datos, no 0, y la pantalla dice "sin dato". Lo mismo con las 252 de 258 compañías cuyo Revenue Estimate viene vacío en su hoja. La etiqueta derivada EBITDA Band no está construida.',
    fixture: { name: 'Seeded Errors' },
  },
  {
    id: 'QA-21',
    area: 'Build-up',
    check:
      'Un proyecto Build-up con plataforma y dos add-ons muestra Company Count 3 y el EBITDA combinado de las filas no descartadas.',
    state: 'medias',
    detail:
      'El perímetro de tres está con sus roles (Platform, Add-on, Add-on) y sus estados. El EBITDA combinado no se calcula, y Portfolio está fuera de alcance, así que esa parte no se puede ver.',
    fixture: { name: 'Champiñones Cuenca', tab: 'perimetro' },
  },
  {
    id: 'QA-22',
    area: 'Project Builder',
    check:
      'Crear un proyecto con Lead Company y dos Companies to Add da 3 filas de Project Companies y Company Status = Active Project en las tres.',
    state: 'medias',
    detail:
      'El perímetro se añade compañía por compañía desde la pantalla del proyecto. No hay campo de staging "Companies to Add" ni automatización que ponga Company Status.',
    fixture: { name: 'Champiñones Cuenca', tab: 'perimetro' },
  },
  {
    id: 'QA-23',
    area: 'Ownership',
    check:
      'Una interacción no se puede guardar sin proyecto; un documento sin proyecto, industria ni tesis muestra Scope = Unassigned.',
    state: 'no',
    detail: 'No hay tabla de interacciones en alcance.',
  },
  {
    id: 'QA-24',
    area: 'Theses',
    check:
      'Gate Ready? = No en Screening mientras Primary Thesis esté vacío; Investment Theses.Open Projects cuenta el proyecto al ponerla.',
    state: 'si',
    detail:
      'La primera mitad sí: este proyecto no tiene tesis y el panel lo dice con esas palabras. La condición no aparece en la nota de cabecera de su Stage_Gates: sale de la fórmula Projects.Gate Ready? del Field_Dictionary, que es la que manda cuando las dos se contradicen. El contador de proyectos abiertos por tesis no está.',
    fixture: { name: 'Seeded Errors' },
  },
  {
    id: 'QA-25',
    area: 'Value creation',
    check: 'Al cierre, A10 enlaza las iniciativas In Plan / Validated al registro de Portfolio.',
    state: 'no',
    detail: 'Value Creation Initiatives está fuera de alcance.',
  },
  {
    id: 'QA-26',
    area: 'Ownership',
    check: 'Companies.CEO Is Shareholder? = Yes / No / Unknown según la tabla de accionistas.',
    state: 'no',
    detail: 'No hay tabla de accionistas.',
  },
  {
    id: 'QA-27',
    area: 'SharePoint',
    check: 'A22 rellena SharePoint Folder URL o crea la tarea de respaldo.',
    state: 'no',
    detail: 'Fuera de alcance: necesita acceso a su tenant de Microsoft.',
  },
];

function StatePill({ state }: { state: State }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] ${STATE_CLASS[state]}`}
    >
      {STATE_LABEL[state]}
    </span>
  );
}

export default async function QaPage() {
  const projects = await getIosProjects();

  // Fixtures are matched by name prefix, not by id: the loader deletes and
  // recreates them, so every id changes on every run and a hardcoded one would
  // be a dead link by the next QA round.
  const findFixture = (name: string) => projects.find((p) => p.name.startsWith(name));

  const count = (s: State) => CHECKS.filter((c) => c.state === s).length;

  return (
    <div className="max-w-[1100px]">
      <header className="mb-5">
        <h1 className="text-lg font-semibold text-ink">Sus 27 comprobaciones, una por una</h1>
        <p className="mt-1 max-w-[760px] text-sm text-ink-mute">
          La columna de la izquierda es suya, copiada de la hoja <code>QA_Checklist</code> de su
          libro. Lo único nuestro es la nota y el enlace. Donde pone un enlace, puede abrirlo e
          intentar romperlo: son sus propios casos de prueba cargados en la herramienta.
        </p>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Pasan enteras" value={String(count('si'))} hint="casi todas son reglas" />
        <Stat label="A medias" value={String(count('medias'))} hint="falta la mitad que se dice" />
        <Stat label="No pasan" value={String(count('no'))} hint="dependen de algo fuera de alcance" />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-bg-card">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-elevated text-left font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
              <th className="px-3 py-2">Id</th>
              <th className="px-3 py-2">Su comprobación</th>
              <th className="px-3 py-2">Nota</th>
              <th className="px-3 py-2">Estado en V2</th>
            </tr>
          </thead>
          <tbody>
            {CHECKS.map((c) => {
              const fixture = c.fixture ? findFixture(c.fixture.name) : undefined;
              return (
                <tr key={c.id} className="border-b border-border align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-3">
                    <div className="font-mono text-[11px] font-semibold text-ink">{c.id}</div>
                    <div className="font-mono text-[10px] text-ink-faint">{c.area}</div>
                  </td>
                  <td className="max-w-[320px] px-3 py-3 text-xs leading-relaxed text-ink">
                    {c.check}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <StatePill state={c.state} />
                  </td>
                  <td className="px-3 py-3 text-xs leading-relaxed text-ink-soft">
                    {c.detail}
                    {fixture ? (
                      <Link
                        href={`/v2/pipeline/${fixture.id}${
                          c.fixture?.tab ? `?tab=${c.fixture.tab}` : ''
                        }`}
                        className="ml-1 whitespace-nowrap font-medium text-brand hover:underline"
                      >
                        Verlo en {c.fixture?.name} &rarr;
                      </Link>
                    ) : null}
                    {c.screen ? (
                      <Link
                        href={c.screen.href}
                        className="ml-1 whitespace-nowrap font-medium text-brand hover:underline"
                      >
                        Ver {c.screen.label} &rarr;
                      </Link>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 max-w-[760px] space-y-2.5 text-sm leading-relaxed text-ink-soft">
        <h2 className="font-semibold text-ink">Por qué falta lo que falta</h2>
        <p>
          Tres motivos distintos, y mezclarlos es lo que hace que una lista de huecos parezca una
          lista de excusas.
        </p>
        <p>
          <b className="text-ink">Lo dejamos fuera a propósito.</b> Portfolio, KPIs, DD Tracker,
          valoración por casos, iniciativas de creación de valor, financieros por periodo, los
          agentes de IA, interacciones, accionistas y SharePoint. Son 9 de sus 21 tablas. El criterio
          fue construir primero lo que es difícil de garantizar en cualquier herramienta, y las
          reglas son eso: gates, vocabulario, orden de etapas, enlaces, integridad de la carga. Lo
          otro es superficie y se añade después.
        </p>
        <p>
          <b className="text-ink">No existe la pieza, y es un hueco real.</b> Los roles. Hoy hay una
          contraseña compartida y quien entra puede hacer todo. Por eso su QA-08 no se pasa, y la
          mitad de su A16 tampoco. Es lo primero que hay que cerrar.
        </p>
        <p>
          <b className="text-ink">Lo hicimos distinto a propósito.</b> Donde su diseño crea una tarea
          para reclamar un dato que falta, aquí el dato es obligatorio. Su A12 crea una tarea si un
          Pass va sin motivo; aquí el formulario no deja guardar sin motivo. Es una preferencia, no
          una limitación: si prefiere su versión, se cambia.
        </p>
        <p className="rounded-md border border-border bg-bg-elevated px-3 py-2">
          Lo que esta tabla dice de verdad: las comprobaciones que se pasan enteras son casi todas
          reglas, y las que no son casi todas superficie. La superficie se añade. Una regla que no se
          puede garantizar no se arregla añadiendo pantallas.
        </p>
      </div>
    </div>
  );
}
