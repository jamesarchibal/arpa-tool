# Respuesta a Ignasi: borrador

Contra su correo del 20-oct-2026, 20:04 (cc Marc Palà, Eduard Artau), asunto
"ARPA IOS_ Arquitectura i requeriments funcionals".

Su pregunta real era una sola: **Airtable o desarrollo propio.** Todo lo demás del
correo es el diseño. El borrador contesta eso primero y deja lo demás detrás.

**El borrador largo de abajo NO es el que James eligió.** Decidió no contestar la
pregunta por correo y emplazar a una reunión, por dos razones buenas: las cuatro
peticiones solo importan si ya han decidido, y quien escribe "desarrollo propio" por
correo es el que cobra por construirlo, así que pesa más dicho en persona. El correo
corto va en el hilo; esto se queda como el guion de lo que hay que defender EN la
reunión, que es donde se gasta el argumento del gate.

Tres cosas antes de enviar:

1. Él escribe en catalán. El borrador está en castellano porque el resto de la
   documentación lo está. Si el hilo va en catalán, se traduce antes de enviar.
2. No prometas fechas. No hay ninguna estimada en este borrador, a propósito.
3. Adjunta `qa-v9.md` y `airtable-vs-propio.md`, y pon el enlace a
   `joblanders.ai/arpa/v2`. El argumento es la tabla de las 27, no el correo.

---

## Borrador

Asunto: **Airtable o desarrollo propio: respuesta con tus 27 comprobaciones pasadas**

Ignasi,

Respondo a tu pregunta directamente: **desarrollo propio**, y con dos condiciones que
pongo yo mismo, porque sin ellas la respuesta correcta es Airtable.

Antes del argumento, el dato. En vez de opinar, hemos cargado tus 6 fixtures
(`Seed_Fixtures`, P1 a P6) y hemos pasado tus 27 comprobaciones del `QA_Checklist`.
Estado medido, no estimado:

- **8 se pasan hoy enteras**: QA-03, 05, 06, 07, 10, 18, 19, 24.
- **12 están a medias**, y en la pantalla digo de cada una qué mitad falta.
- **7 no se pasan** porque dependen de algo que dejamos fuera de alcance a propósito.

Lo que esa tabla deja ver importa más que el recuento: **las que se pasan son casi
todas reglas** (los gates, el vocabulario, el orden de las etapas, los enlaces, la
integridad de la carga) y **las que no son casi todas superficie** (más tablas, roles,
tareas, SharePoint, agentes). La superficie se añade después. Una regla que la
herramienta no puede garantizar no se arregla añadiendo pantallas.

Y de ahí sale el único argumento que hace falta: **tu gate.** Tu A16 dice que una
decisión de Advance se bloquea si `Gate Ready? = No`. En lo que te enseño, ese bloqueo
está en tres sitios a la vez: el panel no ofrece el botón, el servidor rechaza la
petición aunque la fuerces, y hay una restricción en la base de datos que impide
escribir la fila incluso a mano con SQL. Además, **el intento rechazado se graba** con
el motivo, porque una decisión que alguien intentó tomar y el sistema paró es
exactamente la fila que querrás leer dentro de seis meses. En Airtable eso es una
automatización que se puede desactivar, y la fila que entra por la API no la ve.

También está cargado tu contenido real: 100 subsectores con tus 8 criterios y tus
umbrales de tier (A ≥ 3,75, B ≥ 3,25), 140 tesis con sus 486 parejas tesis-subsector,
173 arquetipos con CNAE y palabras de búsqueda de SABI, 22 fuentes y las 258
compañías de long list. Las 29 listas de `Vocabulary` se comparan opción por opción y
en orden en cada ejecución de los tests.

**Las dos condiciones.**

1. **Autenticación y roles entran ya, no al final.** Hoy hay una contraseña compartida
   y quien entra puede hacer todo. Por eso tu QA-08 no se pasa, y la mitad de tu A16
   (que el que aprueba sea Partner) tampoco. Es el agujero del sistema y lo digo yo
   antes de que lo encuentres tú. Se cierra con login de Microsoft y el rol aplicado
   en el gate.
2. **Disciplina de alcance.** No se construyen las 33 pantallas. Se construye lo que no
   se puede comprar y se deja fuera lo que es un formulario más.

Sobre eso segundo, una observación concreta de tu documento: **tus S13 Pipeline board,
S14 Stage queues y S18 Projects son tres pantallas para una sola lista con tres
filtros.** Lo hemos montado así, con un selector de vista, y la descarga a CSV usa el
mismo filtro que la pantalla, de forma que el fichero nunca puede traer más filas de
las que pediste. Es el tipo de recorte que mantiene esto barato de mantener.

Y una cosa que encontré en tu propio diseño y que conviene mirar: en la importación en
lote (S09, A17) escribes que *"para Excel de SABI la lectura, el mapeo y la vista previa
los hace el Company Import Agent (Claude Code / Cowork por la API de Airtable)"*. O
sea que en tu diseño hace falta un segundo producto para cargar la fuente principal de
originación. Aquí es un botón: se lee el Excel de SABI en el navegador, se mapea, se
convierte a millones, y **nunca se sobrescribe un campo con un vacío**, que es tu
propia regla A17. Está probado con dos exports reales de SABI.

**Lo que necesito de ti**, por orden:

1. **D03**, la tabla de Gate Decisions. Es la primera de tus 7 ámbar y la única que
   cambia código. Las demás (D09, D18, D22, D29, D32, D33) cambian datos u operación.
2. Las **140 tesis entran todas como Proposed**: ¿quién las valida y cuándo? Una
   biblioteca de 140 sin validar es un desplegable de 140 opciones.
3. **SharePoint y el correo de Microsoft**: ¿tenant vuestro, y nos dais acceso? Y
   **Jamie**: ¿está contratado o es un deseo? En tu diseño es el sitio donde viven los
   ficheros, así que no es un extra.
4. Confirmar que **nuestro `sector` / `category` / `subsector` se renombra a
   `industry` / `sector` / `subsector`** para hablar tu idioma. Es mecánico y evita
   tres meses de malentendidos.

Las 27 comprobaciones están una por una, con tus palabras en la columna de la izquierda
y un enlace al caso de prueba que demuestra cada una, en joblanders.ai/arpa/v2/qa. No es
un adjunto: entras, lees la fila, haces clic y lo ves pasar o fallar.

Un abrazo,
James

---

## Lo que el borrador deja fuera a propósito

- **Fechas.** No hay ninguna. En cuanto das una, la conversación pasa a ser sobre la
  fecha.
- **"Es más rápido", "es más bonito", "Airtable no escala", "sin dependencias de
  terceros", "a medida es siempre mejor".** Los cinco se caen al primer empujón y están
  descartados en `airtable-vs-propio.md:254`. El gate es suficiente.
- **La opción híbrida.** Está en el análisis por honestidad, pero no en el correo. Dos
  sistemas son dos verdades, y la primera vez que no coincidan nadie volverá a confiar
  en ninguno de los dos. Si la saca él, hay que contestarla; ofrecerla es regalarle una
  salida peor.
- **La palabra "acordamos".** En el borrador pone "dejamos fuera de alcance a
  propósito", que es nuestra decisión y no una petición suya que podamos atribuirle.
