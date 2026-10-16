'use strict';
const { createHash } = require('node:crypto');
const { ownIds } = require('./probe');
function messageKey(message) {
  const id = message.id;
  const valid = value => typeof value === 'string' && value.trim().length;
  return valid(id?.id) ? `token:${id.id}` : valid(id?._serialized) ? `serialized:${id._serialized}` : null;
}
function digest(key) { return createHash('sha256').update(key).digest('hex'); }
function createRouter(client, store, reservations, config, log = () => {}) {
  let own = new Set(), primary = null;
  const sent = new Set();
  return {
    async ready() {
      own = new Set(); primary = null;
      own = await ownIds(client); primary = [...own].find(id => id.endsWith('@c.us')) || client.info.wid._serialized;
    },
    reset() { own = new Set(); primary = null; },
    async send(to, text, options = { sendSeen: false }) {
      const result = await client.sendMessage(to, text, options);
      const key = messageKey(result || {});
      if (key) {
        sent.add(key);
        store.markSent(digest(key));
        if (sent.size > 1000) sent.delete(sent.values().next().value);
      }
      return result;
    },
    isSent(message) {
      const key = messageKey(message);
      return Boolean(key && (sent.has(key) || store.isSent(digest(key))));
    },
    async handle(message) {
      const ownCommand = message.fromMe && typeof message.body === 'string' && message.body.trim().startsWith('!');
      if (ownCommand) log('comando_reserva_recibido', {
        identidadLista: Boolean(primary),
        origenPropio: own.has(message.from),
        destinoPropio: own.has(message.to),
        autorValido: !message.author || own.has(message.author),
      });
      if (!primary) { if (ownCommand) log('reserva_identidad_no_lista'); return; }
      if (this.isSent(message)) { if (ownCommand) log('reserva_eco_ignorado'); return; }
      let owner = Boolean(message.fromMe && own.has(message.from) && own.has(message.to) && (!message.author || own.has(message.author)));
      if (!owner && message.fromMe && own.has(message.from) && own.has(message.to)) {
        // Some self-chat deliveries carry a different author representation.
        // Never add it as an alias. Independently verify the actual chat.
        const identityAtLookup = primary;
        try {
          const chat = await message.getChat();
          owner = Boolean(primary && primary === identityAtLookup &&
            own.has(message.from) && own.has(message.to) &&
            chat?.isGroup === false && own.has(chat.id?._serialized));
          log('reserva_chat_propio_verificado', { valido: owner });
        } catch {
          log('reserva_error_verificar_chat');
        }
      }
      const team = !message.fromMe && /^\d+@(c\.us|lid)$/.test(message.from || '') && config.team.includes(message.from) && own.has(message.to) && (!message.author || message.author === message.from);
      if (!owner && !team) { if (ownCommand) log('reserva_rechazo_permisos'); return; }
      const key = messageKey(message);
      if (!key) { log('reserva_rechazo_sin_id'); return; }
      // Audio is not downloaded, transcribed, or interpreted in this stage.
      const body = message.type === 'ptt' || message.type === 'audio' ? '!audio_no_disponible' : message.body;
      if (typeof body !== 'string') return;
      let result;
      try {
        result = reservations.handle({ actor: owner ? `owner:${primary}` : `team:${message.from}`, token: digest(key), role: owner ? 'owner' : 'team', text: body });
      } catch (error) {
        const codes = ['ERR_SQLITE_ERROR', 'SQLITE_BUSY', 'SQLITE_READONLY', 'SQLITE_FULL', 'SQLITE_CORRUPT'];
        log('error_reserva_almacenamiento', { codigo: codes.includes(error?.code) ? error.code : 'otro' });
        return;
      }
      if (!result) { if (ownCommand) log('reserva_sin_respuesta_o_duplicada'); return; }
      log('intento_respuesta_reserva');
      // Reply only to this validated chat, never to a number in message text.
      const destination = owner ? message.to : message.from;
      for (let offset = 0; offset < result.length; offset += 3000) {
        try { await this.send(destination, result.slice(offset, offset + 3000), { sendSeen: false }); }
        catch { log('error_envio_reserva'); return; }
      }
      log('respuesta_reserva_enviada');
    },
  };
}
module.exports = { createRouter, messageKey };
