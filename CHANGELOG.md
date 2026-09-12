# 変更履歴 (Change Log)

"MeetDock-Solo" 拡張機能のすべての注目すべき変更はこのファイルに記録されます。

## [1.1.1] - 2026-09-12

### 修正 (Fixed)
- オフライン環境での `EAI_AGAIN` (npm ネットワーク接続エラー) 対応
  - 指示に基づき、`.pre-commit-config.yaml` からネットワーク接続を必要とする `eslint` および `check-types` フックを無効化（削除）し、標準のテキスト/JSONフックのみに設定

## [1.1.0] - 2026-09-12

### 修正 (Fixed)
- pre-commit の依存パッケージ参照エラー (`ERR_MODULE_NOT_FOUND`, `TS2688`) の解決
  - `.pre-commit-config.yaml` の `entry` を `bash -c "npm install ... && npm run ..."` に変更

## [1.0.9] - 2026-09-12

### 修正 (Fixed)
- pre-commit の依存パッケージ設定追加

## [1.0.8] - 2026-09-12

### 修正 (Fixed)
- pre-commit の実行形式修正

## [1.0.7] - 2026-09-12

### 修正 (Fixed)
- pre-commit の `Executable npm not found` エラー対応

## [1.0.6] - 2026-09-12

### 修正 (Fixed)
- pre-commit の `AssertionError` 解消

## [1.0.5] - 2026-09-12

### 修正 (Fixed)
- pre-commit の `AssertionError` 対応

## [1.0.4] - 2026-09-12

### 修正 (Fixed)
- pre-commit での `AssertionError` 対応

## [1.0.3] - 2026-09-12

### 修正 (Fixed)
- pre-commit.ci 上での `npm: command not found` エラー対応

## [1.0.2] - 2026-09-12

### 修正 (Fixed)
- pre-commit.ci フック設定の完全修正

## [1.0.1] - 2026-09-12

### 修正 (Fixed)
- pre-commit.ci でのエラー対応

## [1.0.0] - 2026-09-12

### 追加 (Added)
- MeetDock-Solo の初版リリース (v1.0.0)
- Teams ミーティングドラッグ＆ドロップ機能およびサイドバー TreeView の実装
- クリップボードからの自動抽出追加コマンド (`meetdock-solo.addFromClipboard`, `Alt+M` / `Option+M`)
- リマインダー通知 (5分前通知、開始時モーダルダイアログ) およびブラウザ/アプリでの Teams 参加機能
- ステータスバーによるカウントダウン・警告表示・開催中表示機能
- Persistent Storage (`globalState`) によるデータ保存と単発/繰り返し (Weekly/Weekdays) の自動処理
- pre-commit 設定ファイル (`.pre-commit-config.yaml` / `.pre-commit-ci.yaml`) の追加
