'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { SocialHub } = require('../js/core/social.js');
const { footOf } = require('../js/core/chain.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); process.exitCode = 1; }
}
function suite(name) { console.log('## ' + name); }

function makeHub(now) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plaza-soc-'));
  const hub = new SocialHub({ file: path.join(dir, 'log.jsonl'), now: now });
  return hub;
}

let T = 1000000000;
function tick() { return (T += 60000); }

suite('SocialHub: estado derivado del registro');

test('publicar y replicar construye hilos', () => {
  const hub = makeHub(tick);
  const p1 = hub.appendPost('Ana', footOf('k1'), 'buenos días #plaza', { ts: tick() });
  const p2 = hub.appendPost('Luis', footOf('k2'), '¡hola Ana!', { ts: tick(), replyTo: p1.id });
  const p3 = hub.appendPost('Luis', footOf('k2'), '¿vienes?', { ts: tick(), replyTo: p2.id });
  assert.strictEqual(hub.size(), 3);
  // desde la raíz: 2 hijos, el segundo a profundidad 1
  const t1 = hub.thread(p1.id);
  assert.strictEqual(t1.root.length, 1);
  assert.strictEqual(t1.children.length, 2);
  assert.strictEqual(t1.children[0].depth, 0);
  assert.strictEqual(t1.children[1].depth, 1);
  // desde la respuesta intermedia: ancestros + hijo directo
  const t2 = hub.thread(p2.id);
  assert.strictEqual(t2.root.length, 2);
  assert.ok(t2.root.map(x => x.id).includes(p1.id));
  assert.strictEqual(t2.children.length, 1);
  assert.strictEqual(t2.children[0].depth, 0);
});

test('captura hashtags automáticamente', () => {
  const hub = makeHub(tick);
  hub.appendPost('A', footOf('k'), 'mirando #ferrocarril y #memoria #FerroCarril', { ts: tick() });
  const p = hub.overview(1)[0];
  assert.deepStrictEqual(p.tags, ['ferrocarril', 'memoria']);
});

test('likes: la misma huella solo cuenta una vez', () => {
  const hub = makeHub(tick);
  const p = hub.appendPost('A', footOf('k1'), 'un post', { ts: tick() });
  hub.appendLike('B', footOf('k2'), p.id, { ts: tick() });
  hub.appendLike('C', footOf('k3'), p.id, { ts: tick() });
  hub.appendLike('B', footOf('k2'), p.id, { ts: tick() });   // duplicado
  assert.strictEqual(hub.posts.get(p.id).likes.size, 2);
  assert.strictEqual(hub.overview(1)[0].likes, 2);
});

test('ranking: la atención decae con la edad', () => {
  const hub = makeHub(tick);
  const old = hub.appendPost('A', footOf('k1'), 'post viejo con muchos likes', { ts: tick() - 24 * 3600000 });
  const fresh = hub.appendPost('B', footOf('k2'), 'post reciente con un like', { ts: tick() });
  for (let i = 0; i < 9; i++) hub.appendLike('X', footOf('x' + i), old.id, { ts: tick() });
  hub.appendLike('Y', footOf('yy'), fresh.id, { ts: tick() });
  const recent = hub.overview(5, 'recent');
  assert.strictEqual(recent[0].text, 'post reciente con un like');
  const top = hub.overview(5, 'top');
  assert.strictEqual(top[0].text, 'post reciente con un like');
  const oldTop = top.find(x => x.text.includes('viejo'));
  assert.strictEqual(oldTop.likes, 9);
  assert.ok(oldTop.text.includes('viejo'));
});

test('por nombre y por huella', () => {
  const hub = makeHub(tick);
  hub.appendPost('Ana', footOf('k1'), 'de Ana', { ts: tick() });
  hub.appendPost('Luis', footOf('k2'), 'de Luis', { ts: tick() });
  hub.appendPost('Ana', footOf('k1'), 'otra de Ana', { ts: tick() });
  assert.strictEqual(hub.overview(10, 'recent', { nombre: 'Ana' }).length, 2);
  assert.strictEqual(hub.overview(10, 'recent', { foot: footOf('k1') }).length, 2);
});

test('seguir nombres: feed "para ti" por huella', () => {
  const hub = makeHub(tick);
  const yo = footOf('klaveYo');
  hub.appendFollow('Yo', yo, 'Ana', { ts: tick() });
  hub.appendPost('Ana', footOf('k1'), 'publica Ana', { ts: tick() });
  hub.appendPost('Luis', footOf('k2'), 'publica Luis', { ts: tick() });
  const feed = hub.overview(10, 'recent', { followedOf: yo });
  assert.strictEqual(feed.length, 1);
  assert.strictEqual(feed[0].nombre, 'Ana');
  assert.deepStrictEqual(hub.following(yo), ['Ana']);
});

test('tendencias agrupan por ventana temporal', () => {
  const hub = makeHub(tick);
  hub.appendPost('A', footOf('k1'), 'uno #tema', { ts: tick() - 25 * 3600000 }); // fuera de ventana
  hub.appendPost('A', footOf('k1'), 'dos #tema', { ts: tick() });
  hub.appendPost('B', footOf('k2'), 'tres #tema', { ts: tick() });
  hub.appendPost('B', footOf('k2'), 'nada que ver', { ts: tick() });
  const t = hub.trends(24, 5);
  assert.ok(t.length === 1);
  assert.strictEqual(t[0].tag, 'tema');
  assert.strictEqual(t[0].count, 2);
});

test('búsqueda por texto y por etiqueta', () => {
  const hub = makeHub(tick);
  hub.appendPost('A', footOf('k1'), 'hablando del tren de carbón', { ts: tick() });
  hub.appendPost('B', footOf('k2'), 'memorias #sueño', { ts: tick() });
  assert.strictEqual(hub.search('carbón').length, 1);
  assert.strictEqual(hub.search('#sueño').length, 1);
});

test('estado: conteo global e integridad de la cadena', () => {
  const hub = makeHub(tick);
  const p = hub.appendPost('A', footOf('k1'), 'hola', { ts: tick() });
  hub.appendLike('B', footOf('k2'), p.id, { ts: tick() });
  hub.appendFollow('B', footOf('k2'), 'A', { ts: tick() });
  const s = hub.status();
  assert.strictEqual(s.posts, 1);
  assert.strictEqual(s.likes, 1);
  assert.strictEqual(s.integrity, true);
  assert.strictEqual(s.feet, 2);
});

test('remplazo determinista: los IDs sobreviven al recrear el hub', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plaza-soc-'));
  const file = path.join(dir, 'log.jsonl');
  const now = tick;
  let hub = new SocialHub({ file: file, now: now });
  const p = hub.appendPost('Ana', footOf('k1'), 'hola #adios', { ts: now() });
  hub = new SocialHub({ file: file, now: now });
  assert.ok(hub.posts.has(p.id));
  assert.strictEqual(hub.overview(1)[0].text, 'hola #adios');
});

console.log('\n' + passed + ' pruebas superadas\n');