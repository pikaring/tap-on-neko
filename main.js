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
    quizQueue: [],      // まだ だしていない クイズの ばんごう
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
    if (Array.isArray(data.quizQueue)) {
      save.quizQueue = data.quizQueue.filter(function (n) {
        return typeof n === 'number' && n >= 0 && n < QUIZZES.length;
      });
    }
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
   2. クイズの データ（6もん）
      type: 'text'（ことばの あなうめ） / 'silhouette'（かげあて）
   --------------------------------------------------------- */
var QUIZZES = [
  {
    type: 'text',
    question: '「〇〇も あるけば ぼうに あたる」\n〇〇に はいるのは どれ？',
    choices: ['いぬ', 'ねこ', 'とり'],
    answer: 0
  },
  {
    type: 'text',
    question: '「ねこに 〇〇」\nねうちが わからない ことを いう ことば。',
    choices: ['こばん', 'ざぶとん', 'おかし'],
    answer: 0
  },
  {
    type: 'silhouette',
    emoji: '🐘',
    question: 'この かげは なんの どうぶつ？',
    choices: ['ぞう', 'きりん', 'うま'],
    answer: 0
  },
  {
    type: 'text',
    question: '「さるも きから 〇〇」\n〇〇に はいるのは どれ？',
    choices: ['おちる', 'のぼる', 'とぶ'],
    answer: 0
  },
  {
    type: 'text',
    question: '「ねこの 〇 も かりたい」\nとても いそがしい ときの ことば。',
    choices: ['て', 'あし', 'みみ'],
    answer: 0
  },
  {
    type: 'silhouette',
    emoji: '🐟',
    question: 'この かげは なにかな？',
    choices: ['さかな', 'とり', 'むし'],
    answer: 0
  }
];

/* ---------------------------------------------------------
   3. ねこの がら（3しゅるい）
      どれも 同じ 9ポーズ・同じ おおきさ・同じ 立ち位置で 作って あるので、
      入れかえても 画面の みえ方は かわらない。
   --------------------------------------------------------- */
var CAT_PATTERNS = [
  { id: 'cat-kijitora', name: 'きじとら' },
  { id: 'cat-chashiro', name: 'ちゃしろ' },
  { id: 'cat-kuro',     name: 'くろねこ' }
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
var UNLOCKS = [
  { point: 10, id: 'itemCushion', name: 'ふかふかの クッション' },
  { point: 30, id: 'itemToy',     name: 'まるい けいと' },
  { point: 50, id: 'itemFlower',  name: 'きれいな おはな' },
  { point: 80, id: 'itemFish',     name: 'おさかなの おやつ' }
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
  el.cat            = document.getElementById('cat');
  el.effects        = document.getElementById('effects');
  el.btnPet         = document.getElementById('btnPet');
  el.btnFeed        = document.getElementById('btnFeed');
  el.quizModal      = document.getElementById('quizModal');
  el.quizQuestion   = document.getElementById('quizQuestion');
  el.quizChoices    = document.getElementById('quizChoices');
  el.quizResult     = document.getElementById('quizResult');
  el.quizSilhouette = document.getElementById('quizSilhouette');
  el.btnCloseQuiz   = document.getElementById('btnCloseQuiz');
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

/** へやの アイテムを ひょうじ（なかよし度に とうたつした ものだけ） */
function renderRoomItems() {
  UNLOCKS.forEach(function (item) {
    var node = document.getElementById(item.id);
    if (!node) { return; }
    node.hidden = (state.friendship < item.point);
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

/** はじめの あいさつ（ひさしぶりでも ポジティブに むかえる） */
function showGreeting() {
  var hour = new Date().getHours();
  var greet = greetingByHour(hour);
  var timePose = poseByHour(hour);
  var away = Date.now() - state.lastVisit;
  var longTime = (state.lastVisit > 0 && away > 6 * 60 * 60 * 1000);

  /* よるは ねむっている すがたを ふだんの ポーズに する */
  basePose = (timePose === 'night') ? 'night' : 'idle';

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

/* ねこの ポーズ（画像は 3×3 の 9マス。絵文字の ときは なにも おこらない） */
var POSE_CLASSES = [
  'is-pose-idle', 'is-pose-happy', 'is-pose-eating',
  'is-pose-morning', 'is-pose-noon', 'is-pose-night',
  'is-pose-welcome', 'is-pose-celebrate', 'is-pose-thinking'
];
var basePose = 'idle';     /* なにも していない ときの ポーズ */
var poseTimer = null;

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

/**
 * ねこの がらを きりかえる。
 * 画像が よみこめた ときだけ さしかえるので、よみこめない ときは
 * 絵文字の ままで あそべる。
 * @param {string}  id       がらの なまえ（cat-kijitora など）
 * @param {boolean} announce true なら あいさつの メッセージを だす
 */
function applyCatPattern(id, announce) {
  if (!findPattern(id)) { id = DEFAULT_CAT; }
  currentCat = id;
  state.catPattern = id;
  saveGame();

  var src = catImagePath(id);
  var img = new Image();
  img.addEventListener('load', function () {
    el.cat.style.setProperty('--cat-image', 'url("' + src + '")');
    el.cat.classList.add('cat--image');
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

function onPet() {
  popEffects('❤️', 3);
  animateCat('is-happy', 1300);
  setPose('happy', 2200);
  setMessage(PET_MESSAGES[petCount % PET_MESSAGES.length]);
  petCount++;
  addFriendship(1, null);
}

/* ---------------------------------------------------------
   11. 「ごはんを あげる（クイズ）」
   --------------------------------------------------------- */
var currentQuiz = null;
var quizAnswered = false;

/** じゅんばんを シャッフルした クイズの まちぎょうれつを つくる */
function refillQuizQueue() {
  var numbers = [];
  var i;
  for (i = 0; i < QUIZZES.length; i++) { numbers.push(i); }
  for (i = numbers.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = numbers[i];
    numbers[i] = numbers[j];
    numbers[j] = tmp;
  }
  state.quizQueue = numbers;
}

function nextQuiz() {
  if (!state.quizQueue || state.quizQueue.length === 0) { refillQuizQueue(); }
  var index = state.quizQueue.shift();
  saveGame();
  return QUIZZES[index];
}

function openQuiz() {
  currentQuiz = nextQuiz();
  quizAnswered = false;

  el.quizResult.textContent = '';
  el.quizResult.className = 'quiz__result';
  el.quizQuestion.textContent = currentQuiz.question;

  if (currentQuiz.type === 'silhouette') {
    el.quizSilhouette.textContent = currentQuiz.emoji;
    el.quizSilhouette.classList.add('is-shadow');
    el.quizSilhouette.hidden = false;
  } else {
    el.quizSilhouette.hidden = true;
    el.quizSilhouette.textContent = '';
    el.quizSilhouette.classList.remove('is-shadow');
  }

  el.quizChoices.textContent = '';
  currentQuiz.choices.forEach(function (label, i) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice';
    button.textContent = label;
    button.addEventListener('click', function () { onChoice(button, i); });
    el.quizChoices.appendChild(button);
  });

  el.quizModal.hidden = false;
  setMessage('ごはんの クイズだニャ！');
  setPose('thinking', 0);          /* こたえを まっている あいだは かんがえる かお */
}

function closeQuiz() {
  el.quizModal.hidden = true;
  currentQuiz = null;
  if (!quizAnswered) { setPose(basePose, 0); }   /* とちゅうで とじた ときは もとに もどす */
}

function onChoice(button, index) {
  if (!currentQuiz || quizAnswered) { return; }

  /* ―― せいかい ―― */
  if (index === currentQuiz.answer) {
    quizAnswered = true;

    button.classList.add('is-correct');
    el.quizResult.textContent = '大正解！';
    el.quizResult.className = 'quiz__result is-ok';

    /* かげあての ときは いろを みせて あげる */
    el.quizSilhouette.classList.remove('is-shadow');

    /* ほかの ボタンは おせなくする（まちがいを ふやさない） */
    var buttons = el.quizChoices.querySelectorAll('.choice');
    for (var i = 0; i < buttons.length; i++) { buttons[i].disabled = true; }

    showBigNews('大正解！', 1800);

    window.setTimeout(function () {
      closeQuiz();
      popEffects('🍚', 3);
      animateCat('is-eating', 1800);
      setPose('eating', 3400);
      setMessage('モグモグ… おいしいニャ！ありがとうニャ！');
      addFriendship(3, null);
      window.setTimeout(function () { popEffects('❤️', 2); }, 900);
    }, 1500);

    return;
  }

  /* ―― ふせいかい（ペナルティ なし・なんどでも どうぞ） ―― */
  button.classList.add('is-wrong');
  el.quizResult.textContent = 'おしい！もういっかい！';
  el.quizResult.className = 'quiz__result is-ng';
}

/* ---------------------------------------------------------
   12. スタート
   --------------------------------------------------------- */
function init() {
  cacheElements();
  state = loadSave();

  /* はじめて あそぶ ときだけ、ねこを えらぶ がめんを だす */
  var firstTime = !findPattern(state.catPattern);

  renderStatus();
  renderRoomItems();
  setPose(basePose, 0);
  applyCatPattern(firstTime ? DEFAULT_CAT : state.catPattern, false);
  showGreeting();
  saveGame();

  el.btnPet.addEventListener('click', onPet);
  el.btnFeed.addEventListener('click', openQuiz);
  el.btnCloseQuiz.addEventListener('click', closeQuiz);
  el.btnCatPicker.addEventListener('click', openCatPicker);
  el.btnCloseCat.addEventListener('click', closeCatPicker);

  if (firstTime) { openCatPicker(); }

  /* ねこ本体を タップしても なでられる（わかりやすさの ため） */
  el.cat.addEventListener('click', onPet);
}

document.addEventListener('DOMContentLoaded', init);
