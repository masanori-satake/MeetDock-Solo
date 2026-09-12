# 変更履歴 (Change Log)

"MeetDock-Solo" 拡張機能のすべての注目すべき変更はこのファイルに記録されます。

## [1.1.0] - 2026-09-12

### 修正 (Fixed)
- pre-commit の依存パッケージ参照エラー (`ERR_MODULE_NOT_FOUND`, `TS2688`) の完全解決
  - `.pre-commit-config.yaml` の `entry` を `bash -c "npm install --no-audit --no-fund && npm run ..."` に変更し、リポジトリローカルの全 `devDependencies` を自動参照する構成へ変更

## [1.0.9] - 2026-09-12

### 修正 (Fixed)
- pre-commit の `ERR_MODULE_NOT_FOUND` (typescript-eslint) および `TS2688` (@types/node, @types/mocha) エラー対応
  - `.pre-commit-config.yaml` の `additional_dependencies` を指定

## [1.0.8] - 2026-09-12

### 修正 (Fixed)
- pre-commit の `Executable node_modules/.bin/... not found` エラー対応
  - `.pre-commit-config.yaml` の `language` を `node` に変更

## [1.0.7] - 2026-09-12

### 修正 (Fixed)
- pre-commit での `Executable npm not found` エラー対応
  - `.pre-commit-config.yaml` の `entry` を直接指定

## [1.0.6] - 2026-09-12

### 修正 (Fixed)
- pre-commit の `AssertionError` 完全解消
  - `.pre-commit-config.yaml` 内の `eslint` および `check-types` フックの `language` を `system` に設定

## [1.0.5] - 2026-09-12

### 修正 (Fixed)
- pre-commit の `AssertionError` 対応
  - `.pre-commit-config.yaml` の `language: node` フックに `additional_dependencies` を設定

## [1.0.4] - 2026-09-12

### 修正 (Fixed)
- pre-commit での `AssertionError` 対応
  - `.pre-commit-config.yaml` の `language: node` local フックに `additional_dependencies` を記述

## [1.0.3] - 2026-09-12

### 修正 (Fixed)
- pre-commit.ci 上での `npm: command not found` エラー対応
  - `.pre-commit-config.yaml` の `eslint` および `check-types` フックの `language` に `node` を指定

## [1.0.2] - 2026-09-12

### 修正 (Fixed)
- pre-commit.ci フック設定の完全修正
  - `check-json` フックでの未定義の `--allow-comments` オプション削除
  - `check-types` フックでの TS5112 エラー防止のため `pass_filenames: false` を追加

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
