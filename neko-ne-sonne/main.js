/* =========================================================
   ネコネソンヌ ― 囲碁 × タイル配置の なわばり 陣取り
   ・9×9 の 盤（枠の 外へは ひろがらない）。タイルは 4辺が「道」か「壁」
   ・手札 3まいまで。タイルを おいたら「ねこ／ボス猫／壁コマ」の どれか 1つ
   ・道で つながった マスの かたまり＝区画。すきまが なくなると 完成（陣地）
   ・完成した 区画は ねこが いちばん 多い 人の なわばり。点は さいごに 数える
   ・浸食：となりの 相手の 陣地より 自分の 陣地の ねこが 多ければ、手札で
     境目の マスを 上書きできる。上書きした マスには かならず 自分の ねこを おく
   ・区画は 毎回 まるごと 計算しなおす（壁で わかれる・上書きで かわるので 差分管理は しない）
   ========================================================= */
(function () {
  'use strict';

  var SIZE = 9, N = SIZE * SIZE;
  var DN = 1, DE = 2, DS = 4, DW = 8, DIRS = [DN, DE, DS, DW];
  var DIR_NAME = { 1: '北', 2: '東', 4: '南', 8: '西' };

  var CATS = [
    { id: 'kuro', name: 'くろ', color: '#3b4a8a' },
    { id: 'hachiware', name: 'はちわれ', color: '#2f7d4a' },
    { id: 'kijitora', name: 'きじとら', color: '#c65a00' },
    { id: 'chashiro', name: 'ちゃしろ', color: '#d0526b' }
  ];
  var SUPPLY = { 2: { cats: 10, walls: 8 }, 3: { cats: 8, walls: 6 }, 4: { cats: 7, walls: 5 } };
  var HAND_MAX = 3;
  var KOMI = 3;            /* 2人の ときの 後手（はちわれ）の おまけ */
  var FAC = {
    box: { icon: '📦', name: '段ボール', pts: 2 },
    sun: { icon: '☀️', name: 'ひなた', pts: 1 },
    fish: { icon: '🐟', name: '魚屋', pts: 5 }
  };
  /* デッキ 88まい：1まい あたりの 道の 辺は 平均 2.0。
     辺を ぴったり あわせる ルールでは、道の 端が ふえつづけると 区画が とじないので、
     行き止まり・角を 多めに して「ふたを する」タイルを 用意する */
  var DECK_DEF = [
    { m: 15, n: 8, fac: {} },                           /* 十字 */
    { m: 7, n: 16, fac: { box: 2, sun: 2 } },           /* T字 */
    { m: 5, n: 16, fac: {} },                           /* 直線 */
    { m: 3, n: 22, fac: { box: 3, sun: 2, fish: 1 } },  /* 角 */
    { m: 1, n: 20, fac: { box: 3, sun: 2, fish: 1 } },  /* 行き止まり */
    { m: 0, n: 6, fac: {} }                             /* 塀 */
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
  /** 辺の 番号：どの 辺も「西／北がわの マス」の 東(×2) か 南(×2+1) で あらわす */
  function edgeId(c, d) {
    if (d === DE) return nb(c, DE) < 0 ? -1 : c * 2;
    if (d === DS) return nb(c, DS) < 0 ? -1 : c * 2 + 1;
    var b = nb(c, d);
    if (b < 0) return -1;
    return d === DW ? b * 2 : b * 2 + 1;
  }
  function edgeCells(e) { var c = e >> 1; return (e & 1) ? [c, DS] : [c, DE]; }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function buildDeck() {
    var d = [], uid = 1;
    DECK_DEF.forEach(function (def) {
      var facs = [];
      Object.keys(def.fac).forEach(function (k) { for (var i = 0; i < def.fac[k]; i++) facs.push(k); });
      for (var i = 0; i < def.n; i++) d.push({ uid: uid++, m: def.m, fac: facs[i] || null });
    });
    return shuffle(d);
  }

  /* =========================================================
     状態と ルール（描画と わけて ある。CPU も 同じ 関数を つかう）
     ========================================================= */
  function newGame(seats) {
    var n = seats.length, sup = SUPPLY[n];
    var s = {
      n: n,
      players: seats.map(function (st, i) {
        return { index: i, cat: st.cat, human: st.human, catsLeft: sup.cats, bossLeft: 1, wallsLeft: sup.walls, omiyage: 0, hand: [] };
      }),
      cells: new Array(N).fill(null),
      walls: new Uint8Array(N * 2),
      deck: buildDeck(),
      current: 0, turn: 0, passes: 0, phase: 'playing', last: -1, log: [], _reg: null
    };
    s.cells[40] = { m: 15, fac: null, uid: 0, cat: null, stomped: false };
    s.players.forEach(function (p) { p.hand.push(s.deck.pop(), s.deck.pop()); });
    return s;
  }

  function clone(s) {
    return {
      n: s.n,
      players: s.players.map(function (p) {
        return { index: p.index, cat: p.cat, human: p.human, catsLeft: p.catsLeft, bossLeft: p.bossLeft, wallsLeft: p.wallsLeft, omiyage: p.omiyage, hand: p.hand.slice() };
      }),
      cells: s.cells.map(function (c) { return c ? { m: c.m, fac: c.fac, uid: c.uid, cat: c.cat ? { p: c.cat.p, boss: c.cat.boss } : null, stomped: c.stomped } : null; }),
      walls: new Uint8Array(s.walls),
      deck: s.deck, current: s.current, turn: s.turn, passes: s.passes, phase: s.phase, last: s.last, log: null, _reg: null
    };
  }

  function hasWall(s, c, d) { var e = edgeId(c, d); return e >= 0 && s.walls[e] === 1; }

  function passable(s, a, d) {
    var b = nb(a, d);
    if (b < 0) return false;
    var A = s.cells[a], B = s.cells[b];
    if (!A || !B || !(A.m & d) || !(B.m & opp(d))) return false;
    return !hasWall(s, a, d);
  }

  /** 区画を まるごと 計算（81マスなので 毎回 やりなおしても かるい） */
  function computeRegions(s) {
    var of = new Int16Array(N).fill(-1), regions = [];
    for (var c0 = 0; c0 < N; c0++) {
      if (!s.cells[c0] || of[c0] >= 0) continue;
      var r = { id: regions.length, cells: [], closed: true, w: [0, 0, 0, 0], box: 0, sun: 0, fish: 0, owner: null, tops: [], safe: false, pts: 0 };
      var stack = [c0];
      of[c0] = r.id;
      while (stack.length) {
        var a = stack.pop(), A = s.cells[a];
        r.cells.push(a);
        if (A.cat) r.w[A.cat.p] += A.cat.boss ? 2 : 1;
        if (A.fac) r[A.fac]++;
        for (var i = 0; i < 4; i++) {
          var d = DIRS[i], b = nb(a, d);
          if ((A.m & d) && b >= 0 && !s.cells[b] && !hasWall(s, a, d)) r.closed = false;
          if (passable(s, a, d) && of[b] < 0) { of[b] = r.id; stack.push(b); }
        }
      }
      var max = 0;
      for (var p = 0; p < s.n; p++) max = Math.max(max, r.w[p]);
      r.tops = [];
      for (var q = 0; q < s.n; q++) if (max > 0 && r.w[q] === max) r.tops.push(q);
      r.owner = r.tops.length === 1 ? r.tops[0] : null;     /* 同数なら だれの なわばりでも ない */
      r.safe = (r.box + r.sun + r.fish) >= 2;                     /* 二眼で 安住 */
      r.pts = r.cells.length + r.box * FAC.box.pts + r.sun * FAC.sun.pts + (r.fish ? FAC.fish.pts : 0);
      regions.push(r);
    }
    return { of: of, regions: regions };
  }
  function regions(s) { if (!s._reg) s._reg = computeRegions(s); return s._reg; }
  function regionAt(s, c) { var R = regions(s); return R.of[c] >= 0 ? R.regions[R.of[c]] : null; }

  /** おける？：となりに タイルが あり、となりと 辺が ぴったり あう（道には 道、壁には 壁）。
      壁コマの ある 辺は どちらでも よい。回転で 16とおり すべての 辺の 組みあわせを
      つくれるので、どんな 穴にも どれかの 形は はいる */
  function canPlace(s, c, m) {
    if (s.cells[c]) return false;
    var adj = false;
    for (var i = 0; i < 4; i++) {
      var d = DIRS[i], b = nb(c, d);
      if (b < 0 || !s.cells[b]) continue;
      adj = true;
      if (hasWall(s, c, d)) continue;
      if (!!(s.cells[b].m & opp(d)) !== !!(m & d)) return false;
    }
    return adj;
  }

  function placeTile(s, hi, r, c) {
    var P = s.players[s.current];
    var t = P.hand.splice(hi, 1)[0];
    s.cells[c] = { m: rot(t.m, r), fac: t.fac, uid: t.uid, cat: null, stomped: false };
    s.last = c;
    s._reg = null;
  }

  /** ねこを おける マス：その番に おいた タイルの 上だけ（おいて 区画が 完成しても おける） */
  function canCat(s, c) {
    var C = s.cells[c];
    return !!C && !C.cat && c === s.last;
  }
  function putCat(s, p, c, boss) {
    s.cells[c].cat = { p: p, boss: !!boss };
    if (boss) s.players[p].bossLeft--; else s.players[p].catsLeft--;
    s._reg = null;
  }

  /** 壁コマ：どちらかの マスが その辺に 道を むけていて、その区画が 未完成 */
  function canWall(s, c, d) {
    var b = nb(c, d);
    if (b < 0 || hasWall(s, c, d)) return false;
    var pairs = [[c, d], [b, opp(d)]];
    for (var i = 0; i < 2; i++) {
      var x = pairs[i][0], X = s.cells[x];
      if (X && (X.m & pairs[i][1]) && !regionAt(s, x).closed) return true;
    }
    return false;
  }
  function putWall(s, e) {
    s.walls[e] = 1;
    s.players[s.current].wallsLeft--;
    s._reg = null;
  }
  function wallEdges(s) {
    var list = [];
    for (var c = 0; c < N; c++) {
      if (canWall(s, c, DE)) list.push(c * 2);
      if (canWall(s, c, DS)) list.push(c * 2 + 1);
    }
    return list;
  }

  function bossNear(s, t) {
    var cs = [t].concat(DIRS.map(function (d) { return nb(t, d); }));
    return cs.some(function (c) { return c >= 0 && s.cells[c] && s.cells[c].cat && s.cells[c].cat.boss; });
  }

  /** 浸食できる？ p が むき m の タイルで マス t を 上書き */
  function canErode(s, p, t, m) {
    var P = s.players[p];
    if (P.catsLeft + P.bossLeft <= 0) return false;
    var T = s.cells[t];
    if (!T || T.cat || T.stomped || bossNear(s, t)) return false;
    var B = regionAt(s, t);
    if (!B.closed || B.owner === null || B.owner === p || B.safe) return false;
    for (var i = 0; i < 4; i++) {
      var d = DIRS[i];
      if (!(m & d)) continue;
      var a = nb(t, d);
      if (a < 0 || !s.cells[a]) continue;
      var A = regionAt(s, a);
      if (A === B || !A.closed || A.owner !== p) continue;
      if (A.w[p] > B.w[B.owner]) return true;
    }
    return false;
  }

  /** 浸食：境目の 壁を こわし、上書きした マスに 自分の ねこを おく。
      はじき出した タイルは やられた 人の「おみやげ」 */
  function erode(s, hi, r, t, boss) {
    var p = s.current, P = s.players[p];
    var tile = P.hand[hi], m = rot(tile.m, r);
    var victim = regionAt(s, t).owner;
    /* 自分の なわばり がわの 境目は、へい（タイルの 壁）も 壁コマも こわして 道で つなぐ */
    DIRS.forEach(function (d) {
      if (!(m & d)) return;
      var a = nb(t, d);
      if (a < 0 || !s.cells[a]) return;
      var A = regionAt(s, a);
      if (A.closed && A.owner === p) {
        s.cells[a].m |= opp(d);
        var e = edgeId(t, d);
        if (e >= 0) s.walls[e] = 0;
      }
    });
    s.players[victim].omiyage++;
    P.hand.splice(hi, 1);
    s.cells[t] = { m: m, fac: tile.fac, uid: tile.uid, cat: null, stomped: true };
    s.last = t;
    s._reg = null;
    putCat(s, p, t, boss);
    return victim;
  }

  /** 区画の 点：完成は まるごと、未完成は はんぶん。同数で ならんだら さらに はんぶんずつ */
  function regionValue(r) {
    if (!r.tops.length) return 0;
    var v = r.closed ? r.pts : Math.floor(r.pts / 2);
    return r.tops.length > 1 ? Math.floor(v / 2) : v;
  }

  function scores(s) {
    var sc = s.players.map(function (p) { return p.omiyage + (s.n === 2 && p.index === 1 ? KOMI : 0); });
    regions(s).regions.forEach(function (r) {
      var v = regionValue(r);
      r.tops.forEach(function (p) { sc[p] += v; });
    });
    return sc;
  }

  function anyPlace(s, P) {
    for (var hi = 0; hi < P.hand.length; hi++)
      for (var r = 0; r < 4; r++) {
        var m = rot(P.hand[hi].m, r);
        for (var c = 0; c < N; c++) if (canPlace(s, c, m) || canErode(s, P.index, c, m)) return true;
      }
    return false;
  }

  /* ---------- ターン ---------- */
  function startTurn(s) {
    var P = s.players[s.current];
    if (P.hand.length < HAND_MAX && s.deck.length) P.hand.push(s.deck.pop());
    var noTiles = !s.deck.length && s.players.every(function (q) { return !q.hand.length; });
    var full = s.cells.every(Boolean);
    /* 盤が うまったら、だれかが まだ 浸食できる ときだけ つづける */
    if (noTiles || (full && !s.players.some(function (q) { return anyPlace(s, q); }))) finish(s);
  }

  /** 手札を 1まい すてる（番を つかった ことに なる。山札が へるので かならず おわる） */
  function discard(s, hi) {
    s.players[s.current].hand.splice(hi, 1);
  }
  function endTurn(s, acted) {
    s.passes = acted ? 0 : s.passes + 1;
    if (s.passes >= s.n) { finish(s); return; }
    s.turn++;
    s.current = (s.current + 1) % s.n;
    startTurn(s);
  }
  function finish(s) {
    s.phase = 'over';
    s.final = scores(s);
  }

  /* =========================================================
     CPU：1手 先を 読む よくばり 探索
     ========================================================= */
  function evaluate(s, p) {
    var sc = scores(s), best = -Infinity;
    for (var i = 0; i < s.n; i++) if (i !== p) best = Math.max(best, sc[i]);
    var P = s.players[p];
    var v = (sc[p] - best) * 2 + P.catsLeft * 0.5 + P.bossLeft * 1.4 + P.wallsLeft * 0.2;
    /* 未完成の 区画で 2番手なら 少し 見込み、自分の 陣地が 浸食されそうなら へらす */
    regions(s).regions.forEach(function (r) {
      if (!r.closed && r.tops.indexOf(p) < 0 && r.w[p] > 0 && r.w[p] + 1 >= Math.max.apply(null, r.w)) v += r.pts * 0.12;
      if (r.closed && r.owner === p && !r.safe) v -= 0.3;
    });
    return v;
  }

  function cpuChoose(s) {
    var p = s.current, P = s.players[p];
    var best = { v: evaluate(s, p) - 1.5, act: { type: 'pass' } };
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
          if (canPlace(s, c, m)) {
            var s1 = clone(s);
            placeTile(s1, hi, r, c);
            consider(s1, { type: 'place', hi: hi, r: r, c: c });
            if (canCat(s1, c)) {
              if (P.catsLeft > 0) { var s2 = clone(s1); putCat(s2, p, c, false); consider(s2, { type: 'place', hi: hi, r: r, c: c, cat: c }); }
              if (P.bossLeft > 0) { var s3 = clone(s1); putCat(s3, p, c, true); consider(s3, { type: 'place', hi: hi, r: r, c: c, boss: c }); }
            }
            if (P.wallsLeft > 0) {
              DIRS.forEach(function (d) {
                if (!canWall(s1, c, d)) return;
                var s4 = clone(s1);
                putWall(s4, edgeId(c, d));
                consider(s4, { type: 'place', hi: hi, r: r, c: c, wall: edgeId(c, d) });
              });
            }
          } else if (canErode(s, p, c, m)) {
            var s5 = clone(s);
            var useBoss = P.catsLeft <= 0;
            erode(s5, hi, r, c, useBoss);
            consider(s5, { type: 'erode', hi: hi, r: r, c: c, boss: useBoss });
          }
        }
      }
    });
    /* パスしか ない のに 手札が ある → つかいにくい 1まいを すてて 山札を まわす */
    if (best.act.type === 'pass' && P.hand.length && !anyPlace(s, P)) {
      var worst = 0;
      P.hand.forEach(function (t, i) { if (t.m === 15 || t.m === 0) worst = i; });
      return { type: 'discard', hi: worst };
    }
    return best.act;
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
  var FENCE = {
    1: 'x="0" y="0" width="100" height="9"', 2: 'x="91" y="0" width="9" height="100"',
    4: 'x="0" y="91" width="100" height="9"', 8: 'x="0" y="0" width="9" height="100"'
  };

  function sprite(catIdx, relax, c, r, cx, cy, size) {
    var url = 'images/cat-' + CATS[catIdx].id + (relax ? '-relax' : '') + '.png';
    return '<svg x="' + (cx - size / 2) + '" y="' + (cy - size / 2) + '" width="' + size + '" height="' + size + '" viewBox="0 0 340 340">' +
      '<image href="' + url + '" x="' + (-c * 340) + '" y="' + (-r * 340) + '" width="1020" height="1020" /></svg>';
  }

  function tileSVG(cell, o) {
    o = o || {};
    var s = ['<rect width="100" height="100" fill="var(--wood)" />',
      '<path d="M0 30 Q50 26 100 32 M0 70 Q50 66 100 72" stroke="var(--wood-line)" stroke-width="1" fill="none" />'];
    if (o.tint) s.push('<rect width="100" height="100" fill="' + o.tint + '" opacity=".34" />');
    DIRS.forEach(function (d) {
      if (!(cell.m & d)) s.push('<rect ' + FENCE[d] + ' fill="var(--fence)" />');
    });
    DIRS.forEach(function (d) {
      if (!(cell.m & d)) return;
      var e = EDGE_MID[d];
      s.push('<line x1="50" y1="50" x2="' + e[0] + '" y2="' + e[1] + '" stroke="var(--ink)" stroke-width="5" stroke-linecap="butt" />');
    });
    if (cell.m) s.push('<circle cx="50" cy="50" r="6" fill="var(--ink)" />');
    if (cell.fac) s.push('<text x="24" y="33" font-size="26" text-anchor="middle">' + FAC[cell.fac].icon + '</text>');
    if (cell.stomped) s.push('<text x="80" y="92" font-size="15" text-anchor="middle" opacity=".6">🐾</text>');
    if (o.safe) s.push('<text x="80" y="30" font-size="18" text-anchor="middle">🛡️</text>');
    if (cell.cat) {
      var col = CATS[game.players[cell.cat.p].cat];
      var size = cell.cat.boss ? 78 : 64;
      s.push('<ellipse cx="50" cy="' + (50 + size * 0.4) + '" rx="' + (size * 0.34) + '" ry="7" fill="' + col.color + '" stroke="#fff" stroke-width="2" />');
      /* 陣地の 中の ねこは まるくなる（こうばこずわり）、ふだんは おすわり */
      s.push(o.home ? sprite(game.players[cell.cat.p].cat, true, 1, 1, 50, 52, size) : sprite(game.players[cell.cat.p].cat, false, 0, 0, 50, 50, size));
      if (cell.cat.boss) s.push('<text x="50" y="' + (50 - size * 0.38) + '" font-size="20" text-anchor="middle">👑</text>');
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
  var ui = { sel: null, rot: 0, mode: 'tile', erode: null };
  var rulesOpen = false, aiTimer = null;

  function resetUi() { ui = { sel: game && game.players[game.current].hand.length ? 0 : null, rot: 0, mode: 'tile', erode: null }; }
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
      '<p class="nn-hero__lead">9×9の 盤に 街タイルと 壁を おいて 区画を かこい、<br>ねこの かずで なわばりを きめよう。</p>' +
      '<ul class="nn-hero__points">' +
      '<li>🧱 <b>かこむ</b>：すきまの ない 区画は 陣地に なる</li>' +
      '<li>🐾 <b>ねこの かず</b>：いちばん 多い 人の なわばり</li>' +
      '<li>⚔️ <b>浸食</b>：ねこが 多ければ となりの 陣地へ ふみこめる</li>' +
      '<li>🛡️ <b>二眼</b>：お気に入りが 2つ ある 陣地は 安住の地</li>' +
      '</ul></div>' +
      '<section class="nn-card"><h2 class="nn-card__title">だれが あそぶ？（2〜4人）</h2>' + rows +
      '<p class="nn-card__note">2人の ときは 後手の はちわれに コミ ' + KOMI + '点</p>' +
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
        '<span class="nn-pl__left">🐾' + p.catsLeft + ' 👑' + p.bossLeft + ' 🧱' + p.wallsLeft + ' 🎁' + p.omiyage + '</span></span></div>';
    }).join('') + '</div>';
  }

  function renderStatus() {
    var P = game.players[game.current], t;
    if (isAi()) t = pname(game.current) + 'の ばん … かんがえちゅう';
    else if (ui.mode === 'follow') t = 'つぎは ねこ・ボス猫・壁の どれか 1つ（しなくても よい）';
    else if (ui.mode === 'cat' || ui.mode === 'boss') t = (ui.mode === 'boss' ? 'ボス猫' : 'ねこ') + 'は いま おいた タイルに おくよ（タップ）';
    else if (ui.mode === 'wall') t = '壁コマを おく 辺を えらんでね';
    else if (ui.mode === 'erodeCat') t = '浸食した マスに おく ねこを えらんでね';
    else t = pname(game.current) + 'の ばん：手札を えらんで 盤に おく';
    return '<p class="nn-status" style="--pc:' + CATS[P.cat].color + '">' + esc(t) + '</p>';
  }

  function renderPanel() {
    var P = game.players[game.current];
    var deckInfo = '<span class="nn-deck">山札 ' + game.deck.length + '</span>';
    if (isAi()) {
      return '<div class="nn-panel nn-hand">' + P.hand.map(function (t) { return '<span class="nn-hand__tile is-back">' + tileSVG({ m: t.m, fac: t.fac }) + '</span>'; }).join('') + deckInfo + '</div>';
    }
    if (ui.mode === 'follow') {
      var cats = P.catsLeft > 0 && catCells().length > 0;
      var boss = P.bossLeft > 0 && catCells().length > 0;
      var walls = P.wallsLeft > 0 && wallEdges(game).length > 0;
      return '<div class="nn-panel nn-panel--act">' +
        '<button type="button" class="nn-btn nn-btn--cat" data-action="follow" data-mode="cat"' + (cats ? '' : ' disabled') + '>🐾 ねこを おく（のこり' + P.catsLeft + '）</button>' +
        '<button type="button" class="nn-btn nn-btn--boss" data-action="follow" data-mode="boss"' + (boss ? '' : ' disabled') + '>👑 ボス猫を おく（2匹ぶん・まわりを まもる）</button>' +
        '<button type="button" class="nn-btn nn-btn--wall" data-action="follow" data-mode="wall"' + (walls ? '' : ' disabled') + '>🧱 壁コマを おく（のこり' + P.wallsLeft + '）</button>' +
        '<button type="button" class="nn-btn nn-btn--sub" data-action="done">なにも しない</button></div>';
    }
    if (ui.mode === 'cat' || ui.mode === 'boss' || ui.mode === 'wall') {
      return '<div class="nn-panel"><button type="button" class="nn-btn nn-btn--sub nn-btn--small" data-action="follow" data-mode="back">‹ もどる</button></div>';
    }
    if (ui.mode === 'erodeCat') {
      return '<div class="nn-panel nn-panel--act">' +
        '<button type="button" class="nn-btn nn-btn--cat" data-action="erode" data-boss="0">🐾 ねこで ふみこむ</button>' +
        '<button type="button" class="nn-btn nn-btn--boss" data-action="erode" data-boss="1">👑 ボス猫で ふみこむ</button>' +
        '<button type="button" class="nn-btn nn-btn--sub" data-action="erode-cancel">やめる</button></div>';
    }
    var hint = '';
    if (!P.hand.length) hint = '手札が ない…パスしてね';
    else if (!anyPlace(game, P)) hint = 'どの 手札も おけない…1まい すてるか パス';
    else if (ui.sel !== null) {
      var m = rot(P.hand[ui.sel].m, ui.rot), np = 0, ne = 0;
      for (var c = 0; c < N; c++) { if (canPlace(game, c, m)) np++; else if (canErode(game, game.current, c, m)) ne++; }
      hint = np || ne ? 'きいろ＝おける' + (ne ? '／あか＝浸食できる' : '') + '（もう一度 タップで まわす）' : 'この むきでは おけない。まわしてみて';
    }
    return '<div class="nn-panel nn-hand">' +
      P.hand.map(function (t, i) {
        var sel = i === ui.sel;
        return '<button type="button" class="nn-hand__tile' + (sel ? ' is-sel' : '') + '" data-action="hand" data-i="' + i + '" aria-label="手札' + (i + 1) + '">' +
          tileSVG({ m: sel ? rot(t.m, ui.rot) : t.m, fac: t.fac }) + '</button>';
      }).join('') + deckInfo +
      '<p class="nn-panel__hint">' + esc(hint) + '</p>' +
      '<div class="nn-panel__row">' +
      (ui.sel !== null ? '<button type="button" class="nn-btn nn-btn--small" data-action="rotate">↻ まわす</button>' : '') +
      (ui.sel !== null ? '<button type="button" class="nn-btn nn-btn--small nn-btn--sub" data-action="discard">すてる</button>' : '') +
      '<button type="button" class="nn-btn nn-btn--small nn-btn--sub" data-action="pass">パス</button></div></div>';
  }

  function catCells() {
    var list = [];
    for (var c = 0; c < N; c++) if (canCat(game, c)) list.push(c);
    return list;
  }

  function renderBoard() {
    var R = regions(game), P = game.players[game.current];
    var mark = {};
    if (game.phase === 'playing' && !isAi()) {
      if (ui.mode === 'tile' && ui.sel !== null && P.hand[ui.sel]) {
        var m = rot(P.hand[ui.sel].m, ui.rot);
        for (var c = 0; c < N; c++) {
          if (canPlace(game, c, m)) mark[c] = 'is-place';
          else if (canErode(game, game.current, c, m)) mark[c] = 'is-erode';
        }
      } else if (ui.mode === 'cat' || ui.mode === 'boss') {
        catCells().forEach(function (c) { mark[c] = 'is-cat'; });
      }
      if (ui.mode === 'erodeCat') mark[ui.erode.c] = 'is-erode';
    }
    var cells = '';
    for (var i = 0; i < N; i++) {
      var C = game.cells[i], reg = C ? R.regions[R.of[i]] : null;
      var cls = 'nn-cell' + (mark[i] ? ' ' + mark[i] : '') + (i === game.last ? ' is-last' : '') + (C ? '' : ' is-empty');
      var inner = C ? tileSVG(C, {
        tint: reg.closed ? (reg.owner !== null ? CATS[game.players[reg.owner].cat].color : '#8a8a8a') : null,
        safe: reg.closed && reg.safe && reg.owner !== null,
        home: reg.closed
      }) : '';
      cells += mark[i] ? '<button type="button" class="' + cls + '" data-action="cell" data-c="' + i + '">' + inner + '</button>'
        : '<div class="' + cls + '">' + inner + '</div>';
    }
    var walls = '';
    for (var e = 0; e < N * 2; e++) if (game.walls[e]) walls += edgeDiv(e, 'nn-wall', false);
    if (game.phase === 'playing' && !isAi() && ui.mode === 'wall') {
      wallEdges(game).forEach(function (e) { walls += edgeDiv(e, 'nn-edge', true); });
    }
    return '<div class="nn-board-box"><div class="nn-board">' + cells + walls + '</div></div>';
  }

  function edgeDiv(e, cls, button) {
    var ec = edgeCells(e), c = ec[0], x = c % SIZE, y = (c / SIZE) | 0, v = ec[1] === DE;
    var style = v ? 'left:' + ((x + 1) / SIZE * 100) + '%;top:' + ((y + 0.5) / SIZE * 100) + '%'
      : 'left:' + ((x + 0.5) / SIZE * 100) + '%;top:' + ((y + 1) / SIZE * 100) + '%';
    var k = cls + (v ? ' is-v' : ' is-h');
    return button ? '<button type="button" class="' + k + '" style="' + style + '" data-action="edge" data-e="' + e + '" aria-label="壁コマ"></button>'
      : '<span class="' + k + '" style="' + style + '"></span>';
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
        '<span class="nn-final__name">' + esc(pname(i)) + (win ? ' 👑' : '') + '<small>おみやげ ' + p.omiyage + (game.n === 2 && i === 1 ? '・コミ ' + KOMI : '') + '</small></span>' +
        '<span class="nn-final__pts">' + game.final[i] + '点</span></div>';
    }).join('');
    return '<div class="nn-overlay"><div class="nn-modal"><h2 class="nn-modal__title">おしまい！</h2>' +
      '<div class="nn-final">' + rows + '</div>' +
      '<p class="nn-modal__note">完成した 陣地＝マス数＋施設、未完成は はんぶん、同数は わけあう</p>' +
      '<button type="button" class="nn-btn nn-btn--go" data-action="again">もういちど</button>' +
      '<button type="button" class="nn-btn nn-btn--sub" data-action="view">盤面を みる</button></div></div>';
  }

  function renderRules() {
    return '<div class="nn-overlay" data-action="close-rules"><div class="nn-modal nn-rules" data-action="noop">' +
      '<div class="nn-modal__head"><h2 class="nn-modal__title">あそびかた</h2><button type="button" class="nn-modal__close" data-action="close-rules" aria-label="とじる">✕</button></div>' +
      '<h3>タイルと 盤</h3><ul>' +
      '<li>盤は 9×9。まん中の 十字から はじめる。枠の 外へは ひろがらない。</li>' +
      '<li>タイルの 黒い 線＝<b>道</b>、線の ない 辺＝<b>壁（へい）</b>。道どうしが むきあった 辺だけ つながる。</li>' +
      '<li>じぶんの ばんに 山札から 1まい 引く（手札は 3まいまで）。手札を 1まい えらんで、<b>となりと 辺が ぴったり あう</b> ように おく（道には 道、壁には 壁）。壁コマの ある 辺は どちらでも よい。</li>' +
      '</ul><h3>おいた あと（どれか 1つ）</h3><ul>' +
      '<li>🐾 <b>ねこ</b>：いま おいた タイルの 上に おく。おいて 区画が 完成しても おける（とじて 自分の ものに する）。</li>' +
      '<li>👑 <b>ボス猫</b>：1匹だけ。2匹ぶんに 数え、そのマスと 上下左右は 浸食されない。</li>' +
      '<li>🧱 <b>壁コマ</b>：未完成の 区画の 道の 辺に おいて、そこを ふさぐ（区画を わけたり、とじたり）。</li>' +
      '</ul><h3>陣地と なわばり</h3><ul>' +
      '<li>道が 空きマスへ ぬけて いない 区画は <b>完成</b>。ねこ（ボスは2）が いちばん 多い 人の なわばりに なり、色が つく。同数なら 灰色（点は はんぶんずつ）。</li>' +
      '<li>ねこは 盤に のこる（囲碁の 石と おなじ）。手札が どこにも おけない ときは 1まい すてて よい。</li>' +
      '<li>施設が 2つ 以上 ある なわばりは 🛡️<b>安住の地</b>（二眼）。浸食されない。</li>' +
      '</ul><h3>⚔️ 浸食</h3><ul>' +
      '<li>じぶんの なわばりの ねこの かずが、となりの 相手の なわばりの 相手の ねこの かずより <b>多い</b> とき、手札で 境目の マスを <b>上書き</b>できる（タイルを おく かわり）。</li>' +
      '<li>上書きする タイルは じぶんの なわばり がわに 道が むいて いること（ほかの 辺は あわなくて よい）。境目の へいと 壁コマは こわれて、じぶんの なわばりと 道で つながる。</li>' +
      '<li>上書きした マスには <b>かならず じぶんの ねこ（か ボス猫）を おく</b>。ねこが いないと 浸食できない。</li>' +
      '<li>ねこが いる マス・ボス猫の まわり・一度 上書きされた マス（🐾ふみかため）は 上書きできない。</li>' +
      '<li>はじき出された タイルは やられた 人の 🎁<b>おみやげ</b>（さいごに 1点）。</li>' +
      '</ul><h3>おわりと 点数</h3><ul>' +
      '<li>全員が つづけて パスするか、山札と 手札が なくなるか、盤が うまって だれも 浸食できなく なったら おしまい。</li>' +
      '<li>完成した なわばり：マス数 ＋ 📦段ボール2・☀️ひなた1・🐟魚屋5（1区画 1軒まで）。未完成の 区画は ねこが 多い 人に はんぶん。同数なら それを さらに はんぶんずつ。</li>' +
      '<li>2人の ときは 後手（はちわれ）に コミ ' + KOMI + '点。</li>' +
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
    game = newGame(seats);
    startTurn(game);
    resetUi();
    render();
  }

  /* 番の おわりに（ねこを おき おわってから）完成を しらせる */
  function afterAction(acted) {
    announceClosures();
    endTurn(game, acted);
    resetUi();
    render();
  }

  function humanCell(c) {
    var P = game.players[game.current];
    if (ui.mode === 'tile' && ui.sel !== null) {
      var m = rot(P.hand[ui.sel].m, ui.rot);
      if (canPlace(game, c, m)) {
        placeTile(game, ui.sel, ui.rot, c);
        ui.sel = null;
        var canFollow = ((P.catsLeft > 0 || P.bossLeft > 0) && catCells().length) || (P.wallsLeft > 0 && wallEdges(game).length);
        if (canFollow) { ui.mode = 'follow'; render(); } else afterAction(true);
      } else if (canErode(game, game.current, c, m)) {
        if (P.catsLeft > 0 && P.bossLeft > 0) { ui.mode = 'erodeCat'; ui.erode = { hi: ui.sel, r: ui.rot, c: c }; render(); }
        else doErode(ui.sel, ui.rot, c, P.catsLeft <= 0);
      }
    } else if ((ui.mode === 'cat' || ui.mode === 'boss') && canCat(game, c)) {
      putCat(game, game.current, c, ui.mode === 'boss');
      afterAction(true);
    }
  }

  function doErode(hi, r, c, boss) {
    var victim = erode(game, hi, r, c, boss);
    say('⚔️ ' + pname(game.current) + 'が ' + pname(victim) + 'の なわばりに ふみこんだ！（' + pname(victim) + 'に おみやげ）', 'erode');
    afterAction(true);
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
      if (act.type === 'erode') { doErode(act.hi, act.r, act.c, act.boss); return; }
      placeTile(game, act.hi, act.r, act.c);
      if (act.cat !== undefined) putCat(game, p, act.cat, false);
      else if (act.boss !== undefined) putCat(game, p, act.boss, true);
      else if (act.wall !== undefined) putWall(game, act.wall);
      afterAction(true);
    }, 700);
  }

  /* 完成した 瞬間を ひろって しらせる */
  var lastClosed = {};
  function announceClosures() {
    if (!game || !game.log) return;
    var now = {};
    regions(game).regions.forEach(function (r) {
      if (!r.closed) return;
      var k = r.cells.slice().sort(function (a, b) { return a - b; }).join('-');
      now[k] = true;
      if (!lastClosed[k] && r.cells.length > 0 && game.turn > 0) {
        say(r.owner !== null ? '🏠 ' + pname(r.owner) + 'の なわばり 完成（' + r.cells.length + 'マス・' + r.pts + '点' + (r.safe ? '・安住' : '') + '）' : '区画が とじた（ねこ なし／同数）', r.owner !== null ? 'score' : '');
      }
    });
    lastClosed = now;
  }

  document.getElementById('app').addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-action]');
    if (!el) return;
    var a = el.dataset.action;
    if (a === 'noop') return;
    if (a === 'rules') { rulesOpen = true; render(); return; }
    if (a === 'close-rules') { rulesOpen = false; render(); return; }
    if (a === 'seat') { setup.seats[Number(el.dataset.seat)].mode = el.dataset.mode; render(); return; }
    if (a === 'start') { lastClosed = {}; startGame(); return; }
    if (a === 'again') { clearAi(); game = null; render(); return; }
    if (a === 'view') { game.phase = 'viewing'; render(); return; }
    if (!game || game.phase !== 'playing' || isAi()) return;
    var P = game.players[game.current];
    if (a === 'hand') {
      var i = Number(el.dataset.i);
      if (ui.sel === i) ui.rot = (ui.rot + 1) % 4; else { ui.sel = i; ui.rot = 0; }
      ui.mode = 'tile'; render();
    } else if (a === 'rotate') { ui.rot = (ui.rot + 1) % 4; render(); }
    else if (a === 'cell') humanCell(Number(el.dataset.c));
    else if (a === 'follow') {
      var md = el.dataset.mode;
      /* ねこは いま おいた タイルに しか おけないので、ボタンで すぐ おく */
      if ((md === 'cat' && P.catsLeft > 0) || (md === 'boss' && P.bossLeft > 0)) {
        if (canCat(game, game.last)) { putCat(game, game.current, game.last, md === 'boss'); afterAction(true); }
        return;
      }
      ui.mode = md === 'back' ? 'follow' : md;
      if ((md === 'cat' && P.catsLeft <= 0) || (md === 'boss' && P.bossLeft <= 0) || (md === 'wall' && P.wallsLeft <= 0)) ui.mode = 'follow';
      render();
    } else if (a === 'edge') {
      var e = Number(el.dataset.e), ec = edgeCells(e);
      if (ui.mode === 'wall' && P.wallsLeft > 0 && canWall(game, ec[0], ec[1])) { putWall(game, e); afterAction(true); }
    } else if (a === 'done') afterAction(true);
    else if (a === 'erode' && ui.erode) { var er = ui.erode; doErode(er.hi, er.r, er.c, el.dataset.boss === '1'); }
    else if (a === 'erode-cancel') { ui.mode = 'tile'; ui.erode = null; render(); }
    else if (a === 'discard' && ui.sel !== null) { discard(game, ui.sel); say(pname(game.current) + '：手札を 1まい すてた', ''); afterAction(true); }
    else if (a === 'pass') { say(pname(game.current) + '：パス', ''); afterAction(false); }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && rulesOpen) { rulesOpen = false; render(); }
    if ((e.key === 'r' || e.key === 'R') && game && game.phase === 'playing' && !isAi() && ui.mode === 'tile' && ui.sel !== null) { ui.rot = (ui.rot + 1) % 4; render(); }
  });

  /* テスト用 */
  window.NNS = {
    newGame: newGame, computeRegions: computeRegions, canPlace: canPlace, canErode: canErode, canWall: canWall, canCat: canCat,
    placeTile: placeTile, putCat: putCat, putWall: putWall, erode: erode, scores: scores, rot: rot, edgeId: edgeId,
    getGame: function () { return game; }
  };

  render();
})();
