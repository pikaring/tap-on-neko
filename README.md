# tap-on-neko（ねこの ともだち）

タップだけであそべる、**高齢者向けの「猫のお世話＆脳トレ」ゲーム**です。
バックエンドなし（HTML / CSS / Vanilla JavaScript のみ）で、セーブデータは LocalStorage に保存します。

**あそぶ → https://pikaring.github.io/tap-on-neko/**

## ファイル
| ファイル | 役割 |
| --- | --- |
| `index.html` | 画面の構造（ヘッダー／部屋／ボタン／クイズ） |
| `style.css` | 大きなUI・高コントラスト・アニメーション |
| `main.js` | ゲームロジック・LocalStorage・時間判定・クイズ制御 |

## あそびかた
1. 「なでる」で なかよし度 **+1**（ハートが浮かび、猫が喜ぶ）
2. 「ごはんを あげる（クイズ）」で 3択クイズ。正解すると「大正解！」で **+3**
3. なかよし度 **10 / 30 / 50 / 80** で部屋にアイテムが増える（クッション・けいと・おはな・おさかな）
4. なかよし度は自動保存され、次に開いたときに引き継がれる
5. 猫の柄は「ねこを かえる」からいつでも変更できる（きじとら／ちゃしろ／くろねこ）

## 設計上の約束（高齢者向けの配慮）
- 操作は**シングルタップのみ**。スワイプ・ドラッグ・長押しは使わない
- ボタンのタップ領域は 48px 以上（スマートフォン実測 約175×153px）、文字は 22〜40px
- 表記はすべてひらがな中心の日本語。英語表記なし
- **制限時間・ゲームオーバー・病気・死亡は一切なし**
- 久しぶりに開いても「まってたニャ！」とポジティブに迎える
- 不正解でもペナルティなし（「おしい！もういっかい！」で何度でも再挑戦）
- 時間帯で挨拶が変化（朝 5:00–10:59 / 昼 11:00–16:59 / 夜 17:00–4:59）

## ローカルで動かす
```sh
# そのまま index.html を開くだけでも動きます
npx http-server -p 8080
# → http://127.0.0.1:8080/
```

## GitHub Pages
Settings → Pages → Source: `Deploy from a branch` → Branch: `main` / `/ (root)`

## 猫の画像（スプライトシート）

猫の画像は **3×3＝9ポーズを1枚にまとめたスプライトシート**（1020×1020px / 1セル340px）で、
柄が3種類あります。

| ファイル | 柄 |
| --- | --- |
| `images/cat-kijitora.png` | キジトラ ＝ 既定 |
| `images/cat-chashiro.png` | 茶白（ちゃしろ） |
| `images/cat-kuro.png` | くろねこ |

3枚は**同じ縮尺・同じ立ち位置**に揃えてあるため（9セルすべて下端・横中心の差が0px）、
入れ替えても表示位置は変わりません。

遊ぶ人は**初回起動時の「どの ねこに する？」**と、部屋の上にある
**「ねこを かえる」ボタン**でいつでも柄を選べます（選択は LocalStorage に保存）。
既定は `main.js` の `DEFAULT_CAT`、選べる柄は `CAT_PATTERNS` で定義しています。

```js
var CAT_PATTERNS = [
  { id: 'cat-kijitora', name: 'きじとら' },
  { id: 'cat-chashiro', name: 'ちゃしろ' },
  { id: 'cat-kuro',     name: 'くろねこ' }
];
var DEFAULT_CAT = 'cat-kijitora';
```

柄を足すときは、画像を `images/` に置いて `CAT_PATTERNS` に1行足すだけです。

`main.js` が読み込みに成功したときだけ `.cat--image` クラスと `--cat-image` を付けるので、
画像が無い・読めない環境では絵文字（🐈）のまま遊べます。

セルとゲーム内の場面の対応（`style.css` の `.is-pose-*`）:

| 位置 | ポーズ | クラス | 使う場面 |
| --- | --- | --- | --- |
| 上段 左 | おすわり | `is-pose-idle` | 通常 |
| 上段 中央 | よろこぶ | `is-pose-happy` | 「なでる」 |
| 上段 右 | ごはんを食べる | `is-pose-eating` | クイズ正解 |
| 中段 左 | あくび | `is-pose-morning` | 朝 5:00–10:59 |
| 中段 中央 | 遊びの誘い | `is-pose-noon` | 昼 11:00–16:59 |
| 中段 右 | ねむる | `is-pose-night` | 夜 17:00–4:59（通常ポーズも これ） |
| 下段 左 | 手を振る | `is-pose-welcome` | 6時間以上ぶりの起動 |
| 下段 中央 | バンザイ | `is-pose-celebrate` | アイテム獲得 |
| 下段 右 | 首をかしげる | `is-pose-thinking` | クイズ表示中 |

### 画像を作り直す・柄を増やすとき
1. 生成AIに `docs/cat-sprite-prompt.md` のプロンプトを渡して、3×3の9ポーズを1枚で出力する
2. `tools/build_cat_sheet.py` に通す（市松模様やベタ背景の除去 → 9セルを共通の縮尺・
   横中央・下ぞろえに整列 → 透過PNG出力）。**複数枚を一度に渡すと共通の縮尺が使われる**ので、
   柄を足すときは既存の画像も一緒に渡し直すこと

   ```sh
   python3 tools/build_cat_sheet.py images \
     chashiro.jpg:cat-chashiro kijitora.jpg:cat-kijitora kuro.jpg:cat-kuro
   ```
3. `pngquant --quality=70-95 --output images/cat-xxx.png images/cat-xxx.png` で軽量化

ポーズを増やす場合は、グリッドの列数・行数に合わせて `style.css` の
`background-size` と `background-position`、`main.js` の `POSE_CLASSES` を直してください。

## 部屋の背景画像への差し替え
`style.css` の `.room--image` のコメントを外し、`images/room.png` を置いて
`index.html` の `class="room"` を `class="room room--image"` にすれば差し替えできます。
