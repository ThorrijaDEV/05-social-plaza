'use strict';

const { EventLog } = require('./chain.js');

const TAG_RE = /#([a-zA-Z0-9_\u00e0-\u00ff]+)/g;

// Plaza: el estado social se deriva SIEMPRE de re-ejecutar el registro.
// No hay cuentas: cada persona lleva una máscara (nombre) y una huella
// invisible (foot) derivada de su clave, que nunca se guarda.
class SocialHub {
  constructor(opts) {
    opts = opts || {};
    this.now = opts.now || (function () { return Date.now(); });
    this.chain = opts.chain || new EventLog({ file: opts.file, now: this.now });
    this._reset();
    this._replay();
  }

  _reset() {
    this.posts = new Map();
    this.follows = new Map();   // foot -> Set(nombre)
    this.feet = new Set();      // todas las huellas vistas
  }

  _replay() {
    for (const ev of this.chain.events()) {
      this._apply(ev);
    }
  }

  _apply(ev) {
    const d = ev.data;
    if (d.foot) this.feet.add(d.foot);
    switch (ev.type) {
      case 'post': {
        if (this.posts.has(ev.id)) break;
        const p = {
          id: ev.id,
          nombre: d.nombre,
          foot: d.foot,
          text: String(d.text || ''),
          tags: d.tags || extractTags(d.text),
          ts: ev.ts,
          replyTo: d.replyTo || null,
          likes: new Set(),
          replies: []
        };
        this.posts.set(ev.id, p);
        if (p.replyTo && this.posts.has(p.replyTo)) {
          this.posts.get(p.replyTo).replies.push(ev.id);
        }
        break;
      }
      case 'like': {
        const p = this.posts.get(d.target);
        if (p && d.foot) p.likes.add(d.foot);
        break;
      }
      case 'follow': {
        if (!d.foot) break;
        if (!this.follows.has(d.foot)) this.follows.set(d.foot, new Set());
        this.follows.get(d.foot).add(d.target);
        break;
      }
    }
  }

  appendPost(nombre, foot, text, opts) {
    opts = opts || {};
    const ev = this.chain.append('post', {
      nombre: nombre, foot: foot, text: text,
      replyTo: opts.replyTo || null, ts: opts.ts
    });
    this._apply(ev);
    return ev;
  }

  appendLike(nombre, foot, target, opts) {
    opts = opts || {};
    const ev = this.chain.append('like', { nombre: nombre, foot: foot, target: target, ts: opts.ts });
    this._apply(ev);
    return ev;
  }

  appendFollow(nombre, foot, target, opts) {
    opts = opts || {};
    const ev = this.chain.append('follow', { nombre: nombre, foot: foot, target: target, ts: opts.ts });
    this._apply(ev);
    return ev;
  }

  size() { return this.posts.size; }

  // ---------- consultas ----------

  _score(p, order) {
    if (order === 'recent') return p.ts;
    const hours = Math.max(0, (this.now() - p.ts) / 3600000);
    return p.likes.size / Math.pow(hours + 3, 1.2);
  }

  overview(n, order, opts) {
    opts = opts || {};
    const all = [];
    for (const p of this.posts.values()) all.push(p);
    let list = all.filter(p => !opts.nombre || p.nombre === opts.nombre);
    if (opts.foot) list = list.filter(p => p.foot === opts.foot);
    if (opts.followedOf) {
      const names = this.follows.get(opts.followedOf) || new Set();
      list = list.filter(p => names.has(p.nombre));
    }
    return list
      .sort((a, b) => this._score(b, order) - this._score(a, order))
      .slice(0, n || 40)
      .map(p => this._public(p));
  }

  _public(p) {
    return {
      id: p.id, nombre: p.nombre, foot: p.foot, text: p.text,
      tags: p.tags, ts: p.ts, replyTo: p.replyTo,
      likes: p.likes.size, replies: p.replies.length,
      likedByMe: false
    };
  }

  thread(id) {
    let p = this.posts.get(id);
    if (!p) return null;
    // cadena de respuestas hacia arriba
    const chainPosts = [];
    let cur = p;
    const seen = new Set();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      chainPosts.unshift(cur);
      cur = cur.replyTo ? this.posts.get(cur.replyTo) : null;
    }
    // hijos directos (recursivo, con nivel)
    const children = [];
    const walk = (node, depth) => {
      for (const cid of node.replies) {
        const c = this.posts.get(cid);
        if (!c) continue;
        children.push({ post: c, depth: depth });
        walk(c, depth + 1);
      }
    };
    walk(p, 0);
    return {
      root: chainPosts.map(c => this._public(c)).slice(0, chainPosts.length),
      children: children.map(c => Object.assign(this._public(c.post), { depth: c.depth }))
    };
  }

  trends(hours, n) {
    hours = hours || 24;
    const window = this.now() - hours * 3600000;
    const counts = new Map();
    for (const p of this.posts.values()) {
      if (p.ts < window) continue;
      for (const t of p.tags) counts.set(t, (counts.get(t) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, n || 12)
      .map(([tag, count]) => ({ tag: tag, count: count }));
  }

  search(q, n) {
    const ql = String(q).toLowerCase();
    const tag = ql.startsWith('#') ? ql.slice(1) : null;
    const out = [];
    for (const p of this.posts.values()) {
      const text = p.text.toLowerCase();
      if (tag ? p.tags.some(t => t === tag) : text.includes(ql)) {
        out.push(this._public(p));
      }
    }
    return out.sort((a, b) => b.ts - a.ts).slice(0, n || 20);
  }

  status() {
    const chain = this.chain.verify();
    const byFoot = new Set();
    for (const ev of this.chain.events()) if (ev.foot) byFoot.add(ev.foot);
    let likes = 0;
    for (const p of this.posts.values()) likes += p.likes.size;
    return {
      events: this.chain.events().length,
      posts: this.posts.size,
      likes: likes,
      follows: Array.from(this.follows.values()).reduce((a, s) => a + s.size, 0),
      feet: byFoot.size,
      integrity: chain.ok,
      chainEvents: chain.events
    };
  }

  following(foot) {
    return Array.from((this.follows.get(foot) || new Set()));
  }
}

function extractTags(text) {
  const out = [];
  const m = String(text).match(TAG_RE);
  if (m) {
    for (const t of m) {
      const tag = t.slice(1).toLowerCase();
      if (!out.includes(tag)) out.push(tag);
    }
  }
  return out;
}

module.exports = { SocialHub: SocialHub, extractTags: extractTags };