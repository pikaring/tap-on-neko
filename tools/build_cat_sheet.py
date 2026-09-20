# -*- coding: utf-8 -*-
"""市松模様の背景を除去して透過PNG化し、9セルを同縮尺・同接地位置に正規化する。"""
import numpy as np
from PIL import Image
from collections import deque

SRC = 'source.jpg'   # 生成AIから受け取った 3x3 の1枚画像（JPEG/PNG どちらでも）
rgb = np.asarray(Image.open(SRC).convert('RGB')).astype(np.int16)
H, W, _ = rgb.shape

sat    = rgb.max(2) - rgb.min(2)
bright = rgb.mean(2)

# --- 1. 市松模様（無彩色・中間の明るさ）を候補として、外周から塗りつぶし ---
cand = (sat < 16) & (bright > 150) & (bright < 246)
bg = np.zeros((H, W), bool)
dq = deque()
for x in range(W):
    for y in (0, H - 1):
        if cand[y, x] and not bg[y, x]:
            bg[y, x] = True; dq.append((y, x))
for y in range(H):
    for x in (0, W - 1):
        if cand[y, x] and not bg[y, x]:
            bg[y, x] = True; dq.append((y, x))
while dq:
    y, x = dq.popleft()
    for ny, nx in ((y-1, x), (y+1, x), (y, x-1), (y, x+1)):
        if 0 <= ny < H and 0 <= nx < W and cand[ny, nx] and not bg[ny, nx]:
            bg[ny, nx] = True; dq.append((ny, nx))

def dilate(m):
    out = m.copy()
    out[1:, :] |= m[:-1, :]; out[:-1, :] |= m[1:, :]
    out[:, 1:] |= m[:, :-1]; out[:, :-1] |= m[:, 1:]
    return out

# --- 2. JPEG圧縮でにじんだ輪郭まわりの灰色ハローを2px分のみ追加除去 ---
halo = (sat < 26) & (bright > 140)
for _ in range(2):
    bg |= dilate(bg) & halo

alpha = np.where(bg, 0.0, 255.0)

# --- 3. 透明部分のRGBを不透明な隣接色で埋める（合成時の灰色フリンジ防止） ---
out = rgb.astype(np.float32)
opaque = ~bg
for _ in range(3):
    fill = ~opaque
    if not fill.any():
        break
    acc = np.zeros_like(out); cnt = np.zeros((H, W), np.float32)
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        src = np.roll(np.roll(out, dy, 0), dx, 1)
        msk = np.roll(np.roll(opaque, dy, 0), dx, 1).astype(np.float32)
        acc += src * msk[..., None]; cnt += msk
    take = fill & (cnt > 0)
    out[take] = (acc[take] / cnt[take][:, None])
    opaque = opaque | take

# --- 4. アルファを1pxだけぼかしてアンチエイリアス ---
pad = np.pad(alpha, 1, mode='edge')
alpha = sum(pad[1+dy:H+1+dy, 1+dx:W+1+dx] * w
            for dy, dx, w in ((0,0,.4),(-1,0,.15),(1,0,.15),(0,-1,.15),(0,1,.15)))

sheet = np.dstack([np.clip(out, 0, 255), np.clip(alpha, 0, 255)]).astype(np.uint8)
Image.fromarray(sheet, 'RGBA').save('cat_nobg.png')
print('背景除去: 透明画素 %.1f%%' % (100 * (sheet[..., 3] < 8).mean()))

# --- 5. 9セルに分割し、猫ごとの外接矩形を計測 ---
A = sheet[..., 3] > 40
bounds = [round(i * H / 3) for i in range(4)]
cells = []
for r in range(3):
    for c in range(3):
        y0, y1, x0, x1 = bounds[r], bounds[r+1], bounds[c], bounds[c+1]
        sub = A[y0:y1, x0:x1]
        ys, xs = np.where(sub)
        by0, by1, bx0, bx1 = ys.min(), ys.max()+1, xs.min(), xs.max()+1
        touch = (by0 == 0) or (bx0 == 0) or (by1 == sub.shape[0]) or (bx1 == sub.shape[1])
        cells.append(dict(r=r, c=c, box=(x0+bx0, y0+by0, x0+bx1, y0+by1),
                          w=int(bx1-bx0), h=int(by1-by0), touch=touch))
        print(f'  [{r},{c}] 大きさ {bx1-bx0:3d}x{by1-by0:3d}px  セル枠に接触: {"あり" if touch else "なし"}')

# --- 6. 全セル共通の縮尺で、横中央・下ぞろえに配置し直す ---
CELL, PAD = 340, 16
inner = CELL - 2 * PAD
scale = min(min(inner / cl['w'], inner / cl['h']) for cl in cells)
print('共通の縮尺: %.3f  → 1セル %dpx' % (scale, CELL))

src = Image.fromarray(sheet, 'RGBA')
dst = Image.new('RGBA', (CELL * 3, CELL * 3), (0, 0, 0, 0))
for cl in cells:
    cat = src.crop(cl['box'])
    nw, nh = max(1, round(cl['w'] * scale)), max(1, round(cl['h'] * scale))
    cat = cat.resize((nw, nh), Image.LANCZOS)
    ox = cl['c'] * CELL + (CELL - nw) // 2                 # 横は中央ぞろえ
    oy = cl['r'] * CELL + (CELL - PAD - nh)                # 縦は下ぞろえ（床に接地）
    dst.alpha_composite(cat, (ox, oy))
dst.save('cat.png')
print('出力: cat.png', dst.size)
