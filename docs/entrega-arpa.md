# Entrega: qué hace falta para que ARPA lo opere en su casa

Esto es el detalle técnico de los ocho pasos que la pantalla `/arpa/v2` resume en su
pestaña **Docs**. La pantalla es para quien va a usar la herramienta; este fichero es para
quien va a montarla, incluido su IT.

Punto de partida de hoy: la aplicación corre en nuestra cuenta de Vercel, con la base de
datos en nuestro Supabase (región `eu-west-1`) y un login por cookie compartida. Sirve
para enseñarla y para medirla. No sirve para que entren siete personas de ARPA con su
identidad y sus permisos.

El orden importa. Los pasos 1 y 2 van primero porque desbloquean la única regla del v9
que hoy no podemos cumplir.

---

## 1. Login con Microsoft (Entra ID)

**Por qué primero.** No es solo comodidad de acceso. Entra ID es lo que trae el rol de
cada persona, y el rol es la pieza que falta para cerrar su automatización A16 ("quien
aprueba un gate tiene que ser Partner") y su comprobación QA-08. Hoy el campo
`ios_gate_decisions.decided_by` es texto libre, y eso está marcado con un
`// TODO(roles)` en `lib/ios/gates.ts:215`.

**Qué hay que pedirle a su IT.**

- Una *app registration* en el tenant de ARPA, con:
  - *Redirect URI* de tipo Web: `https://<dominio>/arpa/api/auth/callback/microsoft`.
  - Permisos delegados mínimos: `openid`, `profile`, `email`, `User.Read`.
  - Un *client secret* (o mejor, un certificado) y su caducidad apuntada en el calendario.
- Los IDs: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.
- Decidir si el acceso se limita a un grupo de seguridad (recomendado) o a todo el tenant.
- Tres *app roles* en la misma app registration: `partner`, `associate`, `analyst`.
  Es la forma de que el rol viaje firmado en el token en vez de mantenerse en una tabla
  nuestra que alguien tendrá que sincronizar a mano.

**Qué hay que cambiar en el código.**

- `lib/auth.ts` deja de validar una cookie propia y pasa a validar la sesión OIDC.
  El resto de la aplicación no se entera: sigue preguntando "quién es el usuario".
- `middleware.ts` no cambia de matcher, solo de verificación.
- Tabla nueva `ios_users` con `email`, `display_name`, `role` y `active`, poblada en el
  primer login. Hace falta para poder asignar un responsable a alguien que todavía no ha
  entrado nunca.

**Cómo se comprueba que está hecho.** Entrar con dos cuentas distintas y ver dos nombres
distintos en la cabecera, y que una cuenta fuera del grupo recibe un 403 y no un 200 de
la pantalla de login.

---

## 2. Aplicar el rol al gate

Con el paso 1 hecho, esto es poco trabajo y cierra la mitad que falta de A16.

- `recordGateDecision` en `app/v2/actions.ts` añade una guarda antes de las que ya tiene:
  si `decisionType(dec) === 'Advance'` y el rol de la sesión no es `partner`, devuelve
  error. Va **después** de la comprobación de etapa y **antes** de construir el parche,
  en el mismo sitio donde hoy se verifica `isDecisionAllowed`.
- `decided_by` deja de ser un `<input>` y pasa a ser el usuario de la sesión. El campo
  desaparece del formulario en `_gate-panel.tsx`.
- `lib/ios/gates.ts` recibe una función pura `canDecide(role, decision)` con su test, para
  que la regla no viva dentro del action.
- La base de datos ya protege el otro lado: el CHECK
  `ios_gate_decisions_advance_needs_ready` impide grabar un avance aprobado con el gate
  cerrado, venga de la interfaz o de un insert a mano.

**Cómo se comprueba.** Con una cuenta sin rol de Partner, el botón de Registrar devuelve
el error y la fila no se crea. Con Partner, sí.

---

## 3. Alojamiento en sus cuentas, no en un servidor suyo

**La recomendación es que no monten servidor.** Vercel y Supabase en la organización de
ARPA, los dos en región de la UE. Un servidor propio (una VM en Azure, por ejemplo) añade
parches de sistema, certificados, copias de seguridad y monitorización, y no aporta nada
que esta aplicación necesite. Si su política de seguridad exige que todo viva dentro del
tenant, entonces la forma menos mala es Azure Container Apps más Azure Database for
PostgreSQL, y hay que contar con que el trabajo de montaje se multiplica.

**Lo que hay que crear.**

- Organización de Vercel de ARPA, proyecto conectado a su repositorio de Git.
- Proyecto de Supabase de ARPA en `eu-west-1` o `eu-central-1`.
- DPA firmado con Vercel y con Supabase. Hay datos personales en contactos y, si se hace
  el paso 7, en transcripciones.
- Variables de entorno, las mismas que hoy más las tres de Entra ID.
- Dominio. Hoy vive bajo `joblanders.ai/arpa` con `basePath: '/arpa'`. Si pasa a un
  dominio de ARPA, el `basePath` se puede quitar, y eso toca `next.config.mjs` y nada más.

**Migración de datos.** `pg_dump` del esquema y de los datos, `pg_restore` en el proyecto
nuevo, y las migraciones de `supabase/migrations/` aplicadas en orden con
`scripts/migrate.mjs`. El catálogo del v9 no hace falta migrarlo: se vuelve a sembrar
desde su Excel con `scripts/ios-seed.ts` y salen los mismos 1179 registros.

**Un repositorio de Git de verdad, y esto es urgente.** El proyecto vive hoy en una
carpeta de Google Drive sin remoto. Drive ya ha corrompido el almacén de objetos de `.git`
una vez y ha renombrado un fichero fuente en caliente otra. Un repositorio privado en
GitHub o en Azure DevOps es el paso 0 de cualquier entrega.

---

## 4. Copias de seguridad con una restauración probada

Supabase hace copias diarias en el plan Pro, con *point in time recovery*. Eso es el
mecanismo, no la garantía.

- Fijar la retención (7 días es poco para esto, 30 es razonable).
- **Hacer una restauración de verdad, a un proyecto nuevo, y apuntar cuánto tardó.** Una
  copia que nunca se ha restaurado no es una copia.
- Dejar escrito quién la hace y cada cuánto se repite el ensayo.

---

## 5. Documentos en SharePoint

El fichero no se sube aquí. `ios_documents` ya guarda `url`, y eso es lo correcto: el
original vive donde ARPA ya tiene sus permisos, su versionado y su búsqueda.

- Convención de carpetas: una por empresa y, dentro, una por proyecto. Conviene
  escribirla antes de crear la primera, porque después nadie la cambia.
- Opcional, cuando el paso 1 esté hecho: con el mismo token de Microsoft se puede usar
  Microsoft Graph para crear la carpeta del proyecto automáticamente al crearlo, y para
  leer la versión del fichero en vez de teclearla. Es cómodo, no es imprescindible.
- Lo que no se debe hacer es duplicar el fichero en los dos sitios. Entonces hay dos
  versiones y la buena es siempre la otra.

---

## 6. Outlook: el próximo paso en el calendario

`ios_projects.next_step` y `next_step_due` ya existen, y "Mi trabajo" ya lista los
vencidos. Lo que falta es que salgan del navegador.

- Con Microsoft Graph y el permiso `Calendars.ReadWrite`, cada próximo paso se crea como
  evento o tarea en el calendario del responsable, y se actualiza cuando cambia la fecha.
- Guardar el `event_id` devuelto en una columna nueva, para poder actualizar en vez de
  crear un evento nuevo cada vez.
- Regla de diseño: la aplicación es la dueña del dato, el calendario es una copia. Si
  alguien borra el evento en Outlook, el próximo paso sigue vivo aquí.

---

## 7. Transcripciones de reuniones (Jamie y similares)

Su propia arquitectura ya tiene el sitio: la tabla **Interactions**, que quedó fuera del
alcance de V2. Aquí es donde encaja un grabador de reuniones.

- Tabla `ios_interactions`: `project_id`, `company_id`, `interaction_type`, `occurred_at`,
  `participants`, `summary`, `transcript_url`, `source` (Jamie, Teams, manual) y
  `ai_output_status`.
- La llamada entra como una interacción. Lo que el modelo saque de ella (un EBITDA
  mencionado, un nombre de socio, una fecha de proceso) entra con
  `ai_output_status = 'Needs Review'` y **nunca** se escribe directamente sobre un campo
  del proyecto. El vocabulario de ese campo ya está en `lib/ios/lists.ts`
  (`AI_OUTPUT_STATUS`). Una persona lo promueve o lo descarta.
- Esa disciplina no es burocracia: un resumen automático que escribe en el campo de ventas
  estimadas convierte un dato medido en un dato inventado sin que se note.

**Antes de escribir una línea de esto hay que decidir tres cosas**, porque es dato
personal de terceros:

1. Cómo se obtiene el consentimiento de grabación, y si se graban llamadas con vendedores
   o solo internas.
2. Cuánto tiempo se conserva la transcripción y quién la puede leer.
3. Si el audio sale de la UE. Depende del proveedor de transcripción, y hay que mirarlo
   proveedor a proveedor.

Es una conversación de política de empresa, no una tarea de desarrollo, y es la que suele
retrasar este paso.

---

## 8. Registro de auditoría general

Hoy se audita lo que importa: `ios_gate_decisions` guarda cada decisión, su justificación,
quién la tomó, y el detalle congelado de por qué el gate estaba abierto o cerrado,
incluidos los intentos bloqueados. Eso ya cubre la pregunta "por qué avanzó este deal".

Lo que falta es el resto: quién cambió un estado de documento, quién corrigió unas ventas
estimadas, quién reasignó un responsable. Una tabla `ios_audit_log` con
`table_name, row_id, action, actor, before, after, at`, escrita desde un trigger, cubre
todo de una vez y no depende de que cada action se acuerde de registrar.

---

## Lo que no cambia en la entrega

- **Las reglas.** `lib/ios/{lists,industries,gates}.ts` son funciones puras con 85 tests.
  Se mueven de servidor sin tocarse.
- **La forma de mover una etapa.** Sigue siendo una decisión de gate aprobada y nada más.
  No existe `setStage` y no debe existir. La escotilla de emergencia, si el panel tuviera
  un fallo, es parchear `ios_projects.stage` con `scripts/q.mjs`, no un desplegable en la
  interfaz.
- **V1.** Sigue viva en las mismas rutas. La única edición que V2 hizo en ella es el
  conmutador de versión en `app/_topnav.tsx`.

## Lo que seguirá faltando después de los ocho pasos

Está detallado en `docs/qa-v9.md`, pero en una línea: las nueve tablas que acordamos dejar
fuera (Portfolio, KPIs, DD Tracker, valoración por casos, iniciativas de creación de
valor, el formulario externo de asesores, los financieros por periodo, los agentes de IA y
Shareholders). Decidir si entran es una conversación de alcance, no de entrega.
