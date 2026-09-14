# 変更履歴 (Change Log)

"MeetDock-Solo" 拡張機能のすべての注目すべき変更はこのファイルに記録されます。

## [1.10.1] - 2026-09-14

### 修正 (Fixed)
- Welcome View の案内をプレーンテキスト表示に統一し、一部の `.ics` ファイルに繰り返しルールが含まれない場合がある旨へ注意書きを修正

## [1.10.0] - 2026-09-14

### 追加 (Added)
- 会議未登録時（初期状態・0件時）のサイドバーペインへの登録方法表示（Welcome View）を追加
  - 「企業(Enterprise)向けTeams」と「個人(Personal)向けTeams」それぞれの具体的な会議登録手順をペイン中央に分かりやすく表示
  - 企業向けTeamsからダウンロードされた `.ics` ファイルには繰り返しの情報が含まれていないため、登録後に繰り返しの設定変更が必要な旨を注意書きとして色付き・太字で強調表示
  - 日本語および英語の多言語表示（NLS）に対応

## [1.9.2] - 2026-09-14

### 修正 (Fixed)
- Kiro (バージョン 1.0.437 / VS Code 1.109.5) および旧バージョンの VS Code との互換性を改善
  - `package.json` の `engines.vscode` および `devDependencies["@types/vscode"]` の要求バージョンを `^1.137.0` から `^1.109.0` に引き下げ、インストール時の互換性エラーを解消

## [1.9.1] - 2026-09-14

### 修正 (Fixed)
- 繰り返し設定の編集時に、存在しない日付、整数以外の間隔、および無効な月日の組み合わせを受け付けないよう入力検証を強化
- 編集対象の会議がない場合に、繰り返し設定の編集フローに適した案内を表示

## [1.9.0] - 2026-09-14

### 追加 (Added)
- 登録済み会議の単発・繰り返し設定の対話的変更機能 (`editRecurrence`) の追加
  - ツリービュー内の繰り返し項目をクリック、または右クリックメニュー（`繰り返し設定の変更`）から呼び出し可能
  - 繰り返しの種類（単発・日次・毎週・平日・月次・年次）および詳細条件（間隔、曜日、開催日・月、終了日）の編集に対応
- ドキュメント (README.md) の拡充
  - 企業向け Teams と個人向け Teams での会議登録方法の分離整理
  - 特定回情報 (`RECURRENCE-ID`) のみを含む `.ics` ファイルが単発として登録される理由および編集機能での変更方法に関する注意書きの追加

## [1.8.4] - 2026-09-14

### 修正 (Fixed)
- ICS 内に無効な会議 ID が先行していても、後続する有効な会議 ID を抽出するよう修正
- 同一件名・開始時刻でも UID が異なる単独例外 `VEVENT` を重複として除外しないよう修正

## [1.8.3] - 2026-09-14

### 修正 (Fixed)
- 元シリーズ定義（ベース `VEVENT`）を含まず `RECURRENCE-ID` プロパティのみを持つ単独の例外 `VEVENT` が含まれる ICS ファイルをドラッグ＆ドロップした際、「ファイルに有効な会議イベントが存在しません」と誤判定される不具合を修正

## [1.8.2] - 2026-09-14

### 修正 (Fixed)
- OSのエクスプローラー等からサイドバーペインへ `.ics` ファイルをドラッグ＆ドロップした際に `DataTransferFile` の内容が正常に取得・登録されない不具合を修正 (`dropMimeTypes` に `files` を追加しファイル読み込み処理を対応)

## [1.8.1] - 2026-09-14

### 修正 (Fixed)
- ICS の `RRULE` に含まれる `COUNT`、序数曜日、`BYSETPOS` を実際の繰り返し候補へ反映し、終了後の予定を登録しないよう修正
- ICS ファイルの非同期読み込みと、同一 UID・開始時刻の予定を重複登録しないインポート処理へ改善

## [1.8.0] - 2026-09-14

### 追加 (Added)
- 企業版 Microsoft Teams / Outlook の `.ics` カレンダーファイルの直接ドラッグ＆ドロップ読み込み機能の追加
- RFC 5545 及び RFC 6868 規格に準拠した非依存型 `.ics` パーサーエンジン (`src/icsParser.ts`) の新規実装（BOM除去、CRLF正規化、75 octet line folding/unfolding、escaped characters/quoted parameters パース）
- 優先順位（`X-MICROSOFT-SKYPETEAMSMEETINGURL` -> `URL` -> `DESCRIPTION` -> `X-ALT-DESC`）に従う厳格な Teams 参加 URL 抽出および Safe Links 解読
- 日次/平日/週次/月次/年次等の繰り返し（`RRULE`）および例外予定（`EXDATE`, `RDATE`, `RECURRENCE-ID`, `STATUS:CANCELLED`）の算出・リマインド登録対応

## [1.7.6] - 2026-09-13

### セキュリティ強化 (Security Enhancements)
- GitHub Releases 更新確認機能 (`fetchLatestReleaseTag`) において、レスポンスデータの最大サイズ制限（100KB）および上限超過時のストリーム破棄処理を追加し、メモリ枯渇（DoS）リスクに対する防護策（多層防御）を強化

## [1.7.5] - 2026-09-13

### パフォーマンス改善 (Performance Improvements)
- `src/dateTime.ts` の `getZonedDateParts` において、`formatToParts` の返り値解析における `Map` およびの中間配列生成を廃止し、ループと `switch` 文による直接変数代入へ置き換えることで GC 負荷と計算コストを低減

## [1.7.4] - 2026-09-13

### セキュリティ強化 (Security Enhancements)
- 手動入力およびテキストパース時のユーザー入力フィールド（タイトル、主催者名、会議ID、パスコード）に対する制御文字の自動除去・正規化および最大文字数制限（タイトル最大200文字等）を追加し、DoSや表示崩れ・メモリ乱用のリスクを低減

## [1.7.3] - 2026-09-13

### パフォーマンス改善 (Performance Improvements)
- `src/dateTime.ts` における `Intl.DateTimeFormat` インスタンスのキャッシュ（`formatterCache` Map / `validTimeZoneCache` Set）の導入により、タイムゾーン変換や繰り返し計算でのオブジェクト生成コストを削減
- `src/meetingManager.ts` の `getSortedMeetings` において、各会議の開始エポックタイムスタンプを一度だけ計算・キャッシュしてソート（Schwartzian transform）するよう改善し、ソート比較時の $O(N \log N)$ 回の無駄なパースおよび `Date` インスタンス生成コストを削除

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
