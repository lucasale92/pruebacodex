'use strict';
console.log('Iniciando bot de reservas...');
const path = require('node:path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('node:fs');
const { createProbe } = require('./src/probe');
const { Store } = require('./src/store');
const { Reservations } = require('./src/reservations');
const { configFrom } = require('./src/domain');
const { createRouter } = require('./src/router');
const { acquire } = require('./src/lock');
let release, store, config;
try {
  release = acquire(path.join(__dirname, 'data', 'bot.lock'));
  const configPath = path.join(__dirname, 'config.local.json');
  config = configFrom(fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {});
  store = new Store(path.join(__dirname, 'data', 'eventos.sqlite'));
} catch {
  console.error('error_configuracion_o_instancia: revisá config.local.json, Node 24 y que no haya otro bot abierto.');
  if (release) release();
  process.exit(1);
}
process.once('exit', () => { try { store.close(); } finally { release(); } });

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'eventos-prueba', dataPath: path.join(__dirname, '.wwebjs_auth') }),
  puppeteer: { headless: true },
});
const log = (event, details) => console.log(new Date().toISOString(), event, details || '');
const reservations = new Reservations(store, config);
const router = createRouter(client, store, reservations, config, log);
const probe = createProbe(client, log, (...args) => router.send(...args));
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
    await router.ready();
    await probe.ready();
    log('conexion_lista');
    console.log('Listo. Escribí !prueba o !ayuda desde el celular en tu chat con vos mismo.');
  } catch { log('error_identidad_no_disponible'); }
});
// Serialize deliveries, including echoes emitted while sendMessage awaits.
let queue = Promise.resolve();
client.on('message_create', message => {
  queue = queue.then(async () => {
    if (stopping || router.isSent(message)) return;
    if (typeof message.body === 'string' && message.body.trim() === '!prueba') await probe.handle(message);
    else await router.handle(message);
  }).catch(() => log('error_procesamiento'));
});
client.on('auth_failure', () => { probe.reset(); router.reset(); log('fallo_autenticacion'); });
client.on('disconnected', () => { probe.reset(); router.reset(); log('desconectado'); });
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  clearTimeout(startupNotice);
  await queue;
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
