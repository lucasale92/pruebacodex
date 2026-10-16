# Bot de eventos: diagnóstico de conexión

Esta entrega implementa únicamente la prueba de conexión. El MVP de reservas y los audios quedan pendientes hasta verificar `!prueba` en WhatsApp real, según el orden solicitado. No contiene sesiones ni datos personales.

## Instalar la corrección en Windows 11

1. Detené el bot anterior con Ctrl+C. Si PowerShell muestra «Seleccionar», presioná Esc primero: ese modo puede pausar el proceso. No ejecutes dos instancias.
2. Extraé este paquete en `C:\Users\PC Juegitos\bot-eventos`, conservando sus subcarpetas. El paquete incluye `index.original.js`, copia exacta del archivo recibido. Si modificaste tu index desde entonces, hacé otra copia antes de reemplazarlo.
3. Conservá `.wwebjs_auth` y `.wwebjs_cache` existentes: no borres ni reemplaces esas carpetas. Se mantiene `clientId: eventos-prueba` y la autenticación se busca junto al index.
4. Si seguís teniendo las dependencias instaladas, no necesitás reinstalar. Si faltan, abrí una terminal en esa carpeta y ejecutá `npm ci`. La instalación de Puppeteer puede descargar un navegador. No uses `npm audit fix --force`.
5. Hacé doble clic en `iniciar.bat`, o ejecutá `node index.js` desde esa carpeta. No se necesitan permisos de administrador.
6. Esperá `identidad_lista` y `conexion_lista`. Desde el celular, en «Mensaje a ti mismo», enviá un nuevo `!prueba`.
7. La respuesta esperada es «Bot de eventos conectado. Prueba correcta.». Confirmá tanto la respuesta en el celular como `respuesta_enviada` en terminal; una prueba simulada no demuestra que WhatsApp funciona.

Si aparece QR pese a tener una sesión vinculada, detené el proceso y verificá que estás usando la carpeta original con `.wwebjs_auth/session-eventos-prueba`. No revincules ni borres la sesión automáticamente. El QR se muestra solo en terminal: no redirijas la salida a archivos ni compartas capturas del QR.

## Si la ventana queda vacía

El iniciador actualizado imprime un aviso y la versión de Node inmediatamente. El programa imprime `Iniciando bot de prueba...`, luego `iniciando_navegador_y_whatsapp`, y los eventos `cargando_whatsapp` cuando la librería los emite. Si no llega a ready en 60 segundos, aparece `inicio_demorado`; es un aviso, no prueba que el proceso falló. No abras otra instancia ni borres la sesión. Compartí la última línea visible sin QR.

## Cómo interpretar el diagnóstico

- `autenticado`: la librería informó autenticación.
- `identidad_lista`: se obtuvo el ID de la cuenta conectada; `aliasDisponible` indica si también se resolvió su alias.
- `conexion_lista`: podés enviar el comando nuevo desde el celular.
- `comando_prueba_recibido`: se recibió `message_create` para un comando propio. Solo registra el tipo de identificador, nunca el número ni el mensaje.
- `rechazo_permisos`: origen o destino no coincide con la identidad conectada, o un autor presente no pertenece a la cuenta. El registro muestra únicamente `origenPropio`, `destinoPropio`, `autorPresente` y `autorValido` para identificar la condición fallida. No se amplía el acceso para resolverlo.
- `intento_respuesta`, seguido por `respuesta_enviada` o `error_envio`: distingue el envío del filtro de permisos.
- `comando_duplicado`: el mismo ID ya se procesó en este proceso. La memoria es limitada a 1000 comandos y no persiste al reiniciar; esto todavía no es la deduplicación durable del futuro MVP.
- `error_identidad_no_disponible`: no se habilitan respuestas sin una identidad validada.
- `error_inicio`, `fallo_autenticacion`, `desconectado`: son fallos de arranque/sesión, no del filtro.

Si después de `conexion_lista` no aparece `comando_prueba_recibido` al enviar un comando nuevo propio, el filtro no llegó a ejecutarse para ese comando: revisar proceso pausado, instancia correcta y entrega de eventos. No se leen mensajes históricos ni se registran conversaciones de terceros. Los comandos entrantes de otros contactos se ignoran.

Si sigue fallando, compartí solamente los nombres de los eventos de diagnóstico y los campos `origen`, `destino`, `aliasDisponible`; no compartas números, QR o carpetas de sesión. `error_envio` deliberadamente no imprime el error crudo de la librería, que podría contener identificadores.

## Qué se corrigió y qué no está demostrado

El filtro original exige `from === to`. Eso puede fallar cuando WhatsApp representa la misma cuenta mediante `@c.us` y `@lid`. La versión fijada, whatsapp-web.js 1.34.7, expone `client.info.wid` y `getContactLidAndPhone()`.

La corrección parte exclusivamente de la identidad autenticada, resuelve sus alias y exige que tanto el origen como el destino pertenezcan a esa identidad y que `fromMe` sea verdadero. No elimina sufijos para comparar números ni confía en alias tomados del mensaje. Si la resolución falla, solo acepta el ID exacto autenticado. Los grupos se rechazan. No se habilitó acceso al equipo ni envío proactivo.

Este es un diagnóstico y una corrección del posible filtro; no hay evidencia todavía de que esa sea la causa en tu computadora. El modo Seleccionar de PowerShell y errores de envío siguen siendo posibilidades que los registros permiten distinguir.

Fuentes de la versión utilizada:
- https://github.com/pedroslopez/whatsapp-web.js/blob/v1.34.7/src/Client.js (identidad, message_create, getContactLidAndPhone)
- https://github.com/pedroslopez/whatsapp-web.js/blob/v1.34.7/src/structures/Message.js (from, to, fromMe)
- https://github.com/pedroslopez/whatsapp-web.js/blob/v1.34.7/src/authStrategies/LocalAuth.js (ruta y conservación de sesión)

## Validación local

Con Node.js 24, desde la carpeta del proyecto:

```
node --check index.js
node --check src/probe.js
node --test test/probe.test.js
```

Se verificaron 23 pruebas sin conexión a WhatsApp: permisos, alias de la cuenta, alias ajenos, grupos, identidad ausente, resolución fallida, desconexión, duplicados concurrentes y errores de envío sin filtración. `npm test` sigue siendo el marcador original del proyecto; usá el comando anterior. No hay todavía pruebas de persistencia, fechas o cancelaciones porque las reservas no están implementadas.

En la nube se ejecutó `npm ci --ignore-scripts` con caché local escribible; no se descargó ni arrancó Chromium, ni se vinculó una cuenta. No se validó aquí el arranque de WhatsApp. package.json y package-lock.json se conservaron exactamente como fueron recibidos.

## Auditoría de dependencias

El lockfile fija whatsapp-web.js 1.34.7, Puppeteer 24.38.0, basic-ftp 5.3.1 y extract-zip 2.0.1. Una auditoría reportó 9 paquetes afectados, todos con severidad alta, contando dependencias que heredan los avisos.

- `extract-zip`: escritura fuera del destino mediante enlaces simbólicos en archivos maliciosos. Puppeteer lo utiliza en extracción de navegadores; es una superficie de instalación/gestión del navegador. No extraer archivos de origen desconocido. Se mantienen las verificaciones de integridad y TLS.
- `basic-ftp`: denegación de servicio por análisis de listados FTP. Llega mediante `@puppeteer/browsers -> proxy-agent -> pac-proxy-agent -> get-uri`; `get-uri` invoca `Client.list()` en su ruta FTP. El bot no configura FTP ni PAC, pero esta inspección estática no certifica que nunca se alcance mediante configuración externa.
- `npm audit` propone whatsapp-web.js 1.34.2: es anterior a la instalada. No se aplicó esa propuesta ni se forzaron overrides sin validar compatibilidad. Los avisos permanecen pendientes; no se declara la instalación libre de vulnerabilidades.

Avisos: GHSA-c475-qrg2-pj4r, GHSA-jmr9-qjv8-65gv, GHSA-7pqw-9j4j-h8q3. La integración es no oficial y el riesgo de bloqueo de WhatsApp permanece.

## Detener, reiniciar y desvincular

- Detener: Ctrl+C en la terminal; se cierra el cliente sin llamar a logout ni borrar la sesión.
- Reiniciar: esperar el cierre y abrir `iniciar.bat` nuevamente.
- Desvincular voluntariamente: en el celular, WhatsApp → Dispositivos vinculados → elegir este dispositivo → Cerrar sesión. El siguiente inicio puede requerir QR. No hace falta borrar archivos para detener o reiniciar.

El .gitignore excluye sesiones, cachés, node_modules, bases de datos, respaldos y archivos .env. No publiques información privada; .gitignore no elimina archivos que ya estuvieran versionados.

### Ajuste del diagnóstico de permisos

La presencia de `author` ya no causa por sí sola un rechazo: si existe, debe coincidir con un alias verificado de la cuenta. Se sigue exigiendo origen y destino propios y `fromMe`. Los grupos y los chats de otros contactos siguen rechazados. La captura inicial de rechazo no permite determinar cuál condición falló; los nuevos campos booleanos permiten comprobarlo sin revelar identidades.

### Identificador del comando

Se acepta el token `message.id.id` cuando existe, y `_serialized` como alternativa. La estructura Message conserva `data.id` recibido de WhatsApp, por lo que no se supone que siempre venga serializado. La validación de identidad se ejecuta antes de leer esta clave. Los identificadores no se registran. La deduplicación sigue limitada a la memoria del proceso; si falta un token válido, el comando se rechaza y solo se informa la presencia o ausencia de los campos.
