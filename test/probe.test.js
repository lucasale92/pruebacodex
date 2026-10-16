const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProbe, ownIds } = require('../src/probe');
const pn = '111@c.us', lid = '222@lid';
function fixture(options = {}) {
  const calls = [], logs = [];
  const client = {
    info: { wid: { _serialized: pn } },
    getContactLidAndPhone: async () => [{ pn, lid }],
    sendMessage: async (...args) => { calls.push(args); },
    ...options,
  };
  return { client, calls, logs, probe: createProbe(client, e => logs.push(e)) };
}
const message = extra => ({ body: '!prueba', fromMe: true, from: pn, to: lid, id: { _serialized: 'unique' }, ...extra });
test('aliases of the authenticated account authorize self chat', async () => {
  const f = fixture(); await f.probe.ready(); await f.probe.handle(message());
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0][0], lid);
  assert.deepEqual(f.calls[0][2], { sendSeen: false });
});
for (const [name, extra] of Object.entries({ incoming: { fromMe: false }, otherChat: { to: '333@c.us' }, forgedSender: { from: '333@c.us' }, group: { to: '111@g.us' }, author: { author: pn }, missingId: { id: null } })) {
  test(`reject ${name}`, async () => {
    const f = fixture(); await f.probe.ready(); await f.probe.handle(message(extra)); assert.equal(f.calls.length, 0);
  });
}
test('unrelated mappings never become own aliases', async () => {
  const f = fixture({ getContactLidAndPhone: async () => [{ pn: '333@c.us', lid }] });
  await f.probe.ready(); await f.probe.handle(message()); assert.equal(f.calls.length, 0);
});
test('resolver failure denies unknown alias but accepts exact own identity', async () => {
  const f = fixture({ getContactLidAndPhone: async () => { throw Error('private'); } });
  await f.probe.ready(); await f.probe.handle(message()); assert.equal(f.calls.length, 0);
  await f.probe.handle(message({ to: pn })); assert.equal(f.calls.length, 1);
});
test('no ready or disconnected means no access', async () => {
  const f = fixture(); await f.probe.handle(message()); await f.probe.ready(); f.probe.reset();
  await f.probe.handle(message()); assert.equal(f.calls.length, 0);
});
test('concurrent duplicate delivery sends once', async () => {
  const f = fixture(); await f.probe.ready();
  await Promise.all([f.probe.handle(message()), f.probe.handle(message())]); assert.equal(f.calls.length, 1);
});
test('send errors do not leak details', async () => {
  const f = fixture({ sendMessage: async () => { throw Error('private'); } });
  await f.probe.ready(); await f.probe.handle(message());
  assert.ok(f.logs.includes('error_envio')); assert.ok(!JSON.stringify(f.logs).includes('private'));
});
test('missing authenticated identity fails closed', async () => {
  await assert.rejects(ownIds({ info: {} }), /IDENTITY_UNAVAILABLE/);
});
