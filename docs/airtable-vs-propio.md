# Airtable contra desarrollo propio

El correo de Ignasi del 20-oct pide elegir. Esto es el material para esa
conversación: todo a favor y todo en contra, con la evidencia de cada punto y sin
los argumentos que suenan bien pero no se sostienen.

Escrito el 21-oct, después de construir V2 (`/arpa/v2`) con su arquitectura y sus
datos reales.

## 0. La pregunta no es cuál es mejor

Las dos opciones funcionan. Lo que cambia es **qué fallo te puedes permitir**.

- Si el fallo que no te puedes permitir es **un embudo cuyos números no
  significan nada**, Airtable no lo arregla, porque la etapa siempre se puede
  editar a mano. Ese es el fallo del que se queja la primera página de su propio
  documento.
- Si el fallo que no te puedes permitir es **depender de una sola persona para
  cambiar un campo**, el desarrollo propio no lo arregla, y Airtable sí.

Todo lo demás es secundario. Conviene plantearlo así desde el principio, porque
una comparación "feature por feature" la gana Airtable casi siempre y no es la
comparación relevante.

## 1. A favor del desarrollo propio

### 1.1 El gate no se puede garantizar en Airtable. Es el corazón de su diseño

Su automatización A16 dice: no se puede registrar un avance si `Gate Ready?` es
No, y quien aprueba tiene que ser Partner. En Airtable eso solo puede vivir en
tres sitios, y los tres son la capa de interfaz:

- una **fórmula** `Gate Ready?`, que calcula pero no impide nada
- una **automatización**, que corre *después* del cambio y como mucho lo revierte
- **permisos de campo** (planes altos), que dicen quién edita un campo, no qué
  relación tiene que cumplirse entre dos campos

Ninguno de los tres puede expresar la regla real, que es temporal: *la etapa solo
puede cambiar si el gate estaba abierto en ese instante*. Cualquiera con permiso
de edición sobre `Projects` cambia `Stage` y la automatización llega tarde.

En V2 eso es una restricción de la base de datos:

```sql
check (decision_type <> 'Advance' or status <> 'Approved'
       or gate_ready_at_decision)
```

Probado a propósito el 21-oct: un `insert` escrito a mano, saltándose toda la
aplicación, falla con `ios_gate_decisions_advance_needs_ready`. Y no existe
ningún camino que escriba `stage`: `app/v2/actions.ts` no exporta `setStage`, y
el único escritor es la función `ios_record_gate_decision`.

**Esto es el argumento fuerte, y es el único que Airtable no puede igualar a
ningún precio.** Si este punto no les importa, la conversación se inclina hacia
Airtable.

### 1.2 Sus fórmulas no se pueden testear, y una ya estaba mal

El tier A/B/C de los 100 subsectores sale de `Σ(rating × peso)`. Casa 100 de 100
con su columna `Check:`, pero solo si se **redondea a 2 decimales antes de
comparar**. `Electrical equipment / switchgear / transformers` suma
3,7499999999999996, así que un `>= 3,75` crudo da B donde ellos dicen A.

En V2 hay un test con ese número en el nombre, y corre en 0,4 segundos sobre las
100 filas contra su propio oráculo. Cuando llegue el v10, el test dice si algo se
movió. En Airtable esa fórmula se compara a ojo, fila por fila, y un error de
redondeo en el criterio de priorización de sectores es invisible hasta que
alguien audita.

### 1.3 La carga de datos no pierde filas en silencio

Sus propias QA-15 y QA-20 se preocupan exactamente de esto: que un reimport no
duplique, que no vacíe un campo lleno, y que un blanco no se convierta en 0.

- `Revenue Estimate €M` solo es numérico en **6 de 258** filas. Las otras 252
  tienen que ser NULL, nunca 0. Un 0 contamina cualquier media y cualquier
  filtro de banda de EBITDA.
- `scripts/ios-seed.ts` **no tira ninguna fila en silencio**: toda unión fallida,
  valor fuera de vocabulario o celda obligatoria vacía escribe
  `{sheet, row_no, reason, payload}` en `ios_seed_rejects`, hace rollback de todo
  y sale con código distinto de 0. Hoy esa tabla queda vacía porque las cinco
  uniones casan al 100 %. Está para el siguiente Excel.
- Es idempotente: corrido dos veces seguidas deja 100 / 140 / 486 / 173 / 22 /
  258 y 0 rechazos las dos veces.

La importación CSV de Airtable no da nada de esto. Duplica, deja blancos y
avisa poco.

### 1.4 El SABI lo tenemos que parsear igualmente

Su trabajo diario entra por exportaciones de SABI en `.xls`. Airtable no las
puede leer: necesita una capa intermedia que las convierta. Esa capa ya existe en
V1, y nos costó tres bugs reales encontrarla (el parser leía los años al revés en
una exportación de una sola empresa, y una exportación venía con *cuentas
consolidadas*, así que 56 M€ de ventas y 8,3 M€ de EBITDA eran de tres empresas,
no del objetivo).

Con Airtable se paga Airtable **y** se mantiene esa capa. El trozo difícil no
desaparece, solo cambia de sitio.

### 1.5 Coste, por forma y no por cifra

No pongo números de Airtable aquí porque cambian; hay que mirarlos el día de la
decisión. Lo que importa es la forma:

- **Airtable**: por usuario y por mes, para siempre, y sube por asientos, por
  registros por base y por ejecuciones de automatización. Un equipo que crece es
  una factura que crece.
- **Propio**: coste de construcción una vez, más alojamiento fijo y bajo (Vercel
  y Supabase, hoy en tramos pequeños). 258 compañías es nada para Postgres; un
  volcado de SABI de 10.000 filas también.

A tres años, con 5 a 8 personas y un plan Business, la comparación no está
cerrada: hay que hacerla con los precios del día. Pero el límite de registros por
base es un riesgo real en Airtable si la long list crece como pretende su propio
documento.

### 1.6 Los datos son suyos y salen

Están en Postgres estándar, con exportación a CSV y a Excel de seis hojas por
proyecto ya construida. Airtable exporta CSV y se queda con el esquema, las
interfaces y las automatizaciones: salir de ahí dentro de dos años es
reconstruirlo.

### 1.7 Un cambio queda explicado, no solo hecho

Cada cambio de esquema es una migración en git con una cabecera que dice por qué.
En Airtable, cualquiera con permiso de creador renombra un campo en 10 segundos y
rompe tres fórmulas sin que quede dicho quién ni por qué. Con 583 campos, eso
pasa.

### 1.8 La IA ya está dentro del stack

Sus 11 agentes necesitan un modelo con contexto del dominio. Nosotros ya
ejecutamos Claude en el stack para el parseo de SABI. En Airtable se hace con
Airtable AI (limitado) o con scripts que llaman fuera, con el límite de 30
segundos por ejecución.

### 1.9 Su propia regla de IA es más fácil de garantizar aquí

Su regla dura es: *la IA nunca pone un documento en Approved ni registra una
decisión de gate*. En V2 eso es lo mismo que el punto 1.1: una restricción, no
una convención. En Airtable es una norma de equipo.

## 2. A favor de Airtable (los puntos en contra de lo propio)

Estos son reales y no hay que esconderlos. Si los escondemos y aparecen en la
segunda reunión, perdemos la credibilidad de todo el apartado 1.

### 2.1 Ignasi no puede cambiar nada sin nosotros. Este es el punto grande

En Airtable él añade un campo, cambia una lista o monta una vista en minutos, sin
pedir permiso a nadie. En V2 cada cambio pasa por nosotros: migración, deploy,
tiempo de espera. Es una dependencia permanente de una persona externa, y es la
objeción más legítima que tienen. No tiene respuesta técnica, solo contractual.

### 2.2 Su v9 es grande y hemos construido una parte

21 tablas, 583 campos, 33 pantallas, 22 automatizaciones, 11 agentes, 5 roles.
V2 cubre la librería completa, el pipeline, los gates y el log de decisiones. Lo
que falta son semanas: Portfolio, KPIs, DD Tracker, valoración por casos,
iniciativas de creación de valor, permisos, el formulario externo de asesores,
Financials por periodo y los agentes. Airtable cubriría ese ancho mucho antes,
porque genera interfaces a partir de las tablas.

### 2.3 Cosas que Airtable da gratis y nosotros no tenemos

- permisos por rol de verdad (hoy V1 y V2 comparten **una cookie de sesión**)
- historial de cambios **celda a celda**, con quién y cuándo
- comentarios por registro, con menciones y notificaciones
- **adjuntos**: sus QSS, OM y LOI son ficheros; nosotros guardamos una URL
- formularios externos (su formulario de asesores de DD es una hoja de su v9)
- app móvil
- vistas calendario, Gantt, agrupadas y pivotadas, y vistas personales
- resúmenes por correo y conectores con Slack y Outlook
- copias de seguridad y restauración desde la interfaz, con un clic

### 2.4 No hay roles, y A16 los pide

Su A16 exige que quien aprueba sea Partner. No hay roles en el alcance, así que
`decided_by` es texto libre y queda un `// TODO(roles)` en `lib/ios/gates.ts`.
Es una carencia de seguridad hoy, y es honesto decirla antes de que la
encuentren con su fixture P2, que la prueba explícitamente.

### 2.5 Hay muñones visibles

`open_required_dd_items` es un entero que teclea una persona, porque el DD
Tracker está fuera de alcance. El gate de Full DD no abre hasta que marque 0. Es
un muñón a la vista, no oculto, pero es un muñón.

### 2.6 Riesgo de autobús

Si dejamos el proyecto, ARPA se queda con una aplicación Next.js que nadie en la
firma sabe mantener. Su plan B declarado (Airtable más un freelance) es razonable
precisamente porque hay muchos freelances de Airtable y pocos que recojan el
código de otro. Esto hay que reconocerlo y responderlo con documentación y con un
traspaso, no negándolo.

### 2.7 Tiempo hasta algo usable

Una persona monta sus 21 tablas y carga los datos en Airtable en días, con
interfaces generadas. Cada pantalla nuestra se diseña. En V2 se ve: la librería
está completa y el pipeline funciona, pero el ancho no está.

### 2.8 Nadie ha probado una restauración

Supabase hace copias, pero no hemos restaurado ninguna. Hasta que se pruebe, no
es una copia de seguridad, es una creencia.

## 3. El experimento que decide, y lo escribió él

El workbook trae dos hojas que son literalmente su examen de aceptación:

- `Seed_Fixtures`: 6 fixtures (P1 a P6) con cifras y resultado esperado escrito
- `QA_Checklist`: 27 comprobaciones, cada una apuntando a su fixture

La forma justa de comparar no es discutir, es cargar P1 a P6 en las dos opciones
y pasar las 27.

Hecho. Los fixtures están cargados en V2 y el estado real de las 27, medido y no
estimado, está en **`docs/qa-v9.md`**, una fila por comprobación y con sus
palabras en la columna de la izquierda. El resumen:

- **8 se pasan hoy enteras**: QA-03, 05, 06, 07, 10, 18, 19, 24.
- **11 están a medias**, con la parte que falta dicha por su nombre.
- **8 no se pueden pasar** porque dependen de algo que acordamos dejar fuera.

Lo que esa tabla deja ver es que las que se pasan son casi todas reglas (gates,
vocabulario, orden de etapas, enlaces, recuentos de la carga) y las que no son
casi todas superficie (más tablas, roles, tareas, SharePoint, agentes). La
superficie se añade. Una regla que no se puede garantizar no se arregla añadiendo
pantallas.

Decirlo así, con su propia numeración y sus propios datos, vale más que cualquier
argumento del apartado 1.

## 4. Recomendación

Desarrollo propio, **si aceptan dos condiciones**. Sin ellas, Airtable es la
elección correcta y hay que decirlo.

1. **Autenticación y roles entran ya**, no al final. Su A16 depende de ellos y
   hoy es el agujero del sistema.
2. **Disciplina de alcance**: no se construyen las 33 pantallas. Se construye lo
   que no se puede comprar (gates, scoring, SABI, el embudo derivado) y se deja
   fuera lo que es un formulario más.

Y hay una tercera opción que conviene poner sobre la mesa, aunque no la
recomiendo: **híbrido**, Airtable para el día a día y lo propio para el motor. No
la recomiendo porque dos sistemas significan dos verdades, y la primera vez que
no coincidan nadie volverá a confiar en ninguno de los dos.

## 5. Lo que NO hay que decirle

Argumentos que suenan bien y se caen al primer empujón. Usarlos cuesta
credibilidad en el resto:

- **"es más rápido"**. No lo hemos medido contra Airtable y no es verdad en
  tiempo de construcción.
- **"es más bonito"**. Es gusto, y las interfaces de Airtable están bien.
- **"Airtable no escala"**. Escala de sobra para 258 compañías. El límite real es
  por registros y por plan, y hay que mirarlo, no afirmarlo.
- **"sin dependencias de terceros"**. Dependemos de Vercel, de Supabase, de
  Anthropic y de Deepgram. Cambiamos un proveedor por cuatro.
- **"a medida es siempre mejor"**. No lo es. Es mejor cuando hay una regla que la
  herramienta no puede garantizar. Aquí la hay, y es el gate. Ese es el
  argumento, y es suficiente: no hace falta inflarlo.
