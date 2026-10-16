'use strict';
const personalId = id => typeof id === 'string' && /^\d+@(c\.us|lid)$/.test(id);

async function ownIds(client) {
  const primary = client.info?.wid?._serialized;
  if (!personalId(primary)) throw new Error('IDENTITY_UNAVAILABLE');
  const ids = new Set([primary]);
  try {
    // Resolve only the authenticated account; never trust aliases from a message.
    const pairs = await client.getContactLidAndPhone([primary]);
    for (const pair of pairs || []) {
      if (pair.pn !== primary && pair.lid !== primary) continue;
      for (const id of [pair.pn, pair.lid]) if (personalId(id)) ids.add(id);
    }
  } catch {
    // Exact authenticated ID still works. Unknown aliases remain denied.
  }
  return ids;
}

function createProbe(client, log = console.log) {
  let ids = new Set();
  const seen = new Set();
  return {
    async ready() {
      ids = new Set();
      ids = await ownIds(client);
      log('identidad_lista', { aliasDisponible: ids.size > 1 });
    },
    reset() { ids = new Set(); },
    async handle(message) {
      if (typeof message.body !== 'string' || message.body.trim() !== '!prueba') return;
      // Incoming contacts are silently ignored, including their commands.
      if (!message.fromMe) return;
      log('comando_prueba_recibido', {
        origen: personalId(message.from) ? message.from.split('@')[1] : 'otro',
        destino: personalId(message.to) ? message.to.split('@')[1] : 'otro',
      });
      if (!ids.has(message.from) || !ids.has(message.to) || message.author) {
        log('rechazo_permisos');
        return;
      }
      const key = message.id?._serialized;
      if (!key) { log('rechazo_sin_id'); return; }
      if (seen.has(key)) { log('comando_duplicado'); return; }
      seen.add(key); // Reserve before await so concurrent deliveries cannot double-send.
      if (seen.size > 1000) seen.delete(seen.values().next().value);
      log('intento_respuesta');
      try {
        await client.sendMessage(message.to, 'Bot de eventos conectado. Prueba correcta.', { sendSeen: false });
        log('respuesta_enviada');
      } catch {
        // Do not print library errors that may contain message data or identifiers.
        log('error_envio');
      }
    },
  };
}
module.exports = { ownIds, createProbe };
