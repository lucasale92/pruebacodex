'use strict';
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
client.on('qr', qr => {
  console.log('WhatsApp solicita vinculación. Si ya estaba vinculado, detené con Ctrl+C y revisá la carpeta de sesión antes de escanear. No guardes ni compartas este QR.');
  qrcode.generate(qr, { small: true });
});
client.on('authenticated', () => log('autenticado'));
client.on('ready', async () => {
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
  try { await client.destroy(); } catch { log('error_cierre'); }
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
client.initialize().catch(() => { log('error_inicio'); process.exitCode = 1; });
