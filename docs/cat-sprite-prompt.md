# 猫スプライトシート生成プロンプト

`images/cat.png`（3×3＝9ポーズ）を画像生成AIで作り直すときのプロンプト。
出力後は `tools/build_cat_sheet.py` に通して、背景除去とセルの整列を行う。

## 日本語版

```
同じ1匹の猫のキャラクターを、3×3のグリッドに並べた1枚のスプライトシートを作ってください。

【キャラクター設定】
・かわいい二足歩行しない四足の子猫、デフォルメ2頭身、丸くて大きな顔
・毛色：クリームホワイトの地に、オレンジ茶色の模様（茶白猫）
・輪郭線：こい茶色の太い線（はっきり見える太さ）
・目は大きく黒目がち、表情がわかりやすい
・9マスすべて完全に同じ猫（毛色・模様・首輪なし・体型・線の太さを統一）

【画風】
・フラットなベタ塗りのアニメ・絵本調、影やグラデーションは最小限
・高齢者にも見やすい、高コントラストでシンプルな形
・写実的でない、かわいらしいマスコット的なデザイン

【9マスのポーズ】（左上から右方向の順）
上段左：正面を向いておすわり、にっこり笑っている
上段中央：うれしくてジャンプ、目を細めて笑っている
上段右：足元の白いごはんのお皿に顔を寄せて食べている
中段左：前足を前に伸ばして大きくあくびをしている（朝の伸び）
中段中央：おしりを高く上げ、前足を伏せた「遊んで」の誘いポーズ
中段右：体を丸めて目を閉じ、気持ちよく眠っている
下段左：後ろ足で立ち上がり、片方の前足を上げて手を振っている
下段中央：両方の前足を上に上げてバンザイ、とても喜んでいる
下段右：首を右にかしげて不思議そうに考えている

【レイアウトの厳守事項】
・正方形の画像、3列×3行の均等な9マス（各マスも正方形）
・背景は完全な透過（PNG）。透過にできない場合は真っ白な単色背景
・グリッドの枠線・区切り線・番号・文字・ロゴは一切描かない
・各マスの中央に猫を配置し、9匹すべて同じ大きさ（体の高さを揃える）
・各マスの猫はマスの枠に触れないよう、周囲に10%程度の余白を空ける
・となりのマスにはみ出さない、影を落とさない
・小物はごはんのお皿（上段右）のみ。他のマスには小物を置かない

【サイズ】
・1536×1536ピクセル（1マス512px）または3072×3072ピクセル（1マス1024px）
```

## 英語版

```
A single square sprite sheet containing a 3x3 grid of 9 poses of the SAME cute chibi cat character.

Character: adorable chubby kitten, four-legged, big round head, cream-white fur with
orange-brown tabby patches, thick dark-brown outline, large expressive black eyes,
no collar. All 9 cats must be perfectly identical in fur color, markings, body
proportions and line weight.

Style: flat vector cartoon, children's picture-book style, bold clean outlines,
minimal shading, high contrast, simple readable silhouette, kawaii mascot design.

Poses, in reading order (left to right, top to bottom):
Row 1 left: sitting front-facing, gently smiling
Row 1 center: happily jumping up, eyes squinted with joy
Row 1 right: eating from a small white food bowl on the ground
Row 2 left: front legs stretched forward, big yawn (morning stretch)
Row 2 center: play-bow, rear up and front legs down, inviting to play
Row 2 right: curled up in a ball, eyes closed, sleeping peacefully
Row 3 left: standing on hind legs, waving one front paw
Row 3 center: both front paws raised up in celebration, very happy
Row 3 right: head tilted to the side, curious and thinking

Layout requirements: perfectly even 3x3 grid of square cells, transparent
background (PNG with alpha), NO grid lines, NO borders, NO text, NO numbers,
NO watermark, each cat centered in its own cell at the SAME scale with about 10%
padding, nothing overlapping cell boundaries, no drop shadows on the background.
Only prop allowed is the food bowl in row 1 right.

Output: 1536x1536 px (512 px per cell) or 3072x3072 px (1024 px per cell).
```

## ネガティブプロンプト

```
grid lines, borders, frames, text, numbers, labels, watermark, signature,
photorealistic, 3D render, different cats, inconsistent style, varying sizes,
cropped, cut off, background scenery, shadows, drop shadow, collar, clothing
```

## 受け取ったあとの確認ポイント

- 9匹の毛色・模様が同じか
- 各マスの猫の大きさが揃っているか（`tools/build_cat_sheet.py` が共通の縮尺で揃え直すが、元が極端に違うと不自然になる）
- 背景が透過、またはベタの単色か（JPEGで市松模様が焼き込まれている場合もスクリプトが除去する）
- マスの境界にはみ出していないか（スクリプトが接触を検出して警告する）
