/* =========================================================
   ネコネソンヌ（猫街ろまん）
   カルカソンヌ風の タイル ゲームに、ねこならではの ルールを たしたもの。

   ・タイルを つないで「おうち」「ねこみち」「えんがわ」を つくり、ねこを おく
   ・きまぐれ：おいた ねこは ターンの おわりに ときどき となりの タイルへ うごく
   ・タコ大王：よぶと まわり 8マスの ねこが にげだす（1周すると かえる）
   ・きもちいい 場所：☀ひなた・🐟おやつ・えんがわ は 点が 高く、ねこも うごかない

   ルールの 関数（盤面・グループ・得点）は 描画と わけて あり、
   CPU は 盤面を コピーして 同じ 関数で 1手 先を 読む（ずるを しない）。
   ========================================================= */
(function () {
  'use strict';

  var DIRS = ['N', 'E', 'S', 'W'];
  var OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
  var DELTA = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
  var DIR_ARROW = { N: '↑', E: '→', S: '↓', W: '←' };

  /* 4人 = 4柄。スプライトは 3×3（1020px 四方、1コマ 340px） */
  var CATS = [
    { id: 'kijitora', name: 'きじとら', color: '#c65a00' },
    { id: 'kuro', name: 'くろ', color: '#3b4a8a' },
    { id: 'hachiware', name: 'はちわれ', color: '#2f7d4a' },
    { id: 'chashiro', name: 'ちゃしろ', color: '#d0526b' }
  ];
  var CATS_PER_PLAYER = 7;
  var TAKO_PER_PLAYER = 2;
  var WANDER_CHANCE = 0.5;   /* 1ターンに 1匹 うごく 確率 */
  var SUN_RATE = 0.22;       /* ☀ひなたの タイルの わりあい */
  var SHORT_DECK = 40;

  /* ポーズ（シート・列・行） */
  var POSE = {
    idle: { relax: false, c: 0, r: 0 },
    happy: { relax: false, c: 1, r: 0 },
    celebrate: { relax: false, c: 1, r: 2 },
    loaf: { relax: true, c: 1, r: 1 },
    surprised: { relax: true, c: 0, r: 2 },
    walk: { relax: false, c: 1, r: 1 }
  };

  function key(x, y) { return x + ',' + y; }
  function parseKey(k) { var p = k.split(','); return [Number(p[0]), Number(p[1])]; }
  function neighborCoord(x, y, dir) { var d = DELTA[dir]; return [x + d[0], y + d[1]]; }
  function rotateEdges(edges, rotation) {
    var e = edges.slice();
    for (var i = 0; i < (rotation / 90) % 4; i++) e = [e[3], e[0], e[1], e[2]];
    return e;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---- タイル：edges = [N,E,S,W]、H=おうち R=ねこみち F=くさはら ---- */
  var TILE_DEFS = [
    { id: 'road-straight', edges: ['F', 'R', 'F', 'R'], count: 11 },
    { id: 'road-curve', edges: ['F', 'R', 'R', 'F'], count: 12 },
    { id: 'road-t', edges: ['F', 'R', 'R', 'R'], count: 4 },
    { id: 'road-cross', edges: ['R', 'R', 'R', 'R'], count: 1 },
    { id: 'engawa', edges: ['F', 'F', 'F', 'F'], engawa: true, count: 4 },
    { id: 'engawa-road', edges: ['F', 'F', 'R', 'F'], engawa: true, count: 2 },
    { id: 'house-1', edges: ['H', 'F', 'F', 'F'], count: 8 },
    { id: 'house-1-treat', edges: ['H', 'F', 'F', 'F'], treat: true, count: 2 },
    { id: 'house-corner', edges: ['H', 'H', 'F', 'F'], count: 3 },
    { id: 'house-corner-treat', edges: ['H', 'H', 'F', 'F'], treat: true, count: 2 },
    { id: 'house-through', edges: ['H', 'F', 'H', 'F'], count: 1 },
    { id: 'house-through-treat', edges: ['H', 'F', 'H', 'F'], treat: true, count: 2 },
    { id: 'house-3', edges: ['H', 'H', 'H', 'F'], count: 3 },
    { id: 'house-3-treat', edges: ['H', 'H', 'H', 'F'], treat: true, count: 1 },
    { id: 'house-4', edges: ['H', 'H', 'H', 'H'], treat: true, count: 1 },
    { id: 'house-road-straight', edges: ['H', 'R', 'F', 'R'], count: 4 },
    { id: 'house-road-curve', edges: ['H', 'R', 'R', 'F'], count: 3 },
    { id: 'house-road-t', edges: ['H', 'R', 'R', 'R'], count: 3 },
    { id: 'house-2-road', edges: ['H', 'R', 'H', 'R'], count: 1 },
    { id: 'house-3-road', edges: ['H', 'H', 'H', 'R'], count: 2 }
  ];
  var START_TILE = { edges: ['H', 'R', 'F', 'R'], engawa: false, treat: false, sun: true };

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function buildDeck(short) {
    var deck = [];
    TILE_DEFS.forEach(function (def) {
      for (var i = 0; i < def.count; i++) {
        deck.push({
          baseEdges: def.edges.slice(),
          engawa: !!def.engawa,
          treat: !!def.treat,
          sun: !def.engawa && Math.random() < SUN_RATE
        });
      }
    });
    shuffle(deck);
    return short ? deck.slice(0, SHORT_DECK) : deck;
  }

  /* =========================================================
     盤面・グループ（描画とは 関係 ない 純粋な ルール）
     ========================================================= */

  function isValidPlacement(board, x, y, edges) {
    if (board.has(key(x, y))) return false;
    var hasNeighbor = false;
    for (var i = 0; i < 4; i++) {
      var nc = neighborCoord(x, y, DIRS[i]);
      var nb = board.get(key(nc[0], nc[1]));
      if (nb) {
        hasNeighbor = true;
        if (nb.edges[DIRS.indexOf(OPP[DIRS[i]])] !== edges[i]) return false;
      }
    }
    return hasNeighbor;
  }

  function computeFrontier(board) {
    var f = {};
    board.forEach(function (tile, k) {
      var xy = parseKey(k);
      DIRS.forEach(function (d) {
        var nc = neighborCoord(xy[0], xy[1], d);
        var nk = key(nc[0], nc[1]);
        if (!board.has(nk)) f[nk] = true;
      });
    });
    return Object.keys(f).map(parseKey);
  }

  function newGame(seats, short) {
    var players = seats.map(function (s, i) {
      return { index: i, cat: s.cat, human: s.human, score: 0, catsLeft: CATS_PER_PLAYER, takoLeft: TAKO_PER_PLAYER };
    });
    return {
      phase: 'playing',
      numPlayers: players.length,
      players: players,
      current: 0,
      turn: 0,
      deck: buildDeck(short),
      board: new Map(),
      houseGroups: new Map(),
      roadGroups: new Map(),
      houseIndex: new Map(),
      roadIndex: new Map(),
      engawas: new Map(),
      takos: new Map(),
      nextId: 1,
      drawn: null,
      rotation: 0,
      pending: null,
      lastCoord: null,
      moved: {},
      log: [],
      standings: null
    };
  }

  function player(game, i) { return game.players[i]; }
  function catOf(game, i) { return CATS[game.players[i].cat]; }
  function pname(game, i) {
    var p = game.players[i];
    return CATS[p.cat].name + (p.human ? '' : '(CPU)');
  }

  function mergeGroups(map, index, idA, idB, ckA, dA, ckB, dB) {
    if (idA === idB) {
      var g = map.get(idA);
      g.edges.delete(ckA + '|' + dA);
      g.edges.delete(ckB + '|' + dB);
      return idA;
    }
    var a = map.get(idA), b = map.get(idB);
    b.tiles.forEach(function (c) { a.tiles.add(c); });
    b.edges.forEach(function (e) { a.edges.add(e); });
    a.treats += b.treats;
    a.meeples = a.meeples.concat(b.meeples);
    b.tiles.forEach(function (c) {
      DIRS.forEach(function (d) { if (index.get(c + '|' + d) === idB) index.set(c + '|' + d, idA); });
    });
    map.delete(idB);
    a.edges.delete(ckA + '|' + dA);
    a.edges.delete(ckB + '|' + dB);
    return idA;
  }

  function newGroup(game, map, index, kind, ck, dirs, treats) {
    var id = game.nextId++;
    map.set(id, { id: id, kind: kind, tiles: new Set([ck]), edges: new Set(dirs.map(function (d) { return ck + '|' + d; })), treats: treats, meeples: [], completed: false });
    dirs.forEach(function (d) { index.set(ck + '|' + d, id); });
    return id;
  }

  function applyTile(game, x, y, edges, meta) {
    var ck = key(x, y);
    var tile = { x: x, y: y, edges: edges, engawa: !!meta.engawa, treat: !!meta.treat, sun: !!meta.sun, meeple: null, tako: null };
    game.board.set(ck, tile);
    if (tile.engawa) game.engawas.set(ck, { meeple: null, completed: false });

    var houseDirs = DIRS.filter(function (d, i) { return edges[i] === 'H'; });
    if (houseDirs.length) newGroup(game, game.houseGroups, game.houseIndex, 'house', ck, houseDirs, tile.treat ? 1 : 0);

    var roadDirs = DIRS.filter(function (d, i) { return edges[i] === 'R'; });
    if (roadDirs.length === 1 || roadDirs.length === 2) {
      newGroup(game, game.roadGroups, game.roadIndex, 'road', ck, roadDirs, 0);
    } else if (roadDirs.length >= 3) {
      roadDirs.forEach(function (d) { newGroup(game, game.roadGroups, game.roadIndex, 'road', ck, [d], 0); });
    }

    var touchedHouse = new Set(houseDirs.map(function (d) { return game.houseIndex.get(ck + '|' + d); }));
    var touchedRoad = new Set(roadDirs.map(function (d) { return game.roadIndex.get(ck + '|' + d); }));

    DIRS.forEach(function (dir, i) {
      var type = edges[i];
      if (type === 'F') return;
      var nc = neighborCoord(x, y, dir);
      var nk = key(nc[0], nc[1]);
      if (!game.board.has(nk)) return;
      var od = OPP[dir];
      if (type === 'H') {
        touchedHouse.add(mergeGroups(game.houseGroups, game.houseIndex, game.houseIndex.get(ck + '|' + dir), game.houseIndex.get(nk + '|' + od), ck, dir, nk, od));
      } else {
        touchedRoad.add(mergeGroups(game.roadGroups, game.roadIndex, game.roadIndex.get(ck + '|' + dir), game.roadIndex.get(nk + '|' + od), ck, dir, nk, od));
      }
    });
    return { ck: ck, touchedHouse: touchedHouse, touchedRoad: touchedRoad };
  }

  /* ---- タイルの 上の「ねこを おける ところ」 ---- */
  function featuresOnTile(game, ck) {
    var tile = game.board.get(ck);
    var list = [];
    if (tile.engawa) list.push({ type: 'engawa', ck: ck });
    var houseDirs = DIRS.filter(function (d, i) { return tile.edges[i] === 'H'; });
    if (houseDirs.length) list.push({ type: 'house', ck: ck, dir: houseDirs[0], gid: game.houseIndex.get(ck + '|' + houseDirs[0]) });
    var seen = {};
    var roadDirs = DIRS.filter(function (d, i) { return tile.edges[i] === 'R'; });
    roadDirs.forEach(function (d) {
      var gid = game.roadIndex.get(ck + '|' + d);
      if (seen[gid]) return;
      seen[gid] = true;
      list.push({ type: 'road', ck: ck, dir: d, gid: gid, multi: roadDirs.length >= 3 });
    });
    return list;
  }

  function groupOf(game, f) {
    if (f.type === 'engawa') return game.engawas.get(f.ck);
    if (f.type === 'house') return game.houseGroups.get(game.houseIndex.get(f.ck + '|' + f.dir));
    return game.roadGroups.get(game.roadIndex.get(f.ck + '|' + f.dir));
  }

  function featureIsFree(game, f) {
    var g = groupOf(game, f);
    if (!g || g.completed) return false;
    return f.type === 'engawa' ? !g.meeple : g.meeples.length === 0;
  }

  function inTakoZone(game, x, y) {
    var hit = false;
    game.takos.forEach(function (t, ck) {
      var xy = parseKey(ck);
      if (Math.abs(xy[0] - x) <= 1 && Math.abs(xy[1] - y) <= 1) hit = true;
    });
    return hit;
  }

  function isComfy(tile) { return tile.sun || tile.treat || (tile.meeple && tile.meeple.feature === 'engawa'); }

  function featureLabel(f) {
    if (f.type === 'engawa') return 'えんがわ';
    if (f.type === 'house') return 'おうち';
    return 'ねこみち' + (f.multi ? DIR_ARROW[f.dir] : '');
  }

  function claimableOptions(game, ck) {
    var tile = game.board.get(ck);
    if (tile.meeple || tile.tako || inTakoZone(game, tile.x, tile.y)) return [];
    return featuresOnTile(game, ck).filter(function (f) { return featureIsFree(game, f); });
  }

  function putCat(game, f, pi, pose) {
    var tile = game.board.get(f.ck);
    var g = groupOf(game, f);
    if (f.type === 'engawa') g.meeple = { player: pi };
    else g.meeples.push({ player: pi, coord: f.ck });
    tile.meeple = { player: pi, feature: f.type, dir: f.dir, placedTurn: game.turn, pose: pose || null };
  }

  /** ねこを どかす（手もとには もどさない）。どかした ねこの 持ち主を かえす */
  function liftCat(game, ck) {
    var tile = game.board.get(ck);
    var m = tile.meeple;
    if (!m) return -1;
    var g = groupOf(game, { type: m.feature, ck: ck, dir: m.dir });
    if (m.feature === 'engawa') g.meeple = null;
    else g.meeples = g.meeples.filter(function (x) { return x.coord !== ck; });
    tile.meeple = null;
    return m.player;
  }

  function placeCat(game, f) {
    var pi = game.current;
    if (game.players[pi].catsLeft <= 0) return;
    putCat(game, f, pi);
    game.players[pi].catsLeft--;
  }

  /* ---- 得点 ---- */
  function sunCount(game, g) {
    var n = 0;
    g.tiles.forEach(function (c) { if (game.board.get(c).sun) n++; });
    return n;
  }
  function groupPoints(game, g, done) {
    var sun = sunCount(game, g);
    if (g.kind === 'house') return { pts: (done ? 2 : 1) * (g.tiles.size + g.treats) + sun, sun: sun, treats: g.treats };
    return { pts: g.tiles.size + sun, sun: sun, treats: 0 };
  }
  function engawaFill(game, ck) {
    var xy = parseKey(ck), n = 0;
    for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) if (game.board.has(key(xy[0] + dx, xy[1] + dy))) n++;
    return n;
  }

  function majority(meeples) {
    if (!meeples.length) return [];
    var tally = {}, max = 0;
    meeples.forEach(function (m) { tally[m.player] = (tally[m.player] || 0) + 1; });
    Object.keys(tally).forEach(function (p) { if (tally[p] > max) max = tally[p]; });
    return Object.keys(tally).filter(function (p) { return tally[p] === max; }).map(Number);
  }

  function award(game, winners, pts, label, quiet) {
    if (!winners.length || pts <= 0) return;
    winners.forEach(function (p) { game.players[p].score += pts; });
    if (quiet) return;
    say(game, winners.map(function (p) { return pname(game, p); }).join('・') + '：' + label + ' +' + pts + '点', 'score');
  }

  function bonusText(r) {
    var b = [];
    if (r.treats) b.push('🐟×' + r.treats);
    if (r.sun) b.push('☀×' + r.sun);
    return b.length ? '（' + b.join(' ') + '）' : '';
  }

  function returnCats(game, meeples) {
    meeples.forEach(function (m) {
      game.players[m.player].catsLeft++;
      var t = game.board.get(m.coord);
      if (t) t.meeple = null;
    });
  }

  function checkCompletions(game, touched, x, y) {
    touched.touchedHouse.forEach(function (id) {
      var g = game.houseGroups.get(id);
      if (!g || g.completed || g.edges.size) return;
      g.completed = true;
      var r = groupPoints(game, g, true);
      award(game, majority(g.meeples), r.pts, 'おうち かんせい' + bonusText(r));
      returnCats(game, g.meeples);
      g.meeples = [];
    });
    touched.touchedRoad.forEach(function (id) {
      var g = game.roadGroups.get(id);
      if (!g || g.completed || g.edges.size) return;
      g.completed = true;
      var r = groupPoints(game, g, true);
      award(game, majority(g.meeples), r.pts, 'ねこみち かんせい' + bonusText(r));
      returnCats(game, g.meeples);
      g.meeples = [];
    });
    for (var dx = -1; dx <= 1; dx++) {
      for (var dy = -1; dy <= 1; dy++) {
        var ck = key(x + dx, y + dy);
        var m = game.engawas.get(ck);
        if (!m || m.completed || engawaFill(game, ck) < 9) continue;
        m.completed = true;
        if (m.meeple) {
          award(game, [m.meeple.player], 9, 'えんがわで ひなたぼっこ');
          game.players[m.meeple.player].catsLeft++;
          game.board.get(ck).meeple = null;
          m.meeple = null;
        }
      }
    }
  }

  function finalizeScoring(game) {
    [game.houseGroups, game.roadGroups].forEach(function (map) {
      map.forEach(function (g) {
        if (g.completed || !g.meeples.length) return;
        award(game, majority(g.meeples), groupPoints(game, g, false).pts, '', true);
      });
    });
    game.engawas.forEach(function (m, ck) {
      if (m.completed || !m.meeple) return;
      award(game, [m.meeple.player], engawaFill(game, ck), '', true);
    });
    var max = Math.max.apply(null, game.players.map(function (p) { return p.score; }));
    game.standings = game.players.map(function (p) { return { p: p, win: p.score === max }; })
      .sort(function (a, b) { return b.p.score - a.p.score; });
    game.phase = 'gameover';
  }

  /* =========================================================
     ねこの ギミック
     ========================================================= */

  /** タコ大王：いま おいた タイルに よぶ。まわり 8マスの ねこは にげる */
  function placeTako(game, ck, deterministic) {
    var pi = game.current;
    var tile = game.board.get(ck);
    tile.tako = { player: pi };
    game.takos.set(ck, { player: pi, until: game.turn + game.numPlayers });
    game.players[pi].takoLeft--;
    say(game, pname(game, pi) + '：タコ大王を よんだ！', 'tako');

    var xy = parseKey(ck);
    var scared = [];
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        var nk = key(xy[0] + dx, xy[1] + dy);
        var t = game.board.get(nk);
        if (t && t.meeple) scared.push(nk);
      }
    }
    scared.forEach(function (from) {
      var owner = liftCat(game, from);
      var dest = findFleeSpot(game, from, deterministic);
      if (dest) {
        putCat(game, dest, owner, 'surprised');
        game.moved[dest.ck] = 'flee';
        say(game, CATS[game.players[owner].cat].name + 'は びっくりして ' + featureLabel(dest) + 'へ にげた！', 'flee');
      } else {
        game.players[owner].catsLeft++;
        say(game, CATS[game.players[owner].cat].name + 'は びっくりして おうちに かえった…', 'flee');
      }
    });
  }

  /** にげる 先：もとの 場所から タイルづたいに ちかい じゅんに さがす（4マス まで） */
  function findFleeSpot(game, from, deterministic) {
    var seen = {}; seen[from] = true;
    var frontier = [from];
    for (var dist = 1; dist <= 4; dist++) {
      var next = [];
      frontier.forEach(function (ck) {
        var xy = parseKey(ck);
        DIRS.forEach(function (d) {
          var nc = neighborCoord(xy[0], xy[1], d);
          var nk = key(nc[0], nc[1]);
          if (seen[nk] || !game.board.has(nk)) return;
          seen[nk] = true;
          next.push(nk);
        });
      });
      var spots = [];
      next.forEach(function (ck) {
        claimableOptions(game, ck).forEach(function (f) { spots.push(f); });
      });
      if (spots.length) return deterministic ? spots[0] : spots[Math.floor(Math.random() * spots.length)];
      frontier = next;
    }
    return null;
  }

  /** きまぐれ：うごける ねこの 一覧（きもちいい 場所に いる ねこは うごかない） */
  function wanderCandidates(game) {
    var list = [];
    game.board.forEach(function (t, ck) {
      var m = t.meeple;
      if (!m || m.placedTurn === game.turn || isComfy(t)) return;
      var cur = groupOf(game, { type: m.feature, ck: ck, dir: m.dir });
      var dests = [];
      DIRS.forEach(function (d) {
        var nc = neighborCoord(t.x, t.y, d);
        var nk = key(nc[0], nc[1]);
        var nt = game.board.get(nk);
        if (!nt || nt.meeple || nt.tako || inTakoZone(game, nc[0], nc[1])) return;
        featuresOnTile(game, nk).forEach(function (f) {
          var g = groupOf(game, f);
          if (!g || g.completed) return;
          var free = f.type === 'engawa' ? !g.meeple : (g.meeples.length === 0 || g === cur);
          if (!free) return;
          var comfy = f.type === 'engawa' || nt.sun || nt.treat;
          dests.push({ f: f, w: comfy ? 4 : 1, comfy: comfy });
        });
      });
      if (dests.length) list.push({ ck: ck, dests: dests });
    });
    return list;
  }

  function wander(game) {
    if (Math.random() >= WANDER_CHANCE) return;
    var list = wanderCandidates(game);
    if (!list.length) return;
    var c = list[Math.floor(Math.random() * list.length)];
    var total = c.dests.reduce(function (s, d) { return s + d.w; }, 0);
    var r = Math.random() * total, pick = c.dests[0];
    for (var i = 0; i < c.dests.length; i++) { r -= c.dests[i].w; if (r < 0) { pick = c.dests[i]; break; } }
    var owner = liftCat(game, c.ck);
    putCat(game, pick.f, owner, pick.comfy ? 'loaf' : 'walk');
    game.moved[pick.f.ck] = 'wander';
    var nt = game.board.get(pick.f.ck);
    var why = pick.f.type === 'engawa' ? '（えんがわで ひなたぼっこ）' : nt.treat ? '（おやつの においが する…）' : nt.sun ? '（ひなたが きもちいい）' : '';
    say(game, '🐾 きまぐれ：' + CATS[game.players[owner].cat].name + 'が ' + featureLabel(pick.f) + 'へ ぶらり' + why, 'wander');
  }

  /* =========================================================
     ターンの すすみかた
     ========================================================= */

  function currentEdges(game) { return rotateEdges(game.drawn.baseEdges, game.rotation); }

  function anyValid(game, rotation) {
    var edges = rotateEdges(game.drawn.baseEdges, rotation);
    return computeFrontier(game.board).some(function (c) { return isValidPlacement(game.board, c[0], c[1], edges); });
  }
  function anyValidAnyRotation(game) {
    return [0, 90, 180, 270].some(function (r) { return anyValid(game, r); });
  }

  function drawNext(game) {
    game.rotation = 0;
    game.drawn = game.deck.length ? game.deck.pop() : null;
    if (!game.drawn) finalizeScoring(game);
  }

  function startTurn(game) {
    /* このターンの 人が よんだ タコ大王は、1周 したので かえる */
    game.takos.forEach(function (t, ck) {
      if (t.until <= game.turn) {
        game.takos.delete(ck);
        game.board.get(ck).tako = null;
        say(game, 'タコ大王は かえっていった', 'tako');
      }
    });
    drawNext(game);
  }

  function endTurn(game) {
    wander(game);
    game.turn++;
    game.current = (game.current + 1) % game.numPlayers;
    startTurn(game);
  }

  /* =========================================================
     CPU（1手 先を 読む よくばり 探索）
     ========================================================= */

  function cloneGame(game) {
    var g2 = {
      numPlayers: game.numPlayers, current: game.current, turn: game.turn, nextId: game.nextId,
      players: game.players.map(function (p) { return { index: p.index, cat: p.cat, human: p.human, score: p.score, catsLeft: p.catsLeft, takoLeft: p.takoLeft }; }),
      board: new Map(), houseGroups: new Map(), roadGroups: new Map(), engawas: new Map(), takos: new Map(),
      houseIndex: new Map(game.houseIndex), roadIndex: new Map(game.roadIndex),
      moved: {}, log: []
    };
    game.board.forEach(function (t, k) {
      g2.board.set(k, { x: t.x, y: t.y, edges: t.edges.slice(), engawa: t.engawa, treat: t.treat, sun: t.sun,
        meeple: t.meeple ? { player: t.meeple.player, feature: t.meeple.feature, dir: t.meeple.dir, placedTurn: t.meeple.placedTurn } : null,
        tako: t.tako ? { player: t.tako.player } : null });
    });
    [['houseGroups'], ['roadGroups']].forEach(function (n) {
      game[n[0]].forEach(function (gr, id) {
        g2[n[0]].set(id, { id: gr.id, kind: gr.kind, tiles: new Set(gr.tiles), edges: new Set(gr.edges), treats: gr.treats,
          meeples: gr.meeples.map(function (m) { return { player: m.player, coord: m.coord }; }), completed: gr.completed });
      });
    });
    game.engawas.forEach(function (m, k) { g2.engawas.set(k, { meeple: m.meeple ? { player: m.meeple.player } : null, completed: m.completed }); });
    game.takos.forEach(function (t, k) { g2.takos.set(k, { player: t.player, until: t.until }); });
    return g2;
  }

  function heuristic(game, ai) {
    var others = game.players.filter(function (p) { return p.index !== ai; });
    var best = Math.max.apply(null, others.map(function (p) { return p.score; }));
    var val = (game.players[ai].score - best) * 3;

    function share(meeples) {
      var mine = 0, tally = {}, top = 0;
      meeples.forEach(function (m) {
        if (m.player === ai) mine++;
        else { tally[m.player] = (tally[m.player] || 0) + 1; top = Math.max(top, tally[m.player]); }
      });
      if (!mine && !top) return 0;
      if (mine > top) return 1;
      if (mine === top) return 0.5;
      return -1;
    }
    [game.houseGroups, game.roadGroups].forEach(function (map) {
      map.forEach(function (g) {
        if (g.completed || !g.meeples.length) return;
        var s = share(g.meeples);
        if (!s) return;
        val += s * groupPoints(game, g, true).pts / (1 + g.edges.size);
      });
    });
    game.engawas.forEach(function (m, ck) {
      if (m.completed || !m.meeple) return;
      val += (m.meeple.player === ai ? 1 : -1 / others.length) * engawaFill(game, ck) * 0.6;
    });
    var avgCats = others.reduce(function (s, p) { return s + p.catsLeft; }, 0) / others.length;
    val += (game.players[ai].catsLeft - avgCats) * 0.3;
    val += game.players[ai].takoLeft * 1.2;
    return val;
  }

  function chooseAiPlacement(game) {
    var ai = game.current;
    var meta = { engawa: game.drawn.engawa, treat: game.drawn.treat, sun: game.drawn.sun };
    var best = null, bestScore = -Infinity;
    simulating = true;
    computeFrontier(game.board).forEach(function (c) {
      [0, 90, 180, 270].forEach(function (rot) {
        var edges = rotateEdges(game.drawn.baseEdges, rot);
        if (!isValidPlacement(game.board, c[0], c[1], edges)) return;
        var cl = cloneGame(game);
        var res = applyTile(cl, c[0], c[1], edges, meta);
        var s = bestActionScore(cl, res, ai).score + Math.random() * 0.01;
        if (s > bestScore) { bestScore = s; best = { x: c[0], y: c[1], rotation: rot }; }
      });
    });
    simulating = false;
    return best;
  }

  /** タイルを おいた あとの 手：null=なにもしない / {cat:f} / {tako:true} */
  function bestActionScore(game, res, ai) {
    var xy = parseKey(res.ck);
    var skip = cloneGame(game);
    checkCompletions(skip, res, xy[0], xy[1]);
    var best = { action: null, score: heuristic(skip, ai) };
    if (game.players[ai].catsLeft > 0) {
      claimableOptions(game, res.ck).forEach(function (f) {
        var cl = cloneGame(game);
        putCat(cl, f, ai); cl.players[ai].catsLeft--;
        checkCompletions(cl, res, xy[0], xy[1]);
        var s = heuristic(cl, ai) + Math.random() * 0.01;
        if (s > best.score) best = { action: { cat: f }, score: s };
      });
    }
    if (game.players[ai].takoLeft > 0) {
      var cl2 = cloneGame(game);
      placeTako(cl2, res.ck, true);
      checkCompletions(cl2, res, xy[0], xy[1]);
      var s2 = heuristic(cl2, ai);
      if (s2 > best.score + 1.5) best = { action: { tako: true }, score: s2 };
    }
    return best;
  }

  /* =========================================================
     トースト・ログ
     ========================================================= */
  var simulating = false;
  var toastSeq = 0, toasts = [];

  function say(game, text, kind) {
    if (simulating || !game.log) return;
    game.log.unshift({ text: text, kind: kind || '' });
    if (game.log.length > 8) game.log.length = 8;
    var id = ++toastSeq;
    toasts.push({ id: id, text: text, kind: kind || '' });
    if (toasts.length > 4) toasts.shift();
    renderToasts();
    setTimeout(function () {
      toasts = toasts.filter(function (t) { return t.id !== id; });
      renderToasts();
    }, 3200);
  }
  function renderToasts() {
    document.getElementById('toasts').innerHTML = toasts.map(function (t) {
      return '<div class="nn-toast is-' + t.kind + '">' + esc(t.text) + '</div>';
    }).join('');
  }

  /* =========================================================
     えがく
     ========================================================= */

  var HOUSE_PATH = {
    N: 'M 0,0 Q 50,48 100,0 Z',
    E: 'M 100,0 Q 52,50 100,100 Z',
    S: 'M 0,100 Q 50,52 100,100 Z',
    W: 'M 0,0 Q 48,50 0,100 Z'
  };
  var EDGE_MID = { N: [50, 0], E: [100, 50], S: [50, 100], W: [0, 50] };
  var HOUSE_SPOT = { N: [50, 17], E: [83, 50], S: [50, 83], W: [17, 50] };
  var CORNERS = [
    { at: [84, 16], dirs: ['N', 'E'] }, { at: [84, 84], dirs: ['E', 'S'] },
    { at: [16, 84], dirs: ['S', 'W'] }, { at: [16, 16], dirs: ['W', 'N'] }
  ];

  function spriteSVG(catIdx, pose, cx, cy, size) {
    var p = POSE[pose] || POSE.idle;
    var url = 'images/cat-' + CATS[catIdx].id + (p.relax ? '-relax' : '') + '.png';
    return '<svg x="' + (cx - size / 2) + '" y="' + (cy - size / 2) + '" width="' + size + '" height="' + size + '" viewBox="0 0 340 340">' +
      '<image href="' + url + '" x="' + (-p.c * 340) + '" y="' + (-p.r * 340) + '" width="1020" height="1020" /></svg>';
  }

  function tileSVG(tile) {
    var e = tile.edges;
    var s = [];
    s.push('<rect width="100" height="100" fill="var(--t-grass)" />');
    s.push('<g fill="var(--t-grass-dot)"><circle cx="22" cy="30" r="1.6"/><circle cx="74" cy="66" r="1.6"/><circle cx="30" cy="76" r="1.6"/><circle cx="70" cy="24" r="1.6"/></g>');

    var houseDirs = DIRS.filter(function (d, i) { return e[i] === 'H'; });
    if (houseDirs.length === 4) {
      s.push('<rect x="1.5" y="1.5" width="97" height="97" fill="var(--t-house)" stroke="var(--t-roof)" stroke-width="3" />');
    } else if (houseDirs.length) {
      if (houseDirs.length >= 2) s.push('<circle cx="50" cy="50" r="28" fill="var(--t-house)" />');
      houseDirs.forEach(function (d) {
        s.push('<path d="' + HOUSE_PATH[d] + '" fill="var(--t-house)" stroke="var(--t-roof)" stroke-width="3.5" stroke-dasharray="6 2" />');
      });
      if (houseDirs.length >= 2) s.push('<circle cx="50" cy="50" r="27" fill="var(--t-house)" />');
    }

    var roadDirs = DIRS.filter(function (d, i) { return e[i] === 'R'; });
    roadDirs.forEach(function (d) {
      var m = EDGE_MID[d];
      s.push('<line x1="50" y1="50" x2="' + m[0] + '" y2="' + m[1] + '" stroke="var(--t-road-edge)" stroke-width="16" />');
    });
    roadDirs.forEach(function (d) {
      var m = EDGE_MID[d];
      s.push('<line x1="50" y1="50" x2="' + m[0] + '" y2="' + m[1] + '" stroke="var(--t-road)" stroke-width="12" />');
      s.push('<line x1="50" y1="50" x2="' + m[0] + '" y2="' + m[1] + '" stroke="var(--t-road-edge)" stroke-width="1.6" stroke-dasharray="3 4" />');
    });
    if (roadDirs.length >= 3) s.push('<circle cx="50" cy="50" r="9" fill="var(--t-road)" stroke="var(--t-road-edge)" stroke-width="2" />');
    if (roadDirs.length === 1 && !tile.engawa) s.push('<circle cx="50" cy="50" r="8" fill="var(--t-road)" stroke="var(--t-road-edge)" stroke-width="2" />');

    if (tile.engawa) {
      s.push('<g transform="translate(26,30)">' +
        '<rect width="48" height="32" rx="3" fill="var(--t-wood)" stroke="var(--t-wood-edge)" stroke-width="2" />' +
        '<line x1="0" y1="11" x2="48" y2="11" stroke="var(--t-wood-edge)" stroke-width="1.2" />' +
        '<line x1="0" y1="21" x2="48" y2="21" stroke="var(--t-wood-edge)" stroke-width="1.2" />' +
        '<rect x="14" y="6" width="20" height="18" rx="4" fill="#e0656f" stroke="#9b3a42" stroke-width="1.5" />' +
        '</g>' +
        '<circle cx="50" cy="46" r="36" fill="#ffe36e" opacity=".18" />');
    }

    if (tile.treat && houseDirs.length) {
      var p = houseDirs.length === 4 ? [50, 50] : HOUSE_SPOT[houseDirs[0]];
      s.push('<g transform="translate(' + p[0] + ',' + p[1] + ')">' +
        '<circle r="9" fill="#fff8ec" stroke="var(--t-roof)" stroke-width="1.5" />' +
        '<ellipse cx="-1.5" cy="0" rx="5" ry="3" fill="#5a7fa8" />' +
        '<path d="M 3,0 L 7,-3 L 7,3 Z" fill="#5a7fa8" />' +
        '<circle cx="-4" cy="-0.6" r=".8" fill="#fff" />' +
        '</g>');
    }

    if (tile.sun) {
      s.push('<rect width="100" height="100" fill="#ffd84a" opacity=".22" />');
      var corner = CORNERS.filter(function (c) {
        return c.dirs.every(function (d) { return e[DIRS.indexOf(d)] === 'F'; });
      })[0] || CORNERS[0];
      s.push('<g transform="translate(' + corner.at[0] + ',' + corner.at[1] + ')">' +
        '<circle r="9.5" fill="#fff3b0" opacity=".9" />' +
        '<circle r="5.2" fill="#ffb300" stroke="#e07a00" stroke-width="1.2" />' +
        '<g stroke="#e07a00" stroke-width="1.6" stroke-linecap="round">' +
        '<line x1="0" y1="-8.5" x2="0" y2="-7"/><line x1="0" y1="7" x2="0" y2="8.5"/><line x1="-8.5" y1="0" x2="-7" y2="0"/><line x1="7" y1="0" x2="8.5" y2="0"/>' +
        '</g></g>');
    }

    if (tile.tako) {
      s.push('<image href="images/people/daiou-normal.png" x="12" y="10" width="76" height="76" />');
    }

    if (tile.meeple) {
      var mm = tile.meeple;
      var pos = [50, 50];
      if (mm.feature === 'road') {
        var mid = EDGE_MID[mm.dir];
        pos = [(50 + mid[0]) / 2, (50 + mid[1]) / 2];
      } else if (mm.feature === 'house') {
        pos = houseDirs.length === 4 ? [50, 50] : HOUSE_SPOT[mm.dir];
        pos = [(pos[0] + 50) / 2, (pos[1] + 50) / 2];
      }
      pos = [Math.min(78, Math.max(22, pos[0])), Math.min(76, Math.max(22, pos[1]))];
      var pl = game.players[mm.player];
      /* うごいた ばかりの ねこだけ びっくり／あるく ポーズ。ふだんは おすわりか、きもちいい 場所で まるくなる */
      var pose = (game.moved[key(tile.x, tile.y)] && mm.pose) || (isComfy(tile) ? 'loaf' : 'idle');
      s.push('<ellipse cx="' + pos[0] + '" cy="' + (pos[1] + 18) + '" rx="17" ry="6" fill="' + CATS[pl.cat].color + '" stroke="#fff" stroke-width="2" />');
      s.push(spriteSVG(pl.cat, pose, pos[0], pos[1], 46));
    }
    return '<svg viewBox="0 0 100 100" aria-hidden="true">' + s.join('') + '</svg>';
  }

  function previewSVG(drawn, rotation) {
    return tileSVG({ edges: rotateEdges(drawn.baseEdges, rotation), engawa: drawn.engawa, treat: drawn.treat, sun: drawn.sun, meeple: null, tako: null });
  }

  function catFace(catIdx, pose, cls) {
    var p = POSE[pose || 'idle'];
    var url = 'images/cat-' + CATS[catIdx].id + (p.relax ? '-relax' : '') + '.png';
    return '<span class="nn-face ' + (cls || '') + '" style="background-image:url(\'' + url + '\');background-position:' + (p.c * 50) + '% ' + (p.r * 50) + '%"></span>';
  }

  /* ---- 画面の 状態 ---- */
  var game = null;
  var setup = {
    seats: [{ cat: 0, mode: 'human' }, { cat: 1, mode: 'cpu' }, { cat: 2, mode: 'cpu' }, { cat: 3, mode: 'off' }],
    short: false
  };
  var rulesOpen = false;
  var zoom = 1;
  var aiTimer = null;
  var boardScroll = null;
  var wantCenter = false;

  function isAiTurn() {
    return !!game && game.phase === 'playing' && !game.players[game.current].human;
  }

  function render() {
    var root = document.getElementById('app');
    var wrap = root.querySelector('.nn-board-wrap');
    if (wrap) boardScroll = { left: wrap.scrollLeft, top: wrap.scrollTop };

    if (!game) { root.innerHTML = renderSetup() + (rulesOpen ? renderRules() : ''); return; }

    root.innerHTML =
      '<div class="nn-stage">' +
      renderTop() +
      renderScoreboard() +
      (game.phase === 'playing' ? renderStatus() + renderPanel() : '') +
      (game.phase === 'viewing' ? '<div class="nn-panel"><button type="button" class="nn-btn nn-btn--go" data-action="again">もういちど あそぶ</button></div>' : '') +
      renderBoard() +
      renderLog() +
      '</div>' +
      (game.phase === 'gameover' ? renderGameOver() : '') +
      (rulesOpen ? renderRules() : '');

    var w = root.querySelector('.nn-board-wrap');
    if (w) {
      if (wantCenter && game.lastCoord) {
        var el = document.getElementById('cell-' + game.lastCoord.replace(',', '_'));
        if (el) {
          w.scrollLeft = el.offsetLeft - w.clientWidth / 2 + el.offsetWidth / 2;
          w.scrollTop = el.offsetTop - w.clientHeight / 2 + el.offsetHeight / 2;
        }
        wantCenter = false;
      } else if (boardScroll) {
        w.scrollLeft = boardScroll.left;
        w.scrollTop = boardScroll.top;
      }
    }
    scheduleAi();
  }

  function renderTop() {
    return '<header class="nn-top">' +
      '<a class="nn-top__back" href="index.html">‹ タイトル</a>' +
      '<h1 class="nn-top__title">ネコネソンヌ</h1>' +
      '<button type="button" class="nn-top__btn" data-action="rules" aria-label="あそびかた">？</button>' +
      '</header>';
  }

  function renderSetup() {
    var active = setup.seats.filter(function (s) { return s.mode !== 'off'; }).length;
    var rows = setup.seats.map(function (s, i) {
      var modes = [['human', 'ひと'], ['cpu', 'CPU']];
      if (i >= 1) modes.push(['off', 'なし']);
      return '<div class="nn-seat' + (s.mode === 'off' ? ' is-off' : '') + '" style="--pc:' + CATS[s.cat].color + '">' +
        catFace(s.cat, s.mode === 'off' ? 'loaf' : 'idle', 'nn-seat__face') +
        '<span class="nn-seat__name">' + CATS[s.cat].name + '</span>' +
        '<span class="nn-seat__modes">' + modes.map(function (m) {
          return '<button type="button" class="nn-chip' + (s.mode === m[0] ? ' is-on' : '') + '" data-action="seat" data-seat="' + i + '" data-mode="' + m[0] + '">' + m[1] + '</button>';
        }).join('') + '</span></div>';
    }).join('');
    return '<div class="nn-stage nn-setup">' +
      renderTop() +
      '<div class="nn-hero">' +
      '<div class="nn-hero__cats">' + [0, 1, 2, 3].map(function (i) { return catFace(i, ['idle', 'loaf', 'happy', 'walk'][i], 'nn-hero__cat'); }).join('') + '</div>' +
      '<p class="nn-hero__lead">タイルを つないで 猫街を つくり、<br>ねこを おいて 点を あつめよう。</p>' +
      '<ul class="nn-hero__points">' +
      '<li>🐾 <b>きまぐれ</b>：おいた ねこは かってに うごく</li>' +
      '<li>🐙 <b>タコ大王</b>：よぶと まわりの ねこが にげだす</li>' +
      '<li>☀ <b>きもちいい 場所</b>：ひなた・おやつ・えんがわは 点が 高い</li>' +
      '</ul></div>' +
      '<section class="nn-card">' +
      '<h2 class="nn-card__title">だれが あそぶ？（2〜4人）</h2>' + rows +
      '<h2 class="nn-card__title">ながさ</h2>' +
      '<div class="nn-seat__modes nn-len">' +
      '<button type="button" class="nn-chip' + (!setup.short ? ' is-on' : '') + '" data-action="len" data-short="0">ふつう（71まい）</button>' +
      '<button type="button" class="nn-chip' + (setup.short ? ' is-on' : '') + '" data-action="len" data-short="1">みじかめ（40まい）</button>' +
      '</div>' +
      '<button type="button" class="nn-btn nn-btn--go" data-action="start"' + (active < 2 ? ' disabled' : '') + '>あそぶ</button>' +
      '</section></div>';
  }

  function renderScoreboard() {
    return '<div class="nn-score">' + game.players.map(function (p, i) {
      var cur = i === game.current && game.phase === 'playing';
      return '<div class="nn-pl' + (cur ? ' is-current' : '') + '" style="--pc:' + CATS[p.cat].color + '">' +
        catFace(p.cat, cur ? 'happy' : 'idle', 'nn-pl__face') +
        '<span class="nn-pl__body"><span class="nn-pl__name">' + esc(pname(game, i)) + '</span>' +
        '<span class="nn-pl__pts">' + p.score + '<small>点</small></span>' +
        '<span class="nn-pl__left">🐾' + p.catsLeft + ' 🐙' + p.takoLeft + '</span></span></div>';
    }).join('') + '</div>';
  }

  function renderStatus() {
    var name = pname(game, game.current);
    var text;
    if (isAiTurn()) text = name + 'の ばん … かんがえちゅう';
    else if (game.pending) text = name + 'の ばん：ねこを おく？';
    else text = name + 'の ばん：タイルを おいてね';
    return '<p class="nn-status" style="--pc:' + catOf(game, game.current).color + '">' + esc(text) + '</p>';
  }

  function renderPanel() {
    if (isAiTurn()) {
      return '<div class="nn-panel">' +
        (game.drawn ? '<div class="nn-panel__tile">' + previewSVG(game.drawn, game.rotation) + '</div>' : '') +
        '<p class="nn-panel__hint">のこり ' + (game.deck.length + (game.drawn ? 1 : 0)) + 'まい</p></div>';
    }
    if (game.pending) {
      var p = game.players[game.current];
      var opts = claimableOptions(game, game.pending.ck);
      var tile = game.board.get(game.pending.ck);
      var blocked = inTakoZone(game, tile.x, tile.y);
      var btns = opts.map(function (f, i) {
        return '<button type="button" class="nn-btn nn-btn--cat" data-action="cat" data-i="' + i + '"' + (p.catsLeft <= 0 ? ' disabled' : '') + '>' +
          catFace(p.cat, 'idle', 'nn-btn__face') + featureLabel(f) + 'に おく</button>';
      }).join('');
      if (blocked) btns += '<p class="nn-panel__hint is-warn">タコ大王の ちかくには ねこが こわがって おけない</p>';
      btns += '<button type="button" class="nn-btn nn-btn--tako" data-action="tako"' + (p.takoLeft <= 0 ? ' disabled' : '') + '>🐙 タコ大王を よぶ（のこり' + p.takoLeft + '）</button>';
      btns += '<button type="button" class="nn-btn nn-btn--sub" data-action="skip">なにも しない</button>';
      return '<div class="nn-panel nn-panel--act">' + btns + '</div>';
    }
    if (!game.drawn) return '';
    var any = anyValidAnyRotation(game);
    var here = anyValid(game, game.rotation);
    var hint = !any ? '<p class="nn-panel__hint is-warn">どの むきでも おけない…すてるしか ない</p>'
      : !here ? '<p class="nn-panel__hint">この むきでは おけない。まわしてみて</p>'
      : '<p class="nn-panel__hint">きいろい わくに タップで おく</p>';
    var tags = [];
    if (game.drawn.sun) tags.push('☀ひなた');
    if (game.drawn.treat) tags.push('🐟おやつ');
    if (game.drawn.engawa) tags.push('えんがわ');
    return '<div class="nn-panel">' +
      '<button type="button" class="nn-panel__tile" data-action="rotate" aria-label="まわす">' + previewSVG(game.drawn, game.rotation) + '</button>' +
      '<div class="nn-panel__info">' +
      '<p class="nn-panel__hint">のこり ' + (game.deck.length + 1) + 'まい' + (tags.length ? '　' + tags.join(' ') : '') + '</p>' +
      hint +
      '<div class="nn-panel__row">' +
      '<button type="button" class="nn-btn nn-btn--small" data-action="rotate">↻ まわす</button>' +
      (!any ? '<button type="button" class="nn-btn nn-btn--small nn-btn--sub" data-action="discard">すてる</button>' : '') +
      '</div></div></div>';
  }

  function renderBoard() {
    var coords = Array.from(game.board.keys()).map(parseKey);
    var xs = coords.map(function (c) { return c[0]; }), ys = coords.map(function (c) { return c[1]; });
    var minX = Math.min.apply(null, xs) - 1, maxX = Math.max.apply(null, xs) + 1;
    var minY = Math.min.apply(null, ys) - 1, maxY = Math.max.apply(null, ys) + 1;

    var valid = {}, any = {};
    if (game.phase === 'playing' && game.drawn && !game.pending && !isAiTurn()) {
      var edges = currentEdges(game);
      computeFrontier(game.board).forEach(function (c) {
        var k = key(c[0], c[1]);
        any[k] = true;
        if (isValidPlacement(game.board, c[0], c[1], edges)) valid[k] = true;
      });
    }
    var cells = '';
    for (var y = minY; y <= maxY; y++) {
      for (var x = minX; x <= maxX; x++) {
        var k = key(x, y);
        var t = game.board.get(k);
        var zone = inTakoZone(game, x, y) ? ' is-tako-zone' : '';
        if (t) {
          var cls = 'nn-cell is-tile' + zone;
          if (k === game.lastCoord) cls += ' is-last';
          if (game.moved[k]) cls += ' is-' + game.moved[k];
          if (game.pending && game.pending.ck === k) cls += ' is-pending';
          cells += '<div class="' + cls + '" id="cell-' + k.replace(',', '_') + '">' + tileSVG(t) + '</div>';
        } else if (valid[k]) {
          cells += '<button type="button" class="nn-cell is-valid" data-action="place" data-x="' + x + '" data-y="' + y + '" aria-label="ここに おく"></button>';
        } else if (any[k]) {
          cells += '<div class="nn-cell is-invalid"></div>';
        } else {
          cells += '<div class="nn-cell"></div>';
        }
      }
    }
    return '<div class="nn-board-box">' +
      '<div class="nn-zoom">' +
      '<button type="button" class="nn-zoom__btn" data-action="zoom" data-d="-1" aria-label="ちいさく">－</button>' +
      '<button type="button" class="nn-zoom__btn" data-action="zoom" data-d="1" aria-label="おおきく">＋</button>' +
      '</div>' +
      '<div class="nn-board-wrap"><div class="nn-board" style="--zoom:' + zoom + ';grid-template-columns:repeat(' + (maxX - minX + 1) + ',var(--cell))">' + cells + '</div></div></div>';
  }

  function renderLog() {
    if (!game.log.length) return '';
    return '<ul class="nn-log">' + game.log.slice(0, 5).map(function (l) {
      return '<li class="is-' + l.kind + '">' + esc(l.text) + '</li>';
    }).join('') + '</ul>';
  }

  function renderGameOver() {
    var rows = game.standings.map(function (s, rank) {
      return '<div class="nn-final__row' + (s.win ? ' is-win' : '') + '" style="--pc:' + CATS[s.p.cat].color + '">' +
        '<span class="nn-final__rank">' + (rank + 1) + '</span>' +
        catFace(s.p.cat, s.win ? 'celebrate' : 'idle', 'nn-final__face') +
        '<span class="nn-final__name">' + esc(pname(game, s.p.index)) + (s.win ? ' 👑' : '') + '</span>' +
        '<span class="nn-final__pts">' + s.p.score + '点</span></div>';
    }).join('');
    var winners = game.standings.filter(function (s) { return s.win; }).map(function (s) { return pname(game, s.p.index); }).join('・');
    return '<div class="nn-overlay"><div class="nn-modal">' +
      '<h2 class="nn-modal__title">おしまい！</h2>' +
      '<p class="nn-modal__sub">' + esc(winners) + 'の かち</p>' +
      '<div class="nn-final">' + rows + '</div>' +
      '<p class="nn-modal__note">みかんせいの おうち・ねこみち・えんがわも 点に なったよ</p>' +
      '<button type="button" class="nn-btn nn-btn--go" data-action="again">もういちど</button>' +
      '<button type="button" class="nn-btn nn-btn--sub" data-action="close-over">盤面を みる</button>' +
      '</div></div>';
  }

  function renderRules() {
    return '<div class="nn-overlay" data-action="close-rules"><div class="nn-modal nn-rules" data-action="noop">' +
      '<div class="nn-modal__head"><h2 class="nn-modal__title">あそびかた</h2>' +
      '<button type="button" class="nn-modal__close" data-action="close-rules" aria-label="とじる">✕</button></div>' +
      '<ol>' +
      '<li>じぶんの ばんに タイルを 1まい ひく。「まわす」で むきを かえて、<b>きいろい わく</b>に おく（となりと みち・おうち・くさはらが つながる ように）。</li>' +
      '<li>おいた タイルの <b>おうち・ねこみち・えんがわ</b> に じぶんの ねこを 1ぴき おける（ほかの ねこが いる ところには おけない）。かわりに <b>タコ大王</b>を よんでも よい。</li>' +
      '<li>おうち・ねこみちが とじて <b>かんせい</b> すると、ねこが いちばん 多い 人が 点を もらい、ねこは 手もとに もどる。</li>' +
      '<li>タイルが なくなったら おしまい。みかんせいの ところも 点に なる。</li>' +
      '</ol>' +
      '<h3>ねこの ギミック</h3>' +
      '<dl>' +
      '<dt>🐾 きまぐれ</dt><dd>ターンの おわりに ときどき、どこかの ねこ 1ぴきが となりの タイルへ ぶらりと うごく。ひなた・おやつ・えんがわが すき。<b>きもちいい 場所に いる ねこは うごかない</b>。</dd>' +
      '<dt>🐙 タコ大王</dt><dd>ひとり 2回。いま おいた タイルに よぶと、まわり 8マスの ねこ（じぶんの ねこも！）が びっくりして ちかくの あいてる 場所へ にげる（なければ 手もとへ かえる）。1周 するまで まわりには ねこを おけない。</dd>' +
      '<dt>☀ きもちいい 場所</dt><dd>☀ひなたの タイルは 1まい +1点。🐟おやつの おうちは 1つ +2点。えんがわは まわり 8マスが うまると 9点。</dd>' +
      '</dl>' +
      '<h3>点数</h3>' +
      '<ul>' +
      '<li>おうち：かんせい 2点×タイル（🐟 +2）、みかんせいは はんぶん</li>' +
      '<li>ねこみち：1点×タイル</li>' +
      '<li>えんがわ：かんせい 9点、みかんせいは うまった マスの かず</li>' +
      '<li>☀ひなた：ふくまれる タイル 1まいにつき +1</li>' +
      '</ul>' +
      '</div></div>';
  }

  /* =========================================================
     そうさ
     ========================================================= */

  function startGame() {
    var seats = setup.seats.filter(function (s) { return s.mode !== 'off'; }).map(function (s) { return { cat: s.cat, human: s.mode === 'human' }; });
    if (seats.length < 2) return;
    clearAi();
    toasts = [];
    renderToasts();
    game = newGame(seats, setup.short);
    var res = applyTile(game, 0, 0, START_TILE.edges.slice(), START_TILE);
    checkCompletions(game, res, 0, 0);
    game.lastCoord = '0,0';
    wantCenter = true;
    boardScroll = null;
    startTurn(game);
    render();
  }

  function doPlace(x, y) {
    if (!game.drawn || game.pending) return;
    var edges = currentEdges(game);
    if (!isValidPlacement(game.board, x, y, edges)) return;
    game.moved = {};
    var res = applyTile(game, x, y, edges, game.drawn);
    game.lastCoord = res.ck;
    game.drawn = null;
    var p = game.players[game.current];
    var canCat = p.catsLeft > 0 && claimableOptions(game, res.ck).length > 0;
    if (canCat || p.takoLeft > 0) {
      game.pending = res;
    } else {
      checkCompletions(game, res, x, y);
      endTurn(game);
    }
    render();
  }

  function finishPending() {
    var res = game.pending;
    var xy = parseKey(res.ck);
    game.pending = null;
    checkCompletions(game, res, xy[0], xy[1]);
    endTurn(game);
    render();
  }

  function doCat(i) {
    if (!game.pending) return;
    var f = claimableOptions(game, game.pending.ck)[i];
    if (!f) return;
    placeCat(game, f);
    finishPending();
  }

  function doTako() {
    if (!game.pending || game.players[game.current].takoLeft <= 0) return;
    placeTako(game, game.pending.ck, false);
    finishPending();
  }

  function doDiscard() {
    if (!game.drawn || anyValidAnyRotation(game)) return;
    game.moved = {};
    say(game, pname(game, game.current) + '：おけない タイルを すてた', '');
    game.drawn = null;
    endTurn(game);
    render();
  }

  function clearAi() { if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; } }

  function scheduleAi() {
    if (!isAiTurn() || aiTimer) return;
    aiTimer = setTimeout(function () {
      aiTimer = null;
      if (!isAiTurn()) return;
      if (game.pending) {
        var ai = game.current;
        simulating = true;
        var act = bestActionScore(game, game.pending, ai).action;
        simulating = false;
        if (!act) finishPending();
        else if (act.tako) doTako();
        else {
          var opts = claimableOptions(game, game.pending.ck);
          var idx = -1;
          opts.forEach(function (f, i) { if (f.type === act.cat.type && f.dir === act.cat.dir) idx = i; });
          if (idx >= 0) doCat(idx); else finishPending();
        }
        return;
      }
      if (!game.drawn) return;
      if (!anyValidAnyRotation(game)) {
        game.moved = {};
        say(game, pname(game, game.current) + '：おけない タイルを すてた', '');
        game.drawn = null;
        endTurn(game);
        render();
        return;
      }
      var c = chooseAiPlacement(game);
      game.rotation = c.rotation;
      wantCenter = true;
      doPlace(c.x, c.y);
    }, game.pending ? 650 : 900);
  }

  document.getElementById('app').addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var a = el.dataset.action;
    if (a === 'noop') return;
    if (a === 'close-rules') { rulesOpen = false; render(); return; }
    if (a === 'rules') { rulesOpen = true; render(); return; }
    if (a === 'zoom') { zoom = Math.max(0.6, Math.min(1.6, zoom + Number(el.dataset.d) * 0.2)); render(); return; }
    if (a === 'seat') {
      setup.seats[Number(el.dataset.seat)].mode = el.dataset.mode;
      render(); return;
    }
    if (a === 'len') { setup.short = el.dataset.short === '1'; render(); return; }
    if (a === 'start') { startGame(); return; }
    if (a === 'again') { clearAi(); game = null; render(); return; }
    if (a === 'close-over') { game.phase = 'viewing'; render(); return; }
    if (!game || isAiTurn()) return;
    if (a === 'rotate' && game.drawn && !game.pending) { game.rotation = (game.rotation + 90) % 360; render(); }
    else if (a === 'place') doPlace(Number(el.dataset.x), Number(el.dataset.y));
    else if (a === 'discard') doDiscard();
    else if (a === 'cat') doCat(Number(el.dataset.i));
    else if (a === 'tako') doTako();
    else if (a === 'skip') { if (game.pending) finishPending(); }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && rulesOpen) { rulesOpen = false; render(); }
    if ((e.key === 'r' || e.key === 'R') && game && game.phase === 'playing' && game.drawn && !game.pending && !isAiTurn()) {
      game.rotation = (game.rotation + 90) % 360; render();
    }
  });

  /* テスト用に ルールの 関数だけ 外から さわれる ように */
  window.NekoNesonne = {
    newGame: newGame, applyTile: applyTile, checkCompletions: checkCompletions, claimableOptions: claimableOptions,
    placeCat: placeCat, placeTako: placeTako, wanderCandidates: wanderCandidates, groupPoints: groupPoints,
    finalizeScoring: finalizeScoring, featuresOnTile: featuresOnTile, getGame: function () { return game; }
  };

  render();
})();
