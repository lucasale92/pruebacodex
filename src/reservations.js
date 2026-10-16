'use strict';
const d = require('./domain');
const HELP = `Reservas · zona America/Argentina/Ushuaia
!nuevo — carga guiada
!agenda [hoy|7|DD/MM/AAAA] [página] — próximos 7 días por defecto
!ver ID — detalle privado
!editar ID — elegir un campo
!pago ID MONTO [nota] — agregar pago
!cancelar ID — conserva registro e historial
!historial ID — cambios registrados
!pendiente — retomar borrador
confirmar / descartar — resolver el resumen
!descartar — salir de cualquier paso
Los cambios requieren confirmación. No interpreto texto libre ni audio todavía.`;
const editNames = { date: 'fecha', start: 'inicio', end: 'fin', nextDay: 'dia_siguiente', client: 'cliente', phone: 'telefono', place: 'lugar', address: 'direccion', resources: 'recursos', responsible: 'responsable', total: 'precio', status: 'estado', notes: 'observaciones' };
const TEAM_HELP = 'Solo consultas: !hoy, !semana, !fecha DD/MM/AAAA, !agenda [hoy|7|DD/MM/AAAA] [página].';
class Reservations {
  constructor(store, config) { this.store = store; this.config = d.configFrom(config); }
  summary(draft) {
    const warnings = d.conflicts(draft.event, this.store.all(), this.config);
    return `${d.format(draft.event)}\n\n${warnings.length ? `ATENCIÓN: superposición o margen insuficiente con ${warnings.join('; ')}.\nPara aceptar igualmente escribí “confirmar con conflicto”` : 'Escribí “confirmar” para guardar'} o “descartar”.`;
  }
  agenda(text, admin) {
    let parts = text.trim().split(/\s+/), mode = '7', page = 1;
    const command = parts.shift().toLowerCase();
    if (command === '!hoy') mode = 'hoy';
    else if (command === '!fecha') mode = parts.shift();
    else if (command === '!agenda') mode = parts.shift() || '7';
    if (parts.length) { if (parts.length !== 1 || !/^[1-9]\d{0,3}$/.test(parts[0])) throw Error('Página inválida.'); page = +parts[0]; }
    const startDay = mode === 'hoy' || mode === '7' ? d.today() : d.date(mode || '');
    const endDay = d.addDays(startDay, mode === '7' ? 7 : 1);
    const windowStart = Date.parse(`${startDay}T00:00:00-03:00`), windowEnd = Date.parse(`${endDay}T00:00:00-03:00`);
    const events = this.store.all().filter(e => { const r = d.range(e); return e.status !== 'cancelado' && r.end > windowStart && r.start < windowEnd; });
    if (!events.length) return 'No hay eventos activos en ese período.';
    const pages = Math.ceil(events.length / 10);
    if (page > pages) throw Error(`Hay ${pages} páginas.`);
    return `Agenda · página ${page}/${pages}\n${events.slice((page - 1) * 10, page * 10).map(e => d.format(e, admin)).join('\n\n')}\n\nOtra página: !agenda ${mode} N`;
  }
  handle({ actor, token, role, text }) {
    if (!['owner', 'team'].includes(role)) return null;
    if (typeof text !== 'string' || text.length > 4000) return 'Texto demasiado largo (máximo 4000 caracteres).';
    text = text.trim();
    if (!text) return null;
    return this.store.once(actor, token, () => this.dispatch(actor, role, text));
  }
  dispatch(actor, role, text) {
    const command = text.split(/\s+/)[0].toLowerCase();
    const admin = role === 'owner';
    try {
      if (['!agenda', '!hoy', '!semana', '!fecha'].includes(command)) return this.agenda(text, admin);
      if (command === '!ayuda') return admin ? HELP : TEAM_HELP;
      if (command === '!audio_no_disponible') return 'Los audios todavía no están habilitados. Enviá texto; no se descargó ni transcribió el audio.';
      if (!admin) return text.startsWith('!') ? `Acceso de solo lectura. ${TEAM_HELP}` : null;
      const draft = this.store.draft(actor);
      if (text.toLowerCase() === 'descartar' || command === '!descartar') { this.store.clearDraft(actor); return 'Borrador descartado. No se modificaron reservas.'; }
      if (command === '!pendiente') return draft ? draft.stage === 'confirm' ? this.summary(draft) : draft.stage === 'choose' ? this.editPrompt() : d.fields[draft.step][1] : 'No hay borrador pendiente.';
      // Queries may run during a guided flow, without being treated as field data.
      if (command === '!ver' || command === '!historial') {
        const id = text.split(/\s+/)[1];
        const record = this.store.get(id || ''); if (!record) throw Error('ID inexistente. Copiá el ID completo desde !agenda.');
        if (command === '!ver') return d.format(record.event);
        return this.store.history(id).map(row => `${d.auditTime(row.at)} · ${row.action}`).join('\n');
      }
      if (draft) {
        if (text.startsWith('!')) return 'Tenés un borrador pendiente. Usá !pendiente o !descartar antes de otra modificación.';
        return this.advance(actor, draft, text);
      }
      if (command === '!nuevo') {
        this.store.setDraft(actor, { stage: 'fields', step: 0, event: { payments: [] }, action: 'creacion', version: null });
        return `Podés salir con !descartar.\n${d.fields[0][1]}`;
      }
      if (['!editar', '!cancelar', '!pago'].includes(command)) {
        const [, id, amount, ...note] = text.split(/\s+/);
        const record = this.store.get(id || ''); if (!record) throw Error('ID inexistente. Copiá el ID completo desde !agenda.');
        if (record.event.status === 'cancelado' && command !== '!editar') throw Error('La reserva ya está cancelada.');
        const next = { stage: 'confirm', event: record.event, version: record.version, action: command.slice(1) };
        if (command === '!editar') { next.stage = 'choose'; this.store.setDraft(actor, next); return this.editPrompt(); }
        if (command === '!cancelar') next.event.status = 'cancelado';
        if (command === '!pago') {
          const paid = d.money(amount || ''); if (!paid) throw Error('El pago debe ser mayor que cero.');
          next.event.payments.push({ amount: paid, kind: 'pago', at: new Date().toISOString(), note: note.join(' ').slice(0, 300) });
        }
        d.validate(next.event); this.store.setDraft(actor, next); return this.summary(next);
      }
      return text.startsWith('!') ? 'Comando desconocido. Escribí !ayuda.' : null;
    } catch (error) {
      // Domain validation messages are authored by this application, not library data.
      if (error instanceof TypeError || error instanceof RangeError) return 'Entrada inválida. Revisá el formato o usá !ayuda.';
      if (error.code) throw error; // Database/I/O failures must roll back the transaction.
      return error.message;
    }
  }
  editPrompt() {
    return `¿Qué campo querés cambiar? Escribí uno de estos nombres:\n${d.fields.filter(f => f[0] !== 'deposit').map(f => editNames[f[0]]).join(', ')}\nLos pagos se agregan con !pago; no se reemplazan ni borran.`;
  }
  advance(actor, draft, text) {
    if (draft.stage === 'confirm') {
      if (!['confirmar', 'confirmar con conflicto'].includes(text.toLowerCase())) return this.summary(draft);
      d.validate(draft.event);
      const warnings = d.conflicts(draft.event, this.store.all(), this.config);
      if (warnings.length && text.toLowerCase() !== 'confirmar con conflicto') return this.summary(draft);
      const saved = this.store.save(draft.event, draft.action, draft.version);
      this.store.clearDraft(actor);
      return `Guardado.\n${d.format(saved)}`;
    }
    if (draft.stage === 'choose') {
      const index = d.fields.findIndex(f => (f[0] === text.toLowerCase() || editNames[f[0]] === text.toLowerCase()) && f[0] !== 'deposit');
      if (index < 0) return this.editPrompt();
      draft.stage = 'edit'; draft.step = index; this.store.setDraft(actor, draft); return d.fields[index][1];
    }
    const [key, , parse] = d.fields[draft.step];
    let value;
    try { value = parse(text); }
    catch (error) { return `${error.message}\n${d.fields[draft.step][1]}`; }
    if (key === 'deposit') {
      if (value > draft.event.total) return 'La seña no puede superar el precio total. Ingresá otro monto:';
      draft.event.payments = value ? [{ amount: value, kind: 'seña', at: new Date().toISOString(), note: '' }] : [];
    } else draft.event[key] = value;
    if (draft.stage === 'edit') {
      try { d.validate(draft.event); }
      catch (error) { return `${error.message}\n${d.fields[draft.step][1]}\nPara cambiar varios campos, hacé cambios compatibles de a uno o descartá y creá otra reserva.`; }
      draft.stage = 'confirm';
    } else {
      if (key === 'nextDay') {
        try { d.range(draft.event); } catch (error) { return `${error.message}\n${d.fields[draft.step][1]}\nSi el horario inicial era incorrecto, usá !descartar y !nuevo.`; }
      }
      draft.step++;
      if (draft.step === d.fields.length) { d.validate(draft.event); draft.stage = 'confirm'; }
    }
    this.store.setDraft(actor, draft);
    return draft.stage === 'confirm' ? this.summary(draft) : d.fields[draft.step][1];
  }
}
module.exports = { Reservations, HELP, TEAM_HELP };
