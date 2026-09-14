#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { SocialHub } = require('./js/core/social.js');
const { footOf } = require('./js/core/chain.js');

const ROOT = __dirname;
const LOG_FILE = process.env.PLAZA_FILE || path.join(ROOT, 'plaza.jsonl');
const PORT = process.env.PLAZA_PORT || 4848;

const hub = new SocialHub({ file: LOG_FILE });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

function send(res, code, body, type) {
  res.writeHead(code, { 'content-type': type || 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}
function sendJson(res, obj) { send(res, 200, JSON.stringify(obj)); }
function sendError(res, code, msg) { send(res, code, JSON.stringify({ error: msg })); }

function parseQuery(url) {
  const q = (url.split('?')[1] || '');
  const out = {};
  for (const pair of q.split('&')) {
    if (!pair) continue;
    const [k, v] = pair.split('=');
    out[decodeURIComponent(k)] = decodeURIComponent(v || '');
  }
  return out;
}

function readBody(req) {
  return new Promise((resolve) => {
    let chunks = [], size = 0;
    req.on('data', c => { chunks.push(c); size += c.length; if (size > 1e6) { req.destroy(); resolve(null); } });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(null));
  });
}

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { sendError(res, 404, 'no encontrado'); return; }
    send(res, 200, data, MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
  });
}

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];

  if (req.method === 'GET' && urlPath === '/') return serveStatic(res, path.join(ROOT, 'index.html'));
  if (req.method === 'GET' && urlPath === '/js/web.js') return serveStatic(res, path.join(ROOT, 'js', 'web.js'));

  if (req.method === 'GET' && urlPath === '/api/status') return sendJson(res, hub.status());

  if (req.method === 'GET' && urlPath === '/api/feed') {
    const q = parseQuery(req.url);
    const n = +(q.n || 20);
    let foot = q.clave ? footOf(q.clave) : null;
    const opts = {};
    if (q.nombre) opts.nombre = q.nombre;
    if (q.tipo === 'parati' && foot) opts.followedOf = foot;
    return sendJson(res, hub.overview(n, q.order === 'top' ? 'top' : 'recent', opts));
  }

  if (req.method === 'GET' && urlPath === '/api/post') {
    const id = parseQuery(req.url).id;
    if (!id) return sendError(res, 400, 'falta id');
    const t = hub.thread(id);
    return t ? sendJson(res, t) : sendError(res, 404, 'no existe #' + id);
  }

  if (req.method === 'GET' && urlPath === '/api/search') {
    const q = parseQuery(req.url);
    if (!q.q) return sendError(res, 400, 'falta q');
    return sendJson(res, hub.search(q.q, +(q.n || 20)));
  }

  if (req.method === 'GET' && urlPath === '/api/trends') {
    const hours = +(parseQuery(req.url).hours || 24);
    return sendJson(res, hub.trends(hours, 12));
  }

  if (req.method === 'GET' && urlPath === '/api/verificar') {
    const q = parseQuery(req.url);
    if (!q.clave) return sendError(res, 400, 'falta clave');
    const foot = footOf(q.clave);
    const events = [];
    for (const ev of hub.chain.events()) if (ev.foot === foot) events.push(ev);
    return sendJson(res, { foot: foot, events: events });
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    if (!body) return sendError(res, 400, 'cuerpo vacío');
    let d;
    try { d = JSON.parse(body); } catch (e) { return sendError(res, 400, 'json inválido'); }
    if (!d.nombre || !d.clave) return sendError(res, 400, 'nombre y clave son obligatorios');
    const foot = footOf(d.clave);
    switch (urlPath) {
      case '/api/post': {
        if (!d.text || d.text.length < 2) return sendError(res, 400, 'texto muy corto');
        const ev = hub.appendPost(d.nombre, foot, String(d.text), { replyTo: d.replyTo || null });
        return sendJson(res, { id: ev.id, foot: ev.foot });
      }
      case '/api/like': {
        if (!d.target || !hub.posts.has(d.target)) return sendError(res, 404, 'post no existe');
        const ev = hub.appendLike(d.nombre, foot, d.target);
        return sendJson(res, { id: ev.id, foot: ev.foot });
      }
      case '/api/follow': {
        if (!d.target) return sendError(res, 400, 'falta target');
        const ev = hub.appendFollow(d.nombre, foot, d.target);
        return sendJson(res, { id: ev.id, foot: ev.foot });
      }
    }
  }

  sendError(res, 404, 'ruta desconocida');
});

server.listen(PORT, () => {
  console.log('PLAZA — red social local experimental sin cuentas');
  console.log('   Registro: ' + LOG_FILE);
  console.log('   Abre:     http://localhost:' + PORT);
});