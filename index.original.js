const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'eventos-prueba' }),
  puppeteer: { headless: true }
});

client.on('qr', qr => {
  console.log('Escaneá este QR desde Dispositivos vinculados:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('Listo. Escribí !prueba en tu chat con vos mismo.');
});

client.on('message_create', async message => {
  // Aceptar solo mensajes propios enviados al mismo usuario.
  if (!message.fromMe || message.from !== message.to) return;
  if (message.body.trim() !== '!prueba') return;

  try {
    await client.sendMessage(
      message.to,
      'Bot de eventos conectado. Prueba correcta.',
      { sendSeen: false }
    );
  } catch (error) {
    console.error('No se pudo responder:', error.message);
  }
});

client.on('auth_failure', () => {
  console.error('Falló la autenticación.');
});

client.on('disconnected', reason => {
  console.log('WhatsApp desconectado:', reason);
});

client.initialize().catch(error => {
  console.error('Error al iniciar:', error.message);
});