# Bot local de reservas por WhatsApp

MVP de texto para Windows 11 y Node.js 24. Usa SQLite incorporado en Node, sin añadir dependencias de pago. La prueba real `!prueba` fue confirmada por el usuario en WhatsApp; los comandos nuevos de reservas se validaron localmente y necesitan la prueba de aceptación en el celular que figura abajo.

## Actualizar el proyecto existente

1. Detené el bot con Ctrl+C. En modo «Seleccionar», presioná Esc primero.
2. Descargá el repositorio en GitHub con Code → Download ZIP y descomprimilo.
3. Copiá a `C:\Users\PC Juegitos\bot-eventos` los archivos `index.js`, `iniciar.bat`, `package.json`, `README.md`, `config.example.json` y las carpetas `src`, `scripts` y `test`. El lockfile conserva las dependencias anteriores; también puede copiarse sin cambiar sus versiones.
4. **Conservá `.wwebjs_auth`, `.wwebjs_cache`, `node_modules`, `data`, `backups` y `config.local.json` si existen.** No reemplaces la carpeta entera borrando esos datos. `index.original.js` conserva la prueba original recibida; no lo ejecutes como bot.
5. Con las dependencias ya instaladas, no hace falta reinstalar. Para instalación desde cero: `npm ci` en esa carpeta; Puppeteer puede descargar un navegador. Requiere Node 24. No requiere administrador de Windows.
6. Abrí `iniciar.bat`. Esperá `conexion_lista`. Si aparece un QR inesperado, detené y verificá que estés en la carpeta original con `.wwebjs_auth/session-eventos-prueba`; no borres la sesión ni vuelvas a vincular sin diagnosticar.
7. En tu chat propio enviá `!ayuda`.

La app crea `data/eventos.sqlite` al iniciar. Un lock evita dos instancias y operaciones de respaldo mientras el bot está abierto. Al cerrar abruptamente puede quedar un lock: se retira automáticamente solo si su proceso ya no existe. Si no puede comprobarse, detené las instancias y revisá `data/bot.lock`; nunca lo retires con un bot funcionando.

## Prueba de aceptación en tu celular

Primero trabajá solo en tu chat propio; no configures al equipo todavía.

1. Enviá `!prueba`: debe responder una vez.
2. Enviá `!nuevo`. Contestá cada pregunta, por ejemplo: `25/12/2026`, `18:00`, `20:00`, `no`, `Cliente de prueba`, `-`, `Salón de prueba`, `Calle de prueba 123`, `castillo#1`, `-`, `10000`, `2000`, `tentativo`, `Prueba para cancelar`.
3. El resumen debe indicar total $10.000, pagado $2.000 y saldo $8.000. **No guarda la reserva hasta que envíes `confirmar`.** `descartar` la elimina solo del borrador. Para salir de cualquier paso: `!descartar`.
4. Guardá y copiá el ID `EV-...` completo de la respuesta. Consultá `!fecha 25/12/2026` y `!ver ID` (reemplazá ID por ese código). `!agenda` muestra solo los próximos 7 días, por lo que un evento más lejano se busca por fecha.
5. Cerrá con Ctrl+C y volvé a abrir `iniciar.bat`. `!ver ID` debe conservar el evento y su pago sin pedir QR.
6. Probá `!pago ID 1000 prueba`, revisá el resumen y enviá `confirmar`. El saldo debe ser $7.000.
7. Probá `!editar ID`, elegí `observaciones`, enviá la nota nueva, revisá y confirmá.
8. Probá `!cancelar ID`: antes de confirmar debe seguir activo. Confirmá y consultá `!ver ID`: debe decir cancelado. `!historial ID` debe conservar creación, pago, edición y cancelación. La agenda omite cancelados.
9. Probá otro `!nuevo`, descartalo y verificá que no se agregó un evento.

El bot no envía mensajes por iniciativa propia ni contacta al equipo durante estas pruebas. Las respuestas aparecen en el mismo chat validado que envió el comando.

## Comandos y carga guiada

- `!ayuda`: comandos.
- `!nuevo`: pregunta fecha con año, inicio, fin, si termina al día siguiente, cliente, teléfono opcional, lugar, dirección, recursos, responsable opcional, precio, seña, estado y observaciones.
- `!agenda`: próximos 7 días, contando hoy como día 1. `!hoy`, `!semana`, `!fecha DD/MM/AAAA` y `!agenda DD/MM/AAAA` consultan períodos concretos. Incluye eventos iniciados el día anterior que siguen en curso.
- `!agenda 7 2` o `!agenda DD/MM/AAAA 2`: segunda página. Cada página contiene hasta 10 eventos, ordenados por inicio; las respuestas extensas se separan en varios mensajes.
- `!ver ID`: detalle privado del administrador, pagos, saldo y fechas de creación/modificación.
- `!editar ID`: elegí `fecha`, `inicio`, `fin`, `dia_siguiente`, `cliente`, `telefono`, `lugar`, `direccion`, `recursos`, `responsable`, `precio`, `estado` u `observaciones`. Se cambia un campo por operación y se confirma. Los cambios deben dejar horarios y pagos válidos.
- `!pago ID MONTO [nota]`: agrega un pago, con resumen y confirmación. Los pagos no se borran ni reemplazan. La seña inicial se distingue de los pagos posteriores. No se admite pagar más que el precio total; para aumentar el precio, editá primero.
- `!cancelar ID`: conserva la reserva, sus pagos y su historial. Exige confirmación.
- `!historial ID`: lista las acciones y sus fechas. SQLite también conserva la instantánea completa de cada versión; no se borra al cancelar.
- `!pendiente`: retoma la pregunta o el resumen de un borrador, incluso después de reiniciar.
- `!descartar`: abandona el borrador. Las consultas no lo eliminan. Solo puede haber un borrador administrativo a la vez.

Fechas visibles DD/MM/AAAA y horas HH:mm en `America/Argentina/Ushuaia`. Se usa UTC−03:00 y se verifica la correspondencia con la zona IANA. No se aceptan “mañana”, años abreviados, fechas imposibles ni horas ambiguas. Importes en pesos argentinos, sin separadores de miles (`15000,50` o `15000.50`). Se guardan centavos enteros. Las fechas de auditoría y pagos también se muestran en la zona de Ushuaia; internamente se conservan timestamps ISO UTC.

No interpreta instrucciones como código: texto y futuros audios son datos. Los audios todavía no se descargan ni transcriben. La segunda etapa requiere evaluar hardware Windows y herramientas antes de proponer modelos o descargas grandes.

## Recursos, responsables y márgenes

Cada recurso representa una unidad concreta: `castillo#1`, `castillo#2`, `mickey#1`, etc. Usá siempre los mismos nombres, con el mismo formato; se normalizan espacios exteriores y mayúsculas. No hay un catálogo automático que detecte que dos nombres diferentes son el mismo recurso. Para responsables, usá también un nombre único consistente.

Para establecer márgenes, copiá `config.example.json` como `config.local.json` y editá `trasladoMin`, `armadoMin` y `desarmeMin`. Inicialmente son 0 porque no conocemos tus tiempos reales; poné los valores de tu operación antes de confiar en la disponibilidad. El margen anterior al evento suma traslado y armado; el posterior es desarme. Se aplica a todos los recursos y responsables. No calcula distancias ni rutas. Cada valor admite enteros entre 0 y 1440 minutos.

Antes de guardar se advierten coincidencias de unidad o responsable, incluso entre días diferentes y con márgenes. Para guardar pese a una advertencia se exige `confirmar con conflicto`. Los conflictos se vuelven a calcular al confirmar. Las reservas canceladas no ocupan recursos. La app advierte, no promete disponibilidad ni impide una excepción explícita del administrador.

## Equipo: lista explícita y solo lectura

El equipo queda desactivado por defecto: `team` es `[]`. Primero completá las pruebas del administrador. Para habilitar usuarios, detené el bot, copiá `config.example.json` a `config.local.json` si todavía no existe y agregá IDs exactos a `team`. Un teléfono debe incluir país y el identificador WhatsApp correcto, por ejemplo `549...@c.us`; los IDs `@lid` son diferentes y no se obtienen cambiando el sufijo del teléfono. Si WhatsApp entrega un LID, debe autorizarse ese ID exacto, obtenido de forma privada y verificada, sin compartir sesiones ni publicar números. Esta versión no descubre contactos ni adivina identidades. Reiniciá para aplicar cambios.

Los usuarios autorizados solo pueden consultar `!hoy`, `!semana`, `!fecha` y `!agenda`. Reciben ID, fecha, horario, estado, lugar, dirección, recursos y responsable. No reciben cliente, teléfono, precios, pagos, saldo, observaciones privadas ni auditoría. Los comandos administrativos se rechazan incluso si el contacto está autorizado. Los grupos y otros contactos se ignoran. No se usan chats históricos ni se envían invitaciones o recordatorios.

`config.local.json` está excluido de Git porque puede contener números. No copies el contenido real a config.example.json.

## Respaldar y restaurar

1. Detené el bot con Ctrl+C.
2. En una terminal abierta en el proyecto ejecutá `node scripts/backup.js crear` (o `npm run backup`). Crea una copia SQLite consistente y verifica integridad, tablas y eventos en `backups`. No copia sesiones de WhatsApp.
3. Copiá periódicamente los respaldos a otro dispositivo seguro. La base contiene datos personales y financieros sin cifrado propio: protegé la PC y el dispositivo de respaldo. No subas esos archivos a GitHub.
4. Para restaurar, con el bot detenido: `node scripts/backup.js restaurar "backups\NOMBRE-DEL-ARCHIVO.sqlite" --confirmar`. Reemplazá el nombre por un archivo real. Valida el respaldo y crea una copia de la base actual antes de sustituirla.
5. Abrí `iniciar.bat` y verificá `!ver ID` y la agenda. Se restaura la base completa, incluyendo borradores, historial e IDs procesados. Restaurar una copia antigua también retrocede la protección contra duplicados al estado de esa copia; evitá reenviar confirmaciones antiguas.

## Integridad, privacidad y diagnóstico

Las consultas SQLite usan parámetros. Cada mensaje procesado y su modificación se confirman en la misma transacción, con historial y control de versión. Los duplicados de reservas siguen detectándose tras reiniciar. Las respuestas del propio bot se identifican y excluyen del asistente para que no sean tomadas como datos. Si la base confirmó un cambio pero falla el envío, no se repite la escritura automáticamente: consultá `!ver ID`, `!agenda` o `!pendiente`. No se garantiza entrega exactamente una vez frente a fallos externos de WhatsApp.

La conexión conserva `clientId: eventos-prueba` y la carpeta original de sesión. Autoriza el chat propio validando `fromMe` y ambos extremos contra la cuenta autenticada y sus alias `@c.us`/`@lid`. Nunca autoriza todos los chats para resolver un error. `!prueba` usa una deduplicación en memoria propia, distinta de la deduplicación persistente de reservas.

Eventos útiles: `autenticado`, `identidad_lista`, `conexion_lista`, `comando_prueba_recibido`, `rechazo_permisos`, `rechazo_sin_id`, `intento_respuesta`, `respuesta_enviada`, `error_envio`, `error_reserva_almacenamiento`, `error_envio_reserva`. No se registran cuerpos de reservas, números, errores crudos de librerías ni sesiones. El QR se muestra solo en la terminal cuando WhatsApp lo requiere: no redirijas la salida ni compartas el QR. Si no hay conexión en 60 segundos, `inicio_demorado` es solo un aviso; no demuestra que el proceso falló.

Detener: Ctrl+C. Reiniciar: esperar el cierre y abrir iniciar.bat. Desvincular voluntariamente: WhatsApp en el celular → Dispositivos vinculados → elegir dispositivo → Cerrar sesión. Detener/reiniciar no requiere desvincular ni borrar archivos.

## Validación y limitaciones

`npm test` ejecuta pruebas de identidad, permisos, fechas, pagos, superposiciones, confirmación, descartes, historial, persistencia, deduplicación, ecos del bot, respaldo y restauración. Las pruebas no vinculan una cuenta ni envían mensajes reales. El flujo de reservas todavía debe validarse en Windows y el celular; no se afirma que ya pasó esa aceptación. Las pruebas automatizadas de respaldo se ejecutaron en Linux con el mismo Node 24; el procedimiento también necesita aceptación en Windows.

Las dependencias del lockfile siguen siendo whatsapp-web.js 1.34.7 y Puppeteer 24.38.0. La auditoría previa reportó 9 paquetes con severidad alta, heredados principalmente de basic-ftp 5.3.1 y extract-zip 2.0.1. `extract-zip` se usa en extracción de navegadores y tiene avisos de escritura mediante enlaces simbólicos. basic-ftp llega por `@puppeteer/browsers → proxy-agent → pac-proxy-agent → get-uri`; su ruta FTP llama a Client.list y tiene un aviso de denegación de servicio. El bot no configura FTP/PAC; la inspección estática no certifica que configuración externa nunca alcance esas rutas. No se ejecutó `npm audit fix --force`, no se degradó a 1.34.2 ni se desactivaron verificaciones TLS/integridad. Los avisos permanecen pendientes (GHSA-c475-qrg2-pj4r, GHSA-jmr9-qjv8-65gv, GHSA-7pqw-9j4j-h8q3). whatsapp-web.js es una integración no oficial y conserva riesgo de bloqueo.

Referencias de la versión: https://github.com/pedroslopez/whatsapp-web.js/tree/v1.34.7/src (Client.js, structures/Message.js, authStrategies/LocalAuth.js).

Cuando el autor adicional de un mensaje propio no coincide con los alias, el módulo de reservas consulta `message.getChat()` y exige un chat privado cuyo ID pertenezca a la cuenta, además de `fromMe` y ambos extremos propios. Nunca agrega el autor desconocido como alias. Si esa comprobación falla, rechaza el comando.
