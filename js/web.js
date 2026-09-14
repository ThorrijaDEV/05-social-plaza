(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var me = { nombre: localStorage.getItem('plaza.nombre') || '', clave: localStorage.getItem('plaza.clave') || '' };
  var myFoot = '';
  var view = { tab: 'recent' };

  var toastT;
  function toast(msg, isErr) {
    var el = $('toast');
    el.textContent = msg;
    el.style.background = isErr ? '#3a1d1d' : 'var(--p)';
    el.style.borderColor = isErr ? 'var(--bad)' : 'var(--line)';
    el.style.opacity = 1;
    clearTimeout(toastT);
    toastT = setTimeout(function () { el.style.opacity = 0; }, 2600);
  }

  async function get(path) {
    var r = await fetch(path);
    var j = await r.json();
    if (j.error) throw new Error(j.error);
    return j;
  }

  async function post(path, body) {
    var r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    var j = await r.json();
    if (j.error) throw new Error(j.error);
    return j;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function ago(ts) {
    var h = (Date.now() - ts) / 3600000;
    if (h < 1) return Math.max(0, Math.round(h * 60)) + ' min';
    if (h < 48) return Math.round(h) + ' h';
    return new Date(ts).toLocaleDateString('es');
  }

  // ---------- configuración ----------
  function setIdentity() {
    me.nombre = $('ci-nombre').value.trim();
    me.clave = $('ci-clave').value.trim();
    localStorage.setItem('plaza.nombre', me.nombre);
    localStorage.setItem('plaza.clave', me.clave);
    if (me.clave) {
      fetch('/api/verificar?clave=' + encodeURIComponent(me.clave))
        .then(r => r.json())
        .then(j => { myFoot = j.foot; showFoot(); })
        .catch(() => {});
    }
  }
  function showFoot() {
    $('ci-foot').textContent = myFoot || '—';
    renderFeed();
  }
  $('ci-nombre').addEventListener('input', setIdentity);
  $('ci-clave').addEventListener('input', setIdentity);
  $('ci-nombre').value = me.nombre;
  $('ci-clave').value = me.clave;
  if (me.clave) { setIdentity(); }

  // ---------- feed ----------
  async function renderFeed() {
    var params = '';
    if (view.tab === 'top') params = '?order=top';
    if (view.tab === 'parati' && me.clave) params = '?tipo=parati&clave=' + encodeURIComponent(me.clave);
    if (view.tab === 'mine' && me.clave) params = '?clave=' + encodeURIComponent(me.clave);
    var url = '/api/feed' + params;
    if (view.tab === 'search') url = '/api/search?q=' + encodeURIComponent(view.query) + '&n=20';
    if (view.tab === 'tag') url = '/api/search?q=' + encodeURIComponent('#' + view.tag) + '&n=30';
    if (view.tab === 'name') url = '/api/feed?nombre=' + encodeURIComponent(view.name) + '&n=20';
    if (view.tab === 'thread') url = '/api/post?id=' + view.id;
    if (view.tab === 'parati' && !me.clave) { url = '/api/feed?n=20'; }

    var data;
    try { data = await get(url); }
    catch (e) { toast(e.message, true); return; }
    var feed = $('feed');
    if (view.tab === 'thread') {
      feed.innerHTML = renderThread(data);
    } else {
      feed.innerHTML = data.map(renderPost).join('') || '<div style="color:var(--dim);padding:20px;text-align:center">— vacío —</div>';
    }
    wireFeed();
  }

  function renderPost(p) {
    var tags = (p.tags || []).map(t => '<span class="tag" data-tag="' + esc(t) + '">#' + esc(t) + '</span>').join(' ');
    var mine = myFoot && p.foot === myFoot;
    var replyBadge = p.replyTo ? ' <span class="id">↳ ' + p.replyTo.slice(0, 8) + '</span>' : '';
    return '<div class="post' + (mine ? ' mine' : '') + '" data-id="' + p.id + '">' +
      '<div class="head">' +
      '<span class="name" data-name="' + esc(p.nombre) + '">' + esc(p.nombre) + '</span>' +
      '<span class="id">#' + p.id + '</span>' +
      replyBadge +
      '<span class="when">' + ago(p.ts) + '</span>' +
      '<span class="huella">huella ' + p.foot + '</span>' +
      '</div>' +
      '<div class="text">' + esc(p.text) + ' ' + tags + '</div>' +
      '<div class="acts">' +
      '<button class="mini a-like">♥ <span class="likes">' + p.likes + '</span></button>' +
      '<button class="mini a-reply">responder</button>' +
      '<button class="mini a-thread">hilo</button>' +
      '<button class="mini a-follow">seguir</button>' +
      '</div>' +
      '<div class="replybox"><input placeholder="tu respuesta…"><button class="mini primary r-send">enviar</button></div>' +
      '</div>';
  }

  function renderThread(t) {
    var out = '';
    for (var i = 0; i < t.root.length; i++) {
      var p = t.root[i];
      out += renderPost(p);
    }
    for (var j = 0; j < t.children.length; j++) {
      var c = t.children[j];
      out += '<div class="child">' + renderPost(c) + '</div>';
    }
    return out;
  }

  function wireFeed() {
    document.querySelectorAll('.name').forEach(function (el) {
      el.addEventListener('click', function () {
        view.tab = 'name'; view.name = el.dataset.name;
        setTabs(); renderFeed();
      });
    });
    document.querySelectorAll('.tag').forEach(function (el) {
      el.addEventListener('click', function () {
        view.tab = 'tag'; view.tag = el.dataset.tag;
        setTabs(); renderFeed();
      });
    });
    document.querySelectorAll('.a-thread').forEach(function (el) {
      el.addEventListener('click', function () {
        view.tab = 'thread'; view.id = el.closest('.post').dataset.id;
        setTabs(); renderFeed();
      });
    });
    document.querySelectorAll('.a-like').forEach(function (el) {
      el.addEventListener('click', function () {
        if (!me.nombre || !me.clave) { toast('define máscara y clave para dar like', true); return; }
        var id = el.closest('.post').dataset.id;
        post('/api/like', { nombre: me.nombre, clave: me.clave, target: id })
          .then(function () { renderFeed(); })
          .catch(function (e) { toast(e.message, true); });
      });
    });
    document.querySelectorAll('.a-follow').forEach(function (el) {
      el.addEventListener('click', function () {
        if (!me.nombre || !me.clave) { toast('define máscara y clave para seguir', true); return; }
        var name = el.closest('.post').querySelector('.name').textContent;
        post('/api/follow', { nombre: me.nombre, clave: me.clave, target: name })
          .then(function () { toast('✓ ahora sigues a ' + name); renderFeed(); })
          .catch(function (e) { toast(e.message, true); });
      });
    });
    document.querySelectorAll('.a-reply').forEach(function (el) {
      el.addEventListener('click', function () {
        el.parentElement.querySelector('.replybox').classList.toggle('open');
      });
    });
    document.querySelectorAll('.r-send').forEach(function (el) {
      el.addEventListener('click', function () {
        if (!me.nombre || !me.clave) { toast('define máscara y clave', true); return; }
        var box = el.closest('.replybox');
        var text = box.querySelector('input').value.trim();
        if (!text) return;
        var id = el.closest('.post').dataset.id;
        post('/api/post', { nombre: me.nombre, clave: me.clave, text: text, replyTo: id })
          .then(function (r) { box.classList.remove('open'); toast('✓ respondido #' + r.id); renderFeed(); })
          .catch(function (e) { toast(e.message, true); });
      });
    });
  }

  // ---------- tabs ----------
  function setTabs() {
    [['recent', 'tab-recent'], ['top', 'tab-top'], ['parati', 'tab-parati'], ['mine', 'tab-mine']]
      .forEach(function (kv) {
        $('tab-' + kv[1].split('-')[1]).classList.toggle('on', view.tab === kv[0]);
      });
    var names = { name: 'Máscara: ' + view.name, tag: '#' + view.tag, thread: 'Hilo #' + view.id, search: '«' + view.query + '»' };
    $('status').textContent = names[view.tab] || '';
  }
  $('tab-recent').addEventListener('click', function () { view = { tab: 'recent' }; setTabs(); renderFeed(); });
  $('tab-top').addEventListener('click', function () { view = { tab: 'top' }; setTabs(); renderFeed(); });
  $('tab-parati').addEventListener('click', function () { view = { tab: 'parati' }; setTabs(); renderFeed(); });
  $('tab-mine').addEventListener('click', function () { view = { tab: 'mine' }; setTabs(); renderFeed(); });
  $('btn-search').addEventListener('click', function () {
    var q = $('search').value.trim();
    if (!q) return;
    view = { tab: q.startsWith('#') ? 'tag' : 'search', query: q.replace(/^#/, ''), tag: q.replace(/^#/, '') };
    setTabs(); renderFeed();
  });
  $('search').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') $('btn-search').click();
  });

  // ---------- publicar ----------
  $('btn-post').addEventListener('click', function () {
    var text = $('post-text').value.trim();
    if (!me.nombre || !me.clave) { toast('define máscara y clave para publicar', true); return; }
    if (text.length < 2) { toast('escribe algo', true); return; }
    post('/api/post', { nombre: me.nombre, clave: me.clave, text: text })
      .then(function (r) {
        $('post-text').value = '';
        toast('✓ publicado #' + r.id);
        renderFeed();
      })
      .catch(function (e) { toast(e.message, true); });
  });

  // ---------- laterales ----------
  async function loadSide() {
    var s = await get('/api/status');
    var badge = $('chain-badge');
    badge.textContent = s.integrity ? ('cadena íntegra · ' + s.chainEvents + ' eventos') : '¡CADENA MANIPULADA!';
    badge.className = 'badge' + (s.integrity ? '' : ' bad');
    $('foot').innerHTML = s.posts + ' posts · ' + s.likes + ' likes · ' + s.feet + ' huellas';
    var t = await get('/api/trends?hours=48');
    $('trends').innerHTML = t.map(x => '<div class="trend" data-tag="' + esc(x.tag) + '">#' + esc(x.tag) + ' <span style="color:var(--dim)">' + x.count + '</span></div>').join('') ||
      '<div style="color:var(--dim)">sin movimientos</div>';
    document.querySelectorAll('.trend').forEach(function (el) {
      el.addEventListener('click', function () {
        view.tab = 'tag'; view.tag = el.dataset.tag;
        setTabs(); renderFeed();
      });
    });
  }

  setTabs();
  renderFeed();
  loadSide();
  setInterval(loadSide, 20000);
})();