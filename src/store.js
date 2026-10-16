'use strict';
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
class Store {
  constructor(filename) {
    if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS sent(token TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, data TEXT NOT NULL, version INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS history(seq INTEGER PRIMARY KEY, event_id TEXT NOT NULL, action TEXT NOT NULL, at TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS drafts(actor TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS processed(actor TEXT NOT NULL, token TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY(actor, token));
      PRAGMA user_version=1;`);
  }
  all() { return this.db.prepare('SELECT data FROM events').all().map(row => JSON.parse(row.data)).sort((a, b) => `${a.date} ${a.start} ${a.id}`.localeCompare(`${b.date} ${b.start} ${b.id}`)); }
  get(id) { const row = this.db.prepare('SELECT data,version FROM events WHERE id=?').get(id); return row ? { event: JSON.parse(row.data), version: row.version } : null; }
  draft(actor) { const row = this.db.prepare('SELECT data FROM drafts WHERE actor=?').get(actor); return row ? JSON.parse(row.data) : null; }
  setDraft(actor, draft) { this.db.prepare('INSERT INTO drafts(actor,data) VALUES(?,?) ON CONFLICT(actor) DO UPDATE SET data=excluded.data').run(actor, JSON.stringify(draft)); }
  clearDraft(actor) { this.db.prepare('DELETE FROM drafts WHERE actor=?').run(actor); }
  save(event, action, expectedVersion = null) {
    const now = new Date().toISOString();
    if (!event.id) {
      event = { ...event, id: `EV-${randomUUID()}`, createdAt: now, updatedAt: now };
      this.db.prepare('INSERT INTO events(id,data,version) VALUES(?,?,1)').run(event.id, JSON.stringify(event));
    } else {
      event = { ...event, updatedAt: now };
      const result = this.db.prepare('UPDATE events SET data=?,version=version+1 WHERE id=? AND version=?').run(JSON.stringify(event), event.id, expectedVersion);
      if (result.changes !== 1) throw Error('La reserva cambió. Descartá el borrador y volvé a consultarla.');
    }
    this.db.prepare('INSERT INTO history(event_id,action,at,data) VALUES(?,?,?,?)').run(event.id, action, now, JSON.stringify(event));
    return event;
  }
  history(id) { return this.db.prepare('SELECT action,at FROM history WHERE event_id=? ORDER BY seq').all(id); }
  once(actor, token, operation) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.db.prepare('SELECT 1 FROM processed WHERE actor=? AND token=?').get(actor, token)) { this.db.exec('ROLLBACK'); return null; }
      const result = operation();
      this.db.prepare('INSERT INTO processed(actor,token,at) VALUES(?,?,?)').run(actor, token, new Date().toISOString());
      this.db.exec('COMMIT');
      return result;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  markSent(token) { this.db.prepare('INSERT OR IGNORE INTO sent(token) VALUES(?)').run(token); }
  isSent(token) { return Boolean(this.db.prepare('SELECT 1 FROM sent WHERE token=?').get(token)); }
  backup(destination) { this.db.prepare('VACUUM INTO ?').run(destination); }
  close() { this.db.close(); }
}
module.exports = { Store };
