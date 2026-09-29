// ネコネソンヌ：絵の 生成に 添付する 見本画像を 作る
//   node docs/make-prompts.js   （neko-ne-sonne/ で。1つ上の フォルダで python3 -m http.server 8765 を 動かして おく）
//   できる もの：docs/guides/guide-ground.png（街区タイルの 配置の 見本）
//               docs/guides/guide-items.png（魚屋・トンネルの 配置の 見本）
//               docs/guides/board-sample.png（いまの 盤。上に 何が 重なるかの 見本）
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const OUT = path.join(__dirname, 'guides');

/* 街区タイル：まん中の 十字（幅 28%）は 猫道が 通る 空き地。四すみ（点線の 緑）に 建物や 木 */
function groundCell(x, y) {
  const s = 512, lane = s * 0.28, c = s / 2, q = c - lane / 2;
  const corners = [[0, 0], [c + lane / 2, 0], [0, c + lane / 2], [c + lane / 2, c + lane / 2]];
  return `<g transform="translate(${x},${y})">
    <rect width="${s}" height="${s}" fill="#e9e2c9"/>
    <rect x="${c - lane / 2}" y="0" width="${lane}" height="${s}" fill="#d9cfb2"/>
    <rect x="0" y="${c - lane / 2}" width="${s}" height="${lane}" fill="#d9cfb2"/>
    ${corners.map(([qx, qy]) => `<rect x="${qx + 16}" y="${qy + 16}" width="${q - 32}" height="${q - 32}" rx="18" fill="#bfe0a8" stroke="#7aa35e" stroke-width="6" stroke-dasharray="18 10"/>`).join('')}
  </g>`;
}
/* 魚屋・トンネル：白い 背景の まん中に 1つ（マスの 7割ほど） */
function itemCell(x, y) {
  return `<g transform="translate(${x},${y})"><rect width="512" height="512" fill="#ffffff"/>
    <rect x="80" y="80" width="352" height="352" rx="30" fill="#f3efe4" stroke="#b9ab8b" stroke-width="6" stroke-dasharray="20 12"/></g>`;
}
function sheet(cellFn) {
  let body = '';
  for (let i = 0; i < 9; i++) body += cellFn((i % 3) * 512, Math.floor(i / 3) * 512);
  for (let k = 1; k < 3; k++) {
    body += `<line x1="${k * 512}" y1="0" x2="${k * 512}" y2="1536" stroke="#fff" stroke-width="4"/>`;
    body += `<line x1="0" y1="${k * 512}" x2="1536" y2="${k * 512}" stroke="#fff" stroke-width="4"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1536">${body}</svg>`;
}

(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1536, height: 1536 } });
  for (const [name, svg] of [['guide-ground', sheet(groundCell)], ['guide-items', sheet(itemCell)]]) {
    await pg.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    await pg.screenshot({ path: path.join(OUT, name + '.png'), clip: { x: 0, y: 0, width: 1536, height: 1536 } });
  }
  /* いまの 盤（CPU どうしで おわった 盤面） */
  const g = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await g.addInitScript(() => { const st = window.setTimeout; window.setTimeout = (f, d, ...a) => st(f, Math.min(d || 0, 2), ...a); });
  await g.goto('http://localhost:8765/neko-ne-sonne/');
  for (let i = 0; i < 4; i++) await g.click(`[data-action=seat][data-seat="${i}"][data-mode=cpu]`);
  await g.click('[data-action=start]');
  await g.waitForFunction(() => NNS.getGame() && NNS.getGame().phase !== 'playing', null, { timeout: 300000, polling: 200 });
  await g.click('[data-action=view]');
  await (await g.$('.nn-board')).screenshot({ path: path.join(OUT, 'board-sample.png') });
  await b.close();
  console.log('done');
})();
