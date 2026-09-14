'use strict';

const fs = require('fs');
const crypto = require('crypto');

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

function footOf(secret) {
  if (!secret) return '';
  return sha256('foot:' + secret).slice(0, 8);
}

// Registro append-only encadenado por hash. Cada evento referencia el hash
// del anterior: alterar cualquier entrada rompe toda la cadena.
class EventLog {
  constructor(opts) {
    opts = opts || {};
    this.file = opts.file || null;
    this.now = opts.now || (function () { return Date.now(); });
    this._events = [];
    this._seq = 0;
    if (this.file && fs.existsSync(this.file)) this._load();
  }

  _load() {
    const lines = fs.readFileSync(this.file, 'utf8').trim().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      this._events.push(JSON.parse(line));
    }
  }

  // Devuelve la cadena íntegra tal cual (sin reescribir).
  events() { return this._events.slice(); }

  append(type, data) {
    const ts = data && data.ts !== undefined ? data.ts : this.now();
    const prev = this._events.length ? this._events[this._events.length - 1].hash : 'GENESIS';
    const canonical = type + '|' + ts + '|' + (data.foot || '') + '|' + JSON.stringify(data) + '|' + prev;
    const hash = sha256(canonical);
    const id = sha256(canonical + '|' + (this._seq++)).slice(0, 12);
    const ev = {
      id: id,
      type: type,
      ts: ts,
      foot: data.foot || '',
      data: data,
      prev: prev,
      hash: hash
    };
    this._events.push(ev);
    if (this.file) fs.appendFileSync(this.file, JSON.stringify(ev) + '\n');
    return ev;
  }

  // Verifica la integridad de la cadena: hashes y enlaces prev.
  verify() {
    let prev = 'GENESIS';
    for (let i = 0; i < this._events.length; i++) {
      const ev = this._events[i];
      if (ev.prev !== prev) return { ok: false, event: i, why: 'enlace prev roto' };
      const canonical = ev.type + '|' + ev.ts + '|' + (ev.foot || '') + '|' + JSON.stringify(ev.data) + '|' + prev;
      const h = sha256(canonical);
      if (h !== ev.hash) return { ok: false, event: i, why: 'hash no coincide (manipulación)' };
      prev = ev.hash;
    }
    return { ok: true, events: this._events.length };
  }

  // Relee HASTA un índice (pruebas de manipulación): reescribe y recarga.
  corrupt(eventIdx) {
    if (!this.file) throw new Error('sin archivo');
    const lines = fs.readFileSync(this.file, 'utf8').trim().split('\n');
    const ev = JSON.parse(lines[eventIdx]);
    ev.data.text = ev.data.text + ' MANIPULADO';
    lines[eventIdx] = JSON.stringify(ev);
    fs.writeFileSync(this.file, lines.join('\n') + '\n');
    this._events = [];
    this._load();
  }
}

module.exports = { EventLog: EventLog, sha256: sha256, footOf: footOf };