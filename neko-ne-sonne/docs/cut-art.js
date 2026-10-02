// ネコネソンヌ：Gemini で 作った 絵（docs/art/）を 切りわけて images/ に 書き出す
//   node docs/cut-art.js   （neko-ne-sonne/ で。1つ上の フォルダで python3 -m http.server 8765 を 動かして おく）
//   docs/art/ground-a.jpg・ground-b.jpg（3×3 の 街区）→ images/town-00.webp 〜 town-17.webp（a の 9まい、b の 9まいの 順）
//   docs/art/items.jpg（上 2段 魚屋 6・下 1段 トンネル 3）→ images/shop-0.webp 〜 shop-5.webp・images/tunnel-0.webp 〜 tunnel-2.webp
//   小物は 白い 背景を 外がわから 塗りつぶして 透明に する（日よけの 白い しまなど、線で かこまれた 白は のこる）
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const IMG = path.join(__dirname, '..', 'images');
const BASE = 'http://localhost:8765/neko-ne-sonne/docs/art/';

(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage();
  await pg.goto(BASE + 'items.jpg');
  const out = await pg.evaluate(async (BASE) => {
    const load = (f) => new Promise((ok, ng) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ng; i.src = BASE + f; });
    const res = {};
    /* 街区：マスの 区切り線を よけて 少し 内がわを 切る */
    for (const [sheet, k0] of [['ground-a.jpg', 0], ['ground-b.jpg', 9]]) {
      const im = await load(sheet), cw = im.width / 3, inset = cw * 0.015;
      for (let k = 0; k < 9; k++) {
        const cv = document.createElement('canvas'); cv.width = cv.height = 256;
        const x = (k % 3) * cw, y = Math.floor(k / 3) * cw;
        cv.getContext('2d').drawImage(im, x + inset, y + inset, cw - inset * 2, cw - inset * 2, 0, 0, 256, 256);
        res['town-' + String(k0 + k).padStart(2, '0') + '.webp'] = cv.toDataURL('image/webp', 0.86);
      }
    }
    /* 小物：白い 背景を 透明に */
    const im = await load('items.jpg'), cw = im.width / 3;
    for (let k = 0; k < 9; k++) {
      const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
      const g = cv.getContext('2d');
      g.drawImage(im, (k % 3) * cw, Math.floor(k / 3) * cw, cw, cw, 0, 0, S, S);
      const d = g.getImageData(0, 0, S, S), p = d.data;
      const light = (i) => Math.min(p[i * 4], p[i * 4 + 1], p[i * 4 + 2]);
      const seen = new Uint8Array(S * S), q = [];
      for (let i = 0; i < S; i++) q.push(i, (S - 1) * S + i, i * S, i * S + S - 1);
      while (q.length) {
        const i = q.pop();
        if (seen[i] || light(i) < 205) continue;
        seen[i] = 1;
        const x = i % S, y = (i / S) | 0;
        if (x > 0) q.push(i - 1); if (x < S - 1) q.push(i + 1);
        if (y > 0) q.push(i - S); if (y < S - 1) q.push(i + S);
      }
      for (let i = 0; i < S * S; i++) {
        if (!seen[i]) continue;
        /* 白に ちかいほど 透明（ふちの JPEG の にじみを なめらかに） */
        p[i * 4 + 3] = Math.max(0, Math.min(255, (255 - light(i)) * 5));
      }
      g.putImageData(d, 0, 0);
      res[(k < 6 ? 'shop-' + k : 'tunnel-' + (k - 6)) + '.webp'] = cv.toDataURL('image/webp', 0.9);
    }
    return res;
  }, BASE);
  for (const [name, url] of Object.entries(out)) {
    fs.writeFileSync(path.join(IMG, name), Buffer.from(url.split(',')[1], 'base64'));
  }
  await b.close();
  console.log('done', Object.keys(out).length);
})();
