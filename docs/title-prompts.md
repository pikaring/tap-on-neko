# 猫街ろまん タイトル画面の 生成プロンプト

「街と、その白い壁」（throw-on-tako）・「猫が消えた街」（cat-on-escape）と 同じ 形の
オープニング（タイトル）画面を つくるための 絵です。形は throw-on-tako の `docs/asset-prompts.md`
（7. タイトル・9. タイトルロゴ）に そろえて あります。

| # | つくる もの | ファイル名（`app/images/` に 置く） | 大きさ |
| --- | --- | --- | --- |
| 1 | タイトル（キービジュアル） | `title.jpg` | 1024×1536（たて 2:3） |
| 2 | タイトルロゴ「猫街ろまん」 | `logo.png` | 1536×768（よこ）→ 背景を 抜いた PNG |

画面での かさなり（throw-on-tako の タイトル画面と 同じ）:

```
┌──────────────┐  0%
│  夕やけ空と 大きな 猫の 雲  │
│ ┌──────────┐ │ 22〜38% … ロゴ（logo.png）を 重ねる 帯
│ │   猫街ろまん    │ │
│ └──────────┘ │
│   街なみ（学校・商店街）   │ 30〜50%
│                          │
│   4人と 4匹の 猫          │ 45〜88%
│                          │
│ [一週間モード][エンドレス] │ 下から 15% … ボタンを 重ねる（顔・手・猫を 入れない）
└──────────────┘ 100%
```

---

## 1. タイトル（キービジュアル）

**次の 8枚を 添付**して 送ります（ほかの 作品の 絵は 添付しない ―― 線や 雰囲気まで 似て しまう）。

- 4人の 立ち絵：`app/images/people/nao-normal.png`・`fumi-normal.png`・`maki-normal.png`・`chika-normal.png`
- 4匹の 猫：`app/images/cat-kuro.png`・`cat-chashiro.png`・`cat-kijitora.png`・`cat-hachiware.png`
  （3×3の ポーズ表。**左上の おすわりの 絵**を 見本に して もらう）

```
ゲームのタイトル画面に使う、たて長の1枚絵（キービジュアル）をつくってください。
添付した4人の女子高生と、4匹の猫が主人公です。顔・髪型・服・身長・猫の柄は添付の絵とそろえてください。
（猫の絵は3×3のポーズ表です。左上の「おすわり」の絵を柄の見本にしてください）

【物語】
白い壁の事件がおわって、しずかな日常がもどった海べりの街「猫街」。
4人はそれぞれ1匹ずつ猫とくらし、朝ごはん、学校、ほうかご、夜の遊びをくりかえす一週間をすごす。
土曜日には商店街で「ねこ じまん 大会」がある。やさしくて、少しなつかしい、日常のおはなし。

【全体の構図：上から下へ、4つの帯を重ねる。夕方の通学路の坂の上から、街を見おろす視点】
1. 上の帯（画面の上から0〜30%）：夕やけの空と、街を見まもる大きな猫の形の雲
 ・空は、きいろ（#ffe36e）からオレンジ（#e07b2a）への横じまのベタ塗り。
 上のほうに1番星が1つ、小さな白い点で
 ・空いっぱいに、まるくなって眠る大きな猫の形の雲が1つ浮かぶ。クリーム色（#fff8ec）の1色、
 ふちはうすいオレンジ。細かい模様は描かず、耳と、くるりと巻いたしっぽの形だけで猫とわかるようにする
 ・雲の猫は目をとじて、おだやかにほほえんでいる（線1本の目と口）
2. ロゴの帯（画面の上から22〜38%）：ここにタイトルのロゴを重ねる
 ・雲の猫のおなかのあたり。模様や小物を描かず、雲の面だけにする
3. 街なみの帯（画面の上から30〜50%）
 ・坂の下に、低い家並み・商店街のアーケード（ちょうちんが並ぶ）・時計のある学校の校舎・
 公園の緑・川にかかる小さな橋・電柱と電線が広がる。いちばん奥に、夕日にひかる海が細く見える
 ・街には白い壁はない。空がひろく抜けている
 ・家の屋根や塀の上に、小さな猫が4〜5匹（寝そべる・のびをする・歩く）
 ・窓にはぽつぽつと、あたたかいきいろの明かり
4. 4人と猫の帯（画面の上から45〜88%）
 ・坂道の通学路に、4人が並んで立つ。左から順に、ナオ・マキ・フミ・チカ
 ・まんなかの2人（マキ・フミ）は少し手前で大きく、左右の2人（ナオ・チカ）は少しうしろで小さく。
 4人が扇形にかたまり、たがいの肩が少し重なる
 ・4人とも正面向き。ひざから上。みんな、やさしく笑っている
 ・4人のうしろから、画面の中心へ向かって広がる、きいろ（#ffe36e）の太い光の線をベタ塗りで数本
 ・4人のまわりに、小さな猫の足あと（肉球の形）がいくつか、ふわっと舞う

【4人と猫のポーズ】
・ナオ：小柄。黒髪のショートボブ、赤いふちの丸メガネ、紺のブレザーに赤いリボン。
 黒猫（くろねこ・金色の目）を両腕でだっこして、ほおを寄せる。はにかんだ笑顔
・マキ：背が高め。日焼けした肌、黒髪の高いポニーテールをきいろのヘアゴムでむすぶ。
 みどりの半そでシャツに赤いリボン。片手でねこじゃらしを高くかかげ、
 キジトラの猫がそれに向かって元気にジャンプしている。にかっと笑う
・フミ：いちばん背が高い。明るい茶色のゆる巻きロングヘア、きいろのヘアピン2本、金色の小さなピアス、
 大きめのベージュのカーディガン。茶白の猫を肩にのせ、片手でピースしてウインク
・チカ：いちばん小柄。こげ茶の髪を左右2つのおだんごにして、うすいそら色の三角巾。
 白いシャツをうでまくり、赤いリボン、紺の前かけ。ハチワレの猫を頭の上にのせ、
 両手で小さな魚（にぼし）を1匹さし出す。元気な笑顔
・身長の差：フミ ＞ マキ ＞ ナオ ≧ チカ
・猫の柄はかならず添付の見本どおり：くろねこ（ナオ）／キジトラ（マキ）／茶白（フミ）／ハチワレ（チカ）

【下のはし】
・画面の下から15%は、4人の足もとの坂道と、道ばたの草花だけ。ボタンを重ねるので、顔・手・猫を入れない

【サイズ】
・たて長（2:3）、1024×1536ピクセル

【画風（厳守）】
・シンプルな線と色の、フラットな絵本・アニメ調のイラスト。添付の4人と猫の絵と同じ線と塗り
・輪郭線はこい茶色（#3a2a20）の、太さが一定の線。線の強弱や、スケッチ風の重ね線は使わない
・塗りはベタ塗りだけ。グラデーション、テクスチャ、ぼかし、光の反射、リアルな夕日の効果は使わない
 （空のグラデーションも、色の帯を横に重ねたベタ塗りで表す）
・遠くのもの（街・海）も同じ線の太さ・ベタ塗り。ぼかさない
・色は、クリーム #fff8ec／みどり #2f5d3a／うすみどり #9cc5a1／オレンジ #e07b2a／きいろ #ffe36e／
 ローズ #d0526b／そら色 #a8d4e6／制服の紺 #2c3e6b／こい茶 #3a2a20 を中心にする
・4人と猫と雲の猫以外の、人物やキャラクターは描かない
・絵の中に文字・ロゴ・数字・看板の文字・吹き出しを一切描かない
・健全で、あたたかく、少しなつかしい雰囲気
```

日本語で 構図が くずれる ときは 英語で：

```
Create a portrait key-visual illustration for a game's title screen. The four high-school girls and the four
cats in the attached images are the heroes; keep the girls' faces, hair, clothes and relative heights, and the
cats' coat patterns, exactly. (The cat images are 3x3 pose sheets; use the top-left sitting pose as the reference.)

Story: "Cat Town", a quiet seaside town where peaceful everyday life has returned. Each girl lives with one cat
and spends a week of breakfasts, school, after-school fun and evening play. A gentle, slightly nostalgic slice of life.

Viewpoint: from the top of a school-route slope at dusk, looking down over the town. Four stacked bands, top to bottom.
1. TOP (0-30%): evening sky in flat horizontal stripes from yellow (#ffe36e) to orange (#e07b2a), one tiny white
   first star. Filling the sky, a big cloud shaped like a cat curled up asleep: flat single cream color (#fff8ec)
   with a pale orange rim, recognizable only by its ears and curled tail, eyes closed with a calm smile (single lines).
2. LOGO BAND (22-38%): the cloud cat's belly area, plain flat cloud surface with no detail (a logo goes here).
3. TOWN (30-50%): below the slope, low houses, a shopping arcade with paper lanterns, a school building with a clock,
   park greenery, a small bridge over a river, utility poles and wires; a thin strip of sunset sea at the very back.
   No wall anywhere; open sky. 4-5 small cats on roofs and fences (lying, stretching, walking).
   A few warm yellow lit windows.
4. GIRLS AND CATS (45-88%): the four girls stand on the sloped street, grouped in a fan shape with shoulders slightly
   overlapping, facing the viewer, knees up, all smiling gently. Left to right: Nao, Maki, Fumi, Chika;
   Maki and Fumi slightly closer and larger. A few thick flat yellow (#ffe36e) light rays spread from behind them,
   and a few small paw-print shapes float around them.
   - Nao: small, black short bob, round red-framed glasses, navy blazer, red bow; hugs a BLACK cat with golden eyes,
     cheek to cheek; shy smile.
   - Maki: tall, tanned, high black ponytail with a yellow hair tie, green short-sleeve shirt, red bow; holds a cat
     teaser wand high while a BROWN TABBY cat leaps toward it; big grin.
   - Fumi: tallest, light-brown loose wavy long hair, two yellow hairpins, small gold earring, oversized beige
     cardigan; an ORANGE-AND-WHITE cat sits on her shoulder; peace sign and a wink.
   - Chika: smallest, dark-brown hair in two side buns, pale sky-blue headscarf, white shirt with rolled sleeves,
     red bow, navy apron; a BLACK-AND-WHITE "tuxedo/hachiware" cat sits on her head; offers a tiny dried fish
     with both hands; energetic smile.
   - Height order: Fumi > Maki > Nao >= Chika. Cat patterns must match the attached references.
Bottom 15%: only the sloped street and roadside flowers at their feet (buttons go here); no faces, hands or cats.

Size: portrait 2:3, 1024x1536.

Style (strict): flat picture-book / anime illustration matching the attached characters and cats. Uniform-width
dark brown outline (#3a2a20), flat fills only; no gradients (show the sky as flat color bands), textures, blur,
glossy highlights or realistic sunset effects. Distant town and sea use the same line weight, no blur.
Palette centered on cream #fff8ec, green #2f5d3a, pale green #9cc5a1, orange #e07b2a, yellow #ffe36e,
rose #d0526b, sky blue #a8d4e6, navy #2c3e6b, dark brown #3a2a20.
No characters other than the four girls, their cats, the small rooftop cats and the cloud cat.
Absolutely no text, letters, numbers, logos, signs with writing or speech bubbles anywhere.
Warm, wholesome and slightly nostalgic.
```

- **猫の 柄が 入れかわる**：いちばん よく ある 失敗です。英語版の 大文字の 柄の 名前を 残した まま、
  「Nao=black cat, Maki=brown tabby, Fumi=orange-and-white, Chika=black-and-white tuxedo」を 最後に もう1回 書く。
- **雲が 猫に 見えない**：「the cloud's outline clearly shows two pointed cat ears on top and a tail curled around its body」を 足す。
- **4人が くずれる**：先に 空・雲の 猫・街だけを 人物なしで 作り、その絵と 4人・猫を 添付して
  「この 背景の 手前に 4人と 猫を 扇形に」と 頼む。

---

## 2. タイトルロゴ「猫街ろまん」

タイトル画面と 紹介ページの ロゴです。**画風ブロックを 付けずに、単体で** 送ります。
1の タイトルの 絵を 添付すると、色が なじみやすく なります。

```
ゲームのタイトルロゴを1枚つくってください。
文字は「猫街ろまん」（5文字、よこ書き1行）と、その下に小さく「〜Cat city Romance〜」です。
猫と女子高生の、やさしくて少しなつかしい日常のゲームのロゴです。

【いちばん大事：文字】
・「猫街ろまん」の5文字を、1文字もまちがえず、読みやすく書く。漢字（猫・街）の形をくずさない
・スマホの小さな画面（はば350ピクセルほど）で、ひと目で読めること
・「〜Cat city Romance〜」は下に小さく、まるみのある太い英字で。つづりをまちがえない
・ほかの文字・記号・ロゴ・署名は一切入れない

【文字の形：大正ロマン風の、レトロでかわいい手書き文字】
・文字は太めで、少しまるみのある、昔のお菓子の箱や看板のようなレトロな書体
・「猫」の字の上に、小さな三角の猫の耳が2つ、ちょこんと生えている
・「ん」の最後のはらいが、くるりと巻いた猫のしっぽになっている
・「街」と「ろ」のあいだに、小さな肉球のマークを1つ
・「猫街」はみどり（#2f5d3a）、「ろまん」はローズ（#d0526b）の文字に、クリーム（#fff8ec）の太いふち取り、
 その外がわにこい茶（#3a2a20）の細い線
・「〜Cat city Romance〜」は、きいろ（#ffe36e）のまるい帯の上に、みどり（#2f5d3a）の文字

【画風】
・フラットなベタ塗り。影やグラデーションは使わない
・輪郭線はこい茶色（#3a2a20）の、太さが一定の線
・色はすくなく：みどり #2f5d3a・ローズ #d0526b・クリーム #fff8ec・きいろ #ffe36e・こい茶 #3a2a20

【背景と大きさ】
・背景は青一色（#0040ff）のベタ塗り（文字の色と分けて、あとで背景を抜くため）。ロゴのまわりに何も描かない
・ロゴのまわりに、画像のはばの6%以上の余白をあける。ロゴは画像のふちにふれない
・よこ長 1536×768ピクセル
```

> **背景を 青に する わけ**：throw-on-tako の ロゴは ミントグリーン（#00ff99）で 抜きましたが、
> 猫街ろまんの ロゴは みどりの 文字を つかうので、みどり系の 背景だと 文字まで 抜けて しまいます。
> 文字に つかわない 青に して あります。

英語で 文字が くずれる ときは、文字の 部分だけ 日本語の まま、ほかを 英語に します：

```
Create a game title logo. The text is 「猫街ろまん」 (5 Japanese characters, one horizontal line) with a small
subtitle "~Cat city Romance~" underneath. Every character must be exactly correct and legible at 350 px wide.
Retro Taisho-roman style lettering, bold and slightly rounded, like an old candy box or shop sign.
Two small triangular cat ears on top of 「猫」; the final stroke of 「ん」 becomes a curled cat tail;
one small paw-print mark between 「街」 and 「ろ」.
「猫街」 in green #2f5d3a, 「ろまん」 in rose #d0526b, each with a thick cream (#fff8ec) outline and a thin
dark brown (#3a2a20) outer line. Subtitle in green on a rounded yellow (#ffe36e) band.
Flat fills only, no shadows or gradients. No other text, symbols or signatures.
Background: solid flat blue (#0040ff) only, nothing else drawn; at least 6% margin around the logo.
Landscape 1536x768.
```

---

## できた 絵を 入れる とき

`title.jpg` と `logo.png` を もらえれば、こちらで 次を します。

- `logo.png` の 青い 背景を 抜いて、はしの 余白を 切りそろえる
- `app/index.html`（タイトル画面）を throw-on-tako と 同じ 形に する
  （絵を 画面いっぱい → ロゴを 22〜38% の 帯に → 下に ボタン。絵が 読めない ときは いまの 画面の まま）
- 紹介ページの OG画像・アイコンにも つかうか 相談
