# IOS v9 contra lo que tenemos

Fuente: correo de Ignasi Masia del 20-oct-2026, 20:04 (cc Marc Palà, Eduard Artau),
asunto "ARPA IOS_ Arquitectura i requeriments funcionals". Adjuntos leídos:

- `ARPA_IOS_v9_Arquitectura_e_Interfaces.pdf` (47 páginas, 33 pantallas, 5 roles)
- `PE_Airtable_Projects_Build_Workbook_v9.xlsx` (27 hojas, 21 tablas, 583 campos)
- `INTERFACES.md`, el deck `.pptx` y un prototipo de UX como artifact de Claude

Lo importante del correo no es el diseño, es la pregunta: **"podem decidir si optem
per un desenvolupament propi o si partim d'alguna de les plataformes ja existents
(el disseny actual està plantejat per poder desenvolupar-lo sobre Airtable)"**.
Nos están pidiendo decidir Airtable contra desarrollo propio. Nuestra herramienta es
la prueba a favor del desarrollo propio, así que lo que construyamos ahora es el
argumento, no una demo más.

Segunda cosa del correo, fácil de pasar por alto: el IOS tiene que estar conectado a
**SharePoint y al correo de Microsoft**, y a **Jamie** (o similar) para las notas de
reuniones. Eso no es un extra, es el sitio donde viven los ficheros en su diseño.

## 1. Lo que ya coincide, y no hay que tocar

Esto es la mejor noticia del documento. El motor que ya tenemos es el suyo.

| Cosa | Estado |
| --- | --- |
| Las 9 etapas del embudo, con sus nombres exactos | `lib/arpa/lists.ts:STAGES` las tiene todas, verbatim, más `Sourcing` delante y `Closed` al final |
| QSS: 6 criterios, pesos 10/20/15/15/20/20 | idéntico en `lib/arpa/scoring.ts:MODELS` |
| OM: 5 criterios al 20 % | idéntico |
| PFR: 5 criterios, 30/20/20/15/15 | idéntico |
| Puntuación 0-100 = Σ(rating × peso)/5 | idéntico, incluido "en blanco hasta que todos los criterios están puntuados" |
| Kill criteria por etapa | nuestros 13 `KILLS` son los suyos |
| Mandato: España, 1-5 M€ EBITDA, Agribusiness + Industrial Products, fundador/familia | idéntico |
| Mandato separado del atractivo (su D12) | ya lo hacemos así |
| La compañía solo guarda datos descriptivos, el proyecto toda la actividad (su D38) | nuestro modelo es ese |
| Un proyecto con varias compañías vía tabla puente (su D36) | `arpa_project_companies`, escrito desde el 21-oct |
| El proyecto tiene nombre propio | hecho el 21-oct |
| Tres niveles Industry › Sector › Subsector | `arpa_taxonomy` ya los tiene, con los nombres corridos una posición: nuestro `sector` es su Industry y nuestro `category` es su Sector |

No hay que rehacer el scoring ni el embudo. Eso es semanas que no gastamos.

## 2. Los huecos, ordenados por cuánto cambian el producto

### 2.1 La etapa solo debe cambiar con una decisión de gate aprobada

Es la diferencia de comportamiento más grande, no de datos. En su diseño:

- Hay una tabla `Gate Decisions`, una fila por decisión, con decisión, tipo,
  justificación, evidencias, disenso, condiciones, quién aprueba y cuándo.
- `Gate Ready?` solo es Sí si el entregable de la etapa está **Approved** y hay
  **Next Step**. En el gate de LOI además `LOI Status = Accepted`, en el de DD
  `Open Required DD Items = 0`, en Closing `Closing Status = Closed`.
- El kanban **no se puede arrastrar**. Las automatizaciones A03-A10 mueven la etapa, y
  A16 bloquea la decisión si falta un requisito.
- Hay 16 nombres de decisión exactos y una lista cerrada de decisiones permitidas por
  gate (hoja `Stage_Gates`).

Nosotros tenemos un desplegable (`app/_stage-select.tsx`) que mueve la etapa a donde
quieras, sin pedir nada y sin dejar rastro. Esto hay que cambiarlo: es la pieza que
convierte la herramienta en el sistema de control que ellos describen. Ya estaba
anotado como A5 **pendiente** en `decisiones.md`; ahora tenemos la especificación
completa para hacerlo.

Ojo: su **D03** (precisamente esta tabla) es una de las 7 decisiones ámbar que
esperan confirmación de Ignasi. Es la primera que hay que cerrar.

### 2.2 Temática no es lo mismo que tesis de inversión

Esto desbloquea lo que llevaba tres semanas bloqueado.

Tenemos `arpa_themes` con 3 filas inventadas para la demo. Ellos tienen
`Investment Theses`: **140 tesis reales**, en la hoja `Seed_Theses`, con código
(`ARPA-TH-001`), alcance, categoría, driver estructural, estrategia principal (13
posibles), descripción, palancas de creación de valor, perfil objetivo ideal, riesgos
de screening, prioridad, estado (Proposed → Validated → Active) y encaje de mandato.

Y la relación es más rica que la nuestra:

- Tesis ↔ Subsectores es **N:N**.
- En el proyecto hay una **Primary Thesis** y varias **Related Theses**.
- Un Partner valida la tesis. La biblioteca entra entera como Proposed.

Nosotros tenemos un `theme_id` suelto en el proyecto. Cambio: renombrar temática a
tesis, cargar las 140, añadir la N:N con el subsector y separar principal de
relacionadas.

### 2.3 El subsector tiene 100 filas y 8 criterios, no 21 filas y tres letras

`Seed_Industries` trae los **100 subsectores** con su scoring real: Market Growth
15 %, Fragmentation / Add-ons 15 %, Target Density 15 %, Margin Profile 15 %,
Recurring / Resilient Revenue 10 %, Barriers / Differentiation 10 %, Succession /
Founder Exit 10 %, Risk (5 = bajo) 10 %. De ahí sale un Weighted Score 1-5 y el tier:
**A ≥ 3,75, B ≥ 3,25, el resto C**. Trae además riesgos clave, clusters españoles y
la tesis de inversión asociada.

Nosotros tenemos 21 filas con `growth`/`fragmentation`/`consolidation` en H/M/L y un
`pre_score` 0-100 que nos inventamos a partir de esas letras. Eso era exactamente lo
que `decisiones.md` marcaba como bloqueado. Ya no lo está: hay que cargar las 100 con
sus 8 criterios y calcular tier y score con su fórmula, no con la nuestra.

### 2.4 Falta la tabla que hace el sourcing: Target Archetypes

`Seed_Archetypes`: **173 arquetipos** de compañía objetivo, uno a varios por
subsector tier A/B, cada uno con qué hace y a quién vende, modelo de ingresos, margen
EBITDA típico, papel (Platform / Add-on), **código CNAE-2009** y **palabras clave de
búsqueda en SABI en español**.

Esto es el motor de originación proactiva, y no lo tenemos. Tenemos `cnae_codes` y
`keywords` como columnas de `arpa_taxonomy`, rellenadas en 1 de 21 filas, lo cual ya
estaba anotado como deuda en `prueba-sabi-real.md`. Su modelo pone esos datos un nivel
más abajo, en el arquetipo, que es donde tienen sentido: un subsector tiene varios
modelos de negocio y cada uno se busca distinto.

### 2.5 Los documentos tienen un estado y ese estado abre el gate

`Documents.Document Status` es autoritativo: Not Started, Drafting, In Review,
Approved, Rejected, Superseded. El proyecto lee QSS/OM/PFR/IC/DD Summary/FIM Status
como lookup, y el gate exige Approved. Hay 54 plantillas en `Document_Templates`.

Nuestro `arpa_documents` no tiene estado ninguno: title, doc_type, ruta, periodo. Sin
estado no hay gate posible, así que esto va junto con 2.1.

### 2.6 Financials por compañía, periodo y base

Ellos tienen una tabla `Financials` con una fila por compañía, periodo y **Basis**.
Nosotros guardamos tres años de ingresos y EBITDA como columnas del proyecto.

Esto importa porque ya nos mordió: el export real de SABI venía con **cuentas
consolidadas** del grupo y medimos el mandato de 1-5 M€ contra un EBITDA que no era
del target (anotado como A10 en `decisiones.md`). Lo parcheamos metiendo la base en
el texto de `financials_src`. Su campo `Basis` es ese arreglo, bien hecho.

### 2.7 Valoración por casos, y el caso Current manda

`Valuation`: un registro por caso (Initial, PFR, LOI, IC, Final), y el caso **Current
aprobado** es la fuente de verdad de las cifras del deal (su D10). Un Partner aprueba
el caso. Nosotros tenemos las columnas de dinero directamente en el proyecto, o sea
un único caso implícito y sin aprobación.

### 2.8 Lo que no existe en nuestro lado, en una lista

| Tabla suya | Para qué | Tenemos |
| --- | --- | --- |
| `Gate Decisions` | auditoría de decisiones, mueve la etapa | nada |
| `Value Creation Initiatives` | plan de valor que crece por etapa y pasa a cartera | nada |
| `Valuation` | casos de valoración | columnas en el proyecto |
| `DD Tracker` | due diligence por workstream, con hallazgos de asesores | nada |
| `Portfolio` + `KPIs` | post-cierre, KPIs mensuales | nada |
| `Target Archetypes` | CNAE + keywords SABI | 2 columnas en taxonomy |
| `Financials` | por compañía, periodo y base | columnas en el proyecto |
| `Import Batches` | fichero, mapeo, vista previa, errores | `intake_batch` como texto |
| `Sources` | fuentes con tipo, URL y confianza | `source` como texto libre |
| `Users` | 5 roles y permisos por interfaz | una cookie de sesión compartida |

`Seed_Sources` trae 22 fuentes reales (contadas con SheetJS el 21-oct; la versión
anterior de esta nota decía 24 y era un recuento a ojo) y `Seed_Companies` **258 compañías** de long
list con provincia, subsector, arquetipo, estimación de ingresos, fuente y confianza.
Eso es un dataset de demo de verdad, en vez de nuestras 2 filas.

### 2.9 La navegación es otra

Suya: Home (My Work) · Industries · Investment Theses · Sourcing · Pipeline · Deal
Execution · Portfolio · Insights · Admin, en el orden del proceso.

Nuestra: Originación · Proyectos · Contactos · Ajustes.

Dos cosas concretas de ahí:

- **Cada usuario entra en My Work (S01)**: sus tareas, sus proyectos, y una bandeja
  "esperando por mí" con los borradores de IA, documentos, importaciones y decisiones.
  No tenemos página personal.
- El proyecto es **un workspace de 8 pestañas** (Overview, Thesis & value creation,
  Perimeter, Activity, Documents, Financials & valuation, DD, Decisions & history).
  Nosotros tenemos 4 (Datos, Scoring, Personas, Documentos).

Nota a favor nuestro: ellos separan Pipeline y Deal Execution como dos interfaces y
dicen literalmente "son dos vistas del mismo registro Projects". Nosotros ya las
fusionamos en una pestaña con tres vistas el 21-oct, que es la misma conclusión
llevada un paso más allá.

### 2.10 La IA propone y una persona aprueba

11 agentes en `AI_Agents`. Regla dura: todo borrador de IA aparece en "esperando por
mí" hasta que alguien lo acepta, y **la IA nunca pone un documento en Approved ni
registra una decisión de gate**. Cada salida tiene AI Output Status y Reviewed By.

Nosotros no tenemos agentes todavía. Cuando los metamos, esta regla hay que meterla
con ellos, no después.

## 3. Qué cambiaría, en orden

1. **Cerrar las 7 decisiones ámbar con Ignasi** antes de construir nada grande. Son
   D03 (tabla de Gate Decisions), D09 (banda de EBITDA), D18 (arquetipos y long
   list), D22 (motor de IA), D29 (entornos DEV/PROD), D32 (volúmenes del embudo) y
   D33 (encaje de modelo de negocio). D03 y D33 cambian código; las otras cambian
   datos o operación.
2. **Cargar su contenido real**, que es gratis y es lo que estaba bloqueado: 100
   subsectores con los 8 criterios y el tier, 140 tesis, 173 arquetipos, 22 fuentes y
   258 compañías de long list. Esto solo ya convierte la demo en algo que reconocen.
3. **Gate Decisions + estado de documento**, y quitar el desplegable de etapa. Es la
   pieza que les demuestra que entendimos el proceso, no solo la pantalla.
4. **Renombrar temática a tesis** y partir en Primary y Related, con la N:N al
   subsector.
5. **Target Archetypes** como tabla, y mover ahí CNAE y keywords. Con eso el
   importador de SABI puede proponer el arquetipo, no solo el subsector.
6. **Financials por periodo y base**, que además cierra la deuda A10.
7. **My Work** como página de entrada.
8. Luego, y solo luego: Valuation por casos, DD Tracker, Value Creation Initiatives,
   Portfolio y KPIs, Insights.

## 4. Qué no construiría ahora

- **Portfolio y KPIs.** No hay ninguna participada. Es la última etapa del embudo y
  no demuestra nada que no demuestre el resto.
- **El formulario externo de asesores de DD (S33).** Depende de tener DD Tracker y de
  un asesor real al otro lado.
- **Permisos por interfaz y 5 roles.** Hace falta antes de que lo usen de verdad, no
  antes de que lo decidan. Mientras sean tres personas en una demo, es coste sin
  señal.
- **Las 33 pantallas.** Varias son vistas de los mismos datos con otro filtro, que es
  justo el error que ya corregimos dos veces aquí (A11 y A13 en `decisiones.md`).
  Conviene decírselo: su S13 Pipeline board, S14 Stage queues y S18 Projects son tres
  pantallas para una sola lista con tres filtros.

## 5. Lo que hay que preguntarle

1. Airtable o desarrollo propio. Es su pregunta y hay que contestarla con un
   argumento, no con una opinión. Lo que tenemos ya hace el scoring, el embudo y la
   importación de SABI, y eso en Airtable es un agente externo llamado por API.
2. Las 7 ámbar, empezando por D03.
3. Si las 140 tesis entran todas como Proposed, quién las valida y cuándo. Una
   biblioteca de 140 sin validar es un desplegable de 140 opciones.
4. SharePoint y correo de Microsoft: ¿tenant propio, y nos dan acceso? Y Jamie: ¿ya
   lo tienen contratado o es un deseo?
5. Confirmar que nuestro `sector`/`category`/`subsector` se renombra a
   `industry`/`sector`/`subsector` para hablar su idioma. Es mecánico y evita tres
   meses de malentendidos.
