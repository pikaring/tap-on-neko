/* =========================================================
   ネコネソンヌ ― 猫道を つないで 面を かこむ 陣取り
   ・盤は 9×9（2人は 7×7）。タイルには 猫道（中心から 辺の まん中へ）が 0〜4本
   ・猫道と 盤の 端が 境界線。ただし 四辺の まん中は「出口」で、出口に ふれた 面は 0点
   ・ねこは 猫道の 上（タイルの 中心）に おく
   ・面が 完成（中に 空きマスが ない）したら すぐ 採点：面に 面した 猫道の ねこの
     多数派が ¼マス＝1点を もらう。境界の ねこは 全員 手もとへ もどり、
     持ち主は なわばりの 中に ねこを 1匹 おく（目じるし。ずっと のこる）
   ・さいごに 手もとに のこった ねこ 1匹＝1点

   面の 計算：タイルの 角（格子点）を 1点と みなす。1つの 格子点の まわりの
   ¼マス 4つは かならず つながり、となりの 格子点とは「その あいだを 猫道が
   横切って いない」ときだけ つながる。完成した 面は それ以上 かわらない。
   ========================================================= */
(function () {
  'use strict';

  var SIZE = 9, N = 81, V = 10;   /* 盤の 大きさ（newGame で 人数に あわせて きめる） */
  function setSize(size) { SIZE = size; N = size * size; V = size + 1; }

  var DN = 1, DE = 2, DS = 4, DW = 8, DIRS = [DN, DE, DS, DW];

  var CATS = [
    { id: 'kuro', name: 'くろ', color: '#3b4a8a' },
    { id: 'hachiware', name: 'はちわれ', color: '#2f7d4a' },
    { id: 'kijitora', name: 'きじとら', color: '#c65a00' },
    { id: 'chashiro', name: 'ちゃしろ', color: '#d0526b' }
  ];
  /* 人数ごとの 設定：盤の 大きさ・ねこの かず・手札（2人は 場に 4まい ならべた 共通の タイルから えらぶ） */
  var RULES_BY_N = {
    2: { size: 7, cats: 7, hand: 4, shared: true },
    3: { size: 9, cats: 6, hand: 3, shared: false },
    4: { size: 9, cats: 5, hand: 3, shared: false }
  };
  /* デッキ 88まい（まん中の 十字を のぞく）。分岐は 少なめ、かこみやすい 角を 多めに */
  var DECK_DEF = [
    { m: 15, n: 8 },    /* 十字 */
    { m: 7, n: 16 },    /* T字 */
    { m: 5, n: 20 },    /* 直線 */
    { m: 3, n: 24 },    /* 角 */
    { m: 1, n: 12 },    /* 行き止まり */
    { m: 0, n: 8 }      /* 道なし */
  ];
  var TAKO_PER_PLAYER = 1;   /* タコ：1人 1回（タイルを おく かわりに） */
  /* 格子点の 採点ずみ しるし */
  var UNSCORED = -1, TIE = -2, NOBODY = -3;

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
  /** 出口：四辺の まん中の マスの 外がわの 辺（その 両はしの 格子点） */
  function exitVerts() {
    var mid = (SIZE - 1) / 2, last = V - 1, set = {};
    [[mid, 0], [mid + 1, 0], [mid, last], [mid + 1, last], [0, mid], [0, mid + 1], [last, mid], [last, mid + 1]]
      .forEach(function (p) { set[p[1] * V + p[0]] = true; });
    return set;
  }

  /* =========================================================
     状態と ルール（描画と わけて ある。CPU も 同じ 関数を つかう）
     ========================================================= */
  /** mode：'go'＝囲碁モード（猫は 無限。おいた 猫道は かならず 自分の 色）／'neko'＝猫街モード（猫に 限りあり） */
  function newGame(seats, mode) {
    var n = seats.length, R = RULES_BY_N[n];
    mode = mode || 'go';
    setSize(R.size);
    var shared = R.shared ? [] : null;
    var s = {
      n: n, size: R.size, handMax: R.hand, shared: R.shared, mode: mode,
      players: seats.map(function (st, i) {
        return { index: i, cat: st.cat, human: st.human, catsLeft: mode === 'go' ? 0 : R.cats, score: 0, captured: 0, takoLeft: TAKO_PER_PLAYER, hand: shared || [] };
      }),
      cells: new Array(N).fill(null),
      vo: new Int8Array(V * V).fill(UNSCORED),   /* 格子点ごとの 持ち主（採点ずみの 面） */
      markers: [],                               /* なわばりの 目じるしの ねこ {v, p} */
      takos: [],                                 /* タコを おいた マス */
      exits: exitVerts(),
      deck: buildDeck(),
      current: 0, turn: 0, passes: 0, phase: 'playing', last: -1, log: [], _f: null
    };
    s.cells[(N - 1) / 2] = { m: 15, uid: 0, cat: null };
    if (R.shared) { while (shared.length < R.hand) shared.push(s.deck.pop()); }
    else s.players.forEach(function (p) { p.hand.push(s.deck.pop(), s.deck.pop()); });
    return s;
  }

  function clone(s) {
    var sharedHand = s.shared ? s.players[0].hand.slice() : null;
    return {
      n: s.n, size: s.size, handMax: s.handMax, shared: s.shared, mode: s.mode,
      players: s.players.map(function (p) {
        return { index: p.index, cat: p.cat, human: p.human, catsLeft: p.catsLeft, score: p.score, captured: p.captured, takoLeft: p.takoLeft, hand: sharedHand || p.hand.slice() };
      }),
      cells: s.cells.map(function (c) { return c ? { m: c.m, uid: c.uid, cat: c.cat } : null; }),
      vo: new Int8Array(s.vo), markers: s.markers.slice(), takos: s.takos.slice(), exits: s.exits,
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

  var AROUND = [[-1, -1, 'SE'], [0, -1, 'SW'], [-1, 0, 'NE'], [0, 0, 'NW']];
  var QUAD_ARMS = { NW: DN | DW, NE: DN | DE, SW: DS | DW, SE: DS | DE };

  /** 面を まるごと 計算（格子点の 塗りつぶし）。盤の 端は 境界、出口に ふれた 面は 点なし */
  function computeFaces(s) {
    var of = new Int16Array(V * V).fill(-1), faces = [];
    for (var v0 = 0; v0 < V * V; v0++) {
      if (of[v0] >= 0) continue;
      var f = { id: faces.length, verts: [], area: 0, closed: true, exit: false, border: {}, w: [0, 0, 0, 0], tops: [], owner: null };
      var stack = [v0];
      of[v0] = f.id;
      while (stack.length) {
        var v = stack.pop(), vx = v % V, vy = (v / V) | 0;
        f.verts.push(v);
        if (s.exits[v]) f.exit = true;
        AROUND.forEach(function (a) {
          var x = vx + a[0], y = vy + a[1], t = tileAt(s, x, y);
          if (t === undefined) return;
          if (t === null) { f.closed = false; return; }
          f.area++;                                                /* ¼マス 1つ */
          if (t.m & QUAD_ARMS[a[2]]) f.border[y * SIZE + x] = true; /* この 面に 面した 猫道 */
        });
        var nbrs = [];
        if (vx < V - 1 && connH(s, vx, vy)) nbrs.push(v + 1);
        if (vx > 0 && connH(s, vx - 1, vy)) nbrs.push(v - 1);
        if (vy < V - 1 && connV(s, vx, vy)) nbrs.push(v + V);
        if (vy > 0 && connV(s, vx, vy - 1)) nbrs.push(v - V);
        nbrs.forEach(function (u) { if (of[u] < 0) { of[u] = f.id; stack.push(u); } });
      }
      /* 同じ ねこは、同じ 面では 何か所で ふれても 1票 */
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
  function scorable(f) { return f.closed && !f.exit && f.area > 0; }
  function isScored(s, f) { return s.vo[f.verts[0]] !== UNSCORED; }

  /** 面の まん中に いちばん ちかい 格子点（目じるしの ねこを おく 場所） */
  function centerVert(f) {
    var sx = 0, sy = 0;
    f.verts.forEach(function (v) { sx += v % V; sy += (v / V) | 0; });
    sx /= f.verts.length; sy /= f.verts.length;
    var best = f.verts[0], bd = Infinity;
    f.verts.forEach(function (v) {
      var d = Math.pow(v % V - sx, 2) + Math.pow(((v / V) | 0) - sy, 2);
      if (d < bd) { bd = d; best = v; }
    });
    return best;
  }

  /** あたらしく 完成した 面を 採点する。できごとの 一覧を かえす */
  function settle(s) {
    var events = [];
    faces(s).faces.forEach(function (f) {
      if (!scorable(f) || isScored(s, f)) return;
      var k = f.tops.length;
      var mark = k === 0 ? NOBODY : k > 1 ? TIE : f.tops[0];
      f.verts.forEach(function (v) { s.vo[v] = mark; });
      var pts = k ? Math.floor(f.area / k) : 0;              /* 同率首位は 人数で わって 切りすて */
      f.tops.forEach(function (p) { s.players[p].score += pts; });
      if (s.mode === 'go') {
        /* 囲碁モード：持ち主が きまったら、境界の 相手の ねこを とる（盤から のぞき 1匹 1点）。自分の ねこは のこる */
        var cap = 0;
        if (k === 1) {
          Object.keys(f.border).forEach(function (c) {
            var t = s.cells[c];
            if (t && t.cat !== null && t.cat !== f.tops[0]) { t.cat = null; cap++; }
          });
          s.players[f.tops[0]].score += cap;
          s.players[f.tops[0]].captured += cap;
        }
        events.push({ tops: f.tops.slice(), area: f.area, pts: pts, cap: cap });
        return;
      }
      /* 猫街モード：境界の ねこは 全員 手もとへ */
      Object.keys(f.border).forEach(function (c) {
        var t = s.cells[c];
        if (t && t.cat !== null) { s.players[t.cat].catsLeft++; t.cat = null; }
      });
      /* 持ち主は なわばりの 中に 目じるしの ねこを 1匹 */
      if (k === 1) { s.players[f.tops[0]].catsLeft--; s.markers.push({ v: centerVert(f), p: f.tops[0] }); }
      events.push({ tops: f.tops.slice(), area: f.area, pts: pts });
    });
    if (events.length) s._f = null;
    return events;
  }

  /** 合計点：なわばりの 点（囲碁モードは とった ねこを ふくむ）＋ 猫街モードは 手もとの ねこ */
  function totals(s) { return s.players.map(function (p) { return p.score + (s.mode === 'go' ? 0 : p.catsLeft); }); }

  /** おける？：となりに タイルが ある。となりの タイルとの 辺は ぴったり あわせる
      （道が 辺まで 出て いたら かならず 道どうしで つなぐ。行き止まりの 道を となりに ぶつけない）。
      盤の 端へ 出る 猫道は よい（盤の 端は 境界線） */
  function canPlace(s, c, m) {
    if (s.cells[c]) return false;
    var adj = false;
    for (var i = 0; i < 4; i++) {
      var d = DIRS[i], b = nb(c, d);
      if (b < 0 || !s.cells[b]) continue;
      adj = true;
      if (!!(s.cells[b].m & opp(d)) !== !!(m & d)) return false;
    }
    return adj;
  }

  /* ---- タコ：その マスと 上下左右の ねこを 手もとへ かえし、その 5マスには 以後 ねこを おけない ---- */
  function takoZone(c) { return [c].concat(DIRS.map(function (d) { return nb(c, d); }).filter(function (x) { return x >= 0; })); }
  function noCatZone(s, c) { return s.takos.some(function (t) { return takoZone(t).indexOf(c) >= 0; }); }
  function canTako(s, c) { return !!s.cells[c] && s.takos.indexOf(c) < 0 && s.players[s.current].takoLeft > 0; }
  function putTako(s, c) {
    s.takos.push(c);
    s.players[s.current].takoLeft--;
    var removed = 0;
    takoZone(c).forEach(function (x) {
      var t = s.cells[x];
      if (!t || t.cat === null) return;
      if (s.mode !== 'go') s.players[t.cat].catsLeft++;   /* 猫街モード：持ち主の 手もとへ（囲碁モードは 無限なので 盤から のぞくだけ） */
      t.cat = null;
      removed++;
    });
    s._f = null;
    return removed;
  }

  /** まだ あたらしい なわばりが できる 見こみが ある？
      空きマスを ぜんぶ 十字（いちばん こまかく 区切る 形）で うめた と 考え、
      空きマスの 角を ふくむ 面が どれも 出口に ふれるなら、もう なわばりは ふえない */
  function canStillScore(s) {
    var near = {}, any = false;
    s.cells.forEach(function (c, i) {
      if (c) return;
      any = true;
      var x = i % SIZE, y = (i / SIZE) | 0;
      [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]].forEach(function (p) { near[p[1] * V + p[0]] = true; });
    });
    if (!any) return false;
    var sim = { n: s.n, exits: s.exits, cells: s.cells.map(function (c) { return c || { m: 15, uid: 0, cat: null }; }) };
    return computeFaces(sim).faces.some(function (f) {
      return !f.exit && f.area > 0 && f.verts.some(function (v) { return near[v]; });
    });
  }
  function placeTile(s, hi, r, c) {
    var t = s.players[s.current].hand.splice(hi, 1)[0];
    /* 囲碁モード：猫道の ある タイルは おいた 人の 色（ねこが のる） */
    s.cells[c] = { m: rot(t.m, r), uid: t.uid, cat: s.mode === 'go' && t.m && !noCatZone(s, c) ? s.current : null };
    s.last = c;
    s._f = null;
  }
  /** ねこは いま おいた タイルの 猫道の 上だけ */
  function canCat(s, c) { var t = s.cells[c]; return !!t && t.m !== 0 && t.cat === null && c === s.last && s.players[s.current].catsLeft > 0 && !noCatZone(s, c); }
  function putCat(s, c) { s.cells[c].cat = s.current; s.players[s.current].catsLeft--; s._f = null; }
  

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
    while (P.hand.length < s.handMax && s.deck.length && (s.shared || P.hand.length < s.handMax)) {
      P.hand.push(s.deck.pop());
      if (!s.shared) break;   /* 手札は 1まいずつ。場の タイルは 4まいに なるまで */
    }
    /* どの タイルも おけない ときは、おける ものが 出るまで 1まいずつ すてて 引きなおす（自動） */
    s.swapped = 0;
    while (P.hand.length && s.deck.length && !anyPlace(s, P)) {
      P.hand.shift();
      P.hand.push(s.deck.pop());
      s.swapped++;
    }
    var noTiles = !s.deck.length && s.players.every(function (q) { return !q.hand.length; });
    if (noTiles || s.cells.every(Boolean)) { finish(s); return; }
    if (!canStillScore(s)) { s.endReason = 'noterr'; finish(s); }
  }
  function endTurn(s, acted) {
    s.passes = acted ? 0 : s.passes + 1;
    if (s.passes >= s.n) { finish(s); return; }
    s.turn++;
    s.current = (s.current + 1) % s.n;
    startTurn(s);
  }
  function finish(s) { s.phase = 'over'; s.final = totals(s); }

  /* =========================================================
     CPU：1手 先を 読む よくばり 探索
     ========================================================= */
  function evaluate(s, p) {
    var tot = totals(s), best = -Infinity;
    for (var i = 0; i < s.n; i++) if (i !== p) best = Math.max(best, tot[i]);
    var v = (tot[p] - best) * 2;
    /* 未完成で 点に なりうる 面：いま 多数派なら 面積の 一部を 見込む */
    faces(s).faces.forEach(function (f) {
      if (f.closed || f.exit || !f.tops.length) return;
      var share = f.tops.indexOf(p) >= 0 ? 1 / f.tops.length : -1 / Math.max(1, s.n - 1);
      v += share * Math.min(f.area, 40) * 0.4;
    });
    return v;
  }

  function cpuChoose(s) {
    var p = s.current, P = s.players[p];
    var best = { v: -Infinity, act: null };
    function consider(s2, act, bias) {
      settle(s2);
      var v = evaluate(s2, p) + (bias || 0) + Math.random() * 0.05;
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
          if (canCat(s1, c)) { var s2 = clone(s1); putCat(s2, c); consider(s2, { type: 'place', hi: hi, r: r, c: c, cat: true }); }
          consider(s1, { type: 'place', hi: hi, r: r, c: c });
        }
      }
    });
    /* タコ：相手の ねこが 2匹 以上 のぞける ところだけ ためす（つかうと 1回 へるので 少し ひかえめに） */
    if (P.takoLeft > 0) {
      for (var c = 0; c < N; c++) {
        if (!canTako(s, c)) continue;
        var foes = takoZone(c).filter(function (x) { return s.cells[x] && s.cells[x].cat !== null && s.cells[x].cat !== p; }).length;
        if (foes < 2) continue;
        var s3 = clone(s);
        putTako(s3, c);
        consider(s3, { type: 'tako', c: c }, -3);
      }
    }
    return best.act || { type: 'pass' };
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

  /** o.quads：{NW: 色, ...} 採点ずみの なわばりの ¼マスの 色 */
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
    /* 囲碁モードでは 猫道を 持ち主の 色で ぬる（色つきの 線で 見る 囲碁） */
    var owned = game && game.mode === 'go' && t.cat !== null && t.cat !== undefined;
    var pathColor = owned ? CATS[game.players[t.cat].cat].color : 'var(--path)';
    DIRS.forEach(function (d) {
      if (!(t.m & d)) return;
      var e = EDGE_MID[d];
      s.push('<line x1="50" y1="50" x2="' + e[0] + '" y2="' + e[1] + '" stroke="' + pathColor + '" stroke-width="15"' + (owned ? ' opacity=".85"' : '') + ' />');
    });
    if (t.m) {
      s.push('<circle cx="50" cy="50" r="10" fill="' + pathColor + '" stroke="var(--path-edge)" stroke-width="2.5" />');
      DIRS.forEach(function (d) {
        if (!(t.m & d)) return;
        var e = EDGE_MID[d];
        s.push('<circle cx="' + (50 + e[0]) / 2 + '" cy="' + (50 + e[1]) / 2 + '" r="3" fill="var(--path-edge)" opacity=".7" />');
      });
    }
    if (t.cat !== null && t.cat !== undefined) {
      var pl = game.players[t.cat], col = CATS[pl.cat].color;
      if (owned) {
        s.push(sprite(pl.cat, false, 0, 0, 50, 48, 50));                 /* 囲碁モードは ねこ 少し 小さめ */
      } else {
        s.push('<ellipse cx="50" cy="76" rx="22" ry="7" fill="' + col + '" stroke="#fff" stroke-width="2.5" />');
        s.push(sprite(pl.cat, false, 0, 0, 50, 50, 64));
      }
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
  var setup = { game: 'go', seats: [{ cat: 0, mode: 'human' }, { cat: 1, mode: 'cpu' }, { cat: 2, mode: 'off' }, { cat: 3, mode: 'off' }] };
  var ui = { sel: null, rot: 0, mode: 'tile' };
  var rulesOpen = false, aiTimer = null;

  function resetUi() { ui = { sel: game && game.players[game.current].hand.length ? 0 : null, rot: 0, mode: 'tile' }; }
  function isAi() { return game && game.phase === 'playing' && !game.players[game.current].human; }

  function render() {
    var root = document.getElementById('app');
    if (!game) { root.innerHTML = renderSetup() + (rulesOpen ? renderRules() : ''); return; }
    /* 盤は つねに 見える 位置に。したの 操作らんは 高さを 固定して、中身が かわっても 盤が ずれない */
    root.innerHTML = '<div class="nn-play">' + renderTop() +
      '<div class="nn-side">' + renderScore() +
      '<div class="nn-ctrl">' + (game.phase === 'playing' ? renderStatus() + renderPanel()
        : '<p class="nn-status" style="--pc:#2f5d3a">おしまい</p><div class="nn-panel"><button type="button" class="nn-btn nn-btn--go" data-action="again">もういちど</button></div>') + '</div>' +
      renderLog() + '</div>' +
      renderBoard() + '</div>' +
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
    var R = RULES_BY_N[Math.max(2, active)];
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
      '<li>🔁 <b>かこむ</b>：猫道と 盤の 端で かこんだ 面が なわばり（出口🚪に ふれたら ×）</li>' +
      '<li>🐈 <b>見はる</b>：まわりの 猫道に ねこが 多い 人の もの</li>' +
      '</ul></div>' +
      '<section class="nn-card"><h2 class="nn-card__title">だれが あそぶ？（2〜4人）</h2>' + rows +
      '<h2 class="nn-card__title">モード</h2>' +
      '<div class="nn-seat__modes nn-len">' +
      '<button type="button" class="nn-chip' + (setup.game === 'go' ? ' is-on' : '') + '" data-action="gmode" data-g="go">囲碁モード（猫は 無限）</button>' +
      '<button type="button" class="nn-chip' + (setup.game === 'neko' ? ' is-on' : '') + '" data-action="gmode" data-g="neko">猫街モード（猫に 限り）</button>' +
      '</div>' +
      '<p class="nn-card__note">' + (setup.game === 'go'
        ? 'おいた 猫道は かならず 自分の 色。かこんだら 境界の 相手の ねこを とる'
        : 'ねこは ' + R.cats + '匹。完成したら 手もとへ もどり、さいごに 手もとの ねこも 点') +
      '<br>' + active + '人：盤 ' + R.size + '×' + R.size + (R.shared ? '・場の タイル 4まいから えらぶ' : '・手札 3まいまで') + '</p>' +
      '<button type="button" class="nn-btn nn-btn--go" data-action="start"' + (active < 2 ? ' disabled' : '') + '>あそぶ</button></section></div>';
  }

  function renderScore() {
    var tot = game.phase === 'playing' ? totals(game) : game.final;
    return '<div class="nn-score" style="--np:' + game.n + '">' + game.players.map(function (p, i) {
      var cur = i === game.current && game.phase === 'playing';
      return '<div class="nn-pl' + (cur ? ' is-current' : '') + '" style="--pc:' + CATS[p.cat].color + '">' +
        catFace(p.cat, 'nn-pl__face', cur ? [false, 1, 0] : null) +
        '<span class="nn-pl__body"><span class="nn-pl__name">' + CATS[p.cat].name + (p.human ? '' : '<small>CPU</small>') + '</span>' +
        '<span class="nn-pl__pts">' + tot[i] + '<small>点</small></span>' +
        '<span class="nn-pl__left">' + (game.mode === 'go' ? '🏠' + (p.score - p.captured) + ' 🐾' + p.captured : '🏠' + p.score + ' 🐾' + p.catsLeft) + (p.takoLeft ? ' 🐙' : '') + '</span></span></div>';
    }).join('') + '</div>';
  }

  function renderStatus() {
    var P = game.players[game.current], t;
    if (isAi()) t = pname(game.current) + 'の ばん … かんがえちゅう';
    else if (ui.mode === 'follow') t = 'おいた 猫道に ねこを おく？（手もとの ねこは 1匹 1点）';
    else if (ui.mode === 'tako') t = '🐙 タコを おく タイルを えらんでね';
    else t = pname(game.current) + 'の ばん：' + (game.shared ? '場の タイル' : '手札') + 'を えらんで おく';
    return '<p class="nn-status" style="--pc:' + CATS[P.cat].color + '">' + esc(t) + '</p>';
  }

  function renderPanel() {
    var P = game.players[game.current];
    var deckInfo = '<span class="nn-deck">山札 ' + game.deck.length + '</span>';
    var label = game.shared ? '<span class="nn-deck">場（共通）</span>' : '';
    if (isAi()) {
      return '<div class="nn-panel nn-hand">' + label + P.hand.map(function (t) { return '<span class="nn-hand__tile is-back">' + tileSVG({ m: t.m, uid: t.uid, cat: null }) + '</span>'; }).join('') + deckInfo + '</div>';
    }
    if (ui.mode === 'tako') {
      return '<div class="nn-panel nn-panel--act">' +
        '<p class="nn-panel__hint">むらさきの タイルに タコを おくと、その マスと 上下左右の ねこが 手もとへ もどり、その 5マスには もう ねこを おけない</p>' +
        '<button type="button" class="nn-btn nn-btn--sub" data-action="tako-cancel">やめる</button></div>';
    }
    if (ui.mode === 'follow') {
      return '<div class="nn-panel nn-panel--act">' +
        '<button type="button" class="nn-btn nn-btn--cat" data-action="cat">🐾 ねこを おく（手もと ' + P.catsLeft + '）</button>' +
        '<button type="button" class="nn-btn nn-btn--sub" data-action="done">おかない</button></div>';
    }
    var can = anyPlace(game, P), hint = '';
    if (!P.hand.length) hint = 'タイルが ない…パスしてね';
    else if (!can) hint = '山札が なくなって、おける タイルが ない…パスしてね';
    else if (ui.sel !== null) {
      var m = rot(P.hand[ui.sel].m, ui.rot), np = 0;
      for (var c = 0; c < N; c++) if (canPlace(game, c, m)) np++;
      hint = np ? 'きいろの マスに おける（もう一度 タップで まわす）' : 'この むきでは おけない。まわしてみて';
    }
    return '<div class="nn-panel nn-hand">' + label +
      P.hand.map(function (t, i) {
        var sel = i === ui.sel;
        return '<button type="button" class="nn-hand__tile' + (sel ? ' is-sel' : '') + '" data-action="hand" data-i="' + i + '" aria-label="タイル' + (i + 1) + '">' +
          tileSVG({ m: sel ? rot(t.m, ui.rot) : t.m, uid: t.uid, cat: null }) + '</button>';
      }).join('') + deckInfo +
      '<p class="nn-panel__hint">' + esc(hint) + '</p>' +
      '<div class="nn-panel__row">' +
      (ui.sel !== null && can ? '<button type="button" class="nn-btn nn-btn--small" data-action="rotate">↻ まわす</button>' : '') +
      (P.takoLeft > 0 ? '<button type="button" class="nn-btn nn-btn--small nn-btn--tako" data-action="tako">🐙 タコ</button>' : '') +
      (!can ? '<button type="button" class="nn-btn nn-btn--small nn-btn--sub" data-action="pass">パス</button>' : '') +
      '</div></div>';
  }

  /* 格子点の 位置（盤の 端の 格子点は 少し 内がわへ よせて 枠から はみ出さない ように） */
  function vertPos(v) {
    var x = Math.min(SIZE - 0.3, Math.max(0.3, v % V)), y = Math.min(SIZE - 0.3, Math.max(0.3, (v / V) | 0));
    return 'left:' + (x / SIZE * 100) + '%;top:' + (y / SIZE * 100) + '%';
  }

  function renderBoard() {
    var P = game.players[game.current], mark = {};
    if (game.phase === 'playing' && !isAi() && ui.mode === 'tile' && ui.sel !== null && P.hand[ui.sel]) {
      var m = rot(P.hand[ui.sel].m, ui.rot);
      for (var c = 0; c < N; c++) if (canPlace(game, c, m)) mark[c] = 'is-place';
    } else if (game.phase === 'playing' && !isAi() && ui.mode === 'tako') {
      for (var c2 = 0; c2 < N; c2++) if (canTako(game, c2)) mark[c2] = 'is-tako-target';
    }
    var zone = {};
    game.takos.forEach(function (tc) { takoZone(tc).forEach(function (x) { zone[x] = true; }); });
    function quadColor(vx, vy) {
      var o = game.vo[vy * V + vx];
      if (o >= 0) return CATS[game.players[o].cat].color;
      return o === TIE ? '#8a8a8a' : null;
    }
    var cells = '';
    for (var i = 0; i < N; i++) {
      var t = game.cells[i], x = i % SIZE, y = (i / SIZE) | 0;
      var cls = 'nn-cell' + (mark[i] ? ' ' + mark[i] : '') + (i === game.last ? ' is-last' : '') + (t ? '' : ' is-empty') + (zone[i] ? ' is-tako-zone' : '');
      var inner = t ? tileSVG(t, { quads: { NW: quadColor(x, y), NE: quadColor(x + 1, y), SW: quadColor(x, y + 1), SE: quadColor(x + 1, y + 1) } }) : '';
      if (game.takos.indexOf(i) >= 0) inner += '<img class="nn-tako" src="images/tako.png" alt="タコ">';
      cells += mark[i] ? '<button type="button" class="' + cls + '" data-action="cell" data-c="' + i + '">' + inner + '</button>'
        : '<div class="' + cls + '">' + inner + '</div>';
    }
    /* なわばりの 目じるしの ねこ（格子点の 上） */
    var extra = game.markers.map(function (mk) {
      var pl = game.players[mk.p];
      return '<span class="nn-marker" style="' + vertPos(mk.v) + ';--pc:' + CATS[pl.cat].color + '">' + catFace(pl.cat, 'nn-marker__face', [true, 1, 1]) + '</span>';
    }).join('');
    /* 出口（四辺の まん中） */
    var mid = (SIZE - 1) / 2 + 0.5;
    [['top', mid, 0], ['bottom', mid, SIZE], ['left', 0, mid], ['right', SIZE, mid]].forEach(function (e) {
      extra += '<span class="nn-exit is-' + e[0] + '" style="left:' + (e[1] / SIZE * 100) + '%;top:' + (e[2] / SIZE * 100) + '%" title="出口">🚪</span>';
    });
    return '<div class="nn-board-box"><div class="nn-board" style="grid-template-columns:repeat(' + SIZE + ',1fr);grid-template-rows:repeat(' + SIZE + ',1fr)">' +
      cells + extra + '</div></div>';
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
        '<span class="nn-final__name">' + esc(pname(i)) + (win ? ' 👑' : '') + '<small>' + (game.mode === 'go' ? 'なわばり ' + (p.score - p.captured) + '・とった ねこ ' + p.captured : 'なわばり ' + p.score + '・手もとの ねこ ' + p.catsLeft) + '</small></span>' +
        '<span class="nn-final__pts">' + game.final[i] + '点</span></div>';
    }).join('');
    return '<div class="nn-overlay"><div class="nn-modal"><h2 class="nn-modal__title">おしまい！</h2>' +
      (game.endReason === 'noterr' ? '<p class="nn-modal__note">もう あたらしい なわばりが できないので おしまい</p>' : '') +
      '<div class="nn-final">' + rows + '</div>' +
      '<p class="nn-modal__note">' + (game.mode === 'go' ? 'なわばりの ¼マス＝1点 ＋ とった ねこ 1匹＝1点' : 'なわばりの ¼マス＝1点 ＋ 手もとに のこった ねこ 1匹＝1点') + '</p>' +
      '<button type="button" class="nn-btn nn-btn--go" data-action="again">もういちど</button>' +
      '<button type="button" class="nn-btn nn-btn--sub" data-action="view">盤面を みる</button></div></div>';
  }

  function renderRules() {
    return '<div class="nn-overlay" data-action="close-rules"><div class="nn-modal nn-rules" data-action="noop">' +
      '<div class="nn-modal__head"><h2 class="nn-modal__title">あそびかた</h2><button type="button" class="nn-modal__close" data-action="close-rules" aria-label="とじる">✕</button></div>' +
      '<h3>2つの モード</h3><ul>' +
      '<li><b>囲碁モード（猫は 無限）</b>：猫道の ある タイルを おくと、かならず 自分の ねこが のり、猫道が 自分の 色に なる（タイルが 囲碁の 石）。なわばりが 完成したら、境界に いる <b>相手の ねこを とる</b>（盤から のぞく。1匹 1点）。とられた 猫道は だれの 色でも なくなる。</li>' +
      '<li><b>猫街モード（猫に 限り）</b>：ねこを おくかは えらぶ。下の「じゅんび」の かずだけ。完成したら 境界の ねこは 手もとへ もどり、さいごに 手もとの ねこ 1匹＝1点。</li>' +
      '</ul><h3>じゅんび</h3><ul>' +
      '<li>3〜4人：盤 9×9。手札は 3まいまで（はじめは 2まい）。猫街モードの ねこは 3人 6匹・4人 5匹。</li>' +
      '<li>2人：盤 7×7。場に 4まい ならんだ 共通の タイルから えらぶ。猫街モードの ねこは 7匹。</li>' +
      '<li>まん中に 十字の タイルを おいて はじめる。</li>' +
      '</ul><h3>タイルを おく</h3><ul>' +
      '<li>タイルには 猫道が 0〜4本（中心から 辺の まん中へ）。</li>' +
      '<li>すでに ある タイルの となりに おく。<b>となりの タイルとの 辺は ぴったり あわせる</b>（道が 辺まで 出て いたら かならず 道どうしで つなぐ）。盤の 端へ 出る 猫道は よい。</li>' +
      '<li>おいた タイルの 猫道の 上に、じぶんの ねこを 1匹 おく（囲碁モードは 自動・猫街モードは えらぶ）。</li>' +
      '<li>おける ときは かならず おく。どの タイルも おけない ときは、おける ものが 出るまで 1まいずつ すてて 引きなおす（自動）。山札が なければ パス。</li>' +
      '</ul><h3>🐙 タコ（1人 1回）</h3><ul>' +
      '<li>タイルを おく かわりに、盤の タイルに タコを おける。その マスと 上下左右の ねこは 手もとへ もどる（囲碁モードは 盤から いなくなる）。</li>' +
      '<li>その 5マスには、あとから おかれた タイルにも ねこを おけない。</li>' +
      '</ul><h3>なわばり</h3><ul>' +
      '<li>猫道と 盤の 端は 境界線。<b>かこまれた 面</b>が なわばりの 候補。ただし 四辺の まん中の <b>出口🚪に ふれた 面は 0点</b>。</li>' +
      '<li>面の 中に 空きマスが なくなったら 完成して、<b>すぐ 採点</b>。その 面に 面した 猫道の 上の ねこが いちばん 多い 人が、面積 ¼マス＝1点を もらう（1匹の ねこは、ふれて いる 面ごとに 1票）。</li>' +
      '<li>同数なら 点を 人数で わって 切りすて。</li>' +
      '<li>囲碁モード：持ち主は 境界の 相手の ねこを とる（1匹 1点）。自分の ねこは のこる。</li>' +
      '<li>猫街モード：<b>境界の ねこは 全員 手もとへ もどる</b>。なわばりを とった 人は、その 中に 目じるしの ねこを 1匹 おく（もどらない）。</li>' +
      '</ul><h3>おわり</h3><ul>' +
      '<li>盤が うまるか、<b>もう あたらしい なわばりが できなく なったら</b>（のこりの 空きマスを どう うめても 出口に つながる 面しか できない）、または 山札と タイルが なくなるか、全員 つづけて パスしたら おしまい。</li>' +
      '<li>完成して いない 面は 0点。猫街モードは <b>手もとに のこった ねこ 1匹＝1点</b>。</li>' +
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
    game = newGame(seats, setup.game);
    startTurn(game);
    resetUi();
    render();
  }

  function afterAction(acted) {
    settle(game).forEach(function (e) {
      if (e.tops.length === 1) say('🏠 ' + pname(e.tops[0]) + 'の なわばり 完成！ +' + e.pts + '点' +
        (game.mode === 'go' ? (e.cap ? '、ねこを ' + e.cap + '匹 とった（+' + e.cap + '点）' : '') : '（境界の ねこは 手もとへ）'), 'score');
      else if (e.tops.length > 1) say('なわばりが 同数で 完成（' + e.tops.map(pname).join('・') + 'に ' + e.pts + '点ずつ）', '');
      else say('面が とじた（ねこが いないので だれの ものでも ない）', '');
    });
    endTurn(game, acted);
    if (game.phase === 'playing' && game.swapped) say(pname(game.current) + '：おける タイルが なかったので ' + game.swapped + 'まい 引きなおした', '');
    resetUi();
    render();
  }

  function doTako(c) {
    var n = putTako(game, c);
    say('🐙 ' + pname(game.current) + 'が タコを おいた！ ねこ ' + n + '匹が ' + (game.mode === 'go' ? 'にげた' : '手もとへ にげかえった'), 'tako');
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
      if (act.type === 'tako') { doTako(act.c); return; }
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
    if (a === 'gmode') { setup.game = el.dataset.g; render(); return; }
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
    else if (a === 'tako' && P.takoLeft > 0) { ui.mode = 'tako'; render(); }
    else if (a === 'tako-cancel') { ui.mode = 'tile'; render(); }
    else if (a === 'cell' && ui.mode === 'tako') { var tc = Number(el.dataset.c); if (canTako(game, tc)) doTako(tc); }
    else if (a === 'cell' && ui.mode === 'tile' && ui.sel !== null) {
      var c = Number(el.dataset.c), m = rot(P.hand[ui.sel].m, ui.rot);
      if (!canPlace(game, c, m)) return;
      placeTile(game, ui.sel, ui.rot, c);
      ui.sel = null;
      if (canCat(game, c)) { ui.mode = 'follow'; render(); } else afterAction(true);
    } else if (a === 'cat' && canCat(game, game.last)) { putCat(game, game.last); afterAction(true); }
    else if (a === 'done') afterAction(true);
    else if (a === 'pass' && !anyPlace(game, P)) { say(pname(game.current) + '：パス', ''); afterAction(false); }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && rulesOpen) { rulesOpen = false; render(); }
    if ((e.key === 'r' || e.key === 'R') && game && game.phase === 'playing' && !isAi() && ui.mode === 'tile' && ui.sel !== null) { ui.rot = (ui.rot + 1) % 4; render(); }
  });

  /* テスト用 */
  window.NNS = {
    newGame: newGame, computeFaces: computeFaces, canPlace: canPlace, placeTile: placeTile, putCat: putCat, settle: settle,
    totals: totals, rot: rot, canStillScore: canStillScore, putTako: putTako, getGame: function () { return game; }
  };

  render();
})();
