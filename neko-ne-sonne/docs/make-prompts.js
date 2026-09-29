// ネコネソンヌ：絵の 生成に 添付する 見本画像を 作る
//   node docs/make-prompts.js [tiles]   （neko-ne-sonne/ で。1つ上の フォルダで python3 -m http.server 8765 を 動かして おく。tiles を つけると 盤の 見本は 作りなおさない）
//   できる もの：docs/guides/guide-town.png（9×9 の 街の 区画わり。色＝場所の 種類。全体の 見取り図で、Gemini には 添付しない）
//               docs/guides/guide-lane.png（3×3 の 見本。物どうしの すき間（幅 8%）が まん中を 十字に とおる）
//               docs/guides/board-sample.png（いまの 盤。上に 何が 重なるかの 見本）
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const OUT = path.join(__dirname, 'guides');

/* 9×9 の 街の 区画わり（1文字＝1マスの 場所）。docs/tile-prompts.md の 表と おなじ */
const TOWN = [
  '森森畑畑畑神神森森',
  '森住住住ア神神公公',
  '住住ア商商商商公野',
  '住ア商魚商魚商公野',
  '空商魚商商商魚学野',
  '住ア商魚商魚商学学',
  '住住ア商商商商学空',
  '工住住ア図銭空空森',
  '工工畑畑池森森森森',
];
const TINT = { 商: '#f2a7a0', 魚: '#7fb7e6', 住: '#f5d79b', ア: '#c9b8e0', 森: '#6fae6a', 畑: '#b5c97a', 神: '#e0705f', 公: '#bfe0a8',
  学: '#f0e08a', 野: '#8cc7a1', 工: '#a8a8a8', 空: '#e8d9b0', 図: '#d6a77a', 銭: '#7f9fd6', 池: '#7fd0e0' };

/* 十字の すき間（幅 8%）と、四すみの 区画（点線）。tint が あれば 区画に 色を つける。猫道の 帯は この すき間に かさなる */
function cell(x, y, s, tint) {
  const lane = s * 0.08, c = s / 2, q = c - lane / 2, pad = s * 0.02;
  let g = `<g transform="translate(${x},${y})"><rect width="${s}" height="${s}" fill="#e9e2c9"/>`;
  [[0, 0], [c + lane / 2, 0], [0, c + lane / 2], [c + lane / 2, c + lane / 2]].forEach(([qx, qy]) => {
    g += `<rect x="${qx + pad}" y="${qy + pad}" width="${q - pad * 2}" height="${q - pad * 2}" rx="${s * 0.035}" fill="${tint || '#bfe0a8'}" stroke="#7a7a5a" stroke-width="${s * 0.012}" stroke-dasharray="${s * 0.035} ${s * 0.02}"/>`;
  });
  return g + '</g>';
}
function svg(n, s, tintOf) {
  let body = '';
  for (let i = 0; i < n * n; i++) body += cell((i % n) * s, Math.floor(i / n) * s, s, tintOf ? tintOf(i) : null);
  for (let k = 1; k < n; k++) {
    body += `<line x1="${k * s}" y1="0" x2="${k * s}" y2="${n * s}" stroke="#fff" stroke-width="3"/><line x1="0" y1="${k * s}" x2="${n * s}" y2="${k * s}" stroke="#fff" stroke-width="3"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n * s}" height="${n * s}">${body}</svg>`;
}

(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1620, height: 1620 } });
  for (const [name, n, sz, tintOf] of [['guide-town', 9, 180, (i) => TINT[TOWN[Math.floor(i / 9)][i % 9]]], ['guide-lane', 3, 512, null]]) {
    await pg.setContent(`<html><body style="margin:0">${svg(n, sz, tintOf)}</body></html>`);
    await pg.screenshot({ path: path.join(OUT, name + '.png'), clip: { x: 0, y: 0, width: n * sz, height: n * sz } });
  }
  if (process.argv[2] !== 'tiles') {
    /* いまの 盤（CPU どうしで おわった 盤面） */
    const g = await b.newPage({ viewport: { width: 1280, height: 900 } });
    await g.addInitScript(() => { const st = window.setTimeout; window.setTimeout = (f, d, ...a) => st(f, Math.min(d || 0, 2), ...a); });
    await g.goto('http://localhost:8765/neko-ne-sonne/');
    for (let i = 0; i < 4; i++) await g.click(`[data-action=seat][data-seat="${i}"][data-mode=cpu]`);
    await g.click('[data-action=start]');
    await g.waitForFunction(() => NNS.getGame() && NNS.getGame().phase !== 'playing', null, { timeout: 300000, polling: 200 });
    await g.click('[data-action=view]');
    await (await g.$('.nn-board')).screenshot({ path: path.join(OUT, 'board-sample.png') });
  }
  await b.close();
  console.log('done');
})();
