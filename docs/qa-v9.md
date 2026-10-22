# QA_Checklist del IOS v9: estado real en V2

Las 27 comprobaciones son suyas, de la hoja `QA_Checklist` del workbook v9, copiadas
literalmente en la columna "Check". Lo único nuestro es el estado, y está medido
el 21-oct-2026 contra V2 en producción, no estimado.

Sus seis fixtures (`Seed_Fixtures`, P1 a P6) están cargados. Se cargan y se
reinician con:

```bash
node --experimental-strip-types scripts/ios-seed-fixtures.ts           # borra y recrea
node --experimental-strip-types scripts/ios-seed-fixtures.ts --delete  # solo borra
```

Todo lo que toca ese script se llama `(TEST)` o tiene código `TEST-*`, y borra
antes de escribir, porque una ronda de QA que empieza desde lo que dejó el tester
anterior no demuestra nada.

| Fixture | Proyecto en V2 | Dónde empieza | Para qué sirve |
| --- | --- | --- | --- |
| P1 | AgroIrrigation Systems SL (TEST) | Screening, **gate abierto** | recorrer las 9 etapas de una en una |
| P2 | Packaging Norte SL (TEST) | Preliminary Financial Review, **gate cerrado** (PFR In Review) | que el gate diga no |
| P3 | Components Valencia SL (TEST) | Screening, QSS Drafting | Monitor y Pass con el gate cerrado |
| P5 | Seeded Errors SA (TEST) | Screening, sin tesis y sin EBITDA | que los blancos sigan blancos |
| P6 | Champiñones Cuenca SL (TEST) + 2 | Screening, gate abierto | build-up con plataforma y dos add-ons |
| P4 | no cargado | | es el fixture de importación masiva, y el importador está en V1 |

El nombre que V2 generó para P6 es `Champiñones Cuenca SL (TEST) + 2 – 2026`, que
es carácter por carácter el que su hoja predice en la columna `Expected`.

## Resumen

- **8 de 27 se pueden pasar hoy enteras**: QA-03, 05, 06, 07, 10, 18, 19, 24.
- **12 están a medias**, con la parte que falta dicha por su nombre: QA-01, 02, 04,
  09, 11, 12, 13, 15, 16, 20, 21, 22.
- **7 no se pueden pasar** porque dependen de algo que dejamos fuera de alcance:
  QA-08, 14, 17, 23, 25, 26, 27.

Esta tabla se mantiene a mano, así que la fuente de verdad es la pantalla
**`/v2/qa`**, que deriva los tres recuentos de sus propias filas y enlaza cada
comprobación con el fixture que la demuestra. Si los números no coinciden, manda
la pantalla y hay que corregir este fichero.

La que más nos importa es **QA-11**, porque es la regla que da sentido al sistema.
Su mitad de gate está cumplida y, además, cumplida en tres sitios: el panel no
ofrece el botón, la acción de servidor lo rechaza, y hay un CHECK en la base de
datos que impide la fila incluso escribiéndola a mano con SQL. Su mitad de
Partner no está, porque no hay roles.

## Las 27

| ID | Área | Comprobación (sus palabras) | Estado en V2 |
| --- | --- | --- | --- |
| QA-01 | Schema | Las 21 tablas existen con nombres exactos. | **A medias.** V2 tiene 12 tablas `ios_*`, las de las partes acordadas. Las 9 que faltan son Portfolio, KPIs, DD Tracker, Valuation, Value Creation, Interactions, Shareholders, Tasks y Import Batches. |
| QA-02 | Schema | Cada campo del Field_Dictionary existe con su tipo. | **A medias.** Están los campos de las tablas en alcance. Hoy se han añadido `Website`, `Ownership Type` y `EBITDA Estimate €M` a Companies, que faltaban porque su `Seed_Companies` no los trae y sus fixtures sí. |
| QA-03 | Lists | Cada single select tiene exactamente las opciones del Vocabulary, misma escritura y mismo orden. | **Sí, y automatizado.** 29 listas comparadas opción por opción y en orden contra la hoja `Vocabulary`, incluido el guion largo de `A – Priority`. Corre en `npm test`, no a mano. Es la comprobación que en Airtable no se puede automatizar. |
| QA-04 | Links | Cada enlace del Relationship_Map existe y los de un solo registro están limitados a uno. | **A medias.** Las 7 relaciones en alcance son claves ajenas, cada una con su regla de borrado explícita (tesis e industria a NULL, documentos y perímetro en cascada, compañía del perímetro restringida). Una clave ajena limita a uno por definición. |
| QA-05 | Schema | No existe ninguna tabla Opportunity, Deals ni por etapa. | **Sí.** No existe. |
| QA-06 | Gates | Gate Ready? = No cuando el documento de la etapa no está Approved. | **Sí.** P2 está en PFR con el PFR In Review y P3 en Screening con el QSS Drafting: los dos con el gate cerrado. El panel no da un no seco, lista qué falta. Y un QSS `Superseded` no abre el gate: eso tiene su propio test. |
| QA-07 | Gates | Allowed for Gate? = No para una decisión no permitida en ese gate (por ejemplo Approve en Screening). | **Sí.** En P2, en el gate de PFR, el panel solo ofrece Build Investment Case, Reprice, Pass y Lost. `Approve` pertenece al gate de Final Investment Approval y la acción de servidor lo rechaza aunque se fuerce la petición. La rejilla completa de 9 etapas × 16 decisiones está en `npm test`, los 144 casos no permitidos incluidos. |
| QA-08 | Permissions | Un Analyst no puede crear una Gate Decision ni poner Document Status = Approved. | **No.** No hay roles. Hay una contraseña compartida y quien entra puede hacer todo. Es el hueco más grande de V2 y el que hay que cerrar primero si esto sigue adelante. |
| QA-09 | Automations | A02 crea el documento QSS y la tarea, pone Stage Entered Date y Company Status = Active Project. | **A medias.** Avanzar crea el entregable de la etapa siguiente en Not Started v1 y escribe `stage_entered_at`. No hay tareas porque no hay tabla de tareas. Company Status lo pone el cargador de fixtures, no una automatización. |
| QA-10 | Automations | A03 a A10 mueven exactamente una etapa, ponen Stage Entered Date y crean el documento siguiente. | **Sí.** P1 se recorre entero. La etapa solo puede ir al siguiente peldaño: el orden está en una tabla probada, no hay forma de saltarse una etapa porque no hay desplegable de etapa en ninguna pantalla. |
| QA-11 | Automations | A16 bloquea una decisión de Advance cuando Gate Ready = No y cuando Approved By no es Partner. | **La mitad del gate, sí. La de Partner, no.** Con el gate cerrado, el intento de Advance **se graba** como `Blocked` con el motivo, y no mueve nada: el intento rechazado es auditoría, no un error que desaparece. Está impedido en el panel, en la acción y en un CHECK de la base de datos. La condición de Partner necesita roles (QA-08). |
| QA-12 | Automations | A12 pone Passed, copia el motivo y crea una tarea de Data Quality cuando falta el motivo. | **A medias, y a propósito.** Pass pone `project_status = Passed`, guarda la etapa en la que murió y copia el motivo. Pero el motivo es obligatorio en el formulario, así que no hay nada que reclamar después. Preferimos impedir el dato que falta a crear una tarea para pedirlo. Si prefiere su versión, se cambia. |
| QA-13 | Automations | A13 pone Monitor + Review Date +90; A14 crea la tarea de revisión cuando vence. | **A medias.** Monitor pone `Monitor` y la fecha de revisión a 90 días. No hay tarea: "Mi trabajo" lista los próximos pasos vencidos, que hace el mismo trabajo sin tabla de tareas. P2 tiene la fecha ya pasada para que se vea. |
| QA-14 | Automations | A18 deja exactamente un caso de valoración Current por proyecto. | **No.** Valuation por casos está fuera de alcance. |
| QA-15 | Automations | A17 cuenta bien la previsualización de un fichero reimportado y no crea una segunda compañía al coincidir NIF o dominio. | **A medias desde el 21-oct.** V2 ya tiene el importador de SABI: no duplica, porque el nombre normalizado tiene índice único, y nunca sobrescribe un campo con un vacío, que es su regla. Lo que no tiene son sus contadores de previsualización antes de escribir, ni el cruce por NIF o dominio. P4 no se carga. |
| QA-16 | Automations | A07 crea 9 ítems de DD con Required en 4; A08 bloqueado mientras quede un Required abierto. | **A medias, con un muñón a la vista.** El gate de Full Due Diligence exige `open_required_dd_items = 0`, pero ese número lo teclea una persona porque no hay DD Tracker. Es un muñón visible, no oculto. |
| QA-17 | AI | Toda salida de IA entra con AI status Needs Review y ningún paso de IA pone Approved. | **No.** No hay agentes en V2. La columna `ai_enrichment_status` existe y vale `Not Run` en las 258 compañías. |
| QA-18 | Dashboards | El Partner Cockpit muestra decisiones pendientes, paradas y revisiones de monitor. | **Sí, en equivalente.** La pantalla "Mi trabajo" muestra cuatro listas derivadas: gates esperando decisión, documentos In Review, próximos pasos vencidos, y gates cerrados con lo que les falta en la columna de la derecha. No es su maquetación. Ninguna de las cuatro es un campo que alguien mantenga. |
| QA-19 | Migration | 258 compañías y 140 tesis importadas, 0 duplicados por Duplicate Key o Thesis Code, cada compañía con subsector, arquetipo y Origin Type. | **Sí, y medido.** 258 compañías, 140 tesis con 140 códigos distintos, 100 subsectores. De las 258: 258 con subsector, 258 con arquetipo, 258 con Origin Type, 258 con fuente. Los duplicados no son improbables, son imposibles: hay índice único en el nombre normalizado y en el código de tesis. |
| QA-20 | Data quality | Los valores financieros en blanco están en blanco, nunca 0; EBITDA Band muestra Unknown para los blancos. | **La primera mitad, sí. La etiqueta Band, no.** El EBITDA de P5 es NULL en la base de datos, no 0, y la pantalla dice "sin dato". Lo mismo con las 252 de 258 compañías cuyo `Revenue Estimate €M` viene vacío en su hoja. La etiqueta derivada `EBITDA Band` no está construida. |
| QA-21 | Build-up | Un proyecto Build-up con plataforma y dos add-ons muestra Company Count 3 y el EBITDA combinado de las filas no descartadas. | **A medias.** P6 tiene el perímetro de tres con sus roles (Platform, Add-on, Add-on) y sus estados. El EBITDA combinado no se calcula y Portfolio está fuera de alcance, así que la parte de A10 no se puede ver. |
| QA-22 | Project Builder | Crear un proyecto con Lead Company y dos Companies to Add da 3 filas de Project Companies y Company Status = Active Project en las tres. | **A medias.** El perímetro se añade compañía por compañía desde la pantalla del proyecto. No hay campo de staging "Companies to Add" ni automatización que ponga Company Status. |
| QA-23 | Ownership | Una interacción no se puede guardar sin proyecto; un documento sin proyecto, industria ni tesis muestra Scope = Unassigned. | **No.** No hay tabla de interacciones en alcance. |
| QA-24 | Theses | Gate Ready? = No en Screening mientras Primary Thesis esté vacío; Investment Theses.Open Projects cuenta el proyecto al ponerla. | **La primera mitad, sí. El contador, no.** P5 no tiene tesis y el panel lo dice con esas palabras. Esta condición no aparece en la nota de cabecera de su `Stage_Gates`: la sacamos de la fórmula `Projects.Gate Ready?` del `Field_Dictionary`, que es la que manda cuando las dos se contradicen. El contador de proyectos abiertos por tesis no está. |
| QA-25 | Value creation | Al cierre, A10 enlaza las iniciativas In Plan / Validated al registro de Portfolio. | **No.** Value Creation Initiatives está fuera de alcance. |
| QA-26 | Ownership | Companies.CEO Is Shareholder? = Yes / No / Unknown según la tabla de accionistas. | **No.** No hay tabla de accionistas. |
| QA-27 | SharePoint | A22 rellena SharePoint Folder URL o crea la tarea de respaldo. | **No.** Fuera de alcance. |

## Por qué falta lo que falta

Tres motivos distintos, no uno. Mezclarlos es lo que hace que una lista de huecos
parezca una lista de excusas.

**1. Lo acordamos dejar fuera.** Portfolio, KPIs, DD Tracker, Valuation por casos,
Value Creation Initiatives, el formulario externo de asesores, Financials por
periodo, los agentes de IA, la tabla de interacciones, la de accionistas y
SharePoint. Son 9 de sus 21 tablas. El criterio fue construir primero lo que es
difícil de garantizar en cualquier herramienta, y las reglas son eso: gates,
vocabulario, orden de etapas, enlaces, integridad de la carga. Esto es superficie
y se añade después.

**2. No existe la pieza, y es un hueco real, no una decisión.** Los **roles**. Hoy
hay una contraseña compartida y quien entra puede hacer todo. Por eso su QA-08 no
se puede pasar, y la mitad de su A16 (que apruebe un Partner) tampoco. Es lo
primero que hay que cerrar si esto sigue adelante.

**3. Lo hicimos distinto a propósito.** Donde su diseño crea una tarea para
reclamar un dato que falta, nosotros hacemos el dato obligatorio. Su A12 crea una
tarea de Data Quality si un Pass va sin motivo; aquí el formulario no deja guardar
sin motivo. Mejor impedirlo que reclamarlo. Si prefiere su versión, se cambia: es
una preferencia, no una limitación.

Y un muñón a la vista, dicho por su nombre en vez de taparse:
`open_required_dd_items` es un número que teclea una persona, porque el DD Tracker
está fuera de alcance. El gate de Full Due Diligence no abre hasta que marque 0.

## Lo que esta tabla dice de verdad

Las comprobaciones que V2 pasa enteras son casi todas reglas. Las que no pasa son
casi todas superficie. La superficie se añade. Una regla que no se puede
garantizar no se arregla añadiendo pantallas.
