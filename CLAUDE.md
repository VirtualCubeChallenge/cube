# 開発ワークフロー

- 新規作業は `main` ではなく `test` ブランチから分岐すること。
- Pull Request の向き先(base branch)は `main` ではなく `test` にすること。

# このアプリの約束

- 機能ごとに1ファイル。`index.html` への追記は最小限にする。
- `style.css` と `i18n.js` は原則いじらない
  (CSSも文言も、その機能のファイル自身が注入する)。
- 文言は9言語(ja/en/zh-CN/zh-TW/ko/es/id/ru/pt-BR)。
  既存の辞書は書き換えず、無いキーだけ足すマージ方式。
- ファイルを差し替えたら `index.html` の `?v=` を上げる。
  同時に `sw.js` の `SW_BUILD_MARKER` も必ず上げる
  (ここを上げないと更新バナーが出ない)。
