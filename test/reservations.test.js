'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../src/store');
const { Reservations } = require('../src/reservations');
const d = require('../src/domain');
const { check } = require('../scripts/backup');
function fixture(t, filename = ':memory:', config = {}) {
  const store = new Store(filename); t.after(() => store.close());
  const app = new Reservations(store, config); let n = 0;
  const send = (text, extra = {}) => app.handle({ actor: 'owner', token: String(++n), role: 'owner', text, ...extra });
  return { store, app, send };
}
function create(send, overrides = {}) {
  const input = { date: '25/12/2026', start: '22:00', end: '01:00', nextDay: 'sí', client: "Cliente ' OR 1=1 --", phone: '-', place: 'Salón', address: 'Calle 1', resources: 'castillo#1, mickey#1', responsible: 'ana', total: '10000', deposit: '2000', status: 'confirmado', notes: 'Privado' , ...overrides };
  send('!nuevo'); let last;
  for (const [key] of d.fields) last = send(input[key]);
  return last;
}
test('guided creation requires confirmation, persists money and history; cancel retains record', t => {
  const { store, send } = fixture(t);
  assert.match(create(send), /confirmar/); assert.equal(store.all().length, 0);
  send('confirmar'); const event = store.all()[0];
  assert.equal(event.total, 1000000); assert.equal(event.payments[0].amount, 200000);
  assert.equal(event.client, "Cliente ' OR 1=1 --"); assert.ok(event.createdAt); assert.ok(event.updatedAt);
  send(`!pago ${event.id} 3000 saldo parcial`); assert.equal(store.get(event.id).event.payments.length, 1);
  send('confirmar'); assert.equal(store.get(event.id).event.payments.length, 2);
  send(`!cancelar ${event.id}`); assert.equal(store.get(event.id).event.status, 'confirmado');
  send('confirmar'); assert.equal(store.get(event.id).event.status, 'cancelado');
  assert.equal(store.history(event.id).length, 3); assert.equal(store.all().length, 1);
});
test('discard, invalid dates, ambiguous dates, money and overnight validation', t => {
  const { send, store } = fixture(t);
  send('!nuevo'); assert.match(send('mañana'), /DD\/MM\/AAAA/); assert.match(send('31/02/2026'), /no existe/);
  send('!descartar'); create(send); send('descartar'); assert.equal(store.all().length, 0);
  assert.throws(() => d.date('1/2/26')); assert.throws(() => d.date('29/02/2025')); assert.equal(d.date('29/02/2028'), '2028-02-29');
  assert.throws(() => d.money('-1')); assert.throws(() => d.money('1.000,00')); assert.equal(d.money('10,50'), 1050);
  assert.throws(() => d.time('24:00')); assert.throws(() => d.range({ date: '2026-12-25', start: '22:00', end: '01:00', nextDay: false }));
  assert.equal(d.range({ date: '2026-12-25', start: '22:00', end: '01:00', nextDay: true }).end - d.range({ date: '2026-12-25', start: '22:00', end: '01:00', nextDay: true }).start, 3 * 3600000);
});
test('team is read-only, queries redact all private fields and outsiders are ignored', t => {
  const { send, store } = fixture(t); create(send); send('confirmar'); const event = store.all()[0];
  for (const command of ['!nuevo', `!editar ${event.id}`, `!cancelar ${event.id}`, `!pago ${event.id} 100`, `!ver ${event.id}`, 'confirmar']) send(command, { actor: 'team', role: 'team' });
  assert.equal(store.all().length, 1); assert.equal(store.get(event.id).event.status, 'confirmado'); assert.equal(store.get(event.id).event.payments.length, 1);
  const result = send('!fecha 25/12/2026', { actor: 'team', role: 'team' });
  assert.match(result, /castillo#1/); for (const privateText of ['Cliente', 'Total:', 'Pagado:', 'Saldo:', 'Privado', 'Teléfono:', 'seña']) assert.ok(!result.includes(privateText));
  assert.equal(send('!agenda', { role: 'stranger' }), null);
});
test('duplicates survive database reopen and drafts resume; verified backup restores data', t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'eventos-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'data.sqlite'); let store = new Store(file); let app = new Reservations(store, {}); let n = 0;
  const send = text => app.handle({ actor: 'owner', role: 'owner', token: String(++n), text });
  create(send); store.close(); store = new Store(file); app = new Reservations(store, {});
  send('confirmar'); const count = n;
  store.close(); store = new Store(file); app = new Reservations(store, {});
  assert.equal(app.handle({ actor: 'owner', role: 'owner', token: String(count), text: 'confirmar' }), null); assert.equal(store.all().length, 1);
  const backup = path.join(dir, 'backup.sqlite'); store.backup(backup); check(backup); store.close();
  const restored = new Store(backup); assert.equal(restored.all().length, 1); assert.equal(restored.history(restored.all()[0].id).length, 1); restored.close();
});
test('conflicts distinguish units, people, overnight and preparation buffers', t => {
  const { send, store } = fixture(t); create(send); send('confirmar'); const first = store.all()[0];
  const config = d.configFrom({ trasladoMin: 30, armadoMin: 15, desarmeMin: 15 });
  const other = { ...first, id: 'other', resources: ['castillo#2'], responsible: 'bea', date: '2026-12-26', start: '01:30', end: '03:00', nextDay: false };
  assert.equal(d.conflicts(other, [first], config).length, 0);
  assert.equal(d.conflicts({ ...other, responsible: 'ana' }, [first], config).length, 1);
  assert.equal(d.conflicts({ ...other, resources: ['castillo#1'] }, [first], config).length, 1);
  assert.equal(d.conflicts({ ...other, resources: ['castillo#1'] }, [first], d.configFrom()).length, 0);
  assert.equal(d.conflicts({ ...other, status: 'cancelado', resources: ['castillo#1'] }, [first], config).length, 0);
});
test('conflicting creation requires explicit override and stale edits cannot overwrite', t => {
  const { send, store } = fixture(t); create(send); send('confirmar');
  assert.match(create(send), /superposición/); assert.match(send('confirmar'), /confirmar con conflicto/); assert.equal(store.all().length, 1);
  send('confirmar con conflicto'); assert.equal(store.all().length, 2);
  const event = store.all()[0]; send(`!editar ${event.id}`); send('notes'); send('Nueva nota');
  store.once('other', 'one', () => store.save({ ...event, notes: 'Cambio externo' }, 'editar', 1));
  assert.match(send('confirmar con conflicto'), /reserva cambió/); assert.equal(store.get(event.id).event.notes, 'Cambio externo');
});
test('overpayment rejected and editing preserves payment history', t => {
  const { send, store } = fixture(t); create(send); send('confirmar'); const event = store.all()[0];
  assert.match(send(`!pago ${event.id} 99999`), /no pueden superar/); assert.equal(store.draft('owner'), null);
  send(`!editar ${event.id}`); send('total'); assert.match(send('100'), /no pueden superar/); send('20000'); send('confirmar');
  assert.equal(store.get(event.id).event.total, 2000000); assert.equal(store.get(event.id).event.payments[0].amount, 200000);
});
test('date queries include previous-day overnight events and sort chronologically', t => {
  const { send, store } = fixture(t); create(send); send('confirmar');
  create(send, { date: '26/12/2026', start: '10:00', end: '12:00', nextDay: 'no' }); send('confirmar');
  const output = send('!fecha 26/12/2026'); assert.ok(output.indexOf(store.all()[0].id) < output.indexOf(store.all()[1].id));
  assert.equal(d.today(new Date('2026-12-26T01:00:00Z')), '2026-12-25');
});
