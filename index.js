'use strict';
console.log('Iniciando bot de prueba...');
const path = require('node:path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createProbe } = require('./src/probe');

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'eventos-prueba', dataPath: path.join(__dirname, '.wwebjs_auth') }),
  puppeteer: { headless: true },
});
const log = (event, details) => console.log(new Date().toISOString(), event, details || '');
const probe = createProbe(client, log);
const startupNotice = setTimeout(() => {
  log('inicio_demorado');
  console.log('Todavia no se confirmo la conexion. Comparti los nombres de los eventos que aparecen; no borres la sesion ni abras otra instancia.');
}, 60000);
startupNotice.unref();
client.on('loading_screen', percent => {
  log('cargando_whatsapp', { porcentaje: Number.isFinite(percent) ? percent : 'desconocido' });
});
client.on('qr', qr => {
  console.log('WhatsApp solicita vinculación. Si ya estaba vinculado, detené con Ctrl+C y revisá la carpeta de sesión antes de escanear. No guardes ni compartas este QR.');
  qrcode.generate(qr, { small: true });
});
client.on('authenticated', () => log('autenticado'));
client.on('ready', async () => {
  clearTimeout(startupNotice);
  try {
    await probe.ready();
    log('conexion_lista');
    console.log('Listo. Escribí !prueba desde el celular en tu chat con vos mismo.');
  } catch { log('error_identidad_no_disponible'); }
});
client.on('message_create', message => {
  probe.handle(message).catch(() => log('error_procesamiento'));
});
client.on('auth_failure', () => { probe.reset(); log('fallo_autenticacion'); });
client.on('disconnected', () => { probe.reset(); log('desconectado'); });
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  clearTimeout(startupNotice);
  try { await client.destroy(); } catch { log('error_cierre'); }
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
log('iniciando_navegador_y_whatsapp');
client.initialize().catch(error => {
  clearTimeout(startupNotice);
  const text = String(error?.message || '');
  const categoria = /already running|SingletonLock|user data directory.*in use/i.test(text) ? 'perfil_en_uso'
    : /could not find chrome|executable.*doesn.t exist|browser was not found/i.test(text) ? 'navegador_no_encontrado'
    : /timeout|timed out/i.test(text) ? 'tiempo_agotado'
    : /failed to launch/i.test(text) ? 'fallo_al_abrir_navegador'
    : 'otro';
  log('error_inicio', { categoria });
  process.exitCode = 1;
});
