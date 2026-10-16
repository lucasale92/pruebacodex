'use strict';
// Run only while the bot is stopped. No session files are copied.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { Store } = require('../src/store');
const { acquire } = require('../src/lock');
const root = path.resolve(__dirname, '..');
const database = path.join(root, 'data', 'eventos.sqlite');
const backupDir = path.join(root, 'backups');
function check(filename) {
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw Error('Respaldo inválido.');
    for (const name of ['events', 'history', 'drafts', 'processed', 'sent']) {
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)) throw Error('Falta tabla requerida.');
    }
    for (const row of db.prepare('SELECT data FROM events').all()) require('../src/domain').validate(JSON.parse(row.data));
  } finally { db.close(); }
}
function snapshot() {
  if (!fs.existsSync(database)) throw Error('No hay base de datos para respaldar.');
  fs.mkdirSync(backupDir, { recursive: true });
  const destination = path.join(backupDir, `eventos-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}.sqlite`);
  const store = new Store(database);
  try { store.backup(destination); } finally { store.close(); }
  check(destination);
  return destination;
}
function main() {
  const release = acquire(path.join(root, 'data', 'bot.lock'));
  try {
    const command = process.argv[2] || 'crear';
    if (command === 'crear') { snapshot(); console.log('Copia creada y verificada en backups. Guardala también en otro dispositivo seguro.'); }
    else if (command === 'restaurar') {
      if (!process.argv[3] || process.argv[4] !== '--confirmar') throw Error('Uso: node scripts/backup.js restaurar "ruta al respaldo.sqlite" --confirmar');
      const source = path.resolve(process.argv[3]); check(source);
      if (source === database) throw Error('Elegí un archivo de respaldo distinto de la base activa.');
      if (fs.existsSync(database)) snapshot();
      const temporary = database + '.restoring';
      fs.copyFileSync(source, temporary, fs.constants.COPYFILE_EXCL);
      try { check(temporary); fs.renameSync(temporary, database); }
      catch (e) { fs.rmSync(temporary, { force: true }); throw e; }
      console.log('Base restaurada. Se conservó copia previa si existía. La sesión de WhatsApp no se modificó.');
    } else throw Error('Usá crear o restaurar.');
  } finally { release(); }
}
if (require.main === module) {
  try { main(); } catch { console.error('No se pudo completar. Detené el bot, verificá la ruta y el formato del respaldo y los permisos. Uso: node scripts/backup.js crear | restaurar "archivo.sqlite" --confirmar'); process.exitCode = 1; }
}
module.exports = { check };
