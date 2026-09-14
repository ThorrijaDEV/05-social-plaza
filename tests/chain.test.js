'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { EventLog, sha256, footOf } = require('../js/core/chain.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); process.exitCode = 1; }
}
function suite(name) { console.log('## ' + name); }
function tmp() { return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'plaza-')), 'log.jsonl'); }

suite('EventLog: cadena de hash');

test('eventos encadenados verifican', () => {
  const log = new EventLog({ file: tmp() });
  log.append('post', { nombre: 'A', foot: footOf('claveA'), text: 'hola', ts: 1 });
  log.append('post', { nombre: 'A', foot: footOf('claveA'), text: 'segundo', ts: 2 });
  log.append('like', { nombre: 'B', foot: footOf('claveB'), target: 'x', ts: 3 });
  assert.deepStrictEqual(log.verify(), { ok: true, events: 3 });
});

test('ids son únicos y cortos', () => {
  const log = new EventLog({});
  const a = log.append('post', { text: 'mismo', foot: '', ts: 1 });
  const b = log.append('post', { text: 'mismo', foot: '', ts: 2 });
  assert.notStrictEqual(a.id, b.id);
  assert.strictEqual(a.id.length, 12);
  assert.strictEqual(b.id.length, 12);
});

test('manipular un evento rompe la cadena', () => {
  const file = tmp();
  const log = new EventLog({ file: file });
  log.append('post', { nombre: 'A', text: 'original', foot: footOf('x'), ts: 1 });
  log.append('post', { nombre: 'B', text: 'otro', foot: footOf('y'), ts: 2 });
  log.corrupt(0);
  const log2 = new EventLog({ file: file });
  const v = log2.verify();
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.event, 0);
});

test('persistencia: recargar desde archivo conserva la cadena', () => {
  const file = tmp();
  let log = new EventLog({ file: file });
  log.append('post', { text: 'uno', foot: '', ts: 10 });
  log = new EventLog({ file: file });
  assert.strictEqual(log.events().length, 1);
  assert.deepStrictEqual(log.verify(), { ok: true, events: 1 });
});

test('footOf deriva una huella determinista sin exponer la clave', () => {
  const f = footOf('frase secreta');
  assert.strictEqual(f.length, 8);
  assert.strictEqual(footOf('frase secreta'), f);
  assert.notStrictEqual(footOf('frase secreta'), footOf('otra'));
  assert.ok(!f.includes('secreta'));
});

suite('EventLog: hashing criptográfico');

test('sha256 es estable y sensible al contenido', () => {
  const h = sha256('plaza');
  assert.strictEqual(h, sha256('plaza'));
  assert.notStrictEqual(h, sha256('plaza2'));
  assert.strictEqual(h.length, 64);
});

console.log('\n' + passed + ' pruebas superadas\n');