// ネコネソンヌ：絵の 生成に 添付する 見本画像を 作る
//   node docs/make-prompts.js [tiles]   （neko-ne-sonne/ で。1つ上の フォルダで python3 -m http.server 8765 を 動かして おく。tiles を つけると 盤の 見本は 作りなおさない）
//   できる もの：docs/guides/guide-cross・guide-t・guide-straight・guide-corner・guide-dead・guide-flat .png
//                 （タイルの 形ごとの 見本。灰色＝物、白い すき間＝猫道。1まい 3×3 で おなじ 形）
//               docs/guides/guide-town.png（9×9 の 街の 区画わりの 見取り図。Gemini には 添付しない）
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


/* タイルの 形ごとの 見本。物（灰色）どうしの すき間が 猫道の 形に なる。すき間 約10%・ふちの 余白 約3%。
   T字＝⊥（すき間が 上・左・右）、角＝┐（すき間が 左・下）、行き止まり＝下から まん中まで の 切れこみ */
const M = 16, G = 52, H = 256, LO = H - G / 2, HI = H + G / 2, R = 496;
const GUIDES = {
  'guide-cross': [[M, M, LO, LO], [HI, M, R, LO], [M, HI, LO, R], [HI, HI, R, R]],
  'guide-t': [[M, M, LO, LO], [HI, M, R, LO], [M, HI, R, R]],
  'guide-straight': [[M, M, LO, R], [HI, M, R, R]],
  'guide-corner': [[M, M, R, LO], [HI, M, R, R], [M, HI, LO, R]],
  'guide-dead': [[M, M, R, R, 'slit']],
  'guide-flat': [[M + 24, M + 24, R - 24, R - 24]],
};
function guideTile(x, y, boxes) {
  let g = `<g transform="translate(${x},${y})"><rect width="512" height="512" fill="#fff"/>`;
  boxes.forEach(([x0, y0, x1, y1, kind]) => {
    if (kind === 'slit') {   /* 1つの 大きな 物に 下の 辺から まん中まで 切れこみ */
      g += `<path d="M${x0} ${y0} H${x1} V${y1} H${HI} V${H} H${LO} V${y1} H${x0} Z" fill="#c0c0c0"/>`;
    } else g += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="24" fill="#c0c0c0"/>`;
  });
  return g + `<rect width="512" height="512" fill="none" stroke="#888" stroke-width="3"/></g>`;
}
function guideSheet(boxes) {
  let body = '';
  for (let i = 0; i < 9; i++) body += guideTile((i % 3) * 512, Math.floor(i / 3) * 512, boxes);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1536">${body}</svg>`;
}

(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1620, height: 1620 } });
  await pg.setViewportSize({ width: 1620, height: 1620 });
  await pg.setContent(`<html><body style="margin:0">${svg(9, 180, (i) => TINT[TOWN[Math.floor(i / 9)][i % 9]])}</body></html>`);
  await pg.screenshot({ path: path.join(OUT, 'guide-town.png'), clip: { x: 0, y: 0, width: 1620, height: 1620 } });
  for (const [name, boxes] of Object.entries(GUIDES)) {
    await pg.setContent(`<html><body style="margin:0">${guideSheet(boxes)}</body></html>`);
    await pg.screenshot({ path: path.join(OUT, name + '.png'), clip: { x: 0, y: 0, width: 1536, height: 1536 } });
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
