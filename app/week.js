/* =========================================================
   猫街ろまん 〜Cat city Romance〜（一週間モード）  ―  ゲームの すすめかた
   ・飼い主（4人）と ねこ（4柄）を えらんで、月〜日の 7日を すごす
   ・1日は あさ → 授業（土日は 大会・おでかけ）→ ほうかご → よる の 4つ
   ・どの じかんも ミニゲームで てんすうが 入り、7日の ごうけいが ハイスコア
   ・バックエンドなし／LocalStorage に ほぞん。操作は シングルタップだけ
   台本と 数値は week-data.js
   ========================================================= */
'use strict';

/* ---------------------------------------------------------
   1. ほぞん（LocalStorage）
   --------------------------------------------------------- */
var WEEK_SAVE_KEY = 'nekochan-week-v1';
var CARE_SAVE_KEY = 'nekochan-save-v1';   /* お世話モードの ねこの 柄を はじめの えらびに つかう */

var SLOTS = ['あさ', 'ひる', 'ほうかご', 'よる'];
var CATEGORIES = [
  { key: 'neko',   label: 'ねこと なかよし', icon: '🐾' },
  { key: 'gakkou', label: 'がっこう',        icon: '📚' },
  { key: 'tomo',   label: 'ともだち',        icon: '🤝' },
  { key: 'baito',  label: 'バイト',          icon: '🐟' }
];

function emptySave() {
  return { run: null, best: null, combos: {}, plays: 0, names: {} };
}

function loadWeekSave() {
  try {
    var raw = window.localStorage.getItem(WEEK_SAVE_KEY);
    if (!raw) { return emptySave(); }
    var data = JSON.parse(raw);
    var save = emptySave();
    if (data && typeof data === 'object') {
      if (validRun(data.run)) { save.run = data.run; }
      if (data.best && typeof data.best.total === 'number') { save.best = data.best; }
      if (data.combos && typeof data.combos === 'object') {
        Object.keys(data.combos).forEach(function (k) {
          if (typeof data.combos[k] === 'number' && isFinite(data.combos[k])) { save.combos[k] = data.combos[k]; }
        });
      }
      if (typeof data.plays === 'number') { save.plays = data.plays; }
      if (data.names && typeof data.names === 'object') {
        Object.keys(data.names).forEach(function (k) {
          if (WEEK.cats[k] && typeof data.names[k] === 'string') { save.names[k] = cleanName(data.names[k]); }
        });
      }
    }
    return save;
  } catch (e) {
    return emptySave();
  }
}

/* 曜日の ならびを かえたら 上げる（ちがう ならびの とちゅう セーブは つかわない） */
var RUN_VERSION = 2;

function validRun(r) {
  return !!(r && typeof r === 'object' && r.version === RUN_VERSION && WEEK.owners[r.owner] && WEEK.cats[r.cat] &&
    typeof r.day === 'number' && r.day >= 0 && r.day < WEEK.days.length &&
    typeof r.slot === 'number' && r.slot >= 0 && r.slot < SLOTS.length &&
    r.score && typeof r.score === 'object');
}

function writeWeekSave() {
  try { window.localStorage.setItem(WEEK_SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ほぞん できなくても あそべる */ }
}

function careCatPattern() {
  try {
    var data = JSON.parse(window.localStorage.getItem(CARE_SAVE_KEY) || '{}');
    return WEEK.cats[data.catPattern] ? data.catPattern : '';
  } catch (e) { return ''; }
}

var save = loadWeekSave();
var run = null;     /* いま あそんでいる 1しゅうかん */

function newRun(owner, cat) {
  var friendCount = {};
  WEEK.ownerOrder.forEach(function (k) { if (k !== owner) { friendCount[k] = 0; } });
  return {
    version: RUN_VERSION,
    owner: owner, cat: cat, day: 0, slot: 0,
    item: null,         /* 日曜の かいもので 手に 入れた アイテム（WEEK.items の キー） */
    score: { neko: 0, gakkou: 0, tomo: 0, baito: 0 },
    friendCount: friendCount,
    dayScores: [0, 0, 0, 0, 0, 0, 0],
    seenPrologue: false,
    schedule: makeSchedule(),
    nightOrder: makeNightOrder()
  };
}

/** 月〜木の 授業の じゅんばん（1しゅうかんごとに ランダム） */
function makeSchedule() {
  return shuffle(Object.keys(WEEK.subjects));
}

/** 7日ぶんの 夜の あそび（ぜんぶ まんべんなく、同じ ものが 2日 つづかない） */
function makeNightOrder() {
  var out = [];
  while (out.length < WEEK.days.length) {
    var set = shuffle(WEEK.nightGames);
    if (out.length && set[0] === out[out.length - 1]) { set.push(set.shift()); }
    out = out.concat(set);
  }
  return out.slice(0, WEEK.days.length);
}

/** むかしの ほぞんに ない ものを おぎなう */
function upgradeRun(r) {
  if (!Array.isArray(r.schedule) || r.schedule.length !== Object.keys(WEEK.subjects).length) { r.schedule = makeSchedule(); }
  if (!Array.isArray(r.nightOrder) || r.nightOrder.length !== WEEK.days.length) { r.nightOrder = makeNightOrder(); }
  return r;
}

/** その日の 時間の よびかた（日曜の「ごご」、土曜の「大会」など） */
function slotName(r, slot) {
  var names = WEEK.days[r.day].names;
  return (names && names[slot]) || SLOTS[slot];
}

/** その日に ある 時間の かず（土曜は 2つ） */
function daySlots(d) {
  return WEEK.days[d].slots || SLOTS.length;
}

/* ---------- ねこの なまえ ---------- */
var NAME_MAX = 8;   /* なまえの 長さの 上限（文字） */
var NAME_IDEAS = ['タマ', 'ミケ', 'モモ', 'ソラ', 'きなこ', 'こむぎ', 'ちゃちゃ', 'おもち'];

/** 入力された なまえを ととのえる（前後の 空白・改行を とり、長すぎたら 切る） */
function cleanName(text) {
  var t = String(text || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return Array.from(t).slice(0, NAME_MAX).join('');
}

/** その 1しゅうかんの ねこの なまえ（つけて いなければ 柄の なまえ） */
function catName(r) {
  return (r && r.catName) || WEEK.cats[r.cat].name;
}

function runTotal(r) {
  return CATEGORIES.reduce(function (sum, c) { return sum + (r.score[c.key] || 0); }, 0);
}

/* ---------------------------------------------------------
   2. ちいさな 道具
   --------------------------------------------------------- */
function $(id) { return document.getElementById(id); }

function mk(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) { e.className = cls; }
  if (text != null) { e.textContent = text; }
  return e;
}

function shuffle(list) {
  var a = list.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

function rand(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

/** {me} {cat} を おきかえる */
function fill(text) {
  if (!run) { return text; }
  return String(text)
    .replace(/\{me\}/g, WEEK.owners[run.owner].name)
    .replace(/\{cat\}/g, catName(run));
}

/** 画像は 読めた ときだけ つかう */
var imgCache = {};
function loadImage(url, cb) {
  if (!url) { cb(false); return; }
  var st = imgCache[url];
  if (st === true || st === false) { cb(st); return; }
  if (Array.isArray(st)) { st.push(cb); return; }
  imgCache[url] = [cb];
  var img = new Image();
  var done = function (ok) {
    var waiters = imgCache[url];
    imgCache[url] = ok;
    waiters.forEach(function (fn) { fn(ok); });
  };
  img.onload = function () { done(img.naturalWidth > 0); };
  img.onerror = function () { done(false); };
  img.src = url;
}

/* ---------- 小物の 絵（3×3の シートの 1マス） ----------
   pic … { sheet: 'goods' | 'items' | …, cell: [たて, よこ], emoji: 読めない ときの 絵文字 } */
var PIC = {
  ball:     { sheet: 'goods', cell: [0, 0], emoji: '🎾' },
  box:      { sheet: 'goods', cell: [0, 1], emoji: '📦' },
  boxOpen:  { sheet: 'goods', cell: [0, 2], emoji: '📦' },
  softball: { sheet: 'goods', cell: [1, 0], emoji: '⚾' },
  fluffy:   { sheet: 'goods', cell: [2, 1], emoji: '🪶' },
  bag:      { sheet: 'goods', cell: [2, 2], emoji: '🛍️' },
  yarn:     { sheet: 'items', cell: [0, 1], emoji: '🧶' },   /* 部屋の 小物から 流用 */
  jarashi:  { sheet: 'items', cell: [1, 2], emoji: '🪶' },
  mouse:    { sheet: 'items', cell: [2, 2], emoji: '🐭' }
};

/** el に 小物の 絵を つける（読めるまでは 絵文字） */
function setPic(el, pic) {
  var url = 'images/' + pic.sheet + '.png';
  el.textContent = pic.emoji;
  el.dataset.pic = url + pic.cell.join(',');
  loadImage(url, function (ok) {
    if (!ok || el.dataset.pic !== url + pic.cell.join(',')) { return; }
    el.textContent = '';
    el.classList.add('is-pic');
    el.style.backgroundImage = 'url("' + url + '")';
    el.style.backgroundPosition = (pic.cell[1] * 50) + '% ' + (pic.cell[0] * 50) + '%';
  });
  return el;
}

/** ボタンの 中に 置く 絵（ボタンの 背景色や ふちを そのまま 生かせる） */
function picIn(pic) {
  var span = mk('span', 'wk-picin');
  span.setAttribute('aria-hidden', 'true');
  return setPic(span, pic);
}

function clearPic(el) {
  el.dataset.pic = '';
  el.classList.remove('is-pic');
  el.style.backgroundImage = '';
}

/** アイテムの 絵 */
function itemPic(item) {
  return { sheet: 'goods', cell: item.cell, emoji: item.icon };
}

function faceUrl(key, face) {
  if (WEEK.guests[key]) { return WEEK.guests[key].image; }
  return 'images/people/' + key + '-' + (WEEK.faces.indexOf(face) >= 0 ? face : 'normal') + '.png';
}

function personName(key) {
  if (WEEK.owners[key]) { return WEEK.owners[key].name; }
  if (WEEK.guests[key]) { return WEEK.guests[key].name; }
  return '';
}

function personColor(key) {
  if (WEEK.owners[key]) { return WEEK.owners[key].color; }
  if (WEEK.guests[key]) { return WEEK.guests[key].color; }
  return '#444c55';
}

/** 飼い主 いがいの 3人 */
function others() {
  return WEEK.ownerOrder.filter(function (k) { return k !== run.owner; });
}

/** その日の ともだち（授業の まえに 話しかけて くる 人） */
function friendOfDay(day) {
  var list = others();
  return list[day % list.length];
}

/** いちばん なかの いい ともだち（同じなら その日の 人） */
function topFriend() {
  var best = null;
  others().forEach(function (k) {
    if (best === null || run.friendCount[k] > run.friendCount[best]) { best = k; }
  });
  return run.friendCount[best] > 0 ? best : friendOfDay(run.day);
}

/* ---------------------------------------------------------
   3. 画面の ぶひん
   --------------------------------------------------------- */
var ui = {};

function cacheUi() {
  ['wkHeader', 'wkDays', 'wkTime', 'wkScore', 'wkStage', 'wkBg', 'wkFigLeft', 'wkFigRight',
   'wkCat', 'wkArena', 'wkBottom', 'wkWindow', 'wkName', 'wkText', 'wkPanel'].forEach(function (id) {
    ui[id] = $(id);
  });
}

function setBg(key) {
  var bg = WEEK.backgrounds[key] || WEEK.backgrounds.home;
  var layer = ui.wkBg;
  layer.style.backgroundColor = bg.color;
  layer.style.backgroundImage = '';
  layer.style.backgroundPosition = bg.pos || 'center';
  layer.classList.toggle('is-chalk', !!bg.chalk);
  layer.classList.toggle('is-dark', !!bg.dark);
  layer.dataset.bg = key;
  layer.classList.toggle('is-title', key === 'title');
  if (bg.image) {
    loadImage(bg.image, function (ok) {
      if (ok && layer.dataset.bg === key) { layer.style.backgroundImage = 'url("' + bg.image + '")'; }
    });
  }
}

/** 立ち絵（side: 'left' / 'right'。key が null なら けす） */
function setFigure(side, key, face) {
  var box = side === 'left' ? ui.wkFigLeft : ui.wkFigRight;
  if (!key) {
    box.classList.remove('is-shown');
    box.dataset.key = '';
    return;
  }
  var url = faceUrl(key, face);
  if (side === 'right') { ui.wkCat.hidden = true; }   /* 右は 立ち絵か ねこの どちらか 1つ */
  box.classList.add('is-shown');
  if (box.dataset.key === key && box.dataset.url === url) { return; }
  box.dataset.key = key;
  box.dataset.url = url;
  box.textContent = '';
  box.style.backgroundImage = '';
  box.classList.remove('is-image');
  var tag = mk('span', 'wk-fig__tag', personName(key));
  tag.style.background = personColor(key);
  box.appendChild(tag);
  loadImage(url, function (ok) {
    if (!ok || box.dataset.url !== url) { return; }
    box.style.backgroundImage = 'url("' + url + '")';
    box.classList.add('is-image');
  });
}

function setSpeaking(side) {
  ui.wkFigLeft.classList.toggle('is-dim', side === 'right');
  ui.wkFigRight.classList.toggle('is-dim', side === 'left');
}

var POSES = ['idle', 'happy', 'eating', 'morning', 'noon', 'night', 'welcome', 'celebrate', 'thinking'];

/** ねこ（pose が null なら かくす） */
function setCat(pose) {
  var c = ui.wkCat;
  if (!pose) { c.hidden = true; return; }
  setFigure('right', null);   /* ねこは 右に 立つので、右の 立ち絵は さげる */
  c.hidden = false;
  POSES.forEach(function (p) { c.classList.remove('is-pose-' + p); });
  c.classList.add('is-pose-' + (POSES.indexOf(pose) >= 0 ? pose : 'idle'));
  var url = 'images/' + run.cat + '.png';
  if (c.dataset.url !== url) {
    c.dataset.url = url;
    c.classList.remove('is-image');
    c.textContent = '🐈';
    loadImage(url, function (ok) {
      if (!ok || c.dataset.url !== url) { return; }
      c.style.setProperty('--cat-image', 'url("' + url + '")');
      c.classList.add('is-image');
      c.textContent = '';
    });
  }
}

function catBounce() {
  ui.wkCat.classList.remove('is-bounce');
  void ui.wkCat.offsetWidth;
  ui.wkCat.classList.add('is-bounce');
}

function updateHeader() {
  if (!run) { ui.wkHeader.hidden = true; return; }
  ui.wkHeader.hidden = false;
  ui.wkDays.textContent = '';
  WEEK.days.forEach(function (d, i) {
    var chip = mk('span', 'wk-day', d.short);
    if (i < run.day) { chip.classList.add('is-done'); }
    if (i === run.day) { chip.classList.add('is-today'); }
    if (d.holiday) { chip.classList.add('is-holiday'); }
    ui.wkDays.appendChild(chip);
  });
  var item = run.item && WEEK.items[run.item];
  ui.wkTime.textContent = WEEK.days[run.day].label + '・' + slotName(run, run.slot) + (item ? '  ' + item.icon : '');
  ui.wkScore.textContent = fmt(runTotal(run));
}

/** したの パネルを 入れかえる */
function panel(cls) {
  ui.wkWindow.hidden = true;
  ui.wkPanel.hidden = false;
  ui.wkPanel.className = 'wk-panel' + (cls ? ' ' + cls : '');
  document.body.classList.toggle('is-title', /(^| )is-title( |$)/.test(cls || ''));
  ui.wkPanel.textContent = '';
  return ui.wkPanel;
}

function button(parent, cls, icon, text, sub, onClick) {
  var b = mk('button', 'wk-btn ' + (cls || ''));
  b.type = 'button';
  if (icon) { var i = mk('span', 'wk-btn__icon', icon); i.setAttribute('aria-hidden', 'true'); b.appendChild(i); }
  b.appendChild(mk('span', 'wk-btn__text', text));
  if (sub) { b.appendChild(mk('span', 'wk-btn__sub', sub)); }
  var used = false;
  b.addEventListener('click', function () {
    if (used) { return; }
    used = true;
    onClick();
  });
  parent.appendChild(b);
  return b;
}

/* ---------------------------------------------------------
   4. 台詞（まどを タップで すすむ）
   --------------------------------------------------------- */
var sceneFriend = null;   /* その 場面の 'friend' */
var schoolTalk = 'announce';   /* 授業まえの 台詞の しゅるい（week-data.js の friends.*.school） */

function lineText(line) {
  var t = line.text || '';
  if (t.charAt(0) !== '@') { return fill(t); }
  var key = t.slice(1);
  if (line.who === 'me') { return fill(WEEK.owners[run.owner].lines[key] || ''); }
  if (line.who === 'friend' && key === 'school') { return fill(WEEK.friends[sceneFriend].school[schoolTalk] || ''); }
  return '';
}

function say(lines, done) {
  var i = -1;
  ui.wkPanel.hidden = true;
  ui.wkWindow.hidden = false;
  function next() {
    i++;
    if (i >= lines.length) {
      ui.wkWindow.onclick = null;
      ui.wkWindow.hidden = true;
      setSpeaking(null);
      done();
      return;
    }
    var line = lines[i];
    if (line.bg) { setBg(line.bg); }
    if (line.cat !== undefined) { setCat(line.cat); }
    var who = line.who || null;
    var name = '';
    if (who === 'me') {
      setFigure('left', run.owner, line.face || 'normal');
      setSpeaking('left');
      name = personName(run.owner);
    } else if (who === 'friend' || WEEK.guests[who]) {
      var key = who === 'friend' ? sceneFriend : who;
      setFigure('right', key, line.face || (who === 'friend' ? 'happy' : 'normal'));
      setSpeaking('right');
      name = personName(key);
    } else if (who === 'cat') {
      setCat(line.pose || 'idle');
      catBounce();
      setSpeaking(null);
      name = catName(run);
    } else {
      setSpeaking(null);
    }
    ui.wkName.textContent = name;
    ui.wkName.hidden = !name;
    ui.wkName.style.background = who === 'me' ? personColor(run.owner)
      : (who === 'friend' ? personColor(sceneFriend) : (WEEK.guests[who] ? personColor(who) : '#8a5a2b'));
    ui.wkText.textContent = lineText(line);
    ui.wkWindow.classList.remove('is-in');
    void ui.wkWindow.offsetWidth;
    ui.wkWindow.classList.add('is-in');
  }
  ui.wkWindow.onclick = next;
  next();
  try { ui.wkWindow.focus({ preventScroll: true }); } catch (e) { /* なにもしない */ }
}

/* ---------------------------------------------------------
   5. もんだいを つくる
   --------------------------------------------------------- */
var KOTOBA = (typeof QUESTIONS !== 'undefined' && Array.isArray(QUESTIONS)) ? QUESTIONS : [];
var KOTOBA_LABEL = { y: 'よじじゅくご', k: 'ことわざ', i: 'かんようく', d: 'かんじの よみ' };

var SILHOUETTES = [
  { cell: [0, 0], emoji: '🐘', choices: ['ぞう', 'きりん', 'うま'] },
  { cell: [0, 1], emoji: '🦒', choices: ['きりん', 'うま', 'ぞう'] },
  { cell: [0, 2], emoji: '🐰', choices: ['うさぎ', 'ねこ', 'いぬ'] },
  { cell: [1, 0], emoji: '🐔', choices: ['にわとり', 'はと', 'すずめ'] },
  { cell: [1, 1], emoji: '🐟', choices: ['さかな', 'とり', 'むし'] },
  { cell: [1, 2], emoji: '🐢', choices: ['かめ', 'かに', 'かえる'] },
  { cell: [2, 0], emoji: '🦋', choices: ['ちょう', 'とんぼ', 'はち'] },
  { cell: [2, 1], emoji: '🐴', choices: ['うま', 'うし', 'ぶた'] },
  { cell: [2, 2], emoji: '🐷', choices: ['ぶた', 'いぬ', 'ひつじ'] },

  /* ここから 猫街ろまんの 追加（images/silhouette-*.png。3×3。docs/asset-prompts.md） */
  { sheet: 'silhouette-animals2', cell: [0, 0], emoji: '🦁', choices: ['ライオン', 'トラ', 'くま'] },
  { sheet: 'silhouette-animals2', cell: [0, 1], emoji: '🐧', choices: ['ペンギン', 'からす', 'あひる'] },
  { sheet: 'silhouette-animals2', cell: [0, 2], emoji: '🦘', choices: ['カンガルー', 'うさぎ', 'しか'] },
  { sheet: 'silhouette-animals2', cell: [1, 0], emoji: '🐳', choices: ['くじら', 'いるか', 'さめ'] },
  { sheet: 'silhouette-animals2', cell: [1, 1], emoji: '🐊', choices: ['わに', 'とかげ', 'へび'] },
  { sheet: 'silhouette-animals2', cell: [1, 2], emoji: '🦉', choices: ['ふくろう', 'はと', 'にわとり'] },
  { sheet: 'silhouette-animals2', cell: [2, 0], emoji: '🐿️', choices: ['りす', 'ねずみ', 'きつね'] },
  { sheet: 'silhouette-animals2', cell: [2, 1], emoji: '🐑', choices: ['ひつじ', 'やぎ', 'うし'] },
  { sheet: 'silhouette-animals2', cell: [2, 2], emoji: '🐼', choices: ['パンダ', 'ねこ', 'うさぎ'] },
  { sheet: 'silhouette-sea', cell: [0, 0], emoji: '🐙', choices: ['たこ', 'いか', 'くらげ'] },
  { sheet: 'silhouette-sea', cell: [0, 1], emoji: '🦑', choices: ['いか', 'たこ', 'さかな'] },
  { sheet: 'silhouette-sea', cell: [0, 2], emoji: '🦀', choices: ['かに', 'えび', 'くも'] },
  { sheet: 'silhouette-sea', cell: [1, 0], emoji: '🦐', choices: ['えび', 'ざりがに', 'かに'] },
  { sheet: 'silhouette-sea', cell: [1, 1], emoji: '🪼', choices: ['くらげ', 'たこ', 'きのこ'] },
  { sheet: 'silhouette-sea', cell: [1, 2], emoji: '🌊', choices: ['たつのおとしご', 'うなぎ', 'えび'] },
  { sheet: 'silhouette-sea', cell: [2, 0], emoji: '⭐', choices: ['ひとで', 'かに', 'ほし'] },
  { sheet: 'silhouette-sea', cell: [2, 1], emoji: '🐡', choices: ['ふぐ', 'ボール', 'はりねずみ'] },
  { sheet: 'silhouette-sea', cell: [2, 2], emoji: '🐟', choices: ['まぐろ', 'さめ', 'いるか'] },
  { sheet: 'silhouette-town', cell: [0, 0], emoji: '🚲', choices: ['じてんしゃ', 'バイク', 'くるま'] },
  { sheet: 'silhouette-town', cell: [0, 1], emoji: '☂️', choices: ['かさ', 'ぼうし', 'きのこ'] },
  { sheet: 'silhouette-town', cell: [0, 2], emoji: '🫖', choices: ['やかん', 'きゅうす', 'なべ'] },
  { sheet: 'silhouette-town', cell: [1, 0], emoji: '✂️', choices: ['はさみ', 'ペンチ', 'めがね'] },
  { sheet: 'silhouette-town', cell: [1, 1], emoji: '👓', choices: ['めがね', 'サングラス', 'はさみ'] },
  { sheet: 'silhouette-town', cell: [1, 2], emoji: '🎸', choices: ['ギター', 'バイオリン', 'ラケット'] },
  { sheet: 'silhouette-town', cell: [2, 0], emoji: '✈️', choices: ['ひこうき', 'とり', 'ヘリコプター'] },
  { sheet: 'silhouette-town', cell: [2, 1], emoji: '🚃', choices: ['でんしゃ', 'バス', 'トラック'] },
  { sheet: 'silhouette-town', cell: [2, 2], emoji: '🐱', choices: ['まねきねこ', 'たぬきの おきもの', 'だるま'] }
];

/* 同じ 1しゅうかんで なるべく 同じ もんだいを ださない */
var used = {};
function draw(name, list) {
  if (!list.length) { return null; }
  var u = used[name] || (used[name] = []);
  var fresh = [];
  for (var i = 0; i < list.length; i++) { if (u.indexOf(i) === -1) { fresh.push(i); } }
  if (!fresh.length) { u.length = 0; fresh = list.map(function (_, n) { return n; }); }
  var idx = pick(fresh);
  u.push(idx);
  return list[idx];
}

function kotobaPool(types) {
  return KOTOBA.filter(function (q) {
    return q && typeof q.q === 'string' && Array.isArray(q.c) && types.indexOf(q.t) !== -1;
  });
}
var POOL_KOTOBA = kotobaPool(['y', 'k', 'i']);
var POOL_KANJI = kotobaPool(['d']);

function makeKotoba() {
  var q = draw('kotoba', POOL_KOTOBA);
  if (!q) { return makeNeko(false); }
  return { kind: KOTOBA_LABEL[q.t] || 'ことば', blank: q.q, answer: q.a, choices: q.c.slice(),
           note: (q.yomi ? q.yomi + '\n' : '') + (q.imi || '') };
}

function makeKanji() {
  var q = draw('kanji', POOL_KANJI);
  if (!q) { return makeNeko(false); }
  return { kind: 'かんじの よみ', big: q.q, text: 'よみかたは？', answer: q.a, choices: q.c.slice(), note: q.imi || '' };
}

function makeMorning() {
  var g = pick(WEEK.morningGenres);
  var list = g.key === 'neko' ? WEEK.nekoQuiz : WEEK[g.key];
  var q = draw('m-' + g.key, list);
  return { kind: g.label, text: q.q, answer: q.a, choices: q.c.slice() };
}

function makeNeko(speed) {
  var q = draw('neko', WEEK.nekoQuiz);
  return { kind: 'ねこクイズ', text: q.q, answer: q.a, choices: q.c.slice(), speed: !!speed, limit: 9000 };
}

function makeSilhouette() {
  var s = draw('silhouette', SILHOUETTES);
  return { kind: 'かげあて', text: 'この かげは なに？', silhouette: s, answer: s.choices[0],
           choices: s.choices.slice(), speed: true, limit: 5000 };
}

/** まわりの 数で まぎらわしい こたえを つくる */
function nearChoices(answer, steps) {
  var set = [answer];
  var tries = 0;
  while (set.length < 4 && tries < 50) {
    tries++;
    var n = answer + pick(steps) * (Math.random() < 0.5 ? -1 : 1);
    if (n > 0 && set.indexOf(n) === -1) { set.push(n); }
  }
  return set;
}

function makeKeisan() {
  var type = rand(0, 2);
  var a, b, ans, text;
  if (type === 0) { a = rand(12, 58); b = rand(11, 39); ans = a + b; text = a + ' ＋ ' + b; }
  else if (type === 1) { a = rand(31, 89); b = rand(11, a - 8); ans = a - b; text = a + ' − ' + b; }
  else { a = rand(3, 9); b = rand(3, 9); ans = a * b; text = a + ' × ' + b; }
  var choices = nearChoices(ans, type === 2 ? [a, b, 1, 2] : [1, 2, 10, 11]).map(String);
  return { kind: 'けいさん', big: text + ' ＝ ？', answer: String(ans), choices: choices, speed: true, limit: 7000 };
}

function makeBaito() {
  var items = WEEK.baito.items;
  var x = pick(items);
  var y = pick(items);
  var total = x.price + y.price;
  var text = x === y
    ? x.name + ' ' + x.price + '円を 2つ'
    : x.name + ' ' + x.price + '円 と\n' + y.name + ' ' + y.price + '円';
  var choices = nearChoices(total, [10, 20, 50, 100]).map(function (n) { return n + '円'; });
  return { kind: 'おかいけい', text: text, answer: total + '円', choices: choices, speed: true, limit: 9000 };
}

function makeOtsuri() {
  var price = rand(12, 88) * 10;
  var ans = 1000 - price;
  var choices = nearChoices(ans, [10, 50, 100]).map(function (n) { return n + '円'; });
  return { kind: 'おつり', text: price + '円の ものを\n1000円で かったら、おつりは？', answer: ans + '円',
           choices: choices, speed: true, limit: 9000 };
}

/* ミニゲームの しゅるい */
var GAMES = {
  kotoba:     { title: 'ことばクイズ',   count: 3, make: makeKotoba },
  kanji:      { title: 'かんじクイズ',   count: 3, make: makeKanji },
  asagohan:   { title: 'あさごはん クイズ', count: 3, make: makeMorning },
  keisan:     { title: 'けいさん はやおし', count: 4, make: makeKeisan },
  silhouette: { title: 'かげあて はやおし', count: 4, make: makeSilhouette },
  baito:      { title: 'おかいけい はやおし', count: 4, make: makeBaito },
  test:       { title: 'しょうテスト',   count: 5, list: [makeKotoba, makeKeisan, makeKanji, makeSilhouette, makeKotoba], mult: 1.5 },
  taikai:     { title: 'ねこクイズ はやおし', count: 5, make: function () { return makeNeko(true); } },
  jarashi:    { title: 'ねこじゃらし',   tap: true, targets: 8, life: 2200, pic: 'jarashi', what: 'ねこじゃらし', hit: 'ニャッ！', cat: true },
  bat:        { title: 'ボールを うつ', tap: true, targets: 8, life: 1700, pic: 'softball', what: 'ボール', hit: 'カキーン！' },
  oboeru:     { title: 'じゅんばん おぼえ', memory: true, rounds: [3, 4, 5], toys: ['yarn', 'mouse', 'jarashi', 'ball'], per: 30 },
  kakurenbo:  { title: 'ねこの かくれんぼ', shell: true, rounds: [3, 5, 7], speed: [520, 420, 330], per: 120 },
  otsuri:     { title: 'おつり はやおし', count: 4, make: makeOtsuri }
};

/* ---------------------------------------------------------
   6. ミニゲーム（クイズ・はやおし）
      result … { points, speedPoints }
   --------------------------------------------------------- */
var timer = null;
function stopTimer() { if (timer) { cancelAnimationFrame(timer); timer = null; } }

function playGame(name, done) {
  var g = GAMES[name];
  if (g.tap) { playTap(g, done); return; }
  if (g.memory) { playOboeru(g, done); return; }
  if (g.shell) { playKakurenbo(g, done); return; }
  var total = 0, speedTotal = 0, n = 0;
  var box = panel('is-quiz');

  function ask() {
    if (n >= g.count) { finish(); return; }
    var q = g.list ? g.list[n]() : g.make();
    n++;
    box.textContent = '';
    var head = mk('div', 'wk-quiz__head');
    head.appendChild(mk('span', 'wk-quiz__title', g.title));
    head.appendChild(mk('span', 'wk-quiz__count', n + ' / ' + g.count));
    box.appendChild(head);
    if (g.title.indexOf(q.kind) === -1) {
      box.appendChild(mk('p', 'wk-quiz__kind', q.kind + (q.speed ? '（はやおし）' : '')));
    }

    var bar = null, barFill = null;
    if (q.speed) {
      bar = mk('div', 'wk-timer');
      barFill = mk('div', 'wk-timer__fill');
      bar.appendChild(barFill);
      box.appendChild(bar);
    }

    var shadow = null;
    if (q.silhouette) {
      shadow = mk('div', 'wk-shadow is-dark');
      var s = q.silhouette;
      shadow.textContent = s.emoji;
      var sheetUrl = 'images/' + (s.sheet || 'animals') + '.png';
      loadImage(sheetUrl, function (ok) {
        if (!ok) { return; }
        shadow.textContent = '';
        shadow.classList.add('is-image');
        shadow.style.backgroundImage = 'url("' + sheetUrl + '")';
        shadow.style.backgroundPosition = (s.cell[1] * 50) + '% ' + (s.cell[0] * 50) + '%';
      });
      box.appendChild(shadow);
    }
    if (q.big) { box.appendChild(mk('p', 'wk-quiz__big', q.big)); }
    var qText = null;
    if (q.blank) {
      qText = mk('p', 'wk-quiz__big wk-quiz__blank');
      var parts = q.blank.split('_');
      qText.appendChild(document.createTextNode(parts[0]));
      var hole = mk('span', 'wk-hole', '？');
      qText.appendChild(hole);
      qText.appendChild(document.createTextNode(parts.slice(1).join('_')));
      qText.hole = hole;
      box.appendChild(qText);
      box.appendChild(mk('p', 'wk-quiz__text', '〇に 入るのは？'));
    }
    if (q.text) { box.appendChild(mk('p', 'wk-quiz__text', q.text)); }

    var grid = mk('div', 'wk-choices');
    box.appendChild(grid);
    var result = mk('p', 'wk-quiz__result');
    result.setAttribute('aria-live', 'assertive');
    box.appendChild(result);

    var misses = 0, over = false, start = performance.now();

    function end(got, speedGot, msg, ok) {
      over = true;
      stopTimer();
      total += got;
      speedTotal += speedGot;
      grid.querySelectorAll('button').forEach(function (b) {
        b.disabled = true;
        if (b.dataset.v === q.answer) { b.classList.add('is-ok'); }
      });
      if (shadow) { shadow.classList.remove('is-dark'); }
      if (qText) { qText.hole.textContent = q.answer; qText.hole.classList.add('is-filled'); }
      result.textContent = msg + (got ? '  ＋' + got : '');
      result.className = 'wk-quiz__result ' + (ok ? 'is-ok' : 'is-ng');
      if (ok) { catBounce(); }
      /* 「つぎへ」は けっかの すぐ下に（画面から はみ出さない ように）。解説は その下で、読みたい 人は スクロール */
      var nextBtn = mk('div', 'wk-quiz__next');
      box.appendChild(nextBtn);
      var go = button(nextBtn, 'wk-btn--go', '', n >= g.count ? 'けっかへ' : 'つぎへ', '', ask);
      if (q.note && !q.speed) { box.appendChild(mk('p', 'wk-quiz__note', q.note)); }
      try { go.scrollIntoView({ block: 'nearest' }); } catch (e) { /* なにもしない */ }
    }

    shuffle(q.choices).forEach(function (c) {
      var b = mk('button', 'wk-choice', c);
      b.type = 'button';
      b.dataset.v = c;
      b.addEventListener('click', function () {
        if (over || b.disabled) { return; }
        if (c === q.answer) {
          if (q.speed) {
            var left = Math.max(0, 1 - (performance.now() - start) / q.limit);
            var p = 50 + Math.round(150 * left);
            end(p, p, left > 0.6 ? 'はやい！ せいかい！' : 'せいかい！', true);
          } else {
            var pts = misses === 0 ? 100 : (misses === 1 ? 40 : 10);
            end(pts, 0, misses === 0 ? 'せいかい！' : 'せいかい！（' + (misses + 1) + 'かいめ）', true);
          }
        } else if (q.speed) {
          b.classList.add('is-ng');
          end(0, 0, 'ざんねん！', false);
        } else {
          misses++;
          b.disabled = true;
          b.classList.add('is-ng');
          result.textContent = 'おしい！ もういちど';
          result.className = 'wk-quiz__result is-ng';
        }
      });
      grid.appendChild(b);
    });

    if (q.speed) {
      var tick = function () {
        var left = 1 - (performance.now() - start) / q.limit;
        barFill.style.transform = 'scaleX(' + Math.max(0, left) + ')';
        bar.classList.toggle('is-hurry', left < 0.3);
        if (left <= 0) { end(0, 0, 'じかん ぎれ！', false); return; }
        timer = requestAnimationFrame(tick);
      };
      timer = requestAnimationFrame(tick);
    }
  }

  function finish() {
    var mult = g.mult || 1;
    done({ points: total, speedPoints: speedTotal, mult: mult, title: g.title });
  }

  ask();
}

/* ---------------------------------------------------------
   7. ミニゲーム（タップ：ねこじゃらし・バッティング）
   --------------------------------------------------------- */
function playTap(g, done) {
  var box = panel('is-tap');
  box.appendChild(mk('p', 'wk-quiz__title', g.title));
  /* ふわふわ ねこじゃらしを 持って いる 週は、まとも その 絵に */
  var targetPic = PIC[g.pic === 'jarashi' && run.item === 'jarashi' ? 'fluffy' : g.pic];
  box.appendChild(mk('p', 'wk-tap__help', g.what + 'が 出たら すぐ タップ！\n' + g.targets + 'かい'));
  var info = mk('p', 'wk-tap__info', '');
  box.appendChild(info);
  var go = mk('div', 'wk-quiz__next');
  box.appendChild(go);
  button(go, 'wk-btn--go', '▶', 'スタート', '', start);

  var arena = ui.wkArena;
  var total = 0, count = 0, hits = 0, current = null, timeout = null;

  function start() {
    go.textContent = '';
    arena.hidden = false;
    arena.textContent = '';
    info.textContent = '0 / ' + g.targets;
    setTimeout(spawn, 500);
  }

  function spawn() {
    if (count >= g.targets) { finish(); return; }
    count++;
    var t = mk('button', 'wk-target');
    t.appendChild(picIn(targetPic));
    t.type = 'button';
    t.setAttribute('aria-label', 'タップ');
    t.style.left = rand(8, 76) + '%';
    t.style.top = rand(6, 58) + '%';
    var born = performance.now();
    var hit = false;
    t.addEventListener('click', function () {
      if (hit) { return; }
      hit = true;
      clearTimeout(timeout);
      var left = Math.max(0, 1 - (performance.now() - born) / g.life);
      var p = 20 + Math.round(30 * left);
      total += p;
      hits++;
      t.classList.add('is-hit');
      t.textContent = '+' + p;
      if (g.cat) {
        setCat(pick(['happy', 'celebrate', 'noon']));
        catBounce();
      }
      info.textContent = g.hit + '  ' + count + ' / ' + g.targets;
      setTimeout(function () { t.remove(); spawn(); }, 350);
    });
    arena.appendChild(t);
    current = t;
    timeout = setTimeout(function () {
      if (hit) { return; }
      hit = true;
      t.classList.add('is-miss');
      info.textContent = 'にげられた…  ' + count + ' / ' + g.targets;
      setTimeout(function () { t.remove(); spawn(); }, 250);
    }, g.life);
  }

  function finish() {
    arena.hidden = true;
    arena.textContent = '';
    current = null;
    done({ points: total, speedPoints: total, mult: 1, title: g.title, hits: hits });
  }
}

/* ---------------------------------------------------------
   7b. ミニゲーム（じゅんばん おぼえ）
       おもちゃが ひかった じゅんに タップ。3・4・5こ の 3回
   --------------------------------------------------------- */
function tapPanel(g, help) {
  var box = panel('is-tap');
  box.appendChild(mk('p', 'wk-quiz__title', g.title));
  box.appendChild(mk('p', 'wk-tap__help', help));
  var info = mk('p', 'wk-tap__info', '');
  box.appendChild(info);
  var go = mk('div', 'wk-quiz__next');
  box.appendChild(go);
  return { box: box, info: info, go: go };
}

function wait(ms, fn) { setTimeout(fn, ms); }

function playOboeru(g, done) {
  var ui2 = tapPanel(g, 'おもちゃが ひかった じゅんばんを\nおぼえて、同じ じゅんに タップ！');
  var arena = ui.wkArena;
  var total = 0, round = 0, pads = [];
  button(ui2.go, 'wk-btn--go', '▶', 'スタート', '', start);

  function start() {
    ui2.go.textContent = '';
    setFigure('left', null);   /* おもちゃを 見やすく */
    arena.hidden = false;
    arena.textContent = '';
    var grid = mk('div', 'wk-pads');
    g.toys.forEach(function (t, i) {
      var b = mk('button', 'wk-pad');
      b.appendChild(picIn(PIC[t]));
      b.setAttribute('aria-label', PIC[t].emoji);
      b.type = 'button';
      b.disabled = true;
      b.addEventListener('click', function () { press(i); });
      grid.appendChild(b);
      pads.push(b);
    });
    arena.appendChild(grid);
    wait(500, nextRound);
  }

  var seq = [], pos = 0, input = false;

  function lock(on) { pads.forEach(function (p) { p.disabled = on; }); }

  function flash(i, ms) {
    pads[i].classList.add('is-lit');
    wait(ms, function () { pads[i].classList.remove('is-lit'); });
  }

  function nextRound() {
    if (round >= g.rounds.length) { finish(); return; }
    var len = g.rounds[round];
    round++;
    seq = [];
    for (var k = 0; k < len; k++) { seq.push(rand(0, pads.length - 1)); }
    pos = 0;
    input = false;
    lock(true);
    ui2.info.textContent = round + 'かいめ（' + len + 'こ）  よく 見てね';
    setCat('thinking');
    var t = 400;
    seq.forEach(function (i) {
      wait(t, function () { flash(i, 480); });
      t += 700;
    });
    wait(t, function () {
      input = true;
      lock(false);
      ui2.info.textContent = round + 'かいめ  おなじ じゅんに タップ！';
    });
  }

  function press(i) {
    if (!input) { return; }
    flash(i, 200);
    if (i !== seq[pos]) {
      input = false;
      lock(true);
      pads[seq[pos]].classList.add('is-answer');
      ui2.info.textContent = 'ざんねん！';
      setCat('thinking');
      wait(1100, function () { pads[seq[pos]].classList.remove('is-answer'); nextRound(); });
      return;
    }
    pos++;
    if (pos >= seq.length) {
      input = false;
      lock(true);
      var p = g.per * seq.length;
      total += p;
      ui2.info.textContent = 'せいかい！  ＋' + p;
      setCat('celebrate');
      catBounce();
      wait(900, nextRound);
    }
  }

  function finish() {
    arena.hidden = true;
    arena.textContent = '';
    done({ points: total, speedPoints: 0, mult: 1, title: g.title });
  }
}

/* ---------------------------------------------------------
   7c. ミニゲーム（ねこの かくれんぼ）
       ねこが はいった はこを 目で おいかけて タップ。3回
   --------------------------------------------------------- */
var SHELL_X = [6, 37, 68];   /* はこの 左はし（%） */

function playKakurenbo(g, done) {
  var ui2 = tapPanel(g, 'ねこが はいった はこを\n目で おいかけて タップ！');
  var arena = ui.wkArena;
  var total = 0, round = 0, boxes = [], catBox = null, input = false;
  button(ui2.go, 'wk-btn--go', '▶', 'スタート', '', start);

  function start() {
    ui2.go.textContent = '';
    setFigure('left', null);   /* はこを 見やすく */
    arena.hidden = false;
    arena.textContent = '';
    setCat(null);
    for (var i = 0; i < 3; i++) {
      var b = mk('button', 'wk-shell');
      b.type = 'button';
      b.disabled = true;
      b.spot = i;
      b.style.left = SHELL_X[i] + '%';
      var catFace = mk('span', 'wk-shell__cat', '🐈');
      if (imgCache['images/' + run.cat + '.png'] === true) {   /* えらんだ ねこの 絵（おすわり） */
        catFace.textContent = '';
        catFace.classList.add('is-image');
        catFace.style.backgroundImage = 'url("images/' + run.cat + '.png")';
      }
      b.appendChild(catFace);
      b.appendChild(setPic(mk('span', 'wk-shell__box'), PIC.box));
      b.addEventListener('click', pickBox.bind(null, b));
      arena.appendChild(b);
      boxes.push(b);
    }
    wait(400, nextRound);
  }

  function nextRound() {
    if (round >= g.rounds.length) { finish(); return; }
    var swaps = g.rounds[round];
    var ms = g.speed[round];
    round++;
    boxes.forEach(function (b) { b.disabled = true; b.classList.remove('is-open', 'is-ok', 'is-ng'); b.style.transitionDuration = ms + 'ms'; });
    catBox = pick(boxes);
    catBox.classList.add('is-open');
    ui2.info.textContent = round + 'かいめ  ' + catName(run) + 'は ここ！';
    wait(1200, function () {
      catBox.classList.remove('is-open');
      ui2.info.textContent = round + 'かいめ  よく 見てね…';
      var n = 0;
      (function swap() {
        if (n >= swaps) {
          wait(ms, function () {
            input = true;
            boxes.forEach(function (b) { b.disabled = false; });
            ui2.info.textContent = round + 'かいめ  どの はこ？';
          });
          return;
        }
        n++;
        var a = rand(0, 2), c = (a + rand(1, 2)) % 3;
        var ba = boxes.filter(function (b) { return b.spot === a; })[0];
        var bc = boxes.filter(function (b) { return b.spot === c; })[0];
        ba.spot = c; bc.spot = a;
        ba.style.left = SHELL_X[c] + '%';
        bc.style.left = SHELL_X[a] + '%';
        wait(ms + 60, swap);
      })();
    });
  }

  function pickBox(b) {
    if (!input) { return; }
    input = false;
    boxes.forEach(function (x) { x.disabled = true; });
    catBox.classList.add('is-open');
    if (b === catBox) {
      total += g.per;
      b.classList.add('is-ok');
      ui2.info.textContent = 'みつけた！  ＋' + g.per;
    } else {
      b.classList.add('is-ng');
      ui2.info.textContent = 'ざんねん、こっち でした';
    }
    wait(1300, nextRound);
  }

  function finish() {
    arena.hidden = true;
    arena.textContent = '';
    setCat('happy');
    done({ points: total, speedPoints: 0, mult: 1, title: g.title });
  }
}

/* ---------------------------------------------------------
   8. てんすうの けいさん（飼い主・ねこの とくい）
   --------------------------------------------------------- */
/**
 * ctx … { category: 'neko'|'gakkou'|'tomo'|'baito', time: 'morning'|'night'|'' }
 * もどりは { points, lines: [ 'ことば  +点' ] }
 */
function scoreSlot(res, ctx) {
  var owner = WEEK.owners[run.owner];
  var cat = WEEK.cats[run.cat];
  var lines = [];
  var base = res.points;
  lines.push({ label: res.title, value: '+' + fmt(base) });
  var pts = base;

  if (res.mult && res.mult !== 1) {
    var add0 = Math.round(pts * (res.mult - 1));
    pts += add0;
    lines.push({ label: 'テスト ボーナス ×' + res.mult, value: '+' + fmt(add0) });
  }
  if (owner.bonus[ctx.category]) {
    var add1 = Math.round(pts * (owner.bonus[ctx.category] - 1));
    pts += add1;
    lines.push({ label: owner.name + '（' + owner.trait + '）', value: '+' + fmt(add1) });
  }
  if (owner.bonus.speed && res.speedPoints) {
    var add2 = Math.round(res.speedPoints * (owner.bonus.speed - 1));
    pts += add2;
    lines.push({ label: owner.name + '（' + owner.trait + '）', value: '+' + fmt(add2) });
  }
  if (ctx.category === 'neko') {
    if (cat.bonus && cat.bonus[ctx.time]) {
      var add3 = Math.round(pts * (cat.bonus[ctx.time] - 1));
      pts += add3;
      lines.push({ label: catName(run) + '（' + cat.trait + '）', value: '+' + fmt(add3) });
    }
    if (cat.random && (ctx.time === 'morning' || ctx.time === 'night')) {
      var m = Math.round((cat.random[0] + Math.random() * (cat.random[1] - cat.random[0])) * 10) / 10;
      var add4 = Math.round(pts * (m - 1));
      pts += add4;
      lines.push({ label: catName(run) + '（' + cat.trait + ' ×' + m + '）', value: (add4 >= 0 ? '+' : '−') + fmt(Math.abs(add4)) });
    }
    if (cat.nightly && ctx.time === 'night') {
      pts += cat.nightly;
      lines.push({ label: catName(run) + '（' + cat.trait + '）', value: '+' + cat.nightly });
    }
  }
  var item = run.item && WEEK.items[run.item];
  if (item) {
    var extra = 0;
    if ((item.time && item.time === ctx.time) || (item.category && item.category === ctx.category)) {
      extra = Math.round(pts * (item.mult - 1));
    } else if (item.speed && res.speedPoints) {
      extra = Math.round(res.speedPoints * (item.mult - 1));
    }
    if (extra) {
      pts += extra;
      lines.push({ label: item.icon + ' ' + item.name, value: '+' + fmt(extra) });
    }
  }
  if (ctx.extra) {
    pts += ctx.extra.value;
    lines.push({ label: ctx.extra.label, value: '+' + fmt(ctx.extra.value) });
  }
  return { points: Math.max(0, pts), lines: lines };
}

function showSlotResult(res, ctx, next) {
  var s = scoreSlot(res, ctx);
  run.score[ctx.category] += s.points;
  run.dayScores[run.day] += s.points;
  updateHeader();
  var box = panel('is-result');
  box.appendChild(mk('p', 'wk-result__title', slotName(run, run.slot) + 'の けっか'));
  var list = mk('dl', 'wk-result__list');
  s.lines.forEach(function (l) {
    list.appendChild(mk('dt', '', l.label));
    list.appendChild(mk('dd', '', l.value));
  });
  box.appendChild(list);
  var cat = CATEGORIES.filter(function (c) { return c.key === ctx.category; })[0];
  box.appendChild(mk('p', 'wk-result__total', cat.icon + ' ' + cat.label + '  ＋' + fmt(s.points)));
  var go = mk('div', 'wk-quiz__next');
  box.appendChild(go);
  button(go, 'wk-btn--go', '', 'つぎへ', '', next);
}

/* ---------------------------------------------------------
   9. 1日の ながれ
   --------------------------------------------------------- */
function advance() {
  run.slot++;
  if (run.slot >= daySlots(run.day)) {
    endOfDay();
    return;
  }
  save.run = run;
  writeWeekSave();
  updateHeader();
  playSlot();
}

function playSlot() {
  updateHeader();
  if (run.slot === 0) { slotMorning(); }
  else if (run.slot === 1) { slotDay(); }
  else if (run.slot === 2) { slotAfter(); }
  else { slotNight(); }
}

function slotMorning() {
  setFigure('right', null);
  setFigure('left', run.owner, 'normal');
  var lines = WEEK.scenes.morning.slice();
  if (!run.seenPrologue) {
    lines = WEEK.scenes.prologue.concat(lines);
    run.seenPrologue = true;
  }
  say(lines, function () {
    setCat('thinking');
    playGame('asagohan', function (res) {
      setCat('eating');
      showSlotResult(res, { category: 'neko', time: 'morning' }, function () {
        say(WEEK.scenes.morningDone, advance);
      });
    });
  });
}

function slotDay() {
  var day = WEEK.days[run.day];
  var spec = day.school;
  if (spec.game === 'taikai') {
    sceneFriend = topFriend();
    setFigure('right', null);
    say(WEEK.scenes.taikai, function () {
      setCat('thinking');
      playGame('taikai', function (res) {
        setCat('celebrate');
        var bonus = Math.round(run.score.neko * 0.1);
        showSlotResult(res, { category: 'neko', time: '', extra: { label: 'ふだんの なかよし ボーナス', value: bonus } }, function () {
          setFigure('right', 'daiou');
          say(WEEK.scenes.taikaiDone, advance);
        });
      });
    });
    return;
  }
  if (spec.game === 'shopping') { slotShopping(); return; }
  /* 月〜金：授業（月〜木の 科目は run.schedule の じゅん） */
  if (spec.game === 'subject') {
    var subj = run.schedule[run.day] || 'kotoba';
    spec = { game: subj, talk: spec.talk, title: WEEK.subjects[subj].title, note: WEEK.subjects[subj].note };
  }
  schoolTalk = spec.talk === 'subject' ? spec.game : spec.talk;
  sceneFriend = friendOfDay(run.day);
  setCat(null);
  setFigure('right', null);
  say([{ bg: 'road', text: fill('{me}は がっこうへ むかった。') }].concat(WEEK.scenes.school), function () {
    say([{ text: spec.title + '。\nきょうは「' + spec.note + '」。' }], function () {
      playGame(spec.game, function (res) {
        showSlotResult(res, { category: 'gakkou', time: '' }, advance);
      });
    });
  });
}

/** 日曜の ひる：ともだちと かいもの。アイテムが 手に 入る */
function slotShopping() {
  setCat(null);
  setFigure('right', null);
  say(WEEK.scenes.shopping, function () {
    var box = panel('is-menu');
    var title = mk('p', 'wk-menu__title wk-menu__title--pic');
    title.appendChild(setPic(mk('span', 'wk-menu__pic'), PIC.bag));
    title.appendChild(document.createTextNode('だれと かいものに 行く？'));
    box.appendChild(title);
    var grid = mk('div', 'wk-menu__grid');
    box.appendChild(grid);
    others().forEach(function (k) {
      var shop = WEEK.friends[k].shop;
      var item = WEEK.items[shop.item];
      var b = button(grid, 'wk-btn--friend', '', personName(k) + 'と ' + shop.place,
        item.icon + ' ' + item.name + '（' + item.note + '）', function () { goShopping(k); });
      b.style.setProperty('--c-person', personColor(k));
      var face = mk('span', 'wk-btn__face');
      face.setAttribute('aria-hidden', 'true');
      loadImage(faceUrl(k, 'happy'), function (ok) { if (ok) { face.style.backgroundImage = 'url("' + faceUrl(k, 'happy') + '")'; } });
      b.insertBefore(face, b.firstChild);
    });
  });
}

function goShopping(k) {
  sceneFriend = k;
  var shop = WEEK.friends[k].shop;
  var item = WEEK.items[shop.item];
  say([{ who: 'friend', text: shop.line }], function () {
    playGame('otsuri', function (res) {
      run.friendCount[k]++;
      showSlotResult(res, { category: 'tomo', time: '' }, function () {
        run.item = shop.item;
        updateHeader();
        var box = panel('is-result');
        box.appendChild(mk('p', 'wk-result__title', 'アイテムを 手に 入れた！'));
        box.appendChild(setPic(mk('p', 'wk-item__icon'), itemPic(item)));
        box.appendChild(mk('p', 'wk-result__total', item.name));
        box.appendChild(mk('p', 'wk-result__sub', item.note + '（土曜まで ずっと）'));
        var go = mk('div', 'wk-quiz__next');
        box.appendChild(go);
        button(go, 'wk-btn--go', '', 'つぎへ', '', function () {
          say([{ who: 'friend', face: 'happy', text: shop.got }, { who: 'me', face: 'happy', text: '@thanks' }], advance);
        });
      });
    });
  });
}

function slotAfter() {
  setCat(null);
  setFigure('right', null);
  var intro = WEEK.days[run.day].holiday
    ? [{ bg: 'road', text: fill('ごごは なにを しよう。') }]
    : WEEK.scenes.afterChoose;
  say(intro, function () {
    var box = panel('is-menu');
    box.appendChild(mk('p', 'wk-menu__title', slotName(run, run.slot) + 'は どう する？'));
    var grid = mk('div', 'wk-menu__grid');
    box.appendChild(grid);
    others().forEach(function (k) {
      var f = WEEK.friends[k];
      var hearts = run.friendCount[k] ? ' ' + new Array(Math.min(run.friendCount[k], 5) + 1).join('♥') : '';
      var b = button(grid, 'wk-btn--friend', '', personName(k) + 'と あそぶ' + hearts, f.place + '・' + GAMES[f.game].title, function () { hangOut(k); });
      b.style.setProperty('--c-person', personColor(k));
      var face = mk('span', 'wk-btn__face');
      face.setAttribute('aria-hidden', 'true');
      loadImage(faceUrl(k, 'happy'), function (ok) { if (ok) { face.style.backgroundImage = 'url("' + faceUrl(k, 'happy') + '")'; } });
      b.insertBefore(face, b.firstChild);
    });
    var baitoLabel = run.owner === 'chika' ? 'みせの てつだい' : '魚屋で バイト';
    button(grid, 'wk-btn--baito', '🐟', baitoLabel, '商店街・' + WEEK.baito.note, doBaito);
  });
}

function hangOut(k) {
  sceneFriend = k;
  var f = WEEK.friends[k];
  var count = run.friendCount[k];
  setBg(k === 'nao' ? 'school' : (k === 'maki' ? 'road' : 'shotengai'));
  /* 日曜（やすみの 日）は hangHoliday が あれば そちら（「ぶかつの あと」などを 言わない） */
  var hangText = (WEEK.days[run.day].holiday && f.hangHoliday) ? f.hangHoliday : f.hang[Math.min(count, f.hang.length - 1)];
  say([{ who: 'friend', text: hangText }], function () {
    playGame(f.game, function (res) {
      run.friendCount[k]++;
      showSlotResult(res, { category: 'tomo', time: '' }, function () {
        say([{ who: 'me', face: 'happy', text: '@thanks' }], advance);
      });
    });
  });
}

function doBaito() {
  setBg('shotengai');
  var lines = (run.owner === 'chika' ? WEEK.baito.chikaLines : WEEK.baito.lines).slice();
  var ownerLines = WEEK.owners[run.owner].lines;
  lines.push({ who: 'me', text: (WEEK.days[run.day].holiday && ownerLines.baitoHoliday) ? '@baitoHoliday' : '@baito' });
  say(lines, function () {
    playGame('baito', function (res) {
      showSlotResult(res, { category: 'baito', time: '' }, function () {
        say([WEEK.baito.after], advance);
      });
    });
  });
}

function slotNight() {
  setFigure('right', null);
  setFigure('left', run.owner, 'normal');
  var game = run.nightOrder[run.day] || 'jarashi';
  say(WEEK.scenes.home, function () {
    setCat('noon');
    playGame(game, function (res) {
      setFigure('left', run.owner, 'happy');
      setCat('happy');
      showSlotResult(res, { category: 'neko', time: 'night' }, function () {
        say(WEEK.scenes.sleep, advance);
      });
    });
  });
}

function endOfDay() {
  var d = run.day;
  var box = panel('is-result');
  box.appendChild(mk('p', 'wk-result__title', WEEK.days[d].label + '  おしまい'));
  box.appendChild(mk('p', 'wk-result__total', 'きょうの てんすう  ' + fmt(run.dayScores[d])));
  box.appendChild(mk('p', 'wk-result__sub', 'ここまでの ごうけい  ' + fmt(runTotal(run))));
  var go = mk('div', 'wk-quiz__next');
  box.appendChild(go);
  if (d + 1 >= WEEK.days.length) {
    button(go, 'wk-btn--go', '🌅', '一週間の おわりへ', '', ending);
    return;
  }
  run.day = d + 1;
  run.slot = 0;
  save.run = run;
  writeWeekSave();
  button(go, 'wk-btn--go', '☀️', WEEK.days[run.day].label + 'へ', '', function () { updateHeader(); playSlot(); });
  button(go, 'wk-btn--sub', '', 'ここで やすむ', 'つぎは つづきから', showTitle);
}

/* ---------------------------------------------------------
   10. 一週間の おわり
   --------------------------------------------------------- */
function ending() {
  var friend = topFriend();
  sceneFriend = friend;
  var catEnd = WEEK.catEndings.filter(function (e) { return run.score.neko >= e.min; })[0];
  setFigure('right', null);
  var lines = WEEK.scenes.ending.concat([
    { who: 'friend', face: 'happy', text: WEEK.friends[friend].ending },
    { cat: catEnd.pose, text: catEnd.text },
    { who: 'cat', pose: catEnd.pose, text: 'ニャ〜ン' }
  ]);
  say(lines, showFinal);
}

function showFinal() {
  var r = run;
  var sum = runTotal(r);
  var pair = WEEK.owners[r.owner].best === r.cat;
  var total = pair ? Math.round(sum * WEEK.BEST_PAIR) : sum;
  var rank = WEEK.ranks.filter(function (x) { return total >= x.min; })[0];
  var comboKey = r.owner + '|' + r.cat;
  var newBest = !save.best || total > save.best.total;
  var newCombo = !(save.combos[comboKey] >= total);
  if (newBest) { save.best = { total: total, owner: r.owner, cat: r.cat, catName: catName(r) }; }
  if (newCombo) { save.combos[comboKey] = total; }
  save.plays++;
  save.run = null;
  writeWeekSave();

  ui.wkHeader.hidden = true;
  setBg('ending');
  setFigure('left', r.owner, 'happy');
  setFigure('right', null);
  setCat('celebrate');
  var box = panel('is-full');
  box.appendChild(mk('p', 'wk-result__title', '一週間の けっか'));
  var item = r.item && WEEK.items[r.item];
  box.appendChild(mk('p', 'wk-result__who', WEEK.owners[r.owner].name + ' と ' + catName(r) +
    (item ? '  ' + item.icon + ' ' + item.name : '')));
  var list = mk('dl', 'wk-result__list');
  CATEGORIES.forEach(function (c) {
    list.appendChild(mk('dt', '', c.icon + ' ' + c.label));
    list.appendChild(mk('dd', '', fmt(r.score[c.key])));
  });
  if (pair) {
    list.appendChild(mk('dt', '', '💞 あいしょう ◎ ×' + WEEK.BEST_PAIR));
    list.appendChild(mk('dd', '', '+' + fmt(total - sum)));
  }
  box.appendChild(list);
  box.appendChild(mk('p', 'wk-result__grand', fmt(total) + ' てん'));
  box.appendChild(mk('p', 'wk-result__rank', '「' + rank.name + '」'));
  if (newBest) { box.appendChild(mk('p', 'wk-result__new', '★ ハイスコア こうしん！')); }
  else if (newCombo) { box.appendChild(mk('p', 'wk-result__new', '★ この くみあわせの さいこう きろく！')); }
  var go = mk('div', 'wk-quiz__next');
  box.appendChild(go);
  button(go, 'wk-btn--go', '🔁', 'もういちど あそぶ', '', chooseOwner);
  button(go, 'wk-btn--sub', '', 'タイトルへ', '', showTitle);
  run = null;
}

/* ---------------------------------------------------------
   11. タイトル・えらぶ 画面
   --------------------------------------------------------- */
function resetStage() {
  ui.wkArena.hidden = true;
  setFigure('left', null);
  setFigure('right', null);
  setCat(null);
}

function showTitle() {
  stopTimer();
  run = null;
  used = {};
  updateHeader();
  resetStage();
  setBg('title');
  var box = panel('is-title');

  /* ロゴ：images/logo.png が 読めたら 絵に、読めなければ 文字の まま（読みあげは 文字） */
  var head = mk('div', 'wk-title__head');
  var h1 = mk('h1', 'wk-title');
  h1.appendChild(mk('span', 'wk-title__a', '猫街'));
  h1.appendChild(mk('span', 'wk-title__b', 'ろまん'));
  head.appendChild(h1);
  head.appendChild(mk('p', 'wk-title__sub', '〜Cat city Romance〜'));
  box.appendChild(head);
  loadImage('images/logo.png', function (ok) {
    if (!ok || !head.isConnected) { return; }
    var img = mk('img', 'wk-title__logo');
    img.src = 'images/logo.png';
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    head.insertBefore(img, h1);
    head.classList.add('has-logo');
  });

  if (save.best) {
    var best = mk('button', 'wk-title__best');
    best.type = 'button';
    best.textContent = '🏆 ハイスコア ' + fmt(save.best.total) + '（' +
      WEEK.owners[save.best.owner].name + '・' + (save.best.catName || WEEK.cats[save.best.cat].name) + '）';
    best.addEventListener('click', showRecords);
    box.appendChild(best);
  }

  var btns = mk('div', 'wk-title__btns');
  box.appendChild(btns);
  button(btns, 'wk-btn--go', '📅', '一週間モード', save.run ? 'つづき あり' : '7日間で ハイスコア', weekMenu);
  button(btns, 'wk-btn--endless', '♾️', 'エンドレスモード', 'のんびり おせわ', function () { location.href = 'endless.html'; });
  button(btns, 'wk-btn--board', '🧩', 'ネコネソンヌ', 'タイルで 対戦（2〜4人）', function () { location.href = 'nekonesonne.html'; });
}

/** 一週間モード：つづきが あれば えらぶ */
function weekMenu() {
  if (!save.run) { chooseOwner(); return; }
  var box = panel('is-full');
  box.appendChild(mk('p', 'wk-menu__title', '一週間モード'));
  var btns = mk('div', 'wk-title__btns');
  box.appendChild(btns);
  var r = save.run;
  button(btns, 'wk-btn--go', '🔖', 'つづきから',
    WEEK.owners[r.owner].name + '・' + catName(r) + '／' + WEEK.days[r.day].label + ' ' + slotName(r, r.slot),
    function () { startRun(save.run); });
  button(btns, 'wk-btn--sub', '📖', 'はじめから', 'つづきは きえます', chooseOwner);
  button(btns, 'wk-btn--sub', '🏆', 'きろく', '16の くみあわせ', showRecords);
  button(btns, 'wk-btn--sub', '', 'タイトルへ', '', showTitle);
}

function showRecords() {
  var box = panel('is-full');
  box.appendChild(mk('p', 'wk-result__title', 'くみあわせの きろく'));
  var table = mk('table', 'wk-records');
  var head = mk('tr');
  head.appendChild(mk('th', '', ''));
  WEEK.catOrder.forEach(function (c) { head.appendChild(mk('th', '', WEEK.cats[c].name)); });
  table.appendChild(head);
  WEEK.ownerOrder.forEach(function (o) {
    var tr = mk('tr');
    tr.appendChild(mk('th', '', WEEK.owners[o].name));
    WEEK.catOrder.forEach(function (c) {
      var v = save.combos[o + '|' + c];
      var td = mk('td', WEEK.owners[o].best === c ? 'is-best' : '', v ? fmt(v) : '―');
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  box.appendChild(table);
  box.appendChild(mk('p', 'wk-records__note', '💞 の マスは あいしょう ◎（ごうけい 1.2ばい）'));
  var go = mk('div', 'wk-quiz__next');
  box.appendChild(go);
  button(go, 'wk-btn--sub', '', 'もどる', '', save.run ? weekMenu : showTitle);
}

function chooseOwner() {
  stopTimer();
  run = null;
  updateHeader();
  resetStage();
  setBg('road');
  var box = panel('is-full');
  box.appendChild(mk('p', 'wk-menu__title', 'だれに なる？'));
  var grid = mk('div', 'wk-cards');
  box.appendChild(grid);
  WEEK.ownerOrder.forEach(function (k) {
    var o = WEEK.owners[k];
    var b = button(grid, 'wk-card', '', o.name, o.trait + '\n' + o.traitNote, function () { chooseCat(k); });
    b.style.setProperty('--c-person', o.color);
    var face = mk('span', 'wk-card__face');
    face.setAttribute('aria-hidden', 'true');
    loadImage(faceUrl(k, 'happy'), function (ok) { if (ok) { face.style.backgroundImage = 'url("' + faceUrl(k, 'happy') + '")'; } });
    b.insertBefore(face, b.firstChild);
  });
  var go = mk('div', 'wk-quiz__next');
  box.appendChild(go);
  button(go, 'wk-btn--sub', '', 'もどる', '', showTitle);
}

function chooseCat(owner) {
  var box = panel('is-full');
  setBg('home');
  box.appendChild(mk('p', 'wk-menu__title', WEEK.owners[owner].name + 'の ねこは？'));
  var grid = mk('div', 'wk-cards');
  box.appendChild(grid);
  var fav = careCatPattern();
  WEEK.catOrder.forEach(function (k) {
    var c = WEEK.cats[k];
    var best = WEEK.owners[owner].best === k;
    var b = button(grid, 'wk-card' + (best ? ' is-best' : ''), '', c.name + (best ? ' 💞' : ''),
      c.trait + '\n' + c.traitNote + (k === fav ? '\n（おせわ モードの ねこ）' : ''),
      function () { nameCat(owner, k); });
    var face = mk('span', 'wk-card__cat');
    face.setAttribute('aria-hidden', 'true');
    face.textContent = '🐈';
    loadImage('images/' + k + '.png', function (ok) {
      if (!ok) { return; }
      face.textContent = '';
      face.style.backgroundImage = 'url("images/' + k + '.png")';
      face.classList.add('is-image');
    });
    b.insertBefore(face, b.firstChild);
  });
  box.appendChild(mk('p', 'wk-records__note', '💞 は ' + WEEK.owners[owner].name + 'と あいしょう ◎（ごうけい 1.2ばい）'));
  var go = mk('div', 'wk-quiz__next');
  box.appendChild(go);
  button(go, 'wk-btn--sub', '', 'もどる', '', chooseOwner);
}

/** ねこの なまえを きめる（入力しても、こうほを タップしても よい） */
function nameCat(owner, pattern) {
  var box = panel('is-full');
  box.appendChild(mk('p', 'wk-menu__title', 'ねこの なまえは？'));
  var face = mk('div', 'wk-name__cat');
  face.setAttribute('aria-hidden', 'true');
  face.textContent = '🐈';
  loadImage('images/' + pattern + '.png', function (ok) {
    if (!ok) { return; }
    face.textContent = '';
    face.style.backgroundImage = 'url("images/' + pattern + '.png")';
    face.classList.add('is-image');
  });
  box.appendChild(face);

  var form = mk('form', 'wk-name');
  form.setAttribute('autocomplete', 'off');
  var label = mk('label', 'wk-name__label', 'なまえ（' + NAME_MAX + 'もじ まで）');
  label.setAttribute('for', 'wkCatName');
  var input = mk('input', 'wk-name__input');
  input.type = 'text';
  input.id = 'wkCatName';
  input.maxLength = NAME_MAX * 2;   /* 絵文字などは 2つぶんに 数えられるので ゆとりを もたせ、cleanName で 切る */
  input.value = save.names[pattern] || WEEK.cats[pattern].name;
  input.setAttribute('enterkeyhint', 'done');
  form.appendChild(label);
  form.appendChild(input);
  box.appendChild(form);

  box.appendChild(mk('p', 'wk-name__hint', 'タップで えらぶ ことも できます'));
  var chips = mk('div', 'wk-name__chips');
  [WEEK.cats[pattern].name].concat(NAME_IDEAS).forEach(function (n) {
    var c = mk('button', 'wk-chip', n);
    c.type = 'button';
    c.addEventListener('click', function () { input.value = n; });
    chips.appendChild(c);
  });
  box.appendChild(chips);

  function decide() {
    var name = cleanName(input.value) || WEEK.cats[pattern].name;
    save.names[pattern] = name;
    var r = newRun(owner, pattern);
    r.catName = name;
    startRun(r);
  }
  form.addEventListener('submit', function (e) { e.preventDefault(); input.blur(); decide(); });

  var go = mk('div', 'wk-quiz__next');
  box.appendChild(go);
  button(go, 'wk-btn--go', '🐾', 'この なまえで はじめる', '', decide);
  button(go, 'wk-btn--sub', '', 'もどる', '', function () { chooseCat(owner); });
}

function startRun(r) {
  run = upgradeRun(r);
  used = {};
  save.run = run;
  writeWeekSave();
  resetStage();
  updateHeader();
  playSlot();
}

/* ---------------------------------------------------------
   12. はじまり
   --------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', function () {
  cacheUi();
  showTitle();
});
