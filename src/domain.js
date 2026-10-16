'use strict';
const ZONE = 'America/Argentina/Ushuaia';
const DEFAULT_CONFIG = { team: [], trasladoMin: 0, armadoMin: 0, desarmeMin: 0 };
function configFrom(raw = {}) {
  const config = { ...DEFAULT_CONFIG, ...raw };
  if (!Array.isArray(config.team) || config.team.some(id => !/^\d+@(c\.us|lid)$/.test(id))) throw Error('La lista team debe contener IDs exactos @c.us o @lid.');
  for (const key of ['trasladoMin', 'armadoMin', 'desarmeMin']) {
    if (!Number.isInteger(config[key]) || config[key] < 0 || config[key] > 1440) throw Error(`Valor inválido: ${key}`);
  }
  return config;
}
function date(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) throw Error('Usá DD/MM/AAAA con año, por ejemplo 25/12/2026.');
  const [, d, m, y] = match;
  const iso = `${y}-${m}-${d}`;
  const parsed = new Date(`${iso}T12:00:00Z`);
  if (+y < 2000 || +y > 2100 || !Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== iso) throw Error('La fecha no existe o está fuera de 2000–2100.');
  return iso;
}
function visibleDate(iso) { return iso.split('-').reverse().join('/'); }
function time(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw Error('Usá HH:mm, entre 00:00 y 23:59.');
  return value;
}
function money(value) {
  if (!/^\d{1,9}(?:[,.]\d{1,2})?$/.test(value)) throw Error('Usá un monto positivo sin separadores de miles, por ejemplo 15000,50.');
  const [whole, fraction = ''] = value.replace(',', '.').split('.');
  return +whole * 100 + +(fraction.padEnd(2, '0'));
}
function auditTime(value) {
  return new Intl.DateTimeFormat('es-AR', { timeZone: ZONE, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}
function pesos(cents) { return `$ ${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)}`; }
function short(value, max = 300) {
  if (!value || value.length > max || /[\x00-\x08\x0B-\x1F\x7F]/.test(value)) throw Error(`Ingresá entre 1 y ${max} caracteres sin controles.`);
  return value;
}
const optional = value => value === '-' ? '' : short(value);
function resources(value) {
  const items = value.split(',').map(x => short(x.trim(), 80).toLowerCase());
  if (items.length > 30 || new Set(items).size !== items.length) throw Error('Usá hasta 30 unidades diferentes separadas por coma.');
  return items;
}
function range(event) {
  const endDate = event.nextDay ? addDays(event.date, 1) : event.date;
  // Ushuaia uses UTC-03:00. Confirm the IANA projection before accepting.
  const start = Date.parse(`${event.date}T${event.start}:00-03:00`);
  const end = Date.parse(`${endDate}T${event.end}:00-03:00`);
  for (const [instant, day, hour] of [[start, event.date, event.start], [end, endDate, event.end]]) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant).map(x => [x.type, x.value]));
    if (`${parts.year}-${parts.month}-${parts.day}` !== day || `${parts.hour}:${parts.minute}` !== hour) throw Error('Horario incompatible con la zona de Ushuaia.');
  }
  if (!(end > start)) throw Error('El fin debe ser posterior al inicio. Indicá sí en “día siguiente” si cruza medianoche.');
  return { start, end };
}
function addDays(iso, count) { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + count); return d.toISOString().slice(0, 10); }
function today(now = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
const fields = [
  ['date', 'Fecha (DD/MM/AAAA, con año):', date],
  ['start', 'Hora de inicio (HH:mm):', time],
  ['end', 'Hora de fin (HH:mm):', time],
  ['nextDay', '¿Termina al día siguiente? Respondé sí o no:', value => { if (!/^(sí|si|no)$/i.test(value)) throw Error('Respondé sí o no.'); return value.toLowerCase() !== 'no'; }],
  ['client', 'Nombre del cliente:', value => short(value)],
  ['phone', 'Teléfono del cliente o - para omitir:', value => { if (value === '-') return ''; if (!/^\+?[\d ()-]{6,25}$/.test(value)) throw Error('Teléfono inválido. Usá números o - para omitir.'); return value; }],
  ['place', 'Lugar del evento:', value => short(value)],
  ['address', 'Dirección:', value => short(value)],
  ['resources', 'Unidades contratadas separadas por coma. Usá siempre los mismos nombres, por ejemplo castillo#1, castillo#2, mickey#1:', resources],
  ['responsible', 'Responsable o - para dejar sin asignar (usá siempre el mismo nombre):', value => optional(value).toLowerCase()],
  ['total', 'Precio total en pesos (sin puntos de miles):', money],
  ['deposit', 'Seña inicial en pesos (0 si no hay):', money],
  ['status', 'Estado: tentativo, confirmado, realizado o cancelado:', value => { if (!['tentativo', 'confirmado', 'realizado', 'cancelado'].includes(value.toLowerCase())) throw Error('Estado inválido.'); return value.toLowerCase(); }],
  ['notes', 'Observaciones o - para omitir:', value => value === '-' ? '' : short(value, 1500)],
];
function validate(event) {
  // Validate persisted drafts again at confirmation; values are never executable.
  for (const [key, , parse] of fields) {
    if (key === 'deposit') continue;
    const value = event[key];
    if (key === 'date') { if (date(visibleDate(value)) !== value) throw Error('Fecha inválida.'); }
    else if (key === 'resources') { if (!Array.isArray(value) || !value.length) throw Error('Faltan recursos.'); resources(value.join(',')); }
    else if (key === 'nextDay') { if (typeof value !== 'boolean') throw Error('Falta indicar día siguiente.'); }
    else if (key === 'total') { if (!Number.isSafeInteger(value) || value < 0 || value > 99999999999) throw Error('Precio inválido.'); }
    else parse(value === '' ? '-' : value);
  }
  const paid = event.payments.reduce((sum, p) => {
    if (!Number.isSafeInteger(p.amount) || p.amount <= 0) throw Error('Pago inválido.');
    return sum + p.amount;
  }, 0);
  if (paid > event.total) throw Error('Los pagos no pueden superar el precio total.');
  range(event);
  return event;
}
function conflicts(event, others, config) {
  if (event.status === 'cancelado') return [];
  const current = range(event);
  const before = (config.trasladoMin + config.armadoMin) * 60000;
  const after = config.desarmeMin * 60000;
  const found = [];
  for (const other of others) {
    if (event.id === other.id || other.status === 'cancelado') continue;
    const previous = range(other);
    if (current.start - before >= previous.end + after || previous.start - before >= current.end + after) continue;
    const shared = event.resources.filter(x => other.resources.includes(x));
    if (event.responsible && event.responsible === other.responsible) shared.push(`responsable ${event.responsible}`);
    if (shared.length) found.push(`${other.id}: ${shared.join(', ')}`);
  }
  return found;
}
function format(event, privateData = true) {
  const text = [event.id || '(nuevo)', `${visibleDate(event.date)} ${event.start} a ${event.end}${event.nextDay ? ' del día siguiente' : ''} · ${event.status}`, `Lugar: ${event.place}`, `Dirección: ${event.address}`, `Recursos: ${event.resources.join(', ')}`, `Responsable: ${event.responsible || 'sin asignar'}`];
  if (privateData) {
    const paid = event.payments.reduce((s, p) => s + p.amount, 0);
    text.push(`Cliente: ${event.client}`, `Teléfono: ${event.phone || 'sin registrar'}`, `Total: ${pesos(event.total)} · Pagado: ${pesos(paid)} · Saldo: ${pesos(event.total - paid)}`);
    for (const p of event.payments) text.push(`${p.kind}: ${pesos(p.amount)} · ${auditTime(p.at)} · ${p.note || '-'}`);
    text.push(`Observaciones: ${event.notes || '-'}`);
    if (event.createdAt) text.push(`Creado: ${auditTime(event.createdAt)}`, `Modificado: ${auditTime(event.updatedAt)}`);
  }
  return text.join('\n');
}
module.exports = { auditTime, ZONE, configFrom, date, time, money, pesos, short, range, addDays, today, fields, validate, conflicts, format };
