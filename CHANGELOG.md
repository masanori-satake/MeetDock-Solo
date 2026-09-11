# 変更履歴 (Change Log)

"MeetDock-Solo" 拡張機能のすべての注目すべき変更はこのファイルに記録されます。

## [1.0.3] - 2026-09-12

### 修正 (Fixed)
- pre-commit.ci 上での `npm: command not found` エラー対応
  - `.pre-commit-config.yaml` の `eslint` および `check-types` フックの `language` に `node` を指定し、pre-commit.ci 環境下で Node.js および npm が正常にロードされるように修正

## [1.0.2] - 2026-09-12

### 修正 (Fixed)
- pre-commit.ci フック設定の完全修正
  - `check-json` フックでの未定義の `--allow-comments` オプション削除
  - `check-types` フックでの TS5112 エラー防止のため `pass_filenames: false` を追加
  - `eslint` および `check-types` での `typescript-eslint` 依存関係エラー防止のため `bash -c "npm install ... && npm run ..."` による依存パッケージ導入の自動化

## [1.0.1] - 2026-09-12

### 修正 (Fixed)
- pre-commit.ci でのエラー対応
  - `.vscode/*.json` および `tsconfig.json` のコメント削除と表記の正規化

## [1.0.0] - 2026-09-12

### 追加 (Added)
- MeetDock-Solo の初版リリース (v1.0.0)
- Teams ミーティングドラッグ＆ドロップ機能およびサイドバー TreeView の実装
- クリップボードからの自動抽出追加コマンド (`meetdock-solo.addFromClipboard`, `Alt+M` / `Option+M`)
- リマインダー通知 (5分前通知、開始時モーダルダイアログ) およびブラウザ/アプリでの Teams 参加機能
- ステータスバーによるカウントダウン・警告表示・開催中表示機能
- Persistent Storage (`globalState`) によるデータ保存と単発/繰り返し (Weekly/Weekdays) の自動処理
- pre-commit 設定ファイル (`.pre-commit-config.yaml` / `.pre-commit-ci.yaml`) の追加
