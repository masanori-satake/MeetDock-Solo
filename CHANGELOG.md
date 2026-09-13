# 変更履歴 (Change Log)

"MeetDock-Solo" 拡張機能のすべての注目すべき変更はこのファイルに記録されます。

## [1.7.3] - 2026-09-13

### パフォーマンス改善 (Performance Improvements)
- `src/dateTime.ts` における `Intl.DateTimeFormat` インスタンスのキャッシュ（`formatterCache` Map / `validTimeZoneCache` Set）の導入により、タイムゾーン変換や繰り返し計算でのオブジェクト生成コストを削減
- `src/meetingManager.ts` の `getSortedMeetings` において、`Date` オブジェクト生成を伴う比較処理を ISO 8601 文字列の直接比較に変更し、ソート時の $O(N \log N)$ のメモリ割り当てと計算オーバーヘッドを削減

## [1.7.2] - 2026-09-13

### 変更・修正 (Changed & Fixed)
- `openTeamsChatUrl` において、自動生成された Teams 会議チャット URL に対する二重セキュリティ検証（`isValidTeamsUrl`）を追加し、不安全なスキームや不正なドメインへの `openExternal` 呼び出しを防止（多層防御の強化）

## [1.7.1] - 2026-09-13

### 変更・修正 (Changed & Fixed)
- 個人用 Teams 会議（`teams.live.com/meet/...`）等、スレッド ID（`chatId`）が存在せずチャット画面を開くことができない会議において、「チャットを開く」アクションボタンおよびメニュー項目を非表示化・非活性化（パターンC）
  - サイドバー (TreeView) 項目の `contextValue` 制御および `package.json` の `when` 条件調整により、チャット非対応会議でのインラインボタン・コンテキストメニュー非表示化
  - リマインダー通知トースト/モーダルダイアログにおける「チャットを開く」アクションボタンの条件付き非表示化
  - ステータスバーからの会議選択 QuickPick におけるチャットアイコンボタンの条件付き非表示化

## [1.7.0] - 2026-09-13

### 追加 (Added)
- 会議チャット画面への直接遷移機能を追加
  - 企業向け Teams 会議 URL からスレッド ID（`chatId`）を自動抽出し、Teams チャットディープリンク (`https://teams.microsoft.com/l/chat/.../conversations`) を生成・オープンする処理の追加
  - リマインダー通知パネル（5分前トースト通知および開始時モーダルダイアログ）に「チャットを開く」ボタンを追加
  - サイドバー Meetings ビュー（TreeView）の各項目インラインアクションおよびコンテキストメニューに「チャットを開く」コマンド (`meetdock-solo.openChat`) を追加
  - ステータスバークリック時の会議リスト（QuickPick）の各項目右端にチャットボタン `$(comment-discussion)` を配置し、項目クリック時は Teams 会議参加、チャットボタンクリック時は会議チャットへ遷移するよう改善
  - ステータスバーの会議リスト項目から不要な URL 文字列 (`detail`) の表示を削除
  - 個人向け Teams 等、スレッド ID が抽出できない URL の場合は警告メッセージを表示するよう配慮

## [1.6.0] - 2026-09-13

### 追加 (Added)
- Jules等のAIエージェントによるコード・ドキュメント変更時のバージョン更新を強制・自動検証する `--check-bump` オプションを `scripts/check-version.js` に追加
- エージェント向けの開発・運用ガイドライン `AGENTS.md` の新規作成（SemVerに基づくバージョン選定基準、更新手順、`CHANGELOG.md` 記述ルールの明確化）
- `package.json` に `check-version-bump` コマンドを追加

## [1.5.1] - 2026-09-13

### 変更・修正 (Changed & Fixed)
- クリップボードからの会議追加（`addFromClipboard`）コマンドにおいて、繰り返し選択肢に日次・月次・年次を追加し全6種類に対応（パース結果のデフォルト引き上げも適用）
- ツリービューの詳細行（時間・主催者・繰り返し）ホバー時に「Teamsに参加」「会議を削除」ボタンが表示されないよう `package.json` の `view/item/context` 条件を調整

## [1.5.0] - 2026-09-13

### 追加 (Added)
- Teams 会議情報の解析マルチエディション（個人向け Teams / 企業向け Teams Work or School）およびバイリンガル（日本語 / 英語）対応
- Safe Links（`safelinks.protection.outlook.com`）URL の自動アンラップ・デコード処理の追加
- 主催者名（Organizer）、会議 ID、パスコード、エディションフラグ、繰り返し（単発/毎週/平日）等のメタデータ自動パースおよびプロパティ保持
- サイドバーツリービュー（TreeView）の複数行・詳細表示（時間・所要時間、主催者、繰り返し種別）および単発/繰り返しアイコンの視覚的分離（カレンダー / 同期アイコン）

## [1.4.2] - 2026-09-12

### 修正 (Fixed)
- 会議終了後（次回会議表示時および予定なし表示時）にステータスバーの文字色が標準色にリセットされず緑色が残る不具合を修正

## [1.4.1] - 2026-09-12

### 修正 (Fixed)
- 外部ブラウザ/アプリで Teams URL を開く際のセキュリティ強化（`openExternal` 実行前の URL スキームおよびドメイン検証 `isValidTeamsUrl` / `openTeamsMeetingUrl` の追加）

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
