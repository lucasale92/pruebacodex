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
      if (!primary || this.isSent(message)) return;
      const owner = message.fromMe && own.has(message.from) && own.has(message.to) && (!message.author || own.has(message.author));
      const team = !message.fromMe && /^\d+@(c\.us|lid)$/.test(message.from || '') && config.team.includes(message.from) && own.has(message.to) && (!message.author || message.author === message.from);
      if (!owner && !team) return;
      const key = messageKey(message);
      if (!key) { log('reserva_rechazo_sin_id'); return; }
      // Audio is not downloaded, transcribed, or interpreted in this stage.
      const body = message.type === 'ptt' || message.type === 'audio' ? '!audio_no_disponible' : message.body;
      if (typeof body !== 'string') return;
      let result;
      try {
        result = reservations.handle({ actor: owner ? `owner:${primary}` : `team:${message.from}`, token: digest(key), role: owner ? 'owner' : 'team', text: body });
      } catch {
        log('error_reserva_almacenamiento');
        return;
      }
      if (!result) return;
      // Reply only to this validated chat, never to a number in message text.
      const destination = owner ? message.to : message.from;
      for (let offset = 0; offset < result.length; offset += 3000) {
        try { await this.send(destination, result.slice(offset, offset + 3000), { sendSeen: false }); }
        catch { log('error_envio_reserva'); return; }
      }
    },
  };
}
module.exports = { createRouter, messageKey };
