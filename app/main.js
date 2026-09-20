/* =========================================================
   ねこの ともだち  ―  ゲームロジック
   ・バックエンドなし／LocalStorage に ほぞん
   ・タップ（クリック）だけで あそべる
   ・じかんせいげん なし／ゲームオーバー なし／びょうき なし
   ========================================================= */
'use strict';

/* ---------------------------------------------------------
   1. ほぞんデータ（LocalStorage）
   --------------------------------------------------------- */
var SAVE_KEY = 'nekochan-save-v1';

/** ほぞんデータの しょきち */
function defaultSave() {
  return {
    friendship: 0,      // なかよし度の ごうけい
    lastVisit: 0,       // まえに あそんだ ときの じかん（ミリびょう）
    food: 0,            // おなかの ゲージ（0〜10目盛）
    play: 0,            // あそびの ゲージ（0〜10目盛）
    foodFull: false,    // まんタンに なって おやすみ中か
    playFull: false,
    kotobaSeen: [],     // さいきん だした ことばの もんだい
    kanjiSeen: [],      // さいきん だした かんじの もんだい
    silhouetteSeen: [], // さいきん だした かげあての もんだい
    catPattern: ''      // えらんだ ねこの がら（はじめては から）
  };
}

var state = defaultSave();

/** よみこみ（こわれていても ぜったいに エラーで とまらない） */
function loadSave() {
  try {
    var raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) { return defaultSave(); }
    var data = JSON.parse(raw);
    var save = defaultSave();
    if (typeof data.friendship === 'number' && isFinite(data.friendship) && data.friendship >= 0) {
      save.friendship = Math.floor(data.friendship);
    }
    if (typeof data.lastVisit === 'number' && isFinite(data.lastVisit)) {
      save.lastVisit = data.lastVisit;
    }
    if (typeof data.catPattern === 'string' && findPattern(data.catPattern)) {
      save.catPattern = data.catPattern;
    }
    ['food', 'play'].forEach(function (key) {
      if (typeof data[key] === 'number' && isFinite(data[key])) {
        var value = data[key];
        /* むかしの ほぞん（0〜100）は 10目盛に なおす */
        if (value > METER_MAX) { value = value / 10; }
        save[key] = Math.min(METER_MAX, Math.max(0, value));
      }
      if (typeof data[key + 'Full'] === 'boolean') {
        save[key + 'Full'] = data[key + 'Full'];
      } else if (save[key] >= METER_MAX - 0.001) {
        save[key + 'Full'] = true;      /* まんタンで 保存されて いた ばあい */
      }
    });
    ['kotobaSeen', 'kanjiSeen', 'silhouetteSeen'].forEach(function (key) {
      if (Array.isArray(data[key])) {
        save[key] = data[key].filter(function (n) { return typeof n === 'number' && n >= 0; });
      }
    });
    return save;
  } catch (e) {
    return defaultSave();   // プライベートモードなどで つかえない ときも そのまま あそべる
  }
}

/** かきこみ（しっぱいしても なにも おこらない） */
function saveGame() {
  try {
    state.lastVisit = Date.now();
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    /* ほぞんできない ときも ゲームは つづけられる */
  }
}

/* ---------------------------------------------------------
   2. クイズの データ
      ・ことばの あなうめ：questions-kotoba.js（tap-on-kotoba の 出題データ）
      ・かげあて：images/animals.png の 9しゅるい
   --------------------------------------------------------- */
/* questions-kotoba.js が よみこめない ときは かげあてだけで あそべる */
var KOTOBA = (typeof QUESTIONS !== 'undefined' && Array.isArray(QUESTIONS)) ? QUESTIONS : [];

/* つかう もんだいの しゅるい。
   ごはん（あなうめ）… y=四字熟語 / k=ことわざ / i=慣用句
   あそび（よみ）  … d=難読漢字 */
var KOTOBA_TYPES = ['y', 'k', 'i'];
var KANJI_TYPES  = ['d'];

var KOTOBA_LABEL = {
  y: 'よじじゅくご',
  k: 'ことわざ',
  i: 'かんようく',
  d: 'かんじの よみ'
};

function poolOf(types) {
  return KOTOBA.filter(function (q) {
    return q && typeof q.q === 'string' && Array.isArray(q.c) && types.indexOf(q.t) !== -1;
  });
}

var kotobaPool = poolOf(KOTOBA_TYPES);   /* ごはんの クイズ（あなうめ 200もん） */
var kanjiPool  = poolOf(KANJI_TYPES);    /* あそびの クイズ（難読漢字 100もん） */

/* かげあて（cell は images/animals.png の [たて, よこ]） */
var SILHOUETTES = [
  { cell: [0, 0], emoji: '🐘', question: 'この かげは なんの どうぶつ？', choices: ['ぞう', 'きりん', 'うま'] },
  { cell: [0, 1], emoji: '🦒', question: 'この かげは なんの どうぶつ？', choices: ['きりん', 'うま', 'ぞう'] },
  { cell: [0, 2], emoji: '🐰', question: 'この かげは なんの どうぶつ？', choices: ['うさぎ', 'ねこ', 'いぬ'] },
  { cell: [1, 0], emoji: '🐔', question: 'この かげは なんの とり？',     choices: ['にわとり', 'はと', 'すずめ'] },
  { cell: [1, 1], emoji: '🐟', question: 'この かげは なにかな？',         choices: ['さかな', 'とり', 'むし'] },
  { cell: [1, 2], emoji: '🐢', question: 'この かげは なんの いきもの？', choices: ['かめ', 'かに', 'かえる'] },
  { cell: [2, 0], emoji: '🦋', question: 'この かげは なんの むし？',     choices: ['ちょう', 'とんぼ', 'はち'] },
  { cell: [2, 1], emoji: '🐴', question: 'この かげは なんの どうぶつ？', choices: ['うま', 'うし', 'ぶた'] },
  { cell: [2, 2], emoji: '🐷', question: 'この かげは なんの どうぶつ？', choices: ['ぶた', 'いぬ', 'ひつじ'] }
];

/* かげあてを だす わりあい（4もんに 1もんくらい） */
var SILHOUETTE_ONE_IN = 4;

/* ---------------------------------------------------------
   3. ねこの がら（4しゅるい）
      どれも 同じ 9ポーズ・同じ おおきさ・同じ 立ち位置で 作って あるので、
      入れかえても 画面の みえ方は かわらない。
   --------------------------------------------------------- */
/* relax: ひとりで いる ときの すがたの シート（cat-*-relax.png）が あるか。
   ない がらでは、1まいめの ポーズだけで ゆっくり きりかえる。 */
var CAT_PATTERNS = [
  { id: 'cat-kijitora',  name: 'きじとら', relax: true },
  { id: 'cat-chashiro',  name: 'ちゃしろ', relax: true },
  { id: 'cat-kuro',      name: 'くろねこ', relax: true },
  { id: 'cat-hachiware', name: 'はちわれ', relax: true }
];
var DEFAULT_CAT = 'cat-kijitora';
var currentCat = DEFAULT_CAT;

/** がらの いちらんから さがす（しらない なまえは null） */
function findPattern(id) {
  for (var i = 0; i < CAT_PATTERNS.length; i++) {
    if (CAT_PATTERNS[i].id === id) { return CAT_PATTERNS[i]; }
  }
  return null;
}

/** がらの 画像の ばしょ */
function catImagePath(id) {
  return 'images/' + id + '.png';
}

/* ---------------------------------------------------------
   4. なかよし度で ふえる へやの アイテム
   --------------------------------------------------------- */
/* cell は images/items.png（3×3）の [たて, よこ] の いち。
   pos は へやの なかの おく位置（bottom が おおきいほど おく＝かべ側）。
   小物どうしの 大小は 画像側で つけてあるので、わくの おおきさは ぜんぶ 同じ。 */
var UNLOCKS = [
  { point:   10, name: 'ふかふかの クッション', emoji: '🛋️', cell: [0, 0], pos: { left:  '1%',  bottom: '15%' } },
  { point:   40, name: 'まるい けいと',         emoji: '🧶', cell: [0, 1], pos: { right: '21%', bottom: '2%'  } },
  { point:   90, name: 'きれいな おはな',       emoji: '🌷', cell: [0, 2], pos: { right: '2%',  bottom: '2%'  } },
  { point:  160, name: 'おさかなの おやつ',     emoji: '🐟', cell: [1, 0], pos: { left:  '1%',  bottom: '2%'  } },
  { point:  260, name: 'ねこ用の ベッド',       emoji: '🧺', cell: [1, 1], pos: { right: '2%',  bottom: '28%' } },
  { point:  400, name: 'ねこじゃらし',          emoji: '🪶', cell: [1, 2], pos: { right: '2%',  bottom: '15%' } },
  { point:  600, name: 'みずの おさら',         emoji: '💧', cell: [2, 0], pos: { left:  '20%', bottom: '2%'  } },
  { point:  850, name: 'キャットタワー',        emoji: '🪑', cell: [2, 1], pos: { left:  '1%',  bottom: '28%' } },
  { point: 1200, name: 'おもちゃの ねずみ',     emoji: '🐭', cell: [2, 2], pos: { left:  '20%', bottom: '15%' } }
];

/* ---------------------------------------------------------
   5. 画面の ぶひん
   --------------------------------------------------------- */
var el = {};

function cacheElements() {
  el.friendship     = document.getElementById('friendship');
  el.level          = document.getElementById('level');
  el.gaugeBar       = document.getElementById('gaugeBar');
  el.message        = document.getElementById('message');
  el.room           = document.getElementById('room');
  el.roomItems      = document.getElementById('roomItems');
  el.cat            = document.getElementById('cat');
  el.effects        = document.getElementById('effects');
  el.btnPet         = document.getElementById('btnPet');
  el.btnFeed        = document.getElementById('btnFeed');
  el.quizModal      = document.getElementById('quizModal');
  el.quizQuestion   = document.getElementById('quizQuestion');
  el.quizChoices    = document.getElementById('quizChoices');
  el.quizResult     = document.getElementById('quizResult');
  el.quizSilhouette = document.getElementById('quizSilhouette');
  el.quizSilhouetteEmoji = document.getElementById('quizSilhouetteEmoji');
  el.btnCloseQuiz   = document.getElementById('btnCloseQuiz');
  el.btnCloseQuizText = document.getElementById('btnCloseQuizText');
  el.quizKind       = document.getElementById('quizKind');
  el.quizTitle      = document.getElementById('quizTitle');
  el.quizAnswer     = document.getElementById('quizAnswer');
  el.quizYomi       = document.getElementById('quizYomi');
  el.quizImi        = document.getElementById('quizImi');
  el.meterFood      = document.getElementById('meterFood');
  el.meterFoodNotches = document.getElementById('meterFoodNotches');
  el.meterFoodState = document.getElementById('meterFoodState');
  el.meterPlay      = document.getElementById('meterPlay');
  el.meterPlayNotches = document.getElementById('meterPlayNotches');
  el.meterPlayState = document.getElementById('meterPlayState');
  el.btnCatPicker   = document.getElementById('btnCatPicker');
  el.catModal       = document.getElementById('catModal');
  el.catChoices     = document.getElementById('catChoices');
  el.btnCloseCat    = document.getElementById('btnCloseCat');
  el.bignews        = document.getElementById('bignews');
  el.bignewsText    = document.getElementById('bignewsText');
}

/* ---------------------------------------------------------
   6. メッセージ・ひょうじの こうしん
   --------------------------------------------------------- */
function setMessage(text) {
  el.message.textContent = text;
}

/** なかよし度から レベルを だす（10ごとに 1レベル） */
function levelOf(points) {
  return Math.floor(points / 10) + 1;
}

function renderStatus() {
  el.friendship.textContent = String(state.friendship);
  el.level.textContent = 'レベル ' + levelOf(state.friendship);
  el.gaugeBar.style.width = (state.friendship % 10) * 10 + '%';
}

/** へやの かざりを つくる（さいしょに 1かいだけ） */
function buildRoomItems() {
  el.roomItems.textContent = '';
  UNLOCKS.forEach(function (item) {
    var node = document.createElement('div');
    node.className = 'room-item';
    node.hidden = true;
    /* 3×3 の どの こまを みせるか */
    node.style.backgroundPosition = (item.cell[1] * 50) + '% ' + (item.cell[0] * 50) + '%';
    if (item.pos.left)  { node.style.left  = item.pos.left; }
    if (item.pos.right) { node.style.right = item.pos.right; }
    node.style.bottom = item.pos.bottom;

    var emoji = document.createElement('span');
    emoji.className = 'room-item__emoji';
    emoji.textContent = item.emoji;
    node.appendChild(emoji);

    item.node = node;
    el.roomItems.appendChild(node);
  });
}

/** へやの かざりを ひょうじ（なかよし度に とうたつした ものだけ） */
function renderRoomItems() {
  UNLOCKS.forEach(function (item) {
    if (item.node) { item.node.hidden = (state.friendship < item.point); }
  });
}

/* ---------------------------------------------------------
   7. じかんに あわせた あいさつ
   --------------------------------------------------------- */
function greetingByHour(hour) {
  if (hour >= 5 && hour <= 10) {
    return 'おはようニャ！あさごはん たべるニャ';
  }
  if (hour >= 11 && hour <= 16) {
    return 'こんにちはニャ！あそんでほしいニャ';
  }
  return 'こんばんはニャ。もう ねむいニャ';
}

/** じかんたいの ポーズ（あさ＝あくび／ひる＝あそんで／よる＝ねむる） */
function poseByHour(hour) {
  if (hour >= 5 && hour <= 10)  { return 'morning'; }
  if (hour >= 11 && hour <= 16) { return 'noon'; }
  return 'night';
}

/* ---------------------------------------------------------
   なにも していない ときの ポーズ

   ずっと 同じ かっこう だと さみしいので、ねこの きもち（ゲージ）に
   あわせて いくつかの ポーズを ゆっくり じゅんばんに きりかえる。
   --------------------------------------------------------- */
/* 2まいめの シートが ないと つかえない ポーズ */
var RELAX_POSES = ['belly', 'groom', 'tail', 'loaf', 'stretch', 'surprised', 'lookup', 'back'];

var IDLE_POSES = {
  /* おなかも あそびも まんタン ＝ まんぞくして ねる・こうばこずわり */
  satisfied: ['loaf', 'night', 'stretch', 'night', 'loaf', 'idle'],
  /* あそびたい ＝ おなかを みせて かまって・あそびの おさそい */
  wantPlay:  ['belly', 'noon', 'tail', 'belly', 'noon', 'thinking'],
  /* おなかが すいた ＝ 手を あげて おねだり・見上げる */
  wantFood:  ['welcome', 'lookup', 'idle', 'lookup', 'welcome', 'thinking'],
  /* よる ＝ ねむっている */
  night:     ['night', 'loaf', 'night', 'stretch', 'night'],
  /* ふつう ＝ いろいろ */
  normal:    ['idle', 'groom', 'thinking', 'loaf', 'morning', 'back',
              'idle', 'tail', 'noon', 'surprised', 'lookup']
};

var IDLE_MESSAGES = {
  satisfied: 'おなかも こころも いっぱい… すーすー',
  wantPlay:  'あそんで ほしいニャー',
  wantFood:  'おなかが すいたニャー'
};

var IDLE_INTERVAL = 7000;      /* 7びょうごとに つぎの ポーズへ */
var idleIndex = 0;
var idleKindNow = '';

/** いまの ねこの きもち（どの ポーズの グループを つかうか） */
function idleKind() {
  if (meterResting('food') && meterResting('play')) { return 'satisfied'; }
  if (state.play <= 0 && state.food <= 0) { return 'wantPlay'; }   /* あそびの ほうを 先に */
  if (state.play <= 0) { return 'wantPlay'; }
  if (state.food <= 0) { return 'wantFood'; }
  if (poseByHour(new Date().getHours()) === 'night') { return 'night'; }
  return 'normal';
}

/** その ポーズが いま つかえるか（2まいめが ない がらでは つかわない） */
function poseAvailable(name) {
  return relaxReady || RELAX_POSES.indexOf(name) === -1;
}

/** ふだんの ポーズを きめる */
function updateBasePose() {
  var kind = idleKind();
  if (kind !== idleKindNow) {
    idleKindNow = kind;
    idleIndex = 0;
  }
  var list = IDLE_POSES[kind];

  /* つかえない ポーズは とばして、つぎの つかえる ポーズを さがす */
  for (var i = 0; i < list.length; i++) {
    var candidate = list[(idleIndex + i) % list.length];
    if (poseAvailable(candidate)) {
      basePose = candidate;
      return;
    }
  }
  basePose = 'idle';
}

/** ねこの きもちが かわった ことを ことばでも つたえる */
function announceIdleKind() {
  var message = (idleKindNow === 'wantPlay' || idleKindNow === 'wantFood')
    ? requestMessage()
    : IDLE_MESSAGES[idleKindNow];
  if (message && el.quizModal.hidden && el.catModal.hidden) {
    setMessage(message);
  }
}

/** なにも していない ときに、つぎの ポーズへ すすめる */
function stepIdlePose() {
  if (!el.quizModal.hidden || !el.catModal.hidden) { return; }  /* がめんを ひらいて いる */
  if (poseTimer) { return; }                                    /* アクションの ポーズを みせて いる */

  var before = idleKindNow;
  idleIndex++;
  updateBasePose();
  if (idleKindNow !== before) { idleIndex = 0; updateBasePose(); }
  setPose(basePose, 0);
}

/** はじめの あいさつ（ひさしぶりでも ポジティブに むかえる） */
function showGreeting() {
  var hour = new Date().getHours();
  var greet = greetingByHour(hour);
  var timePose = poseByHour(hour);
  var away = Date.now() - state.lastVisit;
  var longTime = (state.lastVisit > 0 && away > 6 * 60 * 60 * 1000);

  updateBasePose();

  if (longTime) {
    setMessage('まってたニャ！' + greet);
    setPose('welcome', 4000);        /* おかえりの てふり */
  } else {
    setMessage(greet);
    setPose(timePose, 6000);
  }
}

/* ---------------------------------------------------------
   8. エフェクト（ハート・ごはん・おおきな おしらせ）
   --------------------------------------------------------- */
/** ねこの まわりに 絵文字を ふわっと うかべる */
function popEffects(emoji, count) {
  for (var i = 0; i < count; i++) {
    (function (index) {
      window.setTimeout(function () {
        var span = document.createElement('span');
        span.className = 'effect';
        span.textContent = emoji;
        span.style.marginLeft = (Math.random() * 200 - 100) + 'px';   /* ねこの かおに かぶらないよう 左右に ちらす */
        span.addEventListener('animationend', function () {
          if (span.parentNode) { span.parentNode.removeChild(span); }
        });
        el.effects.appendChild(span);
      }, index * 180);
    })(i);
  }
}

function animateCat(className, duration) {
  el.cat.classList.remove('is-happy', 'is-eating');
  /* いちど けして すぐ つけると アニメーションが やりなおしに なる */
  void el.cat.offsetWidth;
  el.cat.classList.add(className);
  window.setTimeout(function () {
    el.cat.classList.remove(className);
  }, duration);
}

/* ねこの ポーズ。
   1まいめ（cat-*.png）＝おせわの ときの 9つ
   2まいめ（cat-*-relax.png）＝ひとりで いる ときの 8つ
   （絵文字で あそんで いる ときは なにも おこらない） */
var POSE_NAMES = [
  'idle', 'happy', 'eating', 'morning', 'noon', 'night',
  'welcome', 'celebrate', 'thinking',
  'belly', 'groom', 'tail', 'loaf', 'stretch', 'surprised', 'lookup', 'back'
];

var POSE_CLASSES = POSE_NAMES.map(function (name) { return 'is-pose-' + name; });
var basePose = 'idle';     /* なにも していない ときの ポーズ */
var poseTimer = null;
var relaxReady = false;    /* ひとりで いる ときの すがたの シートが つかえるか */

/**
 * ポーズを かえる。
 * @param {string} name  idle / happy / eating / morning / noon / night /
 *                       welcome / celebrate / thinking
 * @param {number} holdMs 0 なら そのまま、それ以外は そのあと basePose に もどる
 */
function setPose(name, holdMs) {
  if (poseTimer) { window.clearTimeout(poseTimer); poseTimer = null; }
  POSE_CLASSES.forEach(function (cls) { el.cat.classList.remove(cls); });
  el.cat.classList.add('is-pose-' + name);
  if (holdMs > 0) {
    poseTimer = window.setTimeout(function () { setPose(basePose, 0); }, holdMs);
  }
}

/** 小物と へやの 背景画像を よみこむ（しっぱいしても 絵文字と グラデーションで あそべる） */
function enableRoomImages() {
  var items = new Image();
  items.addEventListener('load', function () {
    el.roomItems.classList.add('room-items--image');
  });
  items.src = 'images/items.png';

  var room = new Image();
  room.addEventListener('load', function () {
    el.room.classList.add('room--image');
  });
  room.src = 'images/room.jpg';

  var animals = new Image();
  animals.addEventListener('load', function () {
    el.quizSilhouette.classList.add('quiz__silhouette--image');
  });
  animals.src = 'images/animals.png';
}

/**
 * ねこの がらを きりかえる。
 * 画像が よみこめた ときだけ さしかえるので、よみこめない ときは
 * 絵文字の ままで あそべる。
 * @param {string}  id       がらの なまえ（cat-kijitora など）
 * @param {boolean} announce true なら あいさつの メッセージを だす
 */
function applyCatPattern(id, announce) {
  var pattern = findPattern(id);
  if (!pattern) {
    id = DEFAULT_CAT;
    pattern = findPattern(id);
  }
  currentCat = id;
  state.catPattern = id;
  saveGame();

  relaxReady = false;
  el.cat.style.removeProperty('--cat-image-relax');

  var src = catImagePath(id);
  var img = new Image();
  img.addEventListener('load', function () {
    el.cat.style.setProperty('--cat-image', 'url("' + src + '")');
    el.cat.classList.add('cat--image');

    /* ひとりで いる ときの すがたの シートは、1まいめの あとで よみこむ
       （さいしょの ひょうじを はやく する ため）。ある がらだけ。 */
    if (!pattern.relax) {
      updateBasePose();
      return;
    }
    var relaxSrc = 'images/' + id + '-relax.png';
    var relaxImg = new Image();
    relaxImg.addEventListener('load', function () {
      if (currentCat !== id) { return; }        /* あいだに がらが かわった */
      el.cat.style.setProperty('--cat-image-relax', 'url("' + relaxSrc + '")');
      relaxReady = true;
      updateBasePose();
    });
    relaxImg.src = relaxSrc;
  });
  img.src = src;

  if (announce) {
    setMessage('これから よろしくニャ！');
    setPose('welcome', 3000);
    popEffects('❤️', 2);
  }
}

var bignewsTimer = null;

/**
 * おおきな おしらせを だす。
 * @param {boolean} atTop true なら へやの かべの あたりに だす
 *                        （ねこの かおを かくさない ため）
 */
function showBigNews(text, duration, atTop) {
  el.bignewsText.textContent = text;
  el.bignews.classList.toggle('is-top', atTop === true);
  el.bignews.hidden = false;
  if (bignewsTimer) { window.clearTimeout(bignewsTimer); }
  bignewsTimer = window.setTimeout(function () {
    el.bignews.hidden = true;
  }, duration || 1800);
}

/* ---------------------------------------------------------
   ねこを えらぶ がめん
   --------------------------------------------------------- */
/** せんたくしを つくりなおす（いま えらんでいる ねこに しるしを つける） */
function renderCatChoices() {
  el.catChoices.textContent = '';
  CAT_PATTERNS.forEach(function (pattern) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'cat-choice' + (pattern.id === currentCat ? ' is-current' : '');

    var face = document.createElement('span');
    face.className = 'cat-choice__face';
    face.style.backgroundImage = 'url("' + catImagePath(pattern.id) + '")';

    var name = document.createElement('span');
    name.className = 'cat-choice__name';
    name.textContent = pattern.name;

    var mark = document.createElement('span');
    mark.className = 'cat-choice__mark';
    mark.textContent = (pattern.id === currentCat) ? '✔' : '';

    button.appendChild(face);
    button.appendChild(name);
    button.appendChild(mark);
    button.addEventListener('click', function () {
      if (pattern.id === currentCat) { return; }
      applyCatPattern(pattern.id, true);
      renderCatChoices();               /* えらんだら すぐ みため が かわる */
    });
    el.catChoices.appendChild(button);
  });
}

function openCatPicker() {
  renderCatChoices();
  el.catModal.hidden = false;
}

function closeCatPicker() {
  el.catModal.hidden = true;
}

/* ---------------------------------------------------------
   おなかと あそびの ゲージ
      ・アクションで ふえて、まんタンに なると そのアクションは おやすみ
      ・じかんが たつと へっていき、0に なると ねこが おねがいしてくる
      ・あそびの ゲージの ほうが はやく へる
   --------------------------------------------------------- */
var METER_MAX      = 10;    // ゲージの 目盛の かず
var FOOD_PER_QUIZ  = 3;     // ごはんの クイズ 1かいで 3目盛（4かいで まんタン）
var PLAY_PER_QUIZ  = 3;     // あそびの クイズ 1かいで 3目盛（4かいで まんタン）
var FOOD_MINUTES   = 360;   // まんタンから 0に なるまで 6じかん（36ぷんで 1目盛）
var PLAY_MINUTES   = 180;   // あそびは 3じかんで 0（18ぷんで 1目盛）
var lastTick = 0;

/** ゲージが まんタンか */
function meterIsFull(name) {
  return state[name] >= METER_MAX - 0.001;
}

/**
 * その お世話が いま おやすみ中か。
 * まんタンに なったら、0に なるまで おやすみに する。
 * （すこし 減った だけで また できると、いくらでも くりかえせて しまう ため）
 */
function meterResting(name) {
  return state[name + 'Full'] === true;
}

/** じかんの ぶんだけ ゲージを へらす */
function decayMeters(minutes) {
  if (!(minutes > 0)) { return; }
  state.food = Math.max(0, state.food - minutes * METER_MAX / FOOD_MINUTES);
  state.play = Math.max(0, state.play - minutes * METER_MAX / PLAY_MINUTES);
  /* 0に なったら おやすみ おわり。また お世話できる */
  if (state.food <= 0) { state.foodFull = false; }
  if (state.play <= 0) { state.playFull = false; }
}

/** ゲージを ふやす（まんタンより 上には いかない） */
function addMeter(name, amount) {
  var before = idleKindNow;
  state[name] = Math.min(METER_MAX, state[name] + amount);
  if (meterIsFull(name)) { state[name + 'Full'] = true; }   /* ここから おやすみ */
  renderMeters();
  updateBasePose();
  /* まんぞくした ときは、ことばと ねている すがたで つたえる（すこし あとで） */
  if (idleKindNow === 'satisfied' && before !== 'satisfied') {
    window.setTimeout(function () {
      if (idleKindNow !== 'satisfied') { return; }
      announceIdleKind();
      if (!poseTimer) { setPose(basePose, 0); }
    }, 2800);
  }
  saveGame();
}

/** ゲージの 目盛を つくる（さいしょに 1かいだけ） */
function buildMeters() {
  ['Food', 'Play'].forEach(function (key) {
    var box = el['meter' + key + 'Notches'];
    box.textContent = '';
    for (var i = 0; i < METER_MAX; i++) {
      var notch = document.createElement('span');
      notch.className = 'meter__notch';
      box.appendChild(notch);
    }
  });
}

/** ゲージと ボタンの みためを こうしん */
function renderMeters() {
  [['food', 'おなか'], ['play', 'あそび']].forEach(function (pair) {
    var name = pair[0];
    var key = (name === 'food') ? 'Food' : 'Play';
    var value = state[name];
    var lit = Math.round(value);

    var notches = el['meter' + key + 'Notches'].children;
    for (var i = 0; i < notches.length; i++) {
      notches[i].classList.toggle('is-on', i < lit);
    }

    el['meter' + key].classList.toggle('is-full', meterResting(name));
    var word = '';
    if (meterResting(name)) {
      word = 'まんぞく';
    } else if (value <= 0) {
      word = (name === 'food') ? 'ぺこぺこ' : 'あそびたい';
    }
    el['meter' + key + 'State'].textContent = word ? '（' + word + '）' : '';
  });

  /* まんタンの あいだは ボタンを やすみの いろに する。
     おしても だいじょうぶで、ねこが「いっぱいだニャ」と こたえる ので、
     aria-disabled（おしても なにも おきない）には しない。 */
  el.btnFeed.classList.toggle('is-resting', meterResting('food'));
  el.btnPet.classList.toggle('is-resting', meterResting('play'));
}

/** ゲージが 0の ときの おねがいの ことば（0が なければ から） */
function requestMessage() {
  if (state.food <= 0 && state.play <= 0) {
    return 'おなかが すいたニャー。あそんで ほしいニャー';
  }
  if (state.food <= 0) { return 'おなかが すいたニャー'; }
  if (state.play <= 0) { return 'あそんで ほしいニャー'; }
  return '';
}

/** 1ぷんごとに ゲージを へらし、0に なった ときは おねがいする */
function tick() {
  var now = Date.now();
  var minutes = (now - lastTick) / 60000;
  lastTick = now;

  var beforeFood = state.food;
  var beforePlay = state.play;
  decayMeters(minutes);
  renderMeters();
  updateBasePose();

  var justEmpty = (beforeFood > 0 && state.food <= 0) || (beforePlay > 0 && state.play <= 0);
  if (justEmpty) {
    announceIdleKind();
    if (!poseTimer) { setPose(basePose, 0); }
    saveGame();
  }
}

/* ---------------------------------------------------------
   9. なかよし度を ふやす（アイテムの おしらせも する）
   --------------------------------------------------------- */
function addFriendship(amount, messageWhenNoUnlock) {
  var before = state.friendship;
  state.friendship = before + amount;

  var unlocked = UNLOCKS.filter(function (item) {
    return before < item.point && state.friendship >= item.point;
  });

  renderStatus();
  renderRoomItems();
  saveGame();

  if (unlocked.length > 0) {
    var names = unlocked.map(function (u) { return u.name; }).join('と');
    window.setTimeout(function () {
      setMessage('やったニャ！' + names + 'が へやに ふえたニャ！');
      showBigNews('やったね！', 1600, true);
      popEffects('✨', 4);
      setPose('celebrate', 2800);
    }, 900);
  } else if (messageWhenNoUnlock) {
    setMessage(messageWhenNoUnlock);
  }
}

/* ---------------------------------------------------------
   10. 「なでる」
   --------------------------------------------------------- */
var PET_MESSAGES = [
  'ゴロゴロ…（うれしいニャ！）',
  'ゴロゴロ…（もっと なでてニャ）',
  'ゴロゴロ…（きもちいいニャ！）'
];
var petCount = 0;

/**
 * ねこを タップした ときの なでる うごき。
 * いつでも できて、ゲージや なかよし度は うごかない
 * （ボタンを おさなくても ねこと ふれあえる ように する ため）。
 */
function onPet() {
  popEffects('❤️', 2);
  animateCat('is-happy', 1300);
  setPose('happy', 2000);
  setMessage(PET_MESSAGES[petCount % PET_MESSAGES.length]);
  petCount++;
}

/** 「あそぶ」ボタン（あそびの ゲージが いっぱいの ときは やすませる） */
function onPlay() {
  if (meterResting('play')) {
    setMessage('たくさん あそんだニャ。すこし やすむニャ');
    setPose('night', 2600);
    return;
  }
  openQuiz('play');
}

/* ---------------------------------------------------------
   11. 「ごはんを あげる（クイズ）」
   --------------------------------------------------------- */
var currentQuiz = null;
var quizAnswered = false;
var quizMode = 'food';     /* 'food' ＝ ごはん（あなうめ）／'play' ＝ あそび（かんじ） */

/**
 * さいきん だしていない もんだいの ばんごうを えらぶ。
 * @param {number} total もんだいの ぜんぶの かず
 * @param {Array}  seen  さいきん だした ばんごう（この なかから えらばない）
 * @param {number} keep  おぼえておく かず
 */
function pickIndex(total, seen, keep) {
  var index = 0;
  for (var tries = 0; tries < 50; tries++) {
    index = Math.floor(Math.random() * total);
    if (seen.indexOf(index) === -1) { break; }
  }
  seen.push(index);
  while (seen.length > keep) { seen.shift(); }
  return index;
}

/**
 * つぎの もんだいを つくる。
 * @param {string} mode 'food' ＝ ことばの あなうめ・かげあて
 *                      'play' ＝ 難読漢字の よみ
 */
function nextQuiz(mode) {
  if (mode === 'play' && kanjiPool.length > 0) {
    var kanji = kanjiPool[pickIndex(kanjiPool.length, state.kanjiSeen, 30)];
    saveGame();
    return {
      kind: 'kanji',
      label: 'かんじの よみ',
      text: kanji.q,
      choices: kanji.c,
      answer: kanji.a,
      yomi: '',
      imi: kanji.imi || ''
    };
  }

  var useSilhouette = (kotobaPool.length === 0) ||
                      (Math.random() < 1 / SILHOUETTE_ONE_IN);

  if (useSilhouette) {
    var s = SILHOUETTES[pickIndex(SILHOUETTES.length, state.silhouetteSeen, 4)];
    saveGame();
    return {
      kind: 'silhouette',
      label: 'かげあて',
      cell: s.cell,
      emoji: s.emoji,
      text: s.question,
      choices: s.choices,
      answer: s.choices[0],      /* データの 1ばんめが せいかい。ならびは あとで まぜる */
      yomi: '',
      imi: ''
    };
  }

  var k = kotobaPool[pickIndex(kotobaPool.length, state.kotobaSeen, 40)];
  saveGame();
  return {
    kind: 'kotoba',
    label: KOTOBA_LABEL[k.t] || 'ことば',
    text: k.q,
    choices: k.c,
    answer: k.a,
    yomi: k.yomi || '',
    imi: k.imi || ''
  };
}

/** せんたくしの じゅんばんを ばらばらに する（せいかいが いつも 上に こない ように） */
function shuffledChoices(quiz) {
  var list = quiz.choices.slice();
  for (var i = list.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

/**
 * もんだい文を かく。
 * ことばの もんだいは "_" の ところを あなに する。
 * @param {string} filled せいかいの あと、あなに いれる ことば（まだの ときは null）
 */
function renderQuestion(quiz, filled) {
  el.quizQuestion.textContent = '';
  el.quizQuestion.className = 'quiz__question' +
    (quiz.kind === 'kotoba' ? ' quiz__question--word' : '');

  /* 難読漢字は かんじを おおきく みせて、下に といかけを かく */
  if (quiz.kind === 'kanji') {
    var kanji = document.createElement('span');
    kanji.className = 'quiz__kanji';
    kanji.textContent = quiz.text;
    el.quizQuestion.appendChild(kanji);

    var ask = document.createElement('span');
    ask.className = 'quiz__ask';
    ask.textContent = 'これは なんと よむ？';
    el.quizQuestion.appendChild(ask);
    return;
  }

  if (quiz.kind !== 'kotoba') {
    el.quizQuestion.textContent = quiz.text;
    return;
  }

  var parts = quiz.text.split('_');
  el.quizQuestion.appendChild(document.createTextNode(parts[0]));

  var blank = document.createElement('span');
  blank.className = 'quiz__blank' + (filled ? ' is-filled' : '');
  blank.textContent = filled || '？';
  el.quizQuestion.appendChild(blank);

  if (parts.length > 1) {
    el.quizQuestion.appendChild(document.createTextNode(parts.slice(1).join('_')));
  }
}

function openQuiz(mode) {
  quizMode = (mode === 'play') ? 'play' : 'food';
  currentQuiz = nextQuiz(quizMode);
  quizAnswered = false;

  el.quizTitle.textContent = (quizMode === 'play') ? 'あそびの クイズ' : 'ごはんの クイズ';
  el.quizResult.textContent = '';
  el.quizResult.className = 'quiz__result';
  el.quizKind.textContent = currentQuiz.label;
  el.quizAnswer.hidden = true;
  el.quizChoices.hidden = false;
  el.btnCloseQuizText.textContent = 'とじる';

  if (currentQuiz.kind === 'silhouette') {
    el.quizSilhouette.style.backgroundPosition =
      (currentQuiz.cell[1] * 50) + '% ' + (currentQuiz.cell[0] * 50) + '%';
    el.quizSilhouetteEmoji.textContent = currentQuiz.emoji;
    el.quizSilhouette.classList.add('is-shadow');
    el.quizSilhouette.hidden = false;
  } else {
    el.quizSilhouette.hidden = true;
    el.quizSilhouette.classList.remove('is-shadow');
  }

  renderQuestion(currentQuiz, null);

  el.quizChoices.className = 'quiz__choices';
  el.quizChoices.textContent = '';
  shuffledChoices(currentQuiz).forEach(function (label) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice';
    button.textContent = label;
    button.addEventListener('click', function () { onChoice(button, label); });
    el.quizChoices.appendChild(button);
  });

  el.quizModal.hidden = false;
  setMessage((quizMode === 'play') ? 'あそびの クイズだニャ！' : 'ごはんの クイズだニャ！');
  setPose('thinking', 0);          /* こたえを まっている あいだは かんがえる かお */
}

/** クイズを とじる。せいかいして いたら ごはんの ごほうび */
function closeQuiz() {
  var answered = quizAnswered;
  el.quizModal.hidden = true;
  currentQuiz = null;
  quizAnswered = false;

  if (!answered) {
    setPose(basePose, 0);          /* とちゅうで とじた ときは もとに もどす */
    return;
  }

  /* ―― あそびの ごほうび：なでて もらって よろこぶ ―― */
  if (quizMode === 'play') {
    popEffects('❤️', 3);
    animateCat('is-happy', 1300);
    setPose('happy', 2600);
    setMessage('ゴロゴロ…（たのしかったニャ！）');
    addMeter('play', PLAY_PER_QUIZ);
    addFriendship(2, null);
    return;
  }

  /* ―― ごはんの ごほうび：モグモグ たべる ―― */
  popEffects('🍚', 3);
  animateCat('is-eating', 1800);
  setPose('eating', 3400);
  setMessage('モグモグ… おいしいニャ！ありがとうニャ！');
  addMeter('food', FOOD_PER_QUIZ);
  addFriendship(3, null);
  window.setTimeout(function () { popEffects('❤️', 2); }, 900);
}

function onChoice(button, label) {
  if (!currentQuiz || quizAnswered) { return; }

  /* ―― ふせいかい（ペナルティ なし・なんどでも どうぞ） ―― */
  if (label !== currentQuiz.answer) {
    button.classList.add('is-wrong');
    button.disabled = true;
    el.quizResult.textContent = 'おしい！もういっかい！';
    el.quizResult.className = 'quiz__result is-ng';
    return;
  }

  /* ―― せいかい ―― */
  quizAnswered = true;
  button.classList.add('is-correct');

  var buttons = el.quizChoices.querySelectorAll('.choice');
  for (var i = 0; i < buttons.length; i++) { buttons[i].disabled = true; }

  el.quizResult.textContent = '大正解！';
  el.quizResult.className = 'quiz__result is-ok';
  showBigNews('大正解！', 1800);

  /* こたえを あなに いれ、かげあては いろを みせる */
  renderQuestion(currentQuiz, currentQuiz.answer);
  el.quizSilhouette.classList.remove('is-shadow');

  /* よみと いみを みせる。じかんせいげんは ないので ゆっくり よめる */
  el.quizChoices.hidden = true;
  el.quizYomi.textContent = currentQuiz.yomi
    ? '（' + currentQuiz.yomi + '）'
    : 'こたえは 「' + currentQuiz.answer + '」';
  el.quizImi.textContent = currentQuiz.imi;
  el.quizAnswer.hidden = false;

  /* ごほうびは ボタンを おした ときに わたす */
  el.btnCloseQuizText.textContent = (quizMode === 'play') ? 'なでる' : 'ごはんを あげる';
}

/** 「ごはんを あげる」ボタン（おなかが いっぱいの ときは やすませる） */
function onFeed() {
  if (meterResting('food')) {
    setMessage('おなかは いっぱいだニャ。ごちそうさまニャ');
    setPose('idle', 2600);
    return;
  }
  openQuiz('food');
}

/* ---------------------------------------------------------
   12. スタート
   --------------------------------------------------------- */
function init() {
  cacheElements();
  state = loadSave();

  /* はじめて あそぶ ときだけ、ねこを えらぶ がめんを だす */
  var firstTime = !findPattern(state.catPattern);

  /* あそんで いなかった あいだの ぶん、ゲージを へらす */
  if (state.lastVisit > 0) {
    decayMeters((Date.now() - state.lastVisit) / 60000);
  }
  lastTick = Date.now();

  renderStatus();
  buildMeters();
  renderMeters();
  buildRoomItems();
  renderRoomItems();
  enableRoomImages();
  updateBasePose();
  setPose(basePose, 0);
  applyCatPattern(firstTime ? DEFAULT_CAT : state.catPattern, false);
  showGreeting();
  saveGame();

  el.btnPet.addEventListener('click', onPlay);
  el.btnFeed.addEventListener('click', onFeed);
  el.btnCloseQuiz.addEventListener('click', closeQuiz);
  el.btnCatPicker.addEventListener('click', openCatPicker);
  el.btnCloseCat.addEventListener('click', closeCatPicker);

  /* なにも していない ときの ポーズを ゆっくり きりかえる */
  window.setInterval(stepIdlePose, IDLE_INTERVAL);

  /* 1ぷんごとに ゲージを へらす。ほかの がめんから もどった ときも すぐ こうしん */
  window.setInterval(tick, 60000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { tick(); }
  });

  /* あいさつの あとで、おねがいが あれば つたえる */
  if (requestMessage()) {
    window.setTimeout(function () {
      if (el.quizModal.hidden && el.catModal.hidden && requestMessage()) {
        setMessage(requestMessage());
        setPose(basePose, 0);
      }
    }, 4500);
  }

  if (firstTime) { openCatPicker(); }

  /* ねこ本体を タップしても なでられる（わかりやすさの ため） */
  el.cat.addEventListener('click', onPet);
}

document.addEventListener('DOMContentLoaded', init);
