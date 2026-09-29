// ネコネソンヌ：絵の 生成に 添付する 見本画像を 作る
//   node docs/make-prompts.js   （neko-ne-sonne/ で。1つ上の フォルダで python3 -m http.server 8765 を 動かして おく）
//   できる もの：docs/guides/guide-tiles-1〜4.png（タイルの 猫道の 形と 位置の 見本。1シート 3×3）
//               docs/guides/board-sample.png（いまの 盤。上に 何が 重なるかの 見本）
//   猫道は マス幅の 16%・まん中から 辺の まん中へ。ゲームの 猫道（main.js の tileSVG）と おなじ 形
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const OUT = path.join(__dirname, 'guides');
const S = 512, W = S * 0.16;
const N = 1, E = 2, So = 4, Wt = 8;      // 猫道の 4bit（main.js と おなじ）
const MID = { 1: [S / 2, 0], 2: [S, S / 2], 4: [S / 2, S], 8: [0, S / 2] };

/* 各シートの 9マス（行の 順）。m＝猫道の 向き、shop＝魚屋（店を 上よりに 描き、手前の まん中を あける） */
const SHEETS = [
  [15, 15, 15, E | So | Wt, E | So | Wt, E | So | Wt, E | Wt, E | Wt, E | Wt],
  [So | E, So | E, So | E, So | E, So | E, So | E, E | Wt, E | Wt, E | Wt],
  [So, So, So, So, So, So, E | So | Wt, E | So | Wt, E | So | Wt],
  [0, 0, 0, { m: 0, shop: 1 }, { m: 0, shop: 1 }, { m: So, shop: 1 }, 15, 15, 15],
];

function cell(x, y, spec) {
  const m = typeof spec === 'object' ? spec.m : spec, shop = typeof spec === 'object' && spec.shop;
  let g = `<g transform="translate(${x},${y})"><rect width="${S}" height="${S}" fill="#f4efdc"/>`;
  if (shop) g += `<rect x="96" y="40" width="320" height="250" rx="24" fill="#bfe0a8" stroke="#7aa35e" stroke-width="6" stroke-dasharray="18 10"/>`;
  else if (!m) g += `<rect x="70" y="70" width="372" height="372" rx="30" fill="#bfe0a8" stroke="#7aa35e" stroke-width="6" stroke-dasharray="18 10"/>`;
  [N, E, So, Wt].forEach(d => { if (m & d) g += `<line x1="${S / 2}" y1="${S / 2}" x2="${MID[d][0]}" y2="${MID[d][1]}" stroke="#8a6440" stroke-width="${W + 12}"/>`; });
  [N, E, So, Wt].forEach(d => { if (m & d) g += `<line x1="${S / 2}" y1="${S / 2}" x2="${MID[d][0]}" y2="${MID[d][1]}" stroke="#d7b98a" stroke-width="${W}"/>`; });
  if (m) g += `<circle cx="${S / 2}" cy="${S / 2}" r="${W * 0.65}" fill="#d7b98a" stroke="#8a6440" stroke-width="6"/>`;
  return g + '</g>';
}
function sheet(cells) {
  let body = '';
  cells.forEach((c, i) => { body += cell((i % 3) * S, Math.floor(i / 3) * S, c); });
  for (let k = 1; k < 3; k++) {
    body += `<line x1="${k * S}" y1="0" x2="${k * S}" y2="${3 * S}" stroke="#fff" stroke-width="4"/>`;
    body += `<line x1="0" y1="${k * S}" x2="${3 * S}" y2="${k * S}" stroke="#fff" stroke-width="4"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${3 * S}" height="${3 * S}">${body}</svg>`;
}

(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1536, height: 1536 } });
  for (let i = 0; i < SHEETS.length; i++) {
    await pg.setContent(`<html><body style="margin:0">${sheet(SHEETS[i])}</body></html>`);
    await pg.screenshot({ path: path.join(OUT, `guide-tiles-${i + 1}.png`), clip: { x: 0, y: 0, width: 1536, height: 1536 } });
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
