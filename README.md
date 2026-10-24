# AION2 ペットメモ v4 — iPhoneだけで使う個人用

**使用端末：iPhone（Safari）／ペット名：208種類**。ショップのスクショを「写真」から選ぶと自動でOCRして、おすすめ度を所持状況と入手経路から計算します。PCモニターの撮影やPC版スクリーンショットを前提にしません。

## 最初にすること

1. このZIPを解凍。`index.html`、`app.js`、`style.css`、`pets.json`、`manifest.webmanifest`、`icon.svg`、`sample.jpg`、`.github/workflows/update-and-deploy.yml`、`tools`フォルダごとGitHubリポジトリのルートへ配置。**フォルダの中身をルートへ**。
2. GitHubの **Settings → Pages → Build and deployment → Source: GitHub Actions** にする。
3. GitHubの **Actions → ペット入手経路の更新と公開 → Run workflow** を実行する。しばらくすると Pages の公開URLが使えます。
4. iPhoneのSafariで公開URLを開き、必要なら Safariの共有 → **ホーム画面に追加**。
5. AION2でショップを開いて**iPhone本体のスクリーンショット**を撮る。アプリで「＋ スクショを選ぶ」→写真から選択。名前を自動認識し、購入候補順に表示します。

**同じURLに上書きした場合、v2・v3の所持管理データ（localStorageキー `aion2.pet-checker.collection.v2`）を引き継ぐ設計**です。念のため旧版から先にバックアップを書き出してください。異なるURLに移す場合はバックアップJSONを復元してください。

## 所持管理

画面下の「所持ペット」タブで検索し、「未登録」「未所持」「所持 Lv.1〜3」を選択。状態の変更はSafari内に保存。長い説明は閉じた状態で表示し、必要なペットだけ「メモ・自分の入手先」を開けます。バックアップも所持ペット画面の下に収納。

## 入手経路208種類について（重要）

- **208種類の名前と種族**には対応。
- **入手経路の個別確認済みは27種類（2026年10月24日時点の同梱DB）**です。残り181種類は「要確認」。完成済みと表示しません。
- `tools/update_sources.py` は208件の個別URL（DBにslugを保持）から公開されている **本体の入手先**（黒雲貿易団・箱・実績・覚醒戦・イベント／パック）と **魂のモンスター入手元数**を区別して取得します。GitHub Actionsから週1回実行できます。アクセス制限・サイト変更等で全208件の確認を保証するものではありません。
- `coverage.json` と `coverage.csv` に確認済み数と未確認ペットを記録。GitHub Actionsの実行結果「Summary」に、**何件確認済みか**が出ます。
- `monsters=0` は、Wikilyの該当ページに**魂のモンスター入手元の掲載がない**という意味。実際の入手確率が0％、ダンジョン限定、ショップ限定だという意味ではありません。
- 入手元の数が少ないことはレア度やドロップ率の証明ではありません。購入優先度は、実績・箱などの他入手経路と所持状況も表示したうえでの**目安**です。
- ペットが読めなかった場合は候補から名前を修正。カード配置がゲーム更新や端末比率で変わるとOCR精度が落ちるため、iPhone実機でのすべての解像度の認識は未検証です。初回OCRにはネット通信（Tesseract.jsと日本語モデル）が必要です。

## メンテナンス

`python -m pip install requests beautifulsoup4`

`python tools/update_sources.py --workers 2 --throttle 1.0` は手動更新、 `python -m unittest discover -s tools -p test_sources.py` はパーサーテスト。Wikilyから取得できないものを0件や「限定」と決めつける処理はしません。

出典： https://wikily.gg/ja/aion-2/pets ／非公式、個人使用用。
