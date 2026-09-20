# -*- coding: utf-8 -*-
"""
生成AIから受け取った 3×3（9ポーズ）の猫シートを、ゲームで使える形に整える。

・焼き込まれた市松模様や、ベタの白背景を除去して透過PNGにする
・9セルを切り出し、共通の縮尺・横中央・下ぞろえ（接地位置）に並べ直す
・複数枚をまとめて渡すと、すべてに同じ縮尺を使うので、
  猫の柄を入れ替えても大きさと立ち位置が変わらない

つかいかた:
    python3 tools/build_cat_sheet.py 出力先ディレクトリ 入力1.jpg:出力名1 入力2.jpg:出力名2 ...
例:
    python3 tools/build_cat_sheet.py images chashiro.jpg:cat-chashiro kijitora.jpg:cat-kijitora
"""
import sys
import numpy as np
from PIL import Image
from collections import deque

CELL = 340     # 出力の1マスの大きさ（px）
PAD  = 16      # マスの内側にとる余白（px）


def remove_background(path):
    """市松模様・白ベタの背景を外周から塗りつぶして透過にする。"""
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.int16)
    H, W, _ = rgb.shape
    sat = rgb.max(2) - rgb.min(2)
    bright = rgb.mean(2)

    # 背景の色は、画像の外周から実際に採取する。
    # 市松模様は「灰色＋白」「うすいピンク＋白」など 絵に よって ちがうので、
    # 明るさだけでなく 色そのものを おぼえて、それに 近い 画素を 背景とみなす。
    ring = np.concatenate([
        rgb[:3].reshape(-1, 3), rgb[-3:].reshape(-1, 3),
        rgb[:, :3].reshape(-1, 3), rgb[:, -3:].reshape(-1, 3)])

    # 8きざみに まとめて、外周の 5%以上を しめる 色を 背景の 色とする
    keys, counts = np.unique((ring // 8), axis=0, return_counts=True)
    bg_colors = [k * 8 + 4 for k, c in zip(keys, counts) if c > len(ring) * 0.05]
    if not bg_colors:
        raise SystemExit(f'{path}: 外周から 背景の色を 見つけられません'
                         '（透過か、ベタの単色背景で 出力してください）')

    def near_bg(tolerance):
        """背景の色から tolerance 以内の 画素"""
        out = np.zeros((H, W), bool)
        for color in bg_colors:
            out |= (np.abs(rgb - color).max(2) <= tolerance)
        return out

    cand = near_bg(18)
    white_bg = max(c.mean() for c in bg_colors) > 246
    print('  背景の色: ' + ' / '.join(str(tuple(int(v) for v in c)) for c in bg_colors)
          + (f'（純白をふくむ）' if white_bg else '（純白は絵として残す）'))

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

    # JPEG圧縮でにじんだ輪郭まわりの灰色ハローを2px分だけ追加で除去
    # 背景の色に ちかい ところまでを ハローとみなす。
    # ひろげすぎると 細い線（しっぽの動き線など）まで けずれる。
    halo = near_bg(48)
    if not white_bg:
        halo &= bright < 250        # 絵のまわりの 白いフチは のこす
    for _ in range(2):
        bg |= dilate(bg) & halo

    alpha = np.where(bg, 0.0, 255.0)

    # 透明部分のRGBを不透明な隣接色で埋める（合成時の灰色フリンジ防止）
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
        out[take] = acc[take] / cnt[take][:, None]
        opaque |= take

    # のこった 斑点（背景の けし残り）を とりのぞく。
    # ・とても ちいさい かたまり
    # ・色が 背景そのもの の かたまり（市松模様の 1マスぶん など）
    # のどちらかを けす。絵の 細い線（しっぽの動き線など）は のこる。
    opaque_mask = alpha > 40
    visited = np.zeros((H, W), bool)
    ys, xs = np.where(opaque_mask)
    removed = 0
    for sy, sx in zip(ys, xs):
        if visited[sy, sx]:
            continue
        stack = [(sy, sx)]
        visited[sy, sx] = True
        blob = []
        while stack:
            y, x = stack.pop()
            blob.append((y, x))
            for ny, nx in ((y-1, x), (y+1, x), (y, x-1), (y, x+1)):
                if 0 <= ny < H and 0 <= nx < W and opaque_mask[ny, nx] and not visited[ny, nx]:
                    visited[ny, nx] = True
                    stack.append((ny, nx))

        points = np.array(blob)
        mean_color = out[points[:, 0], points[:, 1]].mean(0)
        distance = min(float(np.abs(mean_color - color).max()) for color in bg_colors)

        tiny = len(blob) < 40
        # 平均の 色が 背景に ちかい ちいさな かたまりは けし残り。
        # 絵の 細い線（しっぽの動き線など）は こい色なので のこる。
        bg_like = (len(blob) < 1200) and (distance <= 40)
        if tiny or bg_like:
            for y, x in blob:
                alpha[y, x] = 0
            removed += 1
    if removed:
        print(f'  けし残りの かたまりを {removed}こ とりのぞいた')

    # アルファを1pxだけぼかしてアンチエイリアスにする
    pad = np.pad(alpha, 1, mode='edge')
    alpha = sum(pad[1+dy:H+1+dy, 1+dx:W+1+dx] * w
                for dy, dx, w in ((0, 0, .4), (-1, 0, .15), (1, 0, .15), (0, -1, .15), (0, 1, .15)))

    return np.dstack([np.clip(out, 0, 255), np.clip(alpha, 0, 255)]).astype(np.uint8)


def measure_cells(sheet, name):
    """3×3に分割し、各セルの猫の外接矩形をはかる。"""
    A = sheet[..., 3] > 40
    H = sheet.shape[0]
    bounds = [round(i * H / 3) for i in range(4)]
    cells = []
    for r in range(3):
        for c in range(3):
            y0, y1, x0, x1 = bounds[r], bounds[r+1], bounds[c], bounds[c+1]
            sub = A[y0:y1, x0:x1]
            ys, xs = np.where(sub)
            if len(ys) == 0:
                raise SystemExit(f'{name}: [{r},{c}] に絵がありません')
            by0, by1, bx0, bx1 = ys.min(), ys.max()+1, xs.min(), xs.max()+1
            touch = (by0 == 0) or (bx0 == 0) or (by1 == sub.shape[0]) or (bx1 == sub.shape[1])
            if touch:
                print(f'  警告 {name} [{r},{c}]: 絵がマスの枠に接しています（はみ出しの可能性）')
            cells.append(dict(r=r, c=c, box=(int(x0+bx0), int(y0+by0), int(x0+bx1), int(y0+by1)),
                              w=int(bx1-bx0), h=int(by1-by0)))
    return cells


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    outdir = sys.argv[1].rstrip('/')
    jobs = []
    for arg in sys.argv[2:]:
        src, _, out = arg.partition(':')
        jobs.append((src, out or 'cat'))

    sheets = []
    for src, out in jobs:
        sheet = remove_background(src)
        cells = measure_cells(sheet, out)
        print(f'{src} → 透明画素 {100*(sheet[...,3]<8).mean():.1f}% / '
              f'猫の大きさ {min(c["w"] for c in cells)}〜{max(c["w"] for c in cells)}x'
              f'{min(c["h"] for c in cells)}〜{max(c["h"] for c in cells)}px')
        sheets.append((out, sheet, cells))

    # すべての絵に共通の縮尺（柄を入れ替えても大きさが変わらないように）
    inner = CELL - 2 * PAD
    scale = min(min(inner / c['w'], inner / c['h']) for _, _, cells in sheets for c in cells)
    print(f'共通の縮尺: {scale:.4f}（1マス {CELL}px / 余白 {PAD}px）')

    for out, sheet, cells in sheets:
        src_im = Image.fromarray(sheet, 'RGBA')
        dst = Image.new('RGBA', (CELL * 3, CELL * 3), (0, 0, 0, 0))
        for cl in cells:
            cat = src_im.crop(cl['box'])
            nw, nh = max(1, round(cl['w'] * scale)), max(1, round(cl['h'] * scale))
            cat = cat.resize((nw, nh), Image.LANCZOS)
            ox = cl['c'] * CELL + (CELL - nw) // 2        # 横は中央ぞろえ
            oy = cl['r'] * CELL + (CELL - PAD - nh)       # 縦は下ぞろえ（床に接地）
            dst.alpha_composite(cat, (ox, oy))
        path = f'{outdir}/{out}.png'
        dst.save(path)
        print(f'出力: {path} {dst.size}')


if __name__ == '__main__':
    main()
