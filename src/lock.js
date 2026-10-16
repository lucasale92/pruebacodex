'use strict';
const fs = require('node:fs');
const path = require('node:path');
function acquire(filename) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const create = () => fs.openSync(filename, 'wx');
  let fd;
  try { fd = create(); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = Number(fs.readFileSync(filename, 'utf8'));
    if (!Number.isInteger(pid) || pid <= 0) throw Error('Lock inválido. Verificá que el bot esté detenido antes de retirar data/bot.lock.');
    try { process.kill(pid, 0); }
    catch (probe) {
      if (probe.code !== 'ESRCH') throw Error('No se pudo comprobar si hay otra instancia.');
      fs.unlinkSync(filename); fd = create();
    }
    if (fd === undefined) throw Error('Hay otra instancia del bot o del respaldo en ejecución. Cerrala primero.');
  }
  fs.writeFileSync(fd, String(process.pid)); fs.closeSync(fd);
  let released = false;
  return () => { if (!released) { released = true; fs.unlinkSync(filename); } };
}
module.exports = { acquire };
