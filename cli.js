#!/usr/bin/env node
'use strict';

const path = require('path');
const { SocialHub } = require('./js/core/social.js');
const { footOf } = require('./js/core/chain.js');

const LOG_FILE = process.env.PLAZA_FILE || path.join(__dirname, 'plaza.jsonl');

const hub = new SocialHub({ file: LOG_FILE });

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', green: '\x1b[32m', red: '\x1b[31m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m', mag: '\x1b[35m'
};

function fmtAgo(ts) {
  const h = (Date.now() - ts) / 3600000;
  if (h < 1) return 'hace ' + Math.max(0, Math.round(h * 60)) + ' min';
  if (h < 48) return 'hace ' + Math.round(h) + ' h';
  return new Date(ts).toLocaleDateString('es');
}

function usage() {
  console.log('');
  console.log('PLAZA — red social local experimental sin cuentas');
  console.log('Todo queda en un registro público append-only encadenado por hash.');
  console.log('');
  console.log('  plaza publicar "texto" --nombre N --clave K [--en id]   publicar (o responder)');
  console.log('  plaza gusta <id> --nombre N --clave K                   dar like');
  console.log('  plaza seguir <nombre> --nombre N --clave K              seguir una máscara');
  console.log('  plaza muro [reciente|top] [n]                           feed público');
  console.log('  plaza para-ti --nombre N --clave K                      feed de quien sigues');
  console.log('  plaza hilo <id>                                         conversación completa');
  console.log('  plaza nombre <nombre> [n]                               publicaciones de una máscara');
  console.log('  plaza mis-posts --clave K [n]                           publicaciones con tu huella');
  console.log('  plaza tendencias [horas]                                etiquetas que despegan');
  console.log('  plaza tema <tag>                                        posts de una etiqueta');
  console.log('  plaza buscar <texto> [n]                                búsqueda');
  console.log('  plaza verificar <nombre> --clave K                      prueba tu autoría (revelación)');
  console.log('  plaza sembrar                                           crea actividad de demostración');
  console.log('  plaza estado                                            conteos + integridad de la cadena');
  console.log('  plaza limpiar                                           vacía el registro');
  console.log('');
}

function main(argv) {
  const cmd = argv[0];
  switch (cmd) {
    case 'publicar': return publicar(argv);
    case 'gusta': return gusta(argv);
    case 'seguir': return seguir(argv);
    case 'muro': return muro(argv);
    case 'para-ti': return paraTi(argv);
    case 'hilo': return hilo(argv);
    case 'nombre': return nombre(argv);
    case 'mis-posts': return misPosts(argv);
    case 'tendencias': return tendencias(argv);
    case 'tema': return tema(argv);
    case 'buscar': return buscar(argv);
    case 'verificar': return verificar(argv);
    case 'sembrar': return sembrar();
    case 'estado': return estado();
    case 'limpiar': return limpiar();
    default: usage(); return 1;
  }
}

function getArg(argv, name) {
  const i = argv.indexOf('--' + name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
}

function publicar(argv) {
  const text = argv[1];
  const nombre = getArg(argv, 'nombre');
  const clave = getArg(argv, 'clave');
  const replyTo = getArg(argv, 'en');
  if (!text || !nombre || !clave) { usage(); return 1; }
  const ev = hub.appendPost(nombre, footOf(clave), text, { replyTo: replyTo });
  console.log(C.green + '✓ publicado' + C.reset + (replyTo ? C.dim + ' (respuesta #' + replyTo + ')' + C.reset : ''));
  console.log('   ' + C.cyan + nombre + C.reset + '  ·  huella ' + C.dim + ev.foot + C.reset);
  console.log('   id ' + ev.id + '  ·  ' + C.dim + text.slice(0, 140) + C.reset);
  return 0;
}

function gusta(argv) {
  const target = argv[1];
  const nombre = getArg(argv, 'nombre'), clave = getArg(argv, 'clave');
  if (!target || !nombre || !clave) { usage(); return 1; }
  const p = hub.posts.get(target);
  if (!p) { console.log(C.red + '✗ post no existe: ' + target + C.reset); return 1; }
  hub.appendLike(nombre, footOf(clave), target);
  console.log(C.green + '✓ like de ' + C.cyan + nombre + C.reset + ' a #' + target + ' (' + (p.likes.size + 1) + ' likes)');
  return 0;
}

function seguir(argv) {
  const target = argv[1];
  const nombre = getArg(argv, 'nombre'), clave = getArg(argv, 'clave');
  if (!target || !nombre || !clave) { usage(); return 1; }
  hub.appendFollow(nombre, footOf(clave), target);
  console.log(C.green + '✓ ' + C.cyan + nombre + C.reset + ' ahora sigue a ' + C.cyan + target + C.reset);
  return 0;
}

function renderPost(p, withReplies) {
  const line = '   ' + C.cyan + p.nombre.padEnd(14) + C.reset +
    ' ' + C.dim + '[' + fmtAgo(p.ts) + ']' + C.reset +
    '  #' + C.mag + p.id + C.reset;
  console.log(line);
  console.log('      ' + p.text.replace(/\n/g, '\n      '));
  const meta = '      ' + C.dim + '♥ ' + p.likes + '  ·  ' + p.replies + ' respuestas' +
    (p.replyTo ? '  ·  ↳ en #' + p.replyTo : '') + C.reset;
  console.log(meta);
  if (p.tags && p.tags.length) console.log('      ' + p.tags.map(t => '#' + t).join(' ') + '  ' + C.dim + 'huella ' + p.foot + C.reset + (withReplies ? '' : '\n'));
}

function muro(argv) {
  const order = argv[1] === 'top' ? 'top' : 'recent';
  const n = +(argv[2] || 12);
  const posts = hub.overview(n, order);
  console.log(C.bold + 'MURO' + (order === 'top' ? ' · RANKING (atención con decaimiento)' : ' · RECIENTE') + C.reset);
  posts.forEach(p => renderPost(p));
  return 0;
}

function paraTi(argv) {
  const nombre = getArg(argv, 'nombre'), clave = getArg(argv, 'clave');
  if (!nombre || !clave) { usage(); return 1; }
  const foot = footOf(clave);
  const posts = hub.overview(15, 'recent', { followedOf: foot });
  const sigues = hub.following(foot);
  console.log(C.bold + 'PARA TI' + C.reset + '  ·  sigues a: ' + (sigues.join(', ') || 'nadie'));
  posts.forEach(p => renderPost(p));
  if (!posts.length) console.log(C.dim + '   nada aún — prueba: plaza seguir <nombre> --nombre ... --clave ...' + C.reset);
  return 0;
}

function hilo(argv) {
  const id = argv[1];
  if (!id) { usage(); return 1; }
  const t = hub.thread(id);
  if (!t) { console.log(C.red + '✗ no existe #' + id + C.reset); return 1; }
  t.root.forEach(p => { console.log(p.id === id ? C.yellow + '▸ HILO' + C.reset : C.dim + '  ↑' + C.reset); renderPost(p); });
  for (const c of t.children) {
    console.log(C.dim + '   por profundidad ' + c.depth + ': ' + C.reset);
    renderPost(c);
  }
  return 0;
}

function nombre(argv) {
  const n = +(argv[2] || 10);
  const posts = hub.overview(n, 'recent', { nombre: argv[1] });
  console.log(C.bold + 'MASCARA: ' + (argv[1] || '') + C.reset + '  · ' + posts.length + ' posts');
  posts.forEach(p => renderPost(p));
  return 0;
}

function misPosts(argv) {
  const clave = getArg(argv, 'clave');
  const n = +(argv[2] || 10);
  if (!clave) { usage(); return 1; }
  const foot = footOf(clave);
  const posts = hub.overview(n, 'recent', { foot: foot });
  console.log(C.bold + 'TU HUELLA ' + C.cyan + foot + C.reset + C.dim + ' (nunca se guarda tu clave)' + C.reset);
  posts.forEach(p => renderPost(p));
  if (!posts.length) console.log(C.dim + '   no has publicado nada con esta clave' + C.reset);
  return 0;
}

function tendencias(argv) {
  const t = hub.trends(+(argv[1] || 24), 12);
  console.log(C.bold + 'TENDENCIAS' + C.reset);
  if (!t.length) { console.log(C.dim + '   sin movimientos' + C.reset); return 0; }
  t.forEach((x, i) => console.log('   ' + (i + 1) + '. ' + C.yellow + '#' + x.tag.padEnd(16) + C.reset + x.count + ' menciones'));
  return 0;
}

function tema(argv) {
  const tag = (argv[1] || '').replace(/^#/, '').toLowerCase();
  if (!tag) { usage(); return 1; }
  const posts = hub.search('#' + tag, 10);
  console.log(C.bold + '#' + tag + C.reset + '  · ' + posts.length + ' posts');
  posts.forEach(p => renderPost(p));
  return 0;
}

function buscar(argv) {
  const q = argv[1];
  if (!q) { usage(); return 1; }
  const posts = hub.search(q, +(argv[2] || 10));
  console.log(C.bold + 'BUSCAR «' + q + '»' + C.reset + '  · ' + posts.length + ' resultados');
  posts.forEach(p => renderPost(p));
  return 0;
}

function verificar(argv) {
  const nombre = argv[1];
  const clave = getArg(argv, 'clave');
  if (!nombre || !clave) { usage(); return 1; }
  const foot = footOf(clave);
  const posts = [];
  for (const ev of hub.chain.events()) {
    if (ev.foot === foot) posts.push(ev);
  }
  console.log(C.bold + 'AUTORÍA' + C.reset + '  ·  ' + C.cyan + nombre + C.reset + ' · huella ' + C.mag + foot + C.reset);
  if (!posts.length) { console.log(C.dim + '   ninguna publicación lleva esta huella' + C.reset); return 0; }
  for (const ev of posts) {
    console.log('   ' + C.dim + fmtAgo(ev.ts) + C.reset + '  ' + (ev.data.text || ('→ ' + ev.data.target)).slice(0, 90));
  }
  console.log(C.dim + '   La huella es el hash de tu clave: demuestra autoría sin revelarla.' + C.reset);
  return 0;
}

function estado() {
  const s = hub.status();
  console.log('   Eventos:    ' + s.events);
  console.log('   Posts:      ' + s.posts);
  console.log('   Likes:      ' + s.likes);
  console.log('   Seguidores: ' + s.follows);
  console.log('   Huellas:    ' + s.feet + C.dim + ' (personas distintas, aprox.)' + C.reset);
  console.log('   Cadena:     ' + (s.integrity ? C.green + 'ÍNTEGRA · ' + s.chainEvents + ' hashes encadenados' : C.red + '¡MANIPULADA!') + C.reset);
  console.log('   Registro:   ' + LOG_FILE);
  return 0;
}

function limpiar() {
  const fs = require('fs');
  try { fs.unlinkSync(LOG_FILE); } catch (e) {}
  console.log('✓ registro vaciado (la cadena anterior desaparece)');
  return 0;
}

function sembrar() {
  // Actividad de demostración con máscaras y huellas fijas (no son cuentas: cualquiera puede usarlas).
  const A = { nombre: 'Aurora', clave: 'k-aurora' };
  const L = { nombre: 'Luis', clave: 'k-luis' };
  const M = { nombre: 'Mara', clave: 'k-mara' };
  const T = { nombre: 'Tim', clave: 'k-tim' };
  const t = Date.now();

  const seed = [
    function () { return hub.appendPost(A.nombre, footOf(A.clave), 'Abro la plaza local. Nada de cuentas: cada uno lleva la máscara que quiera. #experimento #plaza', { ts: t - 5 * 3600000 }); },
    function () { return hub.appendPost(L.nombre, footOf(L.clave), '¿Y cómo me reconoces si cambio de nombre? No me reconoces: reconoces mi huella. #identidad', { ts: t - 4.6 * 3600000 }); },
    function () { return hub.appendPost(M.nombre, footOf(M.clave), 'La reputación sigue a la huella (el hash de tu clave), no al nombre. Eso es lo radical. #identidad', { ts: t - 4.2 * 3600000 }); },
    function () { return hub.appendPost(T.nombre, footOf(T.clave), 'Esto corre solo en mi máquina. El muro es un archivo JSONL con cada acción encadenada por SHA-256. #plaza #integridad', { ts: t - 3.8 * 3600000 }); },
    function () { return hub.appendPost(A.nombre, footOf(A.clave), 'Sembrando conversación para que el feed no arranque vacío. #plaza', { ts: t - 3.4 * 3600000 }); },
    function () { return hub.appendPost(L.nombre, footOf(L.clave), 'Si alguien rompe un dato de la cadena, el hash se nota: no hay borrado silencioso. #integridad', { ts: t - 3 * 3600000 }); },
    function (last) { return hub.appendPost(M.nombre, footOf(M.clave), 'Y la siesta lo consolida todo, lo decía la memoria episódica. #memoria', { ts: t - 2.2 * 3600000, replyTo: last && last.id }); },
    function () { return hub.appendPost(A.nombre, footOf(A.clave), 'Pruébalo: publicar, gusta, seguir, hilo, tendencias. Todo local. #experimento', { ts: t - 1.6 * 3600000 }); }
  ];

  let last = null;
  for (const fn of seed) {
    last = fn(last);
  }

  // likes cruzados
  const ids = [];
  for (const ev of hub.chain.events()) if (ev.type === 'post') ids.push(ev.id);
  const likeSeed = [
    [M.clave, ids[1]], [T.clave, ids[1]], [T.clave, ids[2]], [A.clave, ids[2]],
    [A.clave, ids[3]], [L.clave, ids[3]], [L.clave, ids[5]], [M.clave, ids[5]],
    [M.clave, ids[7]], [T.clave, ids[7]], [A.clave, ids[7]], [L.clave, ids[7]]
  ];
  for (const [clave, target] of likeSeed) {
    hub.appendLike('anon', footOf(clave), target, { ts: t + 60000 });
  }

  // seguimientos
  hub.appendFollow(L.nombre, footOf(L.clave), 'Aurora', { ts: t + 120000 });
  hub.appendFollow(M.nombre, footOf(M.clave), 'Luis', { ts: t + 180000 });
  hub.appendFollow(T.nombre, footOf(T.clave), 'Mara', { ts: t + 240000 });

  const s = hub.status();
  console.log(C.green + '✓ plaza sembrada' + C.reset + '  · ' + s.posts + ' posts, ' + s.likes + ' likes, ' + s.follows + ' seguimientos');
  console.log(C.dim + '   Prueba:  plaza muro · plaza tendencias · plaza para-ti --nombre Luis --clave k-luis' + C.reset);
  return 0;
}

if (require.main === module) {
  const fs = require('fs');
  const code = main(process.argv.slice(2));
  if (code !== undefined) process.exitCode = code;
} else {
  module.exports = { main: main };
}