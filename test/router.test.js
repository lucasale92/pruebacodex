'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Store } = require('../src/store');
const { Reservations } = require('../src/reservations');
const { createRouter } = require('../src/router');
const pn = '111@c.us', lid = '222@lid', team = '333@c.us';
async function fixture(t) {
  const store = new Store(':memory:'); t.after(() => store.close());
  const config = { team: [team] };
  const sent = [];
  const client = {
    info: { wid: { _serialized: pn } },
    getContactLidAndPhone: async () => [{ pn, lid }],
    sendMessage: async (to, text) => {
      const id = { id: `bot-${sent.length}` }; const message = { fromMe: true, from: pn, to, body: text, id };
      sent.push(message); return message;
    },
  };
  const app = new Reservations(store, config);
  const router = createRouter(client, store, app, config); await router.ready();
  let n = 0;
  const message = (body, extra = {}) => ({ fromMe: true, from: pn, to: lid, id: { id: `user-${++n}` }, body, ...extra });
  return { store, sent, router, message, app, config, client };
}
test('bot echo cannot fill the next reservation field, even after router recreation', async t => {
  const f = await fixture(t); await f.router.handle(f.message('!nuevo'));
  assert.equal(f.store.draft(`owner:${pn}`).step, 0);
  await f.router.handle(f.sent[0]); assert.equal(f.store.draft(`owner:${pn}`).step, 0); assert.equal(f.sent.length, 1);
  const restarted = createRouter(f.client, f.store, f.app, f.config); await restarted.ready();
  await restarted.handle(f.sent[0]); assert.equal(f.sent.length, 1);
  await f.router.handle(f.message('25/12/2026')); assert.equal(f.store.draft(`owner:${pn}`).step, 1);
});
test('only allowlisted direct contacts get operational replies, groups and outsiders ignored', async t => {
  const f = await fixture(t);
  await f.router.handle(f.message('!nuevo', { fromMe: false, from: team, to: pn }));
  assert.match(f.sent[0].body, /solo lectura/); assert.equal(f.sent[0].to, team);
  assert.equal(f.store.draft(`team:${team}`), null);
  await f.router.handle(f.message('!nuevo', { fromMe: false, from: '999@c.us', to: pn }));
  await f.router.handle(f.message('!nuevo', { fromMe: false, from: '111@g.us', author: team, to: pn }));
  await f.router.handle(f.message('!nuevo', { to: team }));
  assert.equal(f.sent.length, 1);
});
test('message redelivery advances guided state once; disconnect disables handling', async t => {
  const f = await fixture(t); const start = f.message('!nuevo');
  await f.router.handle(start); await f.router.handle(start); assert.equal(f.sent.length, 1);
  const input = f.message('25/12/2026'); await f.router.handle(input); await f.router.handle(input);
  assert.equal(f.store.draft(`owner:${pn}`).step, 1); assert.equal(f.sent.length, 2);
  f.router.reset(); await f.router.handle(f.message('10:00')); assert.equal(f.sent.length, 2);
});
test('audio is not downloaded or accepted as reservation data', async t => {
  const f = await fixture(t); await f.router.handle(f.message('!nuevo'));
  await f.router.handle(f.message('', { type: 'ptt', downloadMedia: () => { throw Error('must not download'); } }));
  assert.equal(f.store.draft(`owner:${pn}`).step, 0);
});

test('own command diagnostics distinguish rejected permissions without logging text or identities', async t => {
  const f = await fixture(t); const entries = [];
  const router = createRouter(f.client, f.store, f.app, f.config, (...args) => entries.push(args));
  await router.ready();
  await router.handle(f.message('!nuevo secreto', { to: '999@lid' }));
  assert.deepEqual(entries[0], ['comando_reserva_recibido', { identidadLista: true, origenPropio: true, destinoPropio: false, autorCoincide: true }]);
  assert.equal(entries[1][0], 'reserva_rechazo_permisos');
  assert.ok(!JSON.stringify(entries).includes('secreto')); assert.ok(!JSON.stringify(entries).includes('999'));
  entries.length = 0;
  await router.handle(f.message('!nuevo', { fromMe: false, from: '999@c.us', to: pn }));
  assert.equal(entries.length, 0);
});
test('successful command emits send result diagnostics', async t => {
  const f = await fixture(t); const entries = [];
  const router = createRouter(f.client, f.store, f.app, f.config, e => entries.push(e));
  await router.ready(); await router.handle(f.message('!ayuda'));
  assert.ok(entries.includes('intento_respuesta_reserva')); assert.ok(entries.includes('respuesta_reserva_enviada'));
});


test('verified self endpoints authorize despite supplemental author and broken chat lookup', async t => {
  const f = await fixture(t);
  await f.router.handle(f.message('!nuevo', {
    author: 'different-representation',
    getChat: async () => { throw Error('broken library lookup must not be used'); },
  }));
  assert.equal(f.sent.length, 1); assert.equal(f.store.draft(`owner:${pn}`).step, 0);
});
for (const [name, extra] of Object.entries({
  group: { to: '111@g.us' }, otherDestination: { to: team },
  otherOrigin: { from: team }, incoming: { fromMe: false, from: '999@c.us' },
  nonBooleanFlag: { fromMe: 'true' },
})) {
  test(`supplemental author cannot bypass ${name} rejection`, async t => {
    const f = await fixture(t);
    await f.router.handle(f.message('!nuevo', { author: pn, ...extra }));
    assert.equal(f.sent.length, 0); assert.equal(f.store.draft(`owner:${pn}`), null);
  });
}
test('disconnect still denies self endpoints with any author', async t => {
  const f = await fixture(t); f.router.reset();
  await f.router.handle(f.message('!nuevo', { author: 'different-representation' }));
  assert.equal(f.sent.length, 0);
});
