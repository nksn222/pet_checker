# AION2 ペット購入チェッカー β（個人用・試作）

**目的**: iPhoneのSafariからモニターに映したAION2ペット商店を読み取り、Wikilyの入手先情報をもとに購入優先候補を一覧化する。

## ファイル
- `index.html`: iPhone向けUI、カメラ、画像選択、日本語OCR、ランキング、手動修正。
- `pets.json`: Wikilyで出典を確認した **11種類** の初期データ。**全208種類ではありません**。
- `sample.jpg`: 提供された画面の動作確認用。
- `manifest.webmanifest`, `icon.svg`: ホーム画面追加用。

## iPhoneで使う
1. これらのファイルを同じフォルダーのままGitHubリポジトリにアップロード。
2. GitHubリポジトリ Settings → Pages → Deploy from a branch → `main` / `/ (root)` で有効化。
3. 公開された `https://<ユーザー名>.github.io/<リポジトリ名>/` をiPhoneのSafariで開く。
4. `サンプル判定を見る` で実際のUIの挙動を確認。
5. `画像を選ぶ` でゲームのスクリーンショットを選んで「ペット名を読み取って判定」。もしくは `カメラを起動` でモニター画面にまっすぐ向け「撮影して判定」。
6. 認識があいまいな場合はペット名を修正。Safari共有メニュー→「ホーム画面に追加」するとアプリ風に利用できる。

GitHub Pagesはインターネット上に公開されます。個人用途でも画像はブラウザ内でOCR処理し、サイト側へのアップロード処理は行いません（OCRライブラリ・日本語言語データのダウンロードはネットワークを利用します）。

## 制約／今後改善する部分
- **まだ試作版**。利用者の実機 iPhone / Safari での動作検証は未実施。
- 画面の10枚のペットカードが、サンプルとほぼ同じ座標にあることを仮定して名称欄を切り出している。UIレイアウト、解像度、ブラウザキャプチャ、モニターへの角度で位置がずれると読み取れない。
- OCRは `tesseract.js` の日本語モデルを使う。初回は読み込みが必要。**瞬時の確実な判定はまだ保証できない**。
- ペット名が途中までしか表示されていない場合、複数候補を区別できないことがある。判定は保留して名前選択を求める。
- 商店の「保有中」の表示は今は自動読取していない。サンプル判定のみチェック済み扱いとして表示し、実画像では手動「所持済み」切り替えが可能。所持済みでも魂の強化に使えるため、所持による優先度ダウンは初期状態では無効にしている。
- **重要**: Wikilyのモンスター入手先はペット本体ではなく「魂」である場合が多い。ショップ・箱・覚醒戦のペット本体との違いを一律の出現数のみで判断しないこと。
- `monster=1` でも確定入手のケースがあれば難度は異なる。出現エリア数もドロップ率の代用ではない。現在のおすすめ表示は**参考値**。
- 未収録のペットは要確認扱い。Wikilyの全208種DBの導入、コレクション状況、価格、割引、魂の必要数、実際の入手確率を組み込むことで精度を高められる。
- Wikilyへのアクセスに依存しないよう静的JSONを採用。更新時は出典とサイト利用条件に配慮する。

## データ編集
`pets.json` に次のような行を追加する。`slug` はWikilyのペット詳細URL上の識別子。

```json
{"name":"カイリン","slug":"kailin","category":"野性","monsters":4,"areas":46,"boxes":2,"achievements":1,"trials":8,"fieldExamples":"カイリンなど"}
```

## データ出典（2026-10-24閲覧）
- https://wikily.gg/ja/aion-2/pets
- https://new.wikily.gg/ja/aion-2/pets/kailin/sources
- https://new.wikily.gg/ja/aion-2/pets/magic-gravi/sources
- https://new.wikily.gg/ja/aion-2/pets/starturtle
- https://new.wikily.gg/ja/aion-2/pets/papis
- https://new.wikily.gg/ja/aion-2/pets/superior-earth-spirit/sources
- https://new.wikily.gg/ja/aion-2/pets/lesser-earth-spirit/sources
- https://new.wikily.gg/ja/aion-2/pets/pino-worker/sources
- https://new.wikily.gg/ja/aion-2/pets/dry-leaf-agrint/sources
- https://new.wikily.gg/ja/aion-2/pets/kerubiel/sources
- https://new.wikily.gg/ja/aion-2/pets/kerubian/sources
- https://new.wikily.gg/ja/aion-2/pets/pino/sources

非公式。AION2およびWikilyとの提携関係はありません。
