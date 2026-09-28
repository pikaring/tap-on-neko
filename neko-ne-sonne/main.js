/* =========================================================
   ネコネソンヌ（シンプル版）― 猫道を つないで 面を かこむ 陣取り
   ・9×9 の 盤。タイルには 猫道（中心から 辺の まん中へ）が 0〜4本
   ・猫道は「境界線」。猫道だけで ぐるりと かこまれた 面が なわばり（盤の 端に ふれた 面は ちがう）
   ・ねこは 猫道の 上（タイルの 中心）に おく。面を かこむ 猫道の 上の
     ねこが いちばん 多い 人の なわばり
   ・面の 中に 空きマスが なくなったら 完成。点は ¼マス＝1点

   面の 計算：タイルの 角（格子点 10×10）を 1点と みなす。
   1つの 格子点の まわりの ¼マス 4つは かならず つながって いて、
   となりの 格子点とは「その あいだを 猫道が 横切って いない」ときだけ つながる。
   ========================================================= */
(function () {
  'use strict';

  var SIZE = 9, N = SIZE * SIZE, V = SIZE + 1;   /* 格子点は 10×10 */
  var DN = 1, DE = 2, DS = 4, DW = 8, DIRS = [DN, DE, DS, DW];

  var CATS = [
    { id: 'kuro', name: 'くろ', color: '#3b4a8a' },
    { id: 'hachiware', name: 'はちわれ', color: '#2f7d4a' },
    { id: 'kijitora', name: 'きじとら', color: '#c65a00' },
    { id: 'chashiro', name: 'ちゃしろ', color: '#d0526b' }
  ];
  var CATS_BY_N = { 2: 12, 3: 10, 4: 8 };
  var HAND_MAX = 3;
  /* デッキ 88まい（まん中の 十字を のぞく）。道の ない マスも まぜる */
  var DECK_DEF = [
    { m: 15, n: 14 },   /* 十字 */
    { m: 7, n: 22 },    /* T字 */
    { m: 5, n: 16 },    /* 直線 */
    { m: 3, n: 20 },    /* 角 */
    { m: 1, n: 8 },     /* 行き止まり */
    { m: 0, n: 8 }      /* 道なし */
  ];

  /* ---------- 盤の 幾何 ---------- */
  function opp(d) { return d === DN ? DS : d === DE ? DW : d === DS ? DN : DE; }
  function rot(m, r) { r = ((r % 4) + 4) % 4; return ((m << r) | (m >> (4 - r))) & 15; }
  function nb(c, d) {
    var x = c % SIZE, y = (c / SIZE) | 0;
    if (d === DN) y--; else if (d === DE) x++; else if (d === DS) y++; else x--;
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return -1;
    return y * SIZE + x;
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function buildDeck() {
    var d = [], uid = 1;
    DECK_DEF.forEach(function (def) { for (var i = 0; i < def.n; i++) d.push({ uid: uid++, m: def.m }); });
    return shuffle(d);
  }

  /* =========================================================
     状態と ルール（描画と わけて ある。CPU も 同じ 関数を つかう）
     ========================================================= */
  function newGame(seats) {
    var n = seats.length;
    var s = {
      n: n,
      players: seats.map(function (st, i) { return { index: i, cat: st.cat, human: st.human, catsLeft: CATS_BY_N[n], hand: [] }; }),
      cells: new Array(N).fill(null),
      deck: buildDeck(),
      current: 0, turn: 0, passes: 0, phase: 'playing', last: -1, log: [], _f: null
    };
    s.cells[40] = { m: 15, uid: 0, cat: null };
    s.players.forEach(function (p) { p.hand.push(s.deck.pop(), s.deck.pop()); });
    return s;
  }

  function clone(s) {
    return {
      n: s.n,
      players: s.players.map(function (p) { return { index: p.index, cat: p.cat, human: p.human, catsLeft: p.catsLeft, hand: p.hand.slice() }; }),
      cells: s.cells.map(function (c) { return c ? { m: c.m, uid: c.uid, cat: c.cat } : null; }),
      deck: s.deck, current: s.current, turn: s.turn, passes: s.passes, phase: s.phase, last: s.last, log: null, _f: null
    };
  }

  function tileAt(s, x, y) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return undefined;   /* 盤の 外 */
    return s.cells[y * SIZE + x];                                    /* null＝空きマス */
  }
  function arms(t) { return t ? t.m : 0; }

  /** 格子点 (vx,vy) と (vx+1,vy) は つながる？（その あいだの よこ線を 猫道が 横切らなければ） */
  function connH(s, vx, vy) {
    var below = tileAt(s, vx, vy), above = tileAt(s, vx, vy - 1);
    return (below !== undefined && !(arms(below) & DN)) || (above !== undefined && !(arms(above) & DS));
  }
  /** 格子点 (vx,vy) と (vx,vy+1) は つながる？ */
  function connV(s, vx, vy) {
    var right = tileAt(s, vx, vy), left = tileAt(s, vx - 1, vy);
    return (right !== undefined && !(arms(right) & DW)) || (left !== undefined && !(arms(left) & DE));
  }

  /* 格子点の まわりの 4マスと、その マスの どの ¼か */
  var AROUND = [[-1, -1, 'SE'], [0, -1, 'SW'], [-1, 0, 'NE'], [0, 0, 'NW']];
  var QUAD_ARMS = { NW: DN | DW, NE: DN | DE, SW: DS | DW, SE: DS | DE };

  /** 面を まるごと 計算（格子点 100個の 塗りつぶし） */
  function computeFaces(s) {
    var of = new Int16Array(V * V).fill(-1), faces = [];
    for (var v0 = 0; v0 < V * V; v0++) {
      if (of[v0] >= 0) continue;
      var f = { id: faces.length, verts: [], area: 0, closed: true, edge: false, border: {}, w: [0, 0, 0, 0], tops: [], owner: null };
      var stack = [v0];
      of[v0] = f.id;
      while (stack.length) {
        var v = stack.pop(), vx = v % V, vy = (v / V) | 0;
        f.verts.push(v);
        /* 盤の 端に ふれた 面は、猫道だけで かこまれて いないので なわばりに ならない */
        if (vx === 0 || vy === 0 || vx === V - 1 || vy === V - 1) f.edge = true;
        AROUND.forEach(function (a) {
          var x = vx + a[0], y = vy + a[1], t = tileAt(s, x, y);
          if (t === undefined) return;
          if (t === null) { f.closed = false; return; }
          f.area++;                                                /* ¼マス 1つ */
          if (t.m & QUAD_ARMS[a[2]]) f.border[y * SIZE + x] = true; /* この 面に 面した 猫道 */
        });
        var nbrs = [];
        if (vx < V - 1 && vy < V && connH(s, vx, vy)) nbrs.push(v + 1);
        if (vx > 0 && connH(s, vx - 1, vy)) nbrs.push(v - 1);
        if (vy < V - 1 && connV(s, vx, vy)) nbrs.push(v + V);
        if (vy > 0 && connV(s, vx, vy - 1)) nbrs.push(v - V);
        nbrs.forEach(function (u) { if (of[u] < 0) { of[u] = f.id; stack.push(u); } });
      }
      if (f.edge) f.closed = false;
      Object.keys(f.border).forEach(function (c) {
        var t = s.cells[c];
        if (t && t.cat !== null) f.w[t.cat]++;
      });
      var max = Math.max.apply(null, f.w);
      for (var p = 0; p < s.n; p++) if (max > 0 && f.w[p] === max) f.tops.push(p);
      f.owner = f.tops.length === 1 ? f.tops[0] : null;
      faces.push(f);
    }
    return { of: of, faces: faces };
  }
  function faces(s) { if (!s._f) s._f = computeFaces(s); return s._f; }

  /** 面の 点：完成した 面だけ。同数なら はんぶんずつ */
  function faceValue(f) {
    if (!f.closed || !f.tops.length) return 0;
    return f.tops.length > 1 ? Math.floor(f.area / 2) : f.area;
  }
  function scores(s) {
    var sc = s.players.map(function () { return 0; });
    faces(s).faces.forEach(function (f) { var v = faceValue(f); f.tops.forEach(function (p) { sc[p] += v; }); });
    return sc;
  }

  /** おける？：となりに タイルが ある。
      となりから むかって きて いる 猫道は ぜんぶ うけとめて つなげる（猫道を とちゅうで ふさがない）。
      こちらから 出す 猫道は、となりに 道が なくても よい（行き止まりに なるだけ）。
      猫道が きて いない 空きマスには どの タイルでも おける */
  function canPlace(s, c, m) {
    if (s.cells[c]) return false;
    var adj = false;
    for (var i = 0; i < 4; i++) {
      var d = DIRS[i], b = nb(c, d);
      if (b < 0 || !s.cells[b]) continue;
      adj = true;
      if ((s.cells[b].m & opp(d)) && !(m & d)) return false;
    }
    return adj;
  }
  function placeTile(s, hi, r, c) {
    var t = s.players[s.current].hand.splice(hi, 1)[0];
    s.cells[c] = { m: rot(t.m, r), uid: t.uid, cat: null };
    s.last = c;
    s._f = null;
  }
  /** ねこは いま おいた タイルの 猫道の 上だけ */
  function canCat(s, c) { var t = s.cells[c]; return !!t && t.m !== 0 && t.cat === null && c === s.last && s.players[s.current].catsLeft > 0; }
  function putCat(s, c) { s.cells[c].cat = s.current; s.players[s.current].catsLeft--; s._f = null; }
  function discard(s, hi) { s.players[s.current].hand.splice(hi, 1); }

  function anyPlace(s, P) {
    for (var hi = 0; hi < P.hand.length; hi++)
      for (var r = 0; r < 4; r++) {
        var m = rot(P.hand[hi].m, r);
        for (var c = 0; c < N; c++) if (canPlace(s, c, m)) return true;
      }
    return false;
  }

  /* ---------- ターン ---------- */
  function startTurn(s) {
    var P = s.players[s.current];
    if (P.hand.length < HAND_MAX && s.deck.length) P.hand.push(s.deck.pop());
    var noTiles = !s.deck.length && s.players.every(function (q) { return !q.hand.length; });
    if (noTiles || s.cells.every(Boolean)) finish(s);
  }
  function endTurn(s, acted) {
    s.passes = acted ? 0 : s.passes + 1;
    if (s.passes >= s.n) { finish(s); return; }
    s.turn++;
    s.current = (s.current + 1) % s.n;
    startTurn(s);
  }
  function finish(s) { s.phase = 'over'; s.final = scores(s); }

  /* =========================================================
     CPU：1手 先を 読む よくばり 探索
     ========================================================= */
  function evaluate(s, p) {
    var sc = scores(s), best = -Infinity;
    for (var i = 0; i < s.n; i++) if (i !== p) best = Math.max(best, sc[i]);
    var v = (sc[p] - best) * 2 + s.players[p].catsLeft * 1.5;
    /* 未完成の 面：いま 多数派なら 面積の 一部を 見込む（大きすぎる 面は 見込みを 小さく） */
    faces(s).faces.forEach(function (f) {
      if (f.closed || !f.tops.length) return;
      var share = f.tops.indexOf(p) >= 0 ? 1 / f.tops.length : -1 / Math.max(1, s.n - 1);
      v += share * Math.min(f.area, 40) * 0.35;
    });
    return v;
  }

  function cpuChoose(s) {
    var p = s.current, P = s.players[p];
    var best = { v: -Infinity, act: null };
    function consider(s2, act) {
      var v = evaluate(s2, p) + Math.random() * 0.05;
      if (v > best.v) best = { v: v, act: act };
    }
    P.hand.forEach(function (tile, hi) {
      var seen = {};
      for (var r = 0; r < 4; r++) {
        var m = rot(tile.m, r);
        if (seen[m]) continue;
        seen[m] = true;
        for (var c = 0; c < N; c++) {
          if (!canPlace(s, c, m)) continue;
          var s1 = clone(s);
          placeTile(s1, hi, r, c);
          consider(s1, { type: 'place', hi: hi, r: r, c: c });
          if (canCat(s1, c)) { var s2 = clone(s1); putCat(s2, c); consider(s2, { type: 'place', hi: hi, r: r, c: c, cat: true }); }
        }
      }
    });
    if (best.act) return best.act;
    return P.hand.length ? { type: 'discard', hi: 0 } : { type: 'pass' };
  }

  /* =========================================================
     ログ・トースト
     ========================================================= */
  var toastSeq = 0, toasts = [];
  function say(text, kind) {
    if (!game || !game.log) return;
    game.log.unshift({ text: text, kind: kind || '' });
    if (game.log.length > 8) game.log.length = 8;
    var id = ++toastSeq;
    toasts.push({ id: id, text: text, kind: kind || '' });
    if (toasts.length > 3) toasts.shift();
    renderToasts();
    setTimeout(function () { toasts = toasts.filter(function (t) { return t.id !== id; }); renderToasts(); }, 3000);
  }
  function renderToasts() {
    document.getElementById('toasts').innerHTML = toasts.map(function (t) {
      return '<div class="nn-toast is-' + t.kind + '">' + esc(t.text) + '</div>';
    }).join('');
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pname(i) { var p = game.players[i]; return CATS[p.cat].name + (p.human ? '' : '(CPU)'); }

  /* =========================================================
     えがく
     ========================================================= */
  var EDGE_MID = { 1: [50, 0], 2: [100, 50], 4: [50, 100], 8: [0, 50] };
  var QUAD_RECT = { NW: [0, 0], NE: [50, 0], SW: [0, 50], SE: [50, 50] };

  function sprite(catIdx, relax, c, r, cx, cy, size) {
    var url = 'images/cat-' + CATS[catIdx].id + (relax ? '-relax' : '') + '.png';
    return '<svg x="' + (cx - size / 2) + '" y="' + (cy - size / 2) + '" width="' + size + '" height="' + size + '" viewBox="0 0 340 340">' +
      '<image href="' + url + '" x="' + (-c * 340) + '" y="' + (-r * 340) + '" width="1020" height="1020" /></svg>';
  }

  /** o.quads：{NW: 色, ...} 完成した なわばりの ¼マスの 色 */
  function tileSVG(t, o) {
    o = o || {};
    var s = ['<rect width="100" height="100" fill="var(--ground)" />'];
    Object.keys(QUAD_RECT).forEach(function (q) {
      if (!o.quads || !o.quads[q]) return;
      var r = QUAD_RECT[q];
      s.push('<rect x="' + r[0] + '" y="' + r[1] + '" width="50" height="50" fill="' + o.quads[q] + '" opacity=".42" />');
    });
    /* 街区の かざり（屋根と 木）：猫道を よけて ¼マスの すみに */
    [['NW', 14, 14], ['NE', 86, 14], ['SW', 14, 86], ['SE', 86, 86]].forEach(function (k, i) {
      var seed = (t.uid * 7 + i * 3) % 5;
      if (seed === 0) s.push('<circle cx="' + k[1] + '" cy="' + k[2] + '" r="8" fill="var(--tree)" />');
      else if (seed === 1) s.push('<rect x="' + (k[1] - 9) + '" y="' + (k[2] - 8) + '" width="18" height="16" rx="2" fill="var(--roof)" />');
    });
    DIRS.forEach(function (d) {
      if (!(t.m & d)) return;
      var e = EDGE_MID[d];
      s.push('<line x1="50" y1="50" x2="' + e[0] + '" y2="' + e[1] + '" stroke="var(--path-edge)" stroke-width="20" />');
    });
    DIRS.forEach(function (d) {
      if (!(t.m & d)) return;
      var e = EDGE_MID[d];
      s.push('<line x1="50" y1="50" x2="' + e[0] + '" y2="' + e[1] + '" stroke="var(--path)" stroke-width="15" />');
    });
    if (t.m) {
      s.push('<circle cx="50" cy="50" r="10" fill="var(--path)" stroke="var(--path-edge)" stroke-width="2.5" />');
      DIRS.forEach(function (d) {
        if (!(t.m & d)) return;
        var e = EDGE_MID[d], mx = (50 + e[0]) / 2, my = (50 + e[1]) / 2;
        s.push('<circle cx="' + mx + '" cy="' + my + '" r="3" fill="var(--path-edge)" opacity=".7" />');   /* 飛び石 */
      });
    }
    if (t.cat !== null && t.cat !== undefined) {
      var pl = game.players[t.cat], col = CATS[pl.cat].color;
      s.push('<ellipse cx="50" cy="76" rx="22" ry="7" fill="' + col + '" stroke="#fff" stroke-width="2.5" />');
      s.push(sprite(pl.cat, false, 0, 0, 50, 50, 64));
    }
    return '<svg viewBox="0 0 100 100" aria-hidden="true">' + s.join('') + '</svg>';
  }

  function catFace(catIdx, cls, pose) {
    var p = pose || [false, 0, 0];
    var url = 'images/cat-' + CATS[catIdx].id + (p[0] ? '-relax' : '') + '.png';
    return '<span class="nn-face ' + (cls || '') + '" style="background-image:url(\'' + url + '\');background-position:' + (p[1] * 50) + '% ' + (p[2] * 50) + '%"></span>';
  }

  /* ---- 画面の 状態 ---- */
  var game = null;
  var setup = { seats: [{ cat: 0, mode: 'human' }, { cat: 1, mode: 'cpu' }, { cat: 2, mode: 'off' }, { cat: 3, mode: 'off' }] };
  var ui = { sel: null, rot: 0, mode: 'tile' };
  var rulesOpen = false, aiTimer = null;

  function resetUi() { ui = { sel: game && game.players[game.current].hand.length ? 0 : null, rot: 0, mode: 'tile' }; }
  function isAi() { return game && game.phase === 'playing' && !game.players[game.current].human; }

  function render() {
    var root = document.getElementById('app');
    if (!game) { root.innerHTML = renderSetup() + (rulesOpen ? renderRules() : ''); return; }
    root.innerHTML = '<div class="nn-stage">' + renderTop() + renderScore() +
      (game.phase === 'playing' ? renderStatus() + renderPanel() : '') +
      (game.phase === 'viewing' ? '<div class="nn-panel"><button type="button" class="nn-btn nn-btn--go" data-action="again">もういちど</button></div>' : '') +
      renderBoard() + renderLog() + '</div>' +
      (game.phase === 'over' ? renderOver() : '') + (rulesOpen ? renderRules() : '');
    scheduleAi();
  }

  function renderTop() {
    return '<header class="nn-top"><a class="nn-top__back" href="../app/">‹ 猫街ろまん</a>' +
      '<h1 class="nn-top__title">ネコネソンヌ</h1>' +
      '<button type="button" class="nn-top__btn" data-action="rules" aria-label="あそびかた">？</button></header>';
  }

  function renderSetup() {
    var active = setup.seats.filter(function (s) { return s.mode !== 'off'; }).length;
    var rows = setup.seats.map(function (st, i) {
      var modes = [['human', 'ひと'], ['cpu', 'CPU']];
      if (i >= 2) modes.push(['off', 'なし']);
      return '<div class="nn-seat' + (st.mode === 'off' ? ' is-off' : '') + '" style="--pc:' + CATS[st.cat].color + '">' +
        catFace(st.cat, 'nn-seat__face', st.mode === 'off' ? [true, 1, 1] : null) +
        '<span class="nn-seat__name">' + CATS[st.cat].name + (i === 0 ? '<small>先手</small>' : '') + '</span>' +
        '<span class="nn-seat__modes">' + modes.map(function (m) {
          return '<button type="button" class="nn-chip' + (st.mode === m[0] ? ' is-on' : '') + '" data-action="seat" data-seat="' + i + '" data-mode="' + m[0] + '">' + m[1] + '</button>';
        }).join('') + '</span></div>';
    }).join('');
    return '<div class="nn-stage">' + renderTop() +
      '<div class="nn-hero">' +
      '<div class="nn-hero__cats">' + [0, 1, 2, 3].map(function (i) { return catFace(i, 'nn-hero__cat', [i % 2 === 1, 1, i % 2 ? 1 : 0]); }).join('') + '</div>' +
      '<p class="nn-hero__lead">猫道を のばして つなげ、<br>かこんだ ところを なわばりに しよう。</p>' +
      '<ul class="nn-hero__points">' +
      '<li>🐾 <b>猫道を のばす</b>：タイルの 猫道を となりに つなげて おく</li>' +
      '<li>🔁 <b>かこむ</b>：猫道で ぐるりと かこんだ 面が なわばり</li>' +
      '<li>🐈 <b>見はる</b>：まわりの 猫道に ねこが 多い 人の もの</li>' +
      '</ul></div>' +
      '<section class="nn-card"><h2 class="nn-card__title">だれが あそぶ？（2〜4人）</h2>' + rows +
      '<button type="button" class="nn-btn nn-btn--go" data-action="start"' + (active < 2 ? ' disabled' : '') + '>あそぶ</button></section></div>';
  }

  function renderScore() {
    var sc = game.phase === 'playing' ? scores(game) : game.final;
    return '<div class="nn-score">' + game.players.map(function (p, i) {
      var cur = i === game.current && game.phase === 'playing';
      return '<div class="nn-pl' + (cur ? ' is-current' : '') + '" style="--pc:' + CATS[p.cat].color + '">' +
        catFace(p.cat, 'nn-pl__face', cur ? [false, 1, 0] : null) +
        '<span class="nn-pl__body"><span class="nn-pl__name">' + CATS[p.cat].name + (p.human ? '' : '<small>CPU</small>') + '</span>' +
        '<span class="nn-pl__pts">' + sc[i] + '<small>点</small></span>' +
        '<span class="nn-pl__left">🐾のこり ' + p.catsLeft + '</span></span></div>';
    }).join('') + '</div>';
  }

  function renderStatus() {
    var P = game.players[game.current], t;
    if (isAi()) t = pname(game.current) + 'の ばん … かんがえちゅう';
    else if (ui.mode === 'follow') t = 'おいた 猫道に ねこを おく？';
    else t = pname(game.current) + 'の ばん：手札を えらんで 盤に おく';
    return '<p class="nn-status" style="--pc:' + CATS[P.cat].color + '">' + esc(t) + '</p>';
  }

  function renderPanel() {
    var P = game.players[game.current];
    var deckInfo = '<span class="nn-deck">山札 ' + game.deck.length + '</span>';
    if (isAi()) {
      return '<div class="nn-panel nn-hand">' + P.hand.map(function (t) { return '<span class="nn-hand__tile is-back">' + tileSVG({ m: t.m, uid: t.uid, cat: null }) + '</span>'; }).join('') + deckInfo + '</div>';
    }
    if (ui.mode === 'follow') {
      return '<div class="nn-panel nn-panel--act">' +
        '<button type="button" class="nn-btn nn-btn--cat" data-action="cat">🐾 ねこを おく（のこり' + P.catsLeft + '）</button>' +
        '<button type="button" class="nn-btn nn-btn--sub" data-action="done">おかない</button></div>';
    }
    var hint = '';
    if (!P.hand.length) hint = '手札が ない…パスしてね';
    else if (!anyPlace(game, P)) hint = 'どの 手札も おけない…1まい すてるか パス';
    else if (ui.sel !== null) {
      var m = rot(P.hand[ui.sel].m, ui.rot), np = 0;
      for (var c = 0; c < N; c++) if (canPlace(game, c, m)) np++;
      hint = np ? 'きいろの マスに おける（もう一度 タップで まわす）' : 'この むきでは おけない。まわしてみて';
    }
    return '<div class="nn-panel nn-hand">' +
      P.hand.map(function (t, i) {
        var sel = i === ui.sel;
        return '<button type="button" class="nn-hand__tile' + (sel ? ' is-sel' : '') + '" data-action="hand" data-i="' + i + '" aria-label="手札' + (i + 1) + '">' +
          tileSVG({ m: sel ? rot(t.m, ui.rot) : t.m, uid: t.uid, cat: null }) + '</button>';
      }).join('') + deckInfo +
      '<p class="nn-panel__hint">' + esc(hint) + '</p>' +
      '<div class="nn-panel__row">' +
      (ui.sel !== null ? '<button type="button" class="nn-btn nn-btn--small" data-action="rotate">↻ まわす</button>' : '') +
      (ui.sel !== null ? '<button type="button" class="nn-btn nn-btn--small nn-btn--sub" data-action="discard">すてる</button>' : '') +
      '<button type="button" class="nn-btn nn-btn--small nn-btn--sub" data-action="pass">パス</button></div></div>';
  }

  function renderBoard() {
    var F = faces(game), P = game.players[game.current], mark = {};
    if (game.phase === 'playing' && !isAi() && ui.mode === 'tile' && ui.sel !== null && P.hand[ui.sel]) {
      var m = rot(P.hand[ui.sel].m, ui.rot);
      for (var c = 0; c < N; c++) if (canPlace(game, c, m)) mark[c] = 'is-place';
    }
    var cells = '';
    for (var i = 0; i < N; i++) {
      var t = game.cells[i], x = i % SIZE, y = (i / SIZE) | 0;
      var cls = 'nn-cell' + (mark[i] ? ' ' + mark[i] : '') + (i === game.last ? ' is-last' : '') + (t ? '' : ' is-empty');
      var inner = '';
      if (t) {
        /* ¼マスごとに、その 角の 格子点が 入る 面を 見て 色を つける */
        var quads = {};
        [['NW', x, y], ['NE', x + 1, y], ['SW', x, y + 1], ['SE', x + 1, y + 1]].forEach(function (q) {
          var f = F.faces[F.of[q[2] * V + q[1]]];
          if (f.closed) quads[q[0]] = f.owner !== null ? CATS[game.players[f.owner].cat].color : (f.tops.length ? '#8a8a8a' : null);
        });
        inner = tileSVG(t, { quads: quads });
      }
      cells += mark[i] ? '<button type="button" class="' + cls + '" data-action="cell" data-c="' + i + '">' + inner + '</button>'
        : '<div class="' + cls + '">' + inner + '</div>';
    }
    return '<div class="nn-board-box"><div class="nn-board">' + cells + '</div></div>';
  }

  function renderLog() {
    if (!game.log.length) return '';
    return '<ul class="nn-log">' + game.log.slice(0, 5).map(function (l) { return '<li class="is-' + l.kind + '">' + esc(l.text) + '</li>'; }).join('') + '</ul>';
  }

  function renderOver() {
    var order = game.players.map(function (p, i) { return i; }).sort(function (a, b) { return game.final[b] - game.final[a]; });
    var top = game.final[order[0]];
    var rows = order.map(function (i, rank) {
      var p = game.players[i], win = game.final[i] === top;
      return '<div class="nn-final__row' + (win ? ' is-win' : '') + '" style="--pc:' + CATS[p.cat].color + '">' +
        '<span class="nn-final__rank">' + (rank + 1) + '</span>' + catFace(p.cat, 'nn-final__face', win ? [false, 1, 2] : null) +
        '<span class="nn-final__name">' + esc(pname(i)) + (win ? ' 👑' : '') + '</span>' +
        '<span class="nn-final__pts">' + game.final[i] + '点</span></div>';
    }).join('');
    return '<div class="nn-overlay"><div class="nn-modal"><h2 class="nn-modal__title">おしまい！</h2>' +
      '<div class="nn-final">' + rows + '</div>' +
      '<p class="nn-modal__note">かこんだ 面の ¼マス＝1点（同数は はんぶんずつ）</p>' +
      '<button type="button" class="nn-btn nn-btn--go" data-action="again">もういちど</button>' +
      '<button type="button" class="nn-btn nn-btn--sub" data-action="view">盤面を みる</button></div></div>';
  }

  function renderRules() {
    return '<div class="nn-overlay" data-action="close-rules"><div class="nn-modal nn-rules" data-action="noop">' +
      '<div class="nn-modal__head"><h2 class="nn-modal__title">あそびかた</h2><button type="button" class="nn-modal__close" data-action="close-rules" aria-label="とじる">✕</button></div>' +
      '<h3>タイルを おく</h3><ul>' +
      '<li>盤は 9×9。まん中の 十字から はじめる。枠の 外へは ひろがらない。</li>' +
      '<li>タイルには 猫道が 0〜4本（中心から 辺の まん中へ）。</li>' +
      '<li>じぶんの ばんに 1まい 引く（手札は 3まいまで）。1まい えらんで、となりに おく。<b>となりから きて いる 猫道は ぜんぶ うけとめて つなげる</b>（猫道を とちゅうで ふさがない）。こちらから 出す 猫道は、となりに 道が なくても よい（行き止まりに なるだけ）。</li>' +
      '<li>おいた タイルの 猫道の 上に、じぶんの ねこを 1匹 おいて よい。</li>' +
      '<li>どこにも おけない ときは 1まい すてて よい。</li>' +
      '</ul><h3>なわばり</h3><ul>' +
      '<li>猫道は 境界線。<b>猫道だけで ぐるりと かこまれた 面</b>が なわばり。盤の 端に ふれて いる 面は なわばりに ならない。分岐・合流・行き止まりが あっても よい。</li>' +
      '<li>面の 中に 空きマスが なくなったら 完成。その 面に 面した 猫道の 上の ねこが いちばん 多い 人の なわばりに なり、色が つく（1匹の ねこは 両がわの 面に 数える）。</li>' +
      '<li>同数なら 灰色で、点は はんぶんずつ。</li>' +
      '</ul><h3>おわりと 点数</h3><ul>' +
      '<li>盤が うまるか、山札と 手札が なくなるか、全員が つづけて パスしたら おしまい。</li>' +
      '<li>完成した なわばりの 面積 ¼マス＝1点。完成して いない 面は 0点。</li>' +
      '</ul></div></div>';
  }

  /* =========================================================
     そうさ
     ========================================================= */
  function startGame() {
    var seats = setup.seats.filter(function (s) { return s.mode !== 'off'; }).map(function (s) { return { cat: s.cat, human: s.mode === 'human' }; });
    if (seats.length < 2) return;
    clearAi();
    toasts = []; renderToasts();
    lastClosed = {};
    game = newGame(seats);
    startTurn(game);
    resetUi();
    render();
  }

  /* 番の おわりに、あたらしく 完成した なわばりを しらせる */
  var lastClosed = {};
  function announceClosures() {
    var now = {};
    faces(game).faces.forEach(function (f) {
      if (!f.closed || !f.area) return;
      var k = f.verts.slice().sort(function (a, b) { return a - b; }).join('-');
      now[k] = true;
      if (lastClosed[k]) return;
      if (f.owner !== null) say('🏠 ' + pname(f.owner) + 'の なわばり 完成（' + f.area + '点）', 'score');
      else if (f.tops.length) say('なわばりが 同数で 完成（' + f.tops.map(pname).join('・') + 'で はんぶんずつ）', '');
    });
    lastClosed = now;
  }

  function afterAction(acted) {
    announceClosures();
    endTurn(game, acted);
    resetUi();
    render();
  }

  function clearAi() { if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; } }
  function scheduleAi() {
    if (!isAi() || aiTimer) return;
    aiTimer = setTimeout(function () {
      aiTimer = null;
      if (!isAi()) return;
      var p = game.current, act = cpuChoose(game);
      if (act.type === 'pass') { say(pname(p) + '：パス', ''); afterAction(false); return; }
      if (act.type === 'discard') { discard(game, act.hi); say(pname(p) + '：手札を 1まい すてた', ''); afterAction(true); return; }
      placeTile(game, act.hi, act.r, act.c);
      if (act.cat) putCat(game, act.c);
      afterAction(true);
    }, 650);
  }

  document.getElementById('app').addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-action]');
    if (!el) return;
    var a = el.dataset.action;
    if (a === 'noop') return;
    if (a === 'rules') { rulesOpen = true; render(); return; }
    if (a === 'close-rules') { rulesOpen = false; render(); return; }
    if (a === 'seat') { setup.seats[Number(el.dataset.seat)].mode = el.dataset.mode; render(); return; }
    if (a === 'start') { startGame(); return; }
    if (a === 'again') { clearAi(); game = null; render(); return; }
    if (a === 'view') { game.phase = 'viewing'; render(); return; }
    if (!game || game.phase !== 'playing' || isAi()) return;
    var P = game.players[game.current];
    if (a === 'hand') {
      var i = Number(el.dataset.i);
      if (ui.sel === i) ui.rot = (ui.rot + 1) % 4; else { ui.sel = i; ui.rot = 0; }
      ui.mode = 'tile'; render();
    } else if (a === 'rotate') { ui.rot = (ui.rot + 1) % 4; render(); }
    else if (a === 'cell' && ui.mode === 'tile' && ui.sel !== null) {
      var c = Number(el.dataset.c), m = rot(P.hand[ui.sel].m, ui.rot);
      if (!canPlace(game, c, m)) return;
      placeTile(game, ui.sel, ui.rot, c);
      ui.sel = null;
      if (canCat(game, c)) { ui.mode = 'follow'; render(); } else afterAction(true);
    } else if (a === 'cat' && canCat(game, game.last)) { putCat(game, game.last); afterAction(true); }
    else if (a === 'done') afterAction(true);
    else if (a === 'discard' && ui.sel !== null) { discard(game, ui.sel); say(pname(game.current) + '：手札を 1まい すてた', ''); afterAction(true); }
    else if (a === 'pass') { say(pname(game.current) + '：パス', ''); afterAction(false); }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && rulesOpen) { rulesOpen = false; render(); }
    if ((e.key === 'r' || e.key === 'R') && game && game.phase === 'playing' && !isAi() && ui.mode === 'tile' && ui.sel !== null) { ui.rot = (ui.rot + 1) % 4; render(); }
  });

  /* テスト用 */
  window.NNS = {
    newGame: newGame, computeFaces: computeFaces, canPlace: canPlace, placeTile: placeTile, putCat: putCat,
    scores: scores, rot: rot, getGame: function () { return game; }
  };

  render();
})();
