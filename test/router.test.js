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
