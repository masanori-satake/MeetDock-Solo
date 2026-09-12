# 変更履歴 (Change Log)

"MeetDock-Solo" 拡張機能のすべての注目すべき変更はこのファイルに記録されます。

## [1.4.0] - 2026-09-12

### 追加 (Added)
- GitHub Releases を活用した更新通知機能の追加 (拡張機能起動時にバックグラウンドで最新リリースをチェックし通知)

## [1.3.1] - 2026-09-12

### 追加 (Added)
- `package.json` に詳細なメタデータ (`publisher`, `author`, `license`, `keywords`, `bugs`, `homepage`, `categories`) を追加・更新

## [1.3.0] - 2026-09-12

### 追加 (Added)
- 拡張機能の公式アイコン (`icon.png`) を追加・設定

## [1.2.1] - 2026-09-12

### 修正 (Fixed)
- Teams 会議招待文（例: `Satake Masanori Microsoft Teams 会議に招待されました。` 等）をクリップボード等から解析する際、招待ヘッダー文言や日付・時刻行ではなく実際の会議件名（例: `テスト`）を正確に会議名（タイトル）として抽出できるように修正
- `令和8年9月7日` のような和暦・年月日表記および日付・時刻が別行に分かれたフォーマットでの開始日時抽出処理の強化
- 各ファイル（`package.json`, `package-lock.json`, `README.md`, `CHANGELOG.md`）のバージョン表記の一貫性チェックを自動化

## [1.2.0] - 2026-09-12

### 追加 (Added)
- GitHub Actions 自動ビルド・パッケージ化・配信ワークフロー (`.github/workflows/build-and-publish.yml`)
  - `main` ブランチへの push 時の自動 TypeScript コンパイルおよび `.vsix` パッケージ作成
  - Material-3 スタイルの社内向け拡張機能ダウンロード web ページ (`index.html`) の動的生成
  - `actions/deploy-pages@v4` による GitHub Pages への自動デプロイ

## [1.1.1] - 2026-09-12

### 修正 (Fixed)
- オフライン環境での `EAI_AGAIN` (npm ネットワーク接続エラー) 対応
  - `.pre-commit-config.yaml` からネットワーク接続を必要とする `eslint` および `check-types` フックを無効化（削除）

## [1.1.0] - 2026-09-12

### 修正 (Fixed)
- pre-commit の依存パッケージ参照エラー (`ERR_MODULE_NOT_FOUND`, `TS2688`) の解決

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
