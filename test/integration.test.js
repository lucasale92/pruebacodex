'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Store } = require('../src/store');
test('entrypoint queues send echoes safely through an entire guided reservation and closes cleanly', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'event-entry-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.copyFileSync(path.join(__dirname, '..', 'index.js'), path.join(dir, 'index.js'));
  fs.cpSync(path.join(__dirname, '..', 'src'), path.join(dir, 'src'), { recursive: true });
  const preload = path.join(dir, 'channel.cjs');
  fs.writeFileSync(preload, `
const Module = require('node:module');
const {EventEmitter} = require('node:events');
const original = Module._load;
let counter = 0;
class Client extends EventEmitter {
  constructor() { super(); this.info = {wid:{_serialized:'111@c.us'}}; }
  async getContactLidAndPhone() { return [{pn:'111@c.us',lid:'222@lid'}]; }
  async sendMessage(to, body) {
    const message = {fromMe:true,from:'111@c.us',to,body,id:{id:'bot-'+(++counter)}};
    this.emit('message_create', message); // Echo happens BEFORE the promise resolves.
    if (body.startsWith('Guardado.')) { this.saved = true; }
    return message;
  }
  async destroy() { if (!this.saved) throw Error('No reservation saved'); }
  async initialize() {
    this.emit('authenticated'); this.emit('ready');
    const steps = ['!nuevo','25/12/2026','18:00','20:00','no','Cliente de prueba','-','Salón','Calle 1','castillo#1','-','10000','2000','tentativo','Observación','confirmar'];
    for (let i=0;i<steps.length;i++) {
      await new Promise(resolve => setTimeout(resolve, 10));
      this.emit('message_create',{fromMe:true,from:'111@c.us',to:'222@lid',body:steps[i],id:{id:'human-'+i}});
    }
    await new Promise(resolve => setTimeout(resolve, 50));
    process.emit('SIGINT');
  }
}
Module._load = function(name,...args) {
  if(name==='whatsapp-web.js') return {Client,LocalAuth:class{}};
  if(name==='qrcode-terminal') return {generate(){throw Error('Unexpected QR');}};
  return original.call(this,name,...args);
};
`);
  const run = spawnSync(process.execPath, ['--require', preload, path.join(dir, 'index.js')], { encoding: 'utf8', timeout: 10000 });
  assert.equal(run.status, 0, run.stderr + run.stdout); assert.match(run.stdout, /conexion_lista/); assert.ok(!run.stdout.includes('error_'));
  const store = new Store(path.join(dir, 'data', 'eventos.sqlite'));
  assert.equal(store.all().length, 1); assert.equal(store.all()[0].client, 'Cliente de prueba'); assert.equal(store.all()[0].total, 1000000);
  assert.equal(store.history(store.all()[0].id).length, 1); store.close();
  assert.ok(!fs.existsSync(path.join(dir, 'data', 'bot.lock')));
});
