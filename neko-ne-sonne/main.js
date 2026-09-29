/* =========================================================
   ネコネソンヌ ― 猫道で えがく 囲碁
   ・盤は 9×9（2人は 7×7）。タイルには 猫道（中心から 辺の まん中へ）が 0〜4本。魚屋の マスも ある
   ・となりの タイルとの 辺は ぴったり あわせる
   ・猫道（か 魚屋）の ある タイルを おくと、かならず おいた 人の ねこが のる（ねこは 無限）
   ・猫道と 盤の 端が 境界線。上下の 辺の まん中の「トンネル」を ふくむ 面は 0点
   ・面が 完成（中に 空きマスが ない）したら すぐ 採点：面に 面した ねこ（と タコ）の
     多数派が、面が かかった タイル 1まいにつき 1点（¼だけ かかって いても 1点）。境界の 相手の ねこは とって 1匹 1点
   ・魚屋は まわりが うまったら 持ち主に まわり 3×3 の 盤内マス数
   ・タコ（1人 1回）：自分の ねこと 交換。上下左右の 猫道に いる 相手の ねこを 逃がす。ねこ 2匹ぶんの 票

   面の 計算：タイルの 角（格子点）を 1点と みなす。1つの 格子点の まわりの
   ¼マス 4つは かならず つながり、となりの 格子点とは「その あいだを 猫道が
   横切って いない」ときだけ つながる。完成した 面は それ以上 かわらない。
   ========================================================= */
(function () {
  'use strict';

  var VERSION = '2026-09-29o';   /* 画面に 出す 版（古い キャッシュで あそんで いないか 見わける ため） */
  var SIZE = 9, N = 81, V = 10;   /* 盤の 大きさ（newGame で 人数に あわせて きめる） */
  function setSize(size) { SIZE = size; N = size * size; V = size + 1; }

  var DN = 1, DE = 2, DS = 4, DW = 8, DIRS = [DN, DE, DS, DW];

  var CATS = [
    { id: 'kuro', name: 'くろ', color: '#3b4a8a' },
    { id: 'hachiware', name: 'はちわれ', color: '#2f7d4a' },
    { id: 'kijitora', name: 'きじとら', color: '#c65a00' },
    { id: 'chashiro', name: 'ちゃしろ', color: '#d0526b' }
  ];
  /* 人数ごとの 設定：盤の 大きさ・手札（2人は 場に 4まい ならべた 共通の タイルから えらぶ）。ねこは 無限 */
  var RULES_BY_N = {
    2: { size: 7, hand: 4, shared: true },
    3: { size: 9, hand: 3, shared: false },
    4: { size: 9, hand: 3, shared: false }
  };
  /* デッキ 88まい（まん中の 十字を のぞく）。分岐は 少なめ、かこみやすい 角を 多めに */
  var DECK_DEF = [
    { m: 15, n: 8 },    /* 十字 */
    { m: 7, n: 16 },    /* T字 */
    { m: 5, n: 20 },    /* 直線 */
    { m: 3, n: 24 },    /* 角 */
    { m: 1, n: 12 },    /* 行き止まり */
    { m: 0, n: 8 },     /* 道なし */
    { m: 0, n: 4, shop: true },   /* 魚屋（道なしの 平地） */
    { m: 1, n: 2, shop: true }    /* 魚屋（行き止まりの 道つき） */
  ];
  var TAKO_PER_PLAYER = 1;   /* タコ：1人 1回（タイルを おく かわりに） */
  var TAKO_VOTES = 2;        /* タコは ねこ 2匹ぶんの 票 */
  var SHOP_POINTS = 5;       /* 魚屋：完成で 5点（まわり 3×3 の 多数派） */
  var NAP_POINTS = 3;        /* ひるね猫：さいごまで なわばりの 外に いれば 1匹 3点（なわばりに のまれたら 持ち主に とられる） */
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
    DECK_DEF.forEach(function (def) { for (var i = 0; i < def.n; i++) d.push({ uid: uid++, m: def.m, shop: !!def.shop }); });
    return shuffle(d);
  }
  /** トンネル：上と 下の 辺の まん中の マスの 外がわ（その 両はしの 格子点）。ここを ふくむ 面は 0点。
      外がわ ぜんたいの 面は 上下の 辺に かならず ふれるので、2つで 総取りを ふせげる */
  function exitVerts() {
    var mid = (SIZE - 1) / 2, last = V - 1, set = {};
    [[mid, 0], [mid + 1, 0], [mid, last], [mid + 1, last]]
      .forEach(function (p) { set[p[1] * V + p[0]] = true; });
    return set;
  }

  /* =========================================================
     状態と ルール（描画と わけて ある。CPU も 同じ 関数を つかう）
     ========================================================= */
  /** ねこは 無限。猫道（か 魚屋）の ある タイルを おくと かならず 自分の ねこが のる */
  function newGame(seats) {
    var n = seats.length, R = RULES_BY_N[n];
    setSize(R.size);
    var shared = R.shared ? [] : null;
    var s = {
      n: n, size: R.size, handMax: R.hand, shared: R.shared,
      players: seats.map(function (st, i) {
        return { index: i, cat: st.cat, human: st.human, score: 0, captured: 0, nap: 0, shopPts: 0, takoLeft: TAKO_PER_PLAYER, hand: shared || [] };
      }),
      cells: new Array(N).fill(null),
      vo: new Int8Array(V * V).fill(UNSCORED),   /* 格子点ごとの 持ち主（採点ずみの 面） */
      takos: [],                                 /* タコ {c: マス, p: おいた 人}。ねこと おなじく 1票 */
      shopDone: {},                              /* 採点ずみの 魚屋 {マス: 持ち主 | NOBODY} */
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
      n: s.n, size: s.size, handMax: s.handMax, shared: s.shared,
      players: s.players.map(function (p) {
        return { index: p.index, cat: p.cat, human: p.human, score: p.score, captured: p.captured, nap: p.nap, shopPts: p.shopPts, takoLeft: p.takoLeft, hand: sharedHand || p.hand.slice() };
      }),
      cells: s.cells.map(function (c) { return c ? { m: c.m, uid: c.uid, cat: c.cat, shop: c.shop } : null; }),
      vo: new Int8Array(s.vo), takos: s.takos.slice(), exits: s.exits, shopDone: Object.assign({}, s.shopDone),
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

  /** 面を まるごと 計算（格子点の 塗りつぶし）。盤の 端は 境界、トンネルを ふくむ 面は 点なし */
  function computeFaces(s) {
    var of = new Int16Array(V * V).fill(-1), faces = [];
    for (var v0 = 0; v0 < V * V; v0++) {
      if (of[v0] >= 0) continue;
      var f = { id: faces.length, verts: [], area: 0, tiles: {}, pts: 0, closed: true, exit: false, border: {}, w: [0, 0, 0, 0], tops: [], owner: null };
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
          f.tiles[y * SIZE + x] = true;                             /* 面が かかった タイル */
          if (t.m & QUAD_ARMS[a[2]]) f.border[y * SIZE + x] = true; /* この 面に 面した 猫道 */
        });
        var nbrs = [];
        if (vx < V - 1 && connH(s, vx, vy)) nbrs.push(v + 1);
        if (vx > 0 && connH(s, vx - 1, vy)) nbrs.push(v - 1);
        if (vy < V - 1 && connV(s, vx, vy)) nbrs.push(v + V);
        if (vy > 0 && connV(s, vx, vy - 1)) nbrs.push(v - V);
        nbrs.forEach(function (u) { if (of[u] < 0) { of[u] = f.id; stack.push(u); } });
      }
      /* 同じ ねこは、同じ 面では 何か所で ふれても 1票。タコも おいた 人の 1票 */
      Object.keys(f.border).forEach(function (c) {
        var t = s.cells[c];
        if (t && t.cat !== null) f.w[t.cat]++;
      });
      (s.takos || []).forEach(function (tk) { if (f.border[tk.c]) f.w[tk.p] += TAKO_VOTES; });
      var max = Math.max.apply(null, f.w);
      for (var p = 0; p < s.n; p++) if (max > 0 && f.w[p] === max) f.tops.push(p);
      f.owner = f.tops.length === 1 ? f.tops[0] : null;
      f.pts = Object.keys(f.tiles).length;                          /* 点：面が かかった タイルの まい数 */
      faces.push(f);
    }
    return { of: of, faces: faces };
  }
  function faces(s) { if (!s._f) s._f = computeFaces(s); return s._f; }
  function scorable(f) { return f.closed && !f.exit && f.area > 0; }
  function isScored(s, f) { return s.vo[f.verts[0]] !== UNSCORED; }

  /** あたらしく 完成した 面を 採点する。できごとの 一覧を かえす */
  function settle(s) {
    var events = [];
    faces(s).faces.forEach(function (f) {
      if (!scorable(f) || isScored(s, f)) return;
      var k = f.tops.length;
      var mark = k === 0 ? NOBODY : k > 1 ? TIE : f.tops[0];
      f.verts.forEach(function (v) { s.vo[v] = mark; });
      var pts = k ? Math.floor(f.pts / k) : 0;               /* 同率首位は 人数で わって 切りすて */
      f.tops.forEach(function (p) { s.players[p].score += pts; });
      /* 持ち主が きまったら、境界の 相手の ねこと、中で ねて いる 相手の ひるね猫を とる（盤から のぞき 1匹 1点）。自分の ねこは のこる */
      var cap = 0;
      if (k === 1) {
        Object.keys(f.border).forEach(function (c) {
          var t = s.cells[c];
          if (t && t.cat !== null && t.cat !== f.tops[0]) { t.cat = null; cap++; }
        });
        Object.keys(f.tiles).forEach(function (c) {
          var t = s.cells[c];
          if (isNapper(t) && t.cat !== f.tops[0]) { t.cat = null; cap++; }
        });
        s.players[f.tops[0]].score += cap;
        s.players[f.tops[0]].captured += cap;
      }
      events.push({ tops: f.tops.slice(), area: f.area, pts: pts, cap: cap });
    });
    /* 魚屋（教会の ような マス）：まわりの 盤内の マスが ぜんぶ うまったら、まわり 3×3 で ねこ（タコは 2）が いちばん 多い 人に
       まわり 3×3 の うち 盤内の マスの かず（まん中 9・辺 6・角 4）。魚屋の ねこは そのまま のこる */
    s.cells.forEach(function (t, c) {
      if (!t || !t.shop || s.shopDone[c] !== undefined) return;
      var st = shopState(s, c);
      if (st.empty) return;
      var k = st.tops.length, pts = k ? Math.floor(SHOP_POINTS / k) : 0;   /* 同数は 人数で わって 切りすて */
      s.shopDone[c] = k === 0 ? NOBODY : k > 1 ? TIE : st.tops[0];
      st.tops.forEach(function (p) { s.players[p].score += pts; s.players[p].shopPts += pts; });
      events.push({ shop: true, tops: st.tops, pts: pts });
    });
    if (events.length) s._f = null;
    return events;
  }

  /** 魚屋の ようす：まわり 3×3（盤内）の マス数・空きマス数・持ち主 */
  function shopState(s, c) {
    var x = c % SIZE, y = (c / SIZE) | 0, total = 0, empty = 0;
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      var t = tileAt(s, x + dx, y + dy);
      if (t === undefined) continue;
      total++;
      if (t === null) empty++;
    }
    /* 持ち主：まわり 3×3（魚屋も ふくむ）の ねこ（1票）と タコ（2票）が いちばん 多い 人 */
    var w = [0, 0, 0, 0];
    for (var ey = -1; ey <= 1; ey++) for (var ex = -1; ex <= 1; ex++) {
      var xx = x + ex, yy = y + ey;
      if (xx < 0 || yy < 0 || xx >= SIZE || yy >= SIZE) continue;
      var k = yy * SIZE + xx, u = s.cells[k];
      if (u && u.cat !== null) w[u.cat]++;
      var tk = takoAt(s, k);
      if (tk) w[tk.p] += TAKO_VOTES;
    }
    var max = Math.max.apply(null, w), tops = [];
    for (var p = 0; p < s.n; p++) if (max > 0 && w[p] === max) tops.push(p);
    /* 同数なら、魚屋に のって いる ねこ（か タコ）の 持ち主が 勝つ */
    if (tops.length > 1) {
      var keeper = s.cells[c].cat;
      if (keeper === null) { var kt = takoAt(s, c); keeper = kt ? kt.p : null; }
      if (keeper !== null && tops.indexOf(keeper) >= 0) tops = [keeper];
    }
    return { total: total, empty: empty, w: w, tops: tops, owner: tops.length === 1 ? tops[0] : null };
  }

  /** 合計点：なわばり・魚屋・とった ねこ */
  function totals(s) { return s.players.map(function (p) { return p.score; }); }

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

  /* ---- タコ：その マスと 上下左右の ねこを 持ち主の 手もとへ かえし（だれの 点にも ならない）、
     その 5マスには 以後 ねこを おけない。タコ 自身は おいた 人の ねこ 1匹と して なわばりを 数える ---- */
  function takoZone(c) { return [c].concat(DIRS.map(function (d) { return nb(c, d); }).filter(function (x) { return x >= 0; })); }
  function noCatZone(s, c) { return s.takos.some(function (t) { return takoZone(t.c).indexOf(c) >= 0; }); }
  function takoAt(s, c) { for (var i = 0; i < s.takos.length; i++) if (s.takos[i].c === c) return s.takos[i]; return null; }
  /** タコは 自分の ねこが のって いる タイルに だけ おける（その ねこと 交換） */
  function canTako(s, c) { var t = s.cells[c]; return !!t && t.cat === s.current && !takoAt(s, c) && s.players[s.current].takoLeft > 0; }
  /** タコで 逃げる ねこ：上下左右の 猫道の 上に いる 相手の ねこ だけ。
      自分の ねこ・魚屋の ねこ・完成した なわばりの ねこは 逃げない */
  function takoScares(s, x) {
    var t = s.cells[x];
    return !!t && t.cat !== null && t.cat !== s.current && !t.shop && t.m !== 0 && !settledCat(s, x);
  }

  /** 完成した 場所の ねこ（タコでも 追い出せない）：完成した なわばりの 境界の 猫道に いる ねこと、完成した 魚屋の ねこ */
  function settledCat(s, c) {
    var t = s.cells[c];
    if (!t || t.cat === null) return false;
    if (t.shop && s.shopDone[c] !== undefined) return true;
    var x = c % SIZE, y = (c / SIZE) | 0;
    var corners = { NW: [x, y], NE: [x + 1, y], SW: [x, y + 1], SE: [x + 1, y + 1] };
    return Object.keys(corners).some(function (q) {
      var v = corners[q][1] * V + corners[q][0];
      return (t.m & QUAD_ARMS[q]) && s.vo[v] !== UNSCORED;
    });
  }

  function putTako(s, c) {
    s.takos.push({ c: c, p: s.current });
    s.players[s.current].takoLeft--;
    s.cells[c].cat = null;                       /* 自分の ねこと 交換（この ねこは 手もとへ） */
    var removed = 0;
    takoZone(c).forEach(function (x) {
      if (x === c) return;
      var t = s.cells[x];
      if (!takoScares(s, x)) return;
      /* 持ち主の 手もとへ もどる（ねこは 無限なので 数は かわらない。だれの 点にも ならない） */
      t.cat = null;
      removed++;
    });
    s._f = null;
    return removed;
  }

  /** まだ あたらしい なわばりが できる 見こみが ある？
      空きマスを ぜんぶ 十字（いちばん こまかく 区切る 形）で うめた と 考え、
      空きマスの 角を ふくむ 面が どれも トンネルを ふくむなら、もう なわばりは ふえない */
  function canStillScore(s) {
    var near = {}, any = false;
    s.cells.forEach(function (c, i) {
      if (c) return;
      any = true;
      var x = i % SIZE, y = (i / SIZE) | 0;
      [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]].forEach(function (p) { near[p[1] * V + p[0]] = true; });
    });
    if (!any) return false;
    /* 未完成の 魚屋が あれば まだ つづく（まわりに ねこを おけば 点に なる） */
    for (var c = 0; c < s.cells.length; c++) {
      var t = s.cells[c];
      if (t && t.shop && s.shopDone[c] === undefined && shopState(s, c).empty) return true;
    }
    var sim = { n: s.n, exits: s.exits, cells: s.cells.map(function (c) { return c || { m: 15, uid: 0, cat: null }; }) };
    return computeFaces(sim).faces.some(function (f) {
      return !f.exit && f.area > 0 && f.verts.some(function (v) { return near[v]; });
    });
  }
  function placeTile(s, hi, r, c) {
    var t = s.players[s.current].hand.splice(hi, 1)[0];
    /* 猫道（か 魚屋）の ある タイルは おいた 人の 色（ねこが のる） */
    /* 平地（道なし）にも ねこが のる：ひるね猫。なわばりの 票には ならない。相手の なわばりに のまれたら とられ、さいごまで 外なら 1匹 3点 */
    s.cells[c] = { m: rot(t.m, r), uid: t.uid, shop: !!t.shop, cat: !noCatZone(s, c) ? s.current : null };
    s.last = c;
    s._f = null;
  }
  /** ねこは いま おいた タイルの 猫道の 上だけ */

  

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
  function isNapper(t) { return !!t && t.m === 0 && !t.shop && t.cat !== null; }

  /** さいごに：なわばりに ならなかった 面（トンネルに つながった 面・未完成の 面）に いる ひるね猫は 1匹 NAP_POINTS 点。
      なわばりの 中の ひるね猫は 0点（相手の なわばりなら 完成した ときに とられて いる） */
  function napFree(s, c) {
    var F = faces(s), x = c % SIZE, y = (c / SIZE) | 0;
    var f = F.faces[F.of[y * V + x]];        /* 平地の タイルは 1つの 面の 中に ある（どの 角でも おなじ 面） */
    return !isScored(s, f);
  }
  function scoreStrays(s) {
    var count = [0, 0, 0, 0];
    s.cells.forEach(function (t, c) { if (isNapper(t) && napFree(s, c)) count[t.cat]++; });
    var events = [];
    count.forEach(function (n, p) {
      if (!n || p >= s.n) return;
      s.players[p].score += n * NAP_POINTS;
      s.players[p].nap += n * NAP_POINTS;
      events.push({ p: p, naps: n, pts: n * NAP_POINTS });
    });
    return events;
  }

  function finish(s) {
    s.strayEvents = scoreStrays(s);
    s.phase = 'over';
    s.final = totals(s);
  }

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
      v += share * Math.min(f.pts, 12) * 1.2;
    });
    /* ひるね猫：なわばりの 外に いれば さいごに 点（トンネル側なら ほぼ 確実） */
    s.cells.forEach(function (t, c) {
      if (!isNapper(t) || !napFree(s, c)) return;
      var F = faces(s), f = F.faces[F.of[((c / SIZE) | 0) * V + c % SIZE]];
      v += (t.cat === p ? 1 : -1 / Math.max(1, s.n - 1)) * NAP_POINTS * (f.exit ? 0.8 : 0.5);
    });
    /* 未完成の 魚屋：うまった ぶんを 見込む */
    s.cells.forEach(function (t, c) {
      if (!t || !t.shop || s.shopDone[c] !== undefined) return;
      var st = shopState(s, c);
      if (!st.tops.length) return;
      var share = st.tops.indexOf(p) >= 0 ? 1 / st.tops.length : -1 / Math.max(1, s.n - 1);
      v += share * SHOP_POINTS * 0.5;
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
          consider(s1, { type: 'place', hi: hi, r: r, c: c });
        }
      }
    });
    /* タコ：相手の ねこが 2匹 以上 のぞける ところだけ ためす（つかうと 1回 へるので 少し ひかえめに） */
    if (P.takoLeft > 0) {
      for (var c = 0; c < N; c++) {
        if (!canTako(s, c)) continue;
        var foes = takoZone(c).filter(function (x) { return x !== c && takoScares(s, x); }).length;
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
    /* 猫道を 持ち主の 色で ぬる（色つきの 線で 見る 囲碁） */
    var owned = !!game && t.cat !== null && t.cat !== undefined;
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
    /* 魚屋：青い しまの 日よけの 小さな 店と さかな。ねこは 店先に */
    if (t.shop) {
      s.push('<g transform="translate(22,16)">' +
        '<rect x="0" y="10" width="56" height="40" rx="3" fill="#fff8ec" stroke="#3a2a20" stroke-width="2.5"/>' +
        '<path d="M-3 12 L59 12 L55 0 L1 0 Z" fill="#fff" stroke="#3a2a20" stroke-width="2.5"/>' +
        '<path d="M8 0 L6 12 M20 0 L19 12 M36 0 L37 12 M48 0 L50 12" stroke="#4a7fb8" stroke-width="6"/>' +
        '<ellipse cx="19" cy="28" rx="10" ry="5" fill="#5a7fa8"/><path d="M28 28 L35 23 L35 33 Z" fill="#5a7fa8"/>' +
        '<ellipse cx="38" cy="40" rx="8" ry="4" fill="#d9705a"/><path d="M45 40 L50 36 L50 44 Z" fill="#d9705a"/>' +
        '</g>');
      if (o.shopDone !== undefined && o.shopDone !== null) {
        var dc = o.shopDone >= 0 ? CATS[game.players[o.shopDone].cat].color : '#8a8a8a';   /* 同数・だれも いない は 灰色 */
        s.push('<circle cx="84" cy="16" r="11" fill="' + dc + '" stroke="#fff" stroke-width="2"/><path d="M78 16 L83 21 L91 11" stroke="#fff" stroke-width="3.5" fill="none"/>');
      }
    }
    if (t.cat !== null && t.cat !== undefined) {
      var pl = game.players[t.cat], col = CATS[pl.cat].color;
      if (t.shop) {
        s.push('<ellipse cx="50" cy="86" rx="18" ry="6" fill="' + col + '" stroke="#fff" stroke-width="2" />');
        s.push(sprite(pl.cat, false, 0, 0, 50, 68, 42));                 /* 魚屋の 店先に すわる */
      } else if (t.m === 0) {
        /* ひるね猫：平地で まるくなって ねむる */
        s.push('<ellipse cx="50" cy="66" rx="24" ry="8" fill="' + col + '" opacity=".55" />');
        s.push(sprite(pl.cat, true, 1, 1, 50, 50, 58));
      } else {
        s.push(sprite(pl.cat, false, 0, 0, 50, 48, 50));
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
  var setup = { seats: [{ cat: 0, mode: 'human' }, { cat: 1, mode: 'cpu' }, { cat: 2, mode: 'off' }, { cat: 3, mode: 'off' }] };
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
      '<li>🔁 <b>かこむ</b>：猫道と 盤の 端で かこんだ 面が なわばり（トンネルを ふくむと ×）</li>' +
      '<li>🐈 <b>見はる</b>：まわりの 猫道に ねこが 多い 人の もの</li>' +
      '</ul></div>' +
      '<section class="nn-card"><h2 class="nn-card__title">だれが あそぶ？（2〜4人）</h2>' + rows +
      '<p class="nn-card__note">おいた 猫道は かならず 自分の 色。かこんだら 境界の 相手の ねこを とる' +
      '<br>' + active + '人：盤 ' + R.size + '×' + R.size + (R.shared ? '・場の タイル 4まいから えらぶ' : '・手札 3まいまで') + '</p>' +
      '<button type="button" class="nn-btn nn-btn--go" data-action="start"' + (active < 2 ? ' disabled' : '') + '>あそぶ</button></section>' +
      '<p class="nn-version">版 ' + VERSION + '</p></div>';
  }

  function renderScore() {
    var tot = game.phase === 'playing' ? totals(game) : game.final;
    return '<div class="nn-score" style="--np:' + game.n + '">' + game.players.map(function (p, i) {
      var cur = i === game.current && game.phase === 'playing';
      return '<div class="nn-pl' + (cur ? ' is-current' : '') + '" style="--pc:' + CATS[p.cat].color + '">' +
        catFace(p.cat, 'nn-pl__face', cur ? [false, 1, 0] : null) +
        '<span class="nn-pl__body"><span class="nn-pl__name">' + CATS[p.cat].name + (p.human ? '' : '<small>CPU</small>') + '</span>' +
        '<span class="nn-pl__pts">' + tot[i] + '<small>点</small></span>' +
        '<span class="nn-pl__left">🏠' + (p.score - p.captured - p.nap) + ' 🐾' + p.captured + (p.nap ? ' 💤' + p.nap : '') + (p.takoLeft ? ' 🐙' : '') + '</span></span></div>';
    }).join('') + '</div>';
  }

  function renderStatus() {
    var P = game.players[game.current], t;
    if (isAi()) t = pname(game.current) + 'の ばん … かんがえちゅう';
    else if (ui.mode === 'tako') t = '🐙 タコと 交換する 自分の ねこを えらんでね';
    else t = pname(game.current) + 'の ばん：' + (game.shared ? '場の タイル' : '手札') + 'を えらんで おく';
    return '<p class="nn-status" style="--pc:' + CATS[P.cat].color + '">' + esc(t) + '</p>';
  }

  function renderPanel() {
    var P = game.players[game.current];
    var deckInfo = '<span class="nn-deck">山札 ' + game.deck.length + '</span>';
    var label = game.shared ? '<span class="nn-deck">場（共通）</span>' : '';
    if (isAi()) {
      return '<div class="nn-panel nn-hand">' + label + P.hand.map(function (t) { return '<span class="nn-hand__tile is-back">' + tileSVG({ m: t.m, uid: t.uid, shop: t.shop, cat: null }) + '</span>'; }).join('') + deckInfo + '</div>';
    }
    if (ui.mode === 'tako') {
      return '<div class="nn-panel nn-panel--act">' +
        '<p class="nn-panel__hint">むらさきの マス（自分の ねこ）を タコと 交換。上下左右の 猫道に いる 相手の ねこは 手もとへ 逃げる（魚屋・完成した なわばりの ねこは のこる）。タコは ねこ 2匹ぶんの 票</p>' +
        '<button type="button" class="nn-btn nn-btn--sub" data-action="tako-cancel">やめる</button></div>';
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
          tileSVG({ m: sel ? rot(t.m, ui.rot) : t.m, uid: t.uid, shop: t.shop, cat: null }) + '</button>';
      }).join('') + deckInfo +
      '<p class="nn-panel__hint">' + esc(hint) + '</p>' +
      '<div class="nn-panel__row">' +
      (ui.sel !== null && can ? '<button type="button" class="nn-btn nn-btn--small" data-action="rotate">↻ まわす</button>' : '') +
      (P.takoLeft > 0 ? '<button type="button" class="nn-btn nn-btn--small nn-btn--tako" data-action="tako">🐙 タコ</button>' : '') +
      (!can ? '<button type="button" class="nn-btn nn-btn--small nn-btn--sub" data-action="pass">パス</button>' : '') +
      '</div></div>';
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
    game.takos.forEach(function (tk) { takoZone(tk.c).forEach(function (x) { zone[x] = true; }); });
    function quadColor(vx, vy) {
      var o = game.vo[vy * V + vx];
      if (o >= 0) return CATS[game.players[o].cat].color;
      return o === TIE ? '#8a8a8a' : null;
    }
    var cells = '';
    for (var i = 0; i < N; i++) {
      var t = game.cells[i], x = i % SIZE, y = (i / SIZE) | 0;
      var cls = 'nn-cell' + (mark[i] ? ' ' + mark[i] : '') + (i === game.last ? ' is-last' : '') + (t ? '' : ' is-empty') + (zone[i] ? ' is-tako-zone' : '');
      var inner = t ? tileSVG(t, { quads: { NW: quadColor(x, y), NE: quadColor(x + 1, y), SW: quadColor(x, y + 1), SE: quadColor(x + 1, y + 1) },
        shopDone: game.shopDone[i] === undefined ? null : game.shopDone[i] }) : '';
      var tk = takoAt(game, i);
      if (tk) inner += '<span class="nn-tako" style="--pc:' + CATS[game.players[tk.p].cat].color + '"><img src="images/tako.png" alt="タコ（' + CATS[game.players[tk.p].cat].name + '）"></span>';
      cells += mark[i] ? '<button type="button" class="' + cls + '" data-action="cell" data-c="' + i + '">' + inner + '</button>'
        : '<div class="' + cls + '">' + inner + '</div>';
    }
    var extra = '';
    /* トンネル（上下の 辺の まん中。盤の 縁に あいた 穴。ここを ふくむ 面は 0点） */
    var mid = (SIZE - 1) / 2 + 0.5;
    var arch = '<svg viewBox="0 0 40 22" aria-hidden="true"><path d="M1 22 V11 A19 11 0 0 1 39 11 V22 Z" fill="#a39686" stroke="#3a2a20" stroke-width="2"/>' +
      '<path d="M9 22 V13 A11 8 0 0 1 31 13 V22 Z" fill="#2b211a"/>' +
      '<path d="M5 9 L9 11 M14 3 L15 7 M26 3 L25 7 M35 9 L31 11" stroke="#3a2a20" stroke-width="1.5"/></svg>';
    [['top', mid, 0], ['bottom', mid, SIZE]].forEach(function (e) {
      extra += '<span class="nn-tunnel is-' + e[0] + '" style="left:' + (e[1] / SIZE * 100) + '%;top:' + (e[2] / SIZE * 100) + '%" title="トンネル（ここを ふくむ なわばりは 0点）">' + arch + '</span>';
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
        '<span class="nn-final__name">' + esc(pname(i)) + (win ? ' 👑' : '') + '<small>なわばり・魚屋 ' + (p.score - p.captured - p.nap) + '・とった ねこ ' + p.captured + '・ひるね猫 ' + p.nap + '</small></span>' +
        '<span class="nn-final__pts">' + game.final[i] + '点</span></div>';
    }).join('');
    return '<div class="nn-overlay"><div class="nn-modal"><h2 class="nn-modal__title">おしまい！</h2>' +
      (game.endReason === 'noterr' ? '<p class="nn-modal__note">もう あたらしい なわばりが できないので おしまい</p>' : '') +
      '<div class="nn-final">' + rows + '</div>' +
      '<p class="nn-modal__note">なわばりは かかった タイル 1まい＝1点 ＋ 魚屋 5点 ＋ とった ねこ 1匹＝1点 ＋ なわばりの 外の ひるね猫 1匹＝3点</p>' +
      '<button type="button" class="nn-btn nn-btn--go" data-action="again">もういちど</button>' +
      '<button type="button" class="nn-btn nn-btn--sub" data-action="view">盤面を みる</button></div></div>';
  }

  function renderRules() {
    return '<div class="nn-overlay" data-action="close-rules"><div class="nn-modal nn-rules" data-action="noop">' +
      '<div class="nn-modal__head"><h2 class="nn-modal__title">あそびかた <small class="nn-version">版 ' + VERSION + '</small></h2><button type="button" class="nn-modal__close" data-action="close-rules" aria-label="とじる">✕</button></div>' +
      '<h3>じゅんび</h3><ul>' +
      '<li>3〜4人：盤 9×9。手札は 3まいまで（はじめは 2まい）。</li>' +
      '<li>2人：盤 7×7。場に 4まい ならんだ 共通の タイルから えらぶ。</li>' +
      '<li>ねこは 無限。</li>' +
      '<li>まん中に 十字の タイルを おいて はじめる。</li>' +
      '</ul><h3>タイルを おく</h3><ul>' +
      '<li>タイルには 猫道が 0〜4本（中心から 辺の まん中へ）。</li>' +
      '<li>すでに ある タイルの となりに おく。<b>となりの タイルとの 辺は ぴったり あわせる</b>（道が 辺まで 出て いたら かならず 道どうしで つなぐ）。盤の 端へ 出る 猫道は よい。</li>' +
      '<li>猫道（か 魚屋）の ある タイルを おくと、<b>かならず 自分の ねこが のり、猫道が 自分の 色に なる</b>（タイルが 囲碁の 石）。</li>' +
      '<li>おける ときは かならず おく。どの タイルも おけない ときは、おける ものが 出るまで 1まいずつ すてて 引きなおす（自動）。山札が なければ パス。</li>' +
      '</ul><h3>🐟 魚屋</h3><ul>' +
      '<li>山札に 魚屋が 6まい（道なし 4・行き止まりの 道つき 2）。おいた 人の ねこが 魚屋に のる。</li>' +
      '<li>まわりの 盤内の マスが ぜんぶ うまったら 完成。<b>まわり 3×3（魚屋も ふくむ）で ねこが いちばん 多い 人</b>（タコは 2匹ぶん）が <b>5点</b>を もらう。同数なら <b>魚屋に のって いる ねこの 持ち主</b>の 勝ち（その 人が 同数に いない ときは 人数で わる）。</li>' +
      '<li>おいた 人の 点とは かぎらない。まわりに ねこを おいて 守るか、よせて うばうか。完成しないまま おわったら 0点。行き止まりの 道つきの 魚屋の ねこは、ふつうの ねこと おなじく なわばりの 票にも なる。</li>' +
      '</ul><h3>💤 平地の ひるね猫</h3><ul>' +
      '<li>道の ない 平地の タイルにも、おいた 人の ねこが のる（ひるね猫）。なわばりの 票には ならない。魚屋の まわりの 3×3 では 1匹と 数える。</li>' +
      '<li>ひるね猫の いる 面が <b>相手の なわばりとして 完成したら、その ひるね猫は とられる</b>（相手に 1点）。</li>' +
      '<li><b>ゲームの さいごまで</b> なわばりの 外（トンネルに つながった 面・未完成の 面）で ねて いた ひるね猫は <b>1匹 3点</b>。</li>' +
      '</ul><h3>🐙 タコ（1人 1回）</h3><ul>' +
      '<li>タイルを おく かわりに、<b>盤の 上の 自分の ねこ 1匹を タコと 交換</b>できる（自分の ねこが いる マスに だけ）。</li>' +
      '<li>上下左右の <b>猫道に いる 相手の ねこ だけ</b>が 持ち主の 手もとへ 逃げる（だれの 点にも ならない）。自分の ねこ・<b>魚屋の ねこ</b>・完成した なわばりの ねこは 逃げない。</li>' +
      '<li>その 5マスには、あとから おかれた タイルにも ねこを おけない。</li>' +
      '<li>タコは おいた 人の <b>ねこ 2匹ぶん</b>の 票に なる（とられない）。</li>' +
      '</ul><h3>なわばり</h3><ul>' +
      '<li>猫道と 盤の 端は 境界線。<b>かこまれた 面</b>が なわばりの 候補。ただし 上と 下の 辺の まん中には <b>トンネル</b>が あり、<b>トンネルを ふくむ 面は 0点</b>（外へ ぬけられて しまう）。</li>' +
      '<li>面の 中に 空きマスが なくなったら 完成して、<b>すぐ 採点</b>。その 面に 面した 猫道の 上の ねこが いちばん 多い 人が、<b>面が かかった タイル 1まいにつき 1点</b>（¼だけ かかって いても 1点）を もらう（1匹の ねこは、ふれて いる 面ごとに 1票）。</li>' +
      '<li>同数なら 点を 人数で わって 切りすて。</li>' +
      '<li>持ち主は 境界の <b>相手の ねこ</b>と、中で ねて いる <b>相手の ひるね猫を とる</b>（盤から のぞく。1匹 1点）。とられた 猫道は だれの 色でも なくなる。自分の ねこは のこる。</li>' +
      '</ul><h3>おわり</h3><ul>' +
      '<li>盤が うまるか、<b>もう あたらしい なわばりが できなく なったら</b>（のこりの 空きマスを どう うめても トンネルを ふくむ 面しか できない）、または 山札と タイルが なくなるか、全員 つづけて パスしたら おしまい。</li>' +
      '<li>完成して いない 魚屋は 0点。なわばりの 外の ひるね猫は 1匹 3点。</li>' +
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

  function afterAction(acted) {
    settle(game).forEach(function (e) {
      if (e.shop) {
        if (e.tops.length === 1) say('🐟 ' + pname(e.tops[0]) + 'が 魚屋を とった！ +' + e.pts + '点', 'score');
        else if (e.tops.length > 1) say('🐟 魚屋は 同数（' + e.tops.map(pname).join('・') + 'に ' + e.pts + '点ずつ）', '');
        else say('🐟 魚屋の まわりが うまった（ねこが いないので 点なし）', '');
        return;
      }
      if (e.tops.length === 1) say('🏠 ' + pname(e.tops[0]) + 'の なわばり 完成！ +' + e.pts + '点' +
        (e.cap ? '、ねこを ' + e.cap + '匹 とった（+' + e.cap + '点）' : ''), 'score');
      else if (e.tops.length > 1) say('なわばりが 同数で 完成（' + e.tops.map(pname).join('・') + 'に ' + e.pts + '点ずつ）', '');
      else say('面が とじた（ねこが いないので だれの ものでも ない）', '');
    });
    endTurn(game, acted);
    if (game.phase === 'over' && game.strayEvents) {
      game.strayEvents.forEach(function (e) {
        say('💤 ' + pname(e.p) + '：なわばりの 外の ひるね猫 ' + e.naps + '匹 → +' + e.pts + '点', 'score');
      });
    }
    if (game.phase === 'playing' && game.swapped) say(pname(game.current) + '：おける タイルが なかったので ' + game.swapped + 'まい 引きなおした', '');
    resetUi();
    render();
  }

  function doTako(c) {
    var n = putTako(game, c);
    say('🐙 ' + pname(game.current) + 'が タコを おいた！ ' + (n ? 'ねこ ' + n + '匹が 手もとへ にげかえった' : 'にげた ねこは いなかった'), 'tako');
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
    else if (a === 'tako' && P.takoLeft > 0) { ui.mode = 'tako'; render(); }
    else if (a === 'tako-cancel') { ui.mode = 'tile'; render(); }
    else if (a === 'cell' && ui.mode === 'tako') { var tc = Number(el.dataset.c); if (canTako(game, tc)) doTako(tc); }
    else if (a === 'cell' && ui.mode === 'tile' && ui.sel !== null) {
      var c = Number(el.dataset.c), m = rot(P.hand[ui.sel].m, ui.rot);
      if (!canPlace(game, c, m)) return;
      placeTile(game, ui.sel, ui.rot, c);
      ui.sel = null;
      afterAction(true);
    }
    else if (a === 'pass' && !anyPlace(game, P)) { say(pname(game.current) + '：パス', ''); afterAction(false); }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && rulesOpen) { rulesOpen = false; render(); }
    if ((e.key === 'r' || e.key === 'R') && game && game.phase === 'playing' && !isAi() && ui.mode === 'tile' && ui.sel !== null) { ui.rot = (ui.rot + 1) % 4; render(); }
  });

  /* テスト用 */
  window.NNS = {
    newGame: newGame, computeFaces: computeFaces, canPlace: canPlace, placeTile: placeTile, settle: settle,
    totals: totals, rot: rot, canStillScore: canStillScore, canTako: canTako, putTako: putTako, getGame: function () { return game; }
  };

  render();
})();
