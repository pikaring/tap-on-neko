# -*- coding: utf-8 -*-
"""
タイトルロゴ「猫街ろまん」と ゲームの ねこから、アプリの アイコン一式を つくる。
（猫街三部作 cat-on-escape・white-squid の tools/make_icons.py と おなじ 図がら）

・桜色から 若草色への 角丸に、テーマ色（#2f5d3a）の わく
・上に ロゴ、下に ねこ 4ひき（きじとら・はちわれ・ちゃしろ・くろ）が 座って ならぶ
・小さい アイコン（64px 以下）は ロゴの 文字が つぶれるので、ねこ 2ひき（きじとら・はちわれ）だけ
・app/images/icon-32 / 180 / 192 / 512.png（ホーム画面用。OS が 角を 丸く 切るので わく なしの 全面ぬり）と、
  紹介ページ・ポータル用の assets/icon.png（512px）・assets/favicon.png（64px。角丸と わくつき）を 書き出す

つかいかた:
    python3 tools/make_icons.py

ねこの 絵は app/images/cat-*.png（3×3 の ポーズ表）の 左上（すわり）を 切り出して 使う。

必要なもの: pillow, numpy （pip install pillow numpy）
"""
import os

import numpy as np
from PIL import Image, ImageDraw

BASE = 1024
TOP = (253, 232, 236)          # 桜色
BOTTOM = (214, 236, 214)       # 若草色
RIM = (47, 93, 58)             # 紹介ページの テーマ色 #2f5d3a
RADIUS = 0.19
SMALL = 64
LOGO = 'assets/logo.png'
CATS = ['kijitora', 'hachiware', 'chashiro', 'kuro']
OUT = [
    ('app/images/icon-512.png', 512),
    ('app/images/icon-192.png', 192),
    ('app/images/icon-180.png', 180),
    ('app/images/icon-32.png', 32),
    ('assets/icon.png', 512),
    ('assets/favicon.png', 64),
]


def sitting(name):
    """ポーズ表の 左上（すわって いる ねこ）を 切り出す"""
    sheet = Image.open(f'app/images/cat-{name}.png').convert('RGBA')
    cell = sheet.crop((0, 0, sheet.width // 3, sheet.height // 3))
    return cell.crop(cell.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())


def backdrop():
    g = np.linspace(0, 1, BASE)[:, None]
    rgb = np.array(TOP) * (1 - g) + np.array(BOTTOM) * g
    return Image.fromarray(np.repeat(rgb[:, None, :], BASE, axis=1).astype(np.uint8), 'RGB').convert('RGBA')


def row_of_cats(canvas, cats, top, bottom, width):
    h = bottom - top
    cats = [c.resize((int(c.width * h / c.height), h), Image.LANCZOS) for c in cats]
    gap = -int(h * 0.20)                          # すこし 重ねて なかよく
    total = sum(c.width for c in cats) + gap * (len(cats) - 1)
    if total > width:
        s = width / total
        cats = [c.resize((int(c.width * s), int(c.height * s)), Image.LANCZOS) for c in cats]
        gap = int(gap * s)
        total = sum(c.width for c in cats) + gap * (len(cats) - 1)
    x = (BASE - total) // 2
    for c in cats:
        canvas.alpha_composite(c, (x, bottom - c.height))
        x += c.width + gap


def build(small, square=False):
    """square=True は ホーム画面用：OS が 角を 丸く 切るので、わくも 角丸も つけず 全面を ぬる。
    切られても 欠けない よう、絵は まんなかへ すこし 寄せる"""
    canvas = Image.new('RGBA', (BASE, BASE), (0, 0, 0, 0))
    cats = [sitting(n) for n in CATS]
    if small:
        row_of_cats(canvas, cats[:2], int(BASE * 0.12), int(BASE * 0.94), BASE * 0.96)
    else:
        logo = Image.open(LOGO).convert('RGBA')
        w = int(BASE * 0.94)
        logo = logo.resize((w, int(logo.height * w / logo.width)), Image.LANCZOS)
        row_of_cats(canvas, cats, int(BASE * 0.44), int(BASE * 0.965), BASE * 0.88)
        canvas.alpha_composite(logo, ((BASE - w) // 2, int(BASE * 0.05)))
    bg = backdrop()
    if square:
        k = 0.86
        canvas = canvas.resize((int(BASE * k), int(BASE * k)), Image.LANCZOS)
        bg.alpha_composite(canvas, ((BASE - canvas.width) // 2, (BASE - canvas.height) // 2))
        return bg
    bg.alpha_composite(canvas)
    canvas = bg
    ImageDraw.Draw(canvas).rounded_rectangle([0, 0, BASE - 1, BASE - 1], radius=int(BASE * RADIUS),
                                             outline=RIM + (255,), width=int(BASE * 0.035))
    mask = Image.new('L', (BASE, BASE), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, BASE - 1, BASE - 1], radius=int(BASE * RADIUS), fill=255)
    out = Image.new('RGBA', (BASE, BASE), (0, 0, 0, 0))
    out.paste(canvas, (0, 0), mask)
    return out


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)
    big, small = build(False), build(True)
    sq_big, sq_small = build(False, True), build(True, True)
    for path, size in OUT:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        sq = path.startswith('app/')                   # ホーム画面・タブ用は 全面ぬりの 四角
        pick = (sq_small if sq else small) if size <= SMALL else (sq_big if sq else big)
        pick.resize((size, size), Image.LANCZOS).save(path, optimize=True)
        print(f'○ {path} ({size}px)')


if __name__ == '__main__':
    main()
