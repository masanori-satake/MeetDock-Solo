# MeetDock-Solo

[![Version](https://img.shields.io/badge/version-v1.17.1-blue.svg)](package.json)
[![Visual Studio Marketplace](https://vsmarketplacebadges.dev/version/masanori-satake.meetdock-solo.svg?label=Marketplace&color=blue)](https://marketplace.visualstudio.com/items?itemName=masanori-satake.meetdock-solo)
[![Open VSX](https://img.shields.io/open-vsx/v/masanori-satake/meetdock-solo?label=Open%20VSX)](https://open-vsx.org/extension/masanori-satake/meetdock-solo)
[![GitHub release (latest by date)](https://img.shields.io/github/v/release/masanori-satake/MeetDock-Solo)](https://github.com/masanori-satake/MeetDock-Solo/releases)

<p align="center">
  <strong>Language / 言語:</strong> <a href="#english">English</a> | <a href="#japanese-日本語">日本語</a>
</p>

---

<a name="english"></a>
## English

**MeetDock-Solo** is a lightweight, 100% local VS Code extension designed to prevent missing or being late for Microsoft Teams meetings while coding.

It allows you to quickly register Teams meetings via drag-and-drop to the sidebar or clipboard auto-parsing using keyboard shortcuts (`Alt+M` / `Option+M`). With real-time countdowns on the status bar, two-stage reminder notifications (a 5-minute popup and a start-time toast), and one-click access to Teams meetings and meeting chat threads, you can stay completely focused on your code without checking external calendar apps.

---

### 📑 Table of Contents

- [💡 Key Features](#-key-features)
- [📦 Installation & Updates](#-installation--updates)
- [🚀 How to Use](#-how-to-use)
- [⌨️ Commands & Keybindings](#️-commands--keybindings)
- [📋 Requirements](#-requirements)
- [🔒 Data Storage & Privacy](#-data-storage--privacy)
- [🛠️ Developer Documentation](#️-developer-documentation)
- [📄 License](#-license)

---

### 💡 Key Features

1. **Intuitive Meeting Registration**
   - **Drag & Drop .ics Files or Text**: Simply drag and drop `.ics` calendar files saved from Enterprise Teams / Outlook, or meeting invitation text from emails and chats directly into the sidebar (TreeView). It parses them according to RFC 5545 specifications, automatically extracting Teams URLs, subjects, date/times, organizers, and recurrence settings.
   - **File Picker Dialog**: Pick a `.ics` file directly from your disk using a dedicated command/button.
   - **Clipboard Parsing (`Alt+M` / `Option+M`)**: Automatically parses copied text and lets you register meetings quickly via an input dialog.

2. **Status Bar Display & Real-Time Countdown**
   - Continuously displays the remaining time until the next meeting in the status bar.
   - Display styles change automatically based on remaining time:
     - **Normal (Today)**: `$(calendar) Next Teams: 14:00 (in 35m)`
     - **Normal (Tomorrow / Future)**: `$(calendar) Next Teams: 14:00 (Tomorrow)`, or `(in 2 days)` for dates further ahead.
     - **5 to 1 min before**: Highlighted in yellow warning `$(calendar) 14:00 Subject (in 5m)`
     - **Less than 1 min before**: Highlighted in red `$(calendar) 14:00 Subject (Starting soon)`
     - **In progress**: Highlighted in green `$(broadcast) Subject (In progress)`
   - Clicking the status bar opens a Quick Pick list of registered meetings for immediate joining or jumping to chat.

3. **Reliable Two-Stage Reminder Notifications**
   - **5-Minute Reminder**: Displays a popup notification in the lower-right corner of VS Code. Click "Join Teams Meeting" to instantly open the meeting link in your browser or Teams app.
   - **Start-Time Notification**: Displays a non-modal notification toast so you can join Teams instantly without missing a beat even when deep in coding.

4. **Direct Navigation to Meeting Chat (Open Chat)**
   - Automatically extracts thread conversation IDs (`chatId`) from Enterprise Teams meeting URLs.
   - Jump directly to the meeting chat thread with a single click from sidebar actions, Quick Pick, or reminder toasts.

5. **Automated Recurrence Updates & Customization**
   - Choose or edit recurrence patterns per meeting:
     - **Once**: Occurs single time and automatically gets removed upon completion.
     - **Daily**: Repeats daily or every specified number of days.
     - **Weekly**: Repeats weekly or on specific days/weeks.
     - **Weekdays**: Repeats every weekday (Monday through Friday).
     - **Monthly**: Repeats monthly or every specified number of months (adjusts automatically for shorter months e.g. 31st to 30th/28th).
     - **Yearly**: Repeats yearly or every specified number of years (adjusts leap year Feb 29th to Feb 28th on common years).
   - Easily modify recurrence rules at any time directly from the sidebar.

6. **Data Persistence (`globalState`)**
   - Registered meeting data is stored safely in VS Code's `globalState` and persists across editor restarts.

---

### 📦 Installation & Updates

#### Method 1: Install from Visual Studio Marketplace (Recommended)

##### A. Install via VS Code UI
1. Open VS Code and click the **Extensions icon** on the Activity Bar (`Ctrl+Shift+X` / `Cmd+Shift+X`).
2. Search for `MeetDock-Solo`.
3. Click the **Install** button.

##### B. Install via Web Browser
1. Visit the [MeetDock-Solo Marketplace Page](https://marketplace.visualstudio.com/items?itemName=masanori-satake.meetdock-solo).
2. Click **Install** and follow the browser prompts to open and install in VS Code.

---

#### Method 2: Install from Open VSX Registry

For VSCodium, Gitpod, Eclipse Theia, or environments configured with Open VSX:
1. Visit the [MeetDock-Solo Open VSX Page](https://open-vsx.org/extension/masanori-satake/meetdock-solo).
2. Install via your editor's extension manager or download the `.vsix` package directly.

---

#### Method 3: Install from VSIX Package File (Offline / Manual)

1. Go to the [GitHub Releases](https://github.com/masanori-satake/MeetDock-Solo/releases) page.
2. Download the `.vsix` file (e.g., `meetdock-solo-1.17.1.vsix`) under Assets.
3. In VS Code Extensions view (`Ctrl+Shift+X`), click the **"..." (Views and More Actions)** icon at the top right, select **Install from VSIX...**, and choose the downloaded file.

---

### 🚀 How to Use

#### 1. Registering Meetings

##### 🏢 Enterprise Teams
- **Option A: Drag & Drop .ics File (Recommended)**: Drag and drop a downloaded `.ics` file directly into the sidebar view (`Meetings`).
- **Option B: Select .ics File**: Click the `.ics` file icon in the sidebar title bar or Welcome view to pick a file from disk.
- **Option C: Add from Clipboard**: Copy invitation text (`Ctrl+C` / `Cmd+C`), then press `Alt+M` (`Option+M` on macOS) or click the `+` icon on the sidebar.

> **⚠️ ICS Recurrence Note**
> Some `.ics` files exported from email attachments or notification emails may contain only a single occurrence (`RECURRENCE-ID`) rather than full recurrence rules (`RRULE`). In such cases, the meeting will initially be registered as a one-time meeting ("Once"). You can change it to Daily, Weekly, Weekdays, Monthly, or Yearly at any time by clicking the recurrence entry in the sidebar.

##### 👤 Personal Teams
- Copy the meeting URL or invite text, press `Alt+M` (`Option+M`), or drag & drop text into the sidebar, then select recurrence options.

#### 2. Joining Meetings & Accessing Chat
- **Status Bar**: Click `Next Teams: ...` to open Quick Pick. Select the meeting to join, or click the chat icon `$(comment-discussion)` to open the chat thread.
- **Sidebar**: Click the external link icon (`$(link-external)`) next to a meeting to join, or click the chat icon (`$(comment-discussion)`) to jump into the meeting chat.
- **Notifications**: Click "Join Teams Meeting" or "Open Chat" on reminder popups.

#### 3. Managing & Deleting Meetings
- **Edit Recurrence**: Click on the recurrence detail row under a meeting or select "Edit Recurrence" from the context menu.
- **Delete**: Hover over a meeting node in the sidebar and click the trash icon (`$(trash)`) to delete it.
- **Refresh**: Click the refresh icon (`$(refresh)`) on the sidebar title bar to reload the list manually.

---

### ⌨️ Commands & Keybindings

| Command Name | Command ID | Keybinding | Description |
| :--- | :--- | :--- | :--- |
| **Add Meeting from Clipboard** | `meetdock-solo.addFromClipboard` | `Alt+M` (Win/Linux)<br>`Option+M` (macOS) | Parse Teams URL, subject, and time from clipboard text |
| **Add Meeting from .ics File** | `meetdock-solo.addFromFile` | - | Open file picker to register meeting from a `.ics` file |
| **Join Teams Meeting** | `meetdock-solo.openMeeting` | - | Open selected meeting URL in browser or Teams app |
| **Open Chat** | `meetdock-solo.openChat` | - | Open Teams meeting chat thread in browser or Teams app |
| **Delete Meeting** | `meetdock-solo.deleteMeeting` | - | Remove registered meeting |
| **Edit Recurrence** | `meetdock-solo.editRecurrence` | - | Change recurrence pattern and settings of a meeting |
| **Refresh View** | `meetdock-solo.refreshView` | - | Refresh sidebar meeting list |
| **Select Meeting from List** | `meetdock-solo.selectMeeting` | - | Open Quick Pick to select and join a meeting |
| **Toggle Guide View** | `meetdock-solo.toggleGuide` | - | Toggle visibility of the inline usage guide |

---

### 📋 Requirements

- **VS Code**: `v1.109.0` or later
- **OS**: Windows, macOS, Linux
- Valid Microsoft Teams meeting URLs (`https://teams.microsoft.com/...` or `https://teams.live.com/...`)

---

### 🔒 Data Storage & Privacy

All meeting information is stored locally via `ExtensionContext.globalState`. No telemetry or meeting data is transmitted to external servers. External links are only triggered when clicking to open a meeting URL in your default browser or Teams app.

---

### 🛠️ Developer Documentation

- System Architecture & Flow: [docs/architecture.md](docs/architecture.md)
- Open VSX Setup: [docs/open-vsx-setup.md](docs/open-vsx-setup.md)

---

### 📄 License

[MIT License](LICENSE)

---

<a name="japanese-日本語"></a>
## Japanese (日本語)

**MeetDock-Solo** は、VS Code でのプログラミング作業中に Microsoft Teams 会議の参加漏れや遅刻を防ぐためのリマインダー＆会議一覧管理拡張機能です。

サイドバーへのドラッグ＆ドロップやショートカットキー（`Alt+M` / `Option+M`）によるクリップボード自動解析により、Teams 会議を迅速に登録できます。ステータスバーのリアルタイムカウントダウン、2段階のリマインダー通知（5分前ポップアップ・開始時の通知トースト）、および会議参加・チャット画面への直接遷移機能により、外部カレンダーを確認することなくコーディングに集中しながら確実に会議へ参加できるようサポートします。

---

### 📑 目次

- [💡 主な機能](#-主な機能)
- [📦 インストール/アップデート方法](#-インストールアップデート方法)
- [🚀 使い方](#-使い方)
- [⌨️ コマンド & キーバインド](#️-コマンド--キーバインド)
- [📋 動作要件 (Requirements)](#-動作要件-requirements)
- [🔒 データの保存について](#-データの保存について)
- [🛠️ 開発者向けドキュメント](#️-開発者向けドキュメント)
- [📄 ライセンス](#-ライセンス)

---

### 💡 主な機能

1. **直感的な会議登録**
   - **.ics ファイル / テキストのドラッグ＆ドロップ**: 企業版 Teams や Outlook から保存した `.ics` カレンダーファイル、またはメール・チャットの会議招待テキストをサイドバー（TreeView）へドラッグ＆ドロップするだけで、RFC 5545 準拠で解析し、Teams URL・件名・日時・主催者・繰り返し設定を自動抽出してリマインダーに登録できます。
   - **.ics ファイル選択ダイアログ**: ファイル選択ダイアログから `.ics` ファイルを直接指定して登録することも可能です。
   - **クリップボード解析 (`Alt+M` / `Option+M`)**: コピーしたテキストから自動解析し、入力ダイアログで迅速に登録できます。

2. **ステータスバー表示とリアルタイムカウントダウン**
   - 次の会議までの残り時間をステータスバーに常時表示します。
   - 残り時間に応じて表示スタイルが自動変化します：
     - **通常時（当日）**: `$(calendar) Next Teams: 14:00 (in 35m)`
     - **通常時（翌日・翌日以降）**: 翌日の場合は `$(calendar) Next Teams: 14:00 (Tomorrow)` / `(明日)`、2日以降先の場合は `(in 2 days)` / `(2日後)` と分かりやすく表示されます。
     - **5分前〜1分前**: 黄色背景で警告表示 `$(calendar) 14:00 件名 (in 5m)`
     - **1分前未満**: 赤色背景で強調表示 `$(calendar) 14:00 件名 (まもなく開始)`
     - **開催中**: 背景色無しの緑色強調表示で `$(broadcast) 件名 (開催中)`
   - ステータスバーをクリックすると、登録済み会議の一覧（クイックピック）が開き、すぐに Teams への参加や会議チャットのオープンが可能です。

3. **確実な2段階リマインダー通知**
   - **5分前通知**: VS Code 右下に通知ポップアップを表示。「Teamsに参加」ボタンを押すとブラウザまたはTeamsアプリで即座に会議リンクが開きます。
   - **開始時刻通知**: **非モーダル通知トースト**を表示。コーディングに没頭していても見逃すことなく Teams へ参加できます。

4. **会議チャット画面への直接遷移（チャットを開く）**
   - 企業向け Teams 会議 URL からスレッド ID（`chatId`）を自動抽出。
   - サイドバーのインラインボタン、Quick Pick、リマインダー通知からワンクリックで該当会議のチャットスレッドへ直接アクセスできます。

5. **繰り返し（リカーレンス）会議の自動更新・柔軟な変更**
   - 会議ごとに繰り返し設定を選択可能：
     - **単発 (Once)**: 1回のみの開催。会議終了後に自動的に一覧から削除されます。
     - **日次 (Daily)**: 毎日または指定日数ごとに繰り返し、次回スケジュールが更新されます。
     - **毎週 (Weekly)**: 毎週または指定曜日/週ごとに繰り返し、次回スケジュールが更新されます。
     - **平日 (Weekdays)**: 月曜〜金曜日の平日に繰り返し、次回スケジュールが更新されます。
     - **月次 (Monthly)**: 毎月または指定月数（同日）ごとに繰り返し、次回スケジュールが更新されます（※対象月に指定日が存在しない場合、31日→30日/28日など自動的に月末日へ調整されます）。
     - **年次 (Yearly)**: 毎年または指定年数（同月日）ごとに繰り返し、次回スケジュールが更新されます（※うるう年の2月29日設定の場合、平年は2月28日へ自動的に調整されます）。
   - 登録後でも、サイドバーからいつでも繰り返しルールや間隔・曜日設定を変更できます。

6. **データ永続化 (`globalState`)**
   - 登録された会議データは VS Code の `globalState` に安全に保存され、エディタを再起動しても保持されます。

---

### 📦 インストール/アップデート方法

本拡張機能は **Visual Studio Marketplace** または **Open VSX Registry** から直接インストールできます（推奨）。Marketplace からインストールした場合、VS Code によって拡張機能のバージョン確認および自動アップデートが自動的に行われます。

#### 方法 1: Visual Studio Marketplace からのインストール（推奨）

##### A. VS Code UI からインストール
1. VS Code を開き、左側のアクティビティバーにある **拡張機能アイコン**（`Ctrl+Shift+X` / `Cmd+Shift+X`）をクリックします。
2. 検索窓に `MeetDock-Solo` と入力します。
3. 一覧に表示された **MeetDock-Solo** の **「インストール (Install)」** ボタンをクリックします。

##### B. VS Code Marketplace Web ページからインストール
1. [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=masanori-satake.meetdock-solo) の MeetDock-Solo ページにアクセスします。
2. **「Install」** ボタンをクリックし、ブラウザの指示に従って VS Code で開いてインストールします。

---

#### 方法 2: Open VSX Registry からのインストール

VSCodium や Gitpod、Eclipse Theia など Open VSX を利用する環境の場合：
1. [Open VSX Registry の MeetDock-Solo ページ](https://open-vsx.org/extension/masanori-satake/meetdock-solo) にアクセスします。
2. エディタの拡張機能ビューから検索してインストールするか、`.vsix` パッケージをダウンロードしてインストールします。

---

#### 方法 3: VSIX パッケージファイルからのインストール（オフライン環境等）

ネットワーク制限のある環境やテスト目的で `.vsix` ファイルから直接インストール・更新を行う手順は以下の通りです。

##### 手順 1: VSIX ファイルのダウンロード
1. 本リポジトリの [GitHub Releases](https://github.com/masanori-satake/MeetDock-Solo/releases) ページにアクセスします。
2. 最新リリースの **Assets** セクションから、`.vsix` ファイル（例: `meetdock-solo-1.17.1.vsix`）をダウンロードします。

##### 手順 2: VS Code へのインストール
1. VS Code の拡張機能ビュー（`Ctrl+Shift+X` / `Cmd+Shift+X`）を開きます。
2. 右上の **「...」（その他の操作）アイコン** をクリックし、**「VSIX からのインストール... (Install from VSIX...)」** を選択します。
3. ダウンロードした `.vsix` ファイルを選択してインストールします。

インストール完了後、アクティビティバーにカレンダーアイコン (**MeetDock-Solo**) が表示されれば準備完了です。

---

### 🚀 使い方

#### 1. 会議を登録する

使っている Teams の種別（企業向け Teams / 個人向け Teams）によって利用できる最適な登録方法が異なります。

##### 🏢 企業 (Enterprise) 向け Teams の場合

###### 方法 A: .ics ファイルのドラッグ＆ドロップ（推奨）
1. Outlook や Teams からダウンロード・保存した `.ics` カレンダーファイルを準備します。
2. VS Code のアクティビティバーにあるカレンダーアイコン **MeetDock-Solo** を開きます。
3. `.ics` ファイルをサイドバービュー（`Meetings`）へ直接ドラッグ＆ドロップします。
4. RFC 5545 準拠で自動解析され、ダイアログなしで即座に会議が登録されます。

###### 方法 B: .ics ファイルを選択して追加
1. サイドバー上部または Welcome ビュー内の「`.ics` ファイルを選択して登録」をクリックします。
2. ファイル選択ダイアログで `.ics` ファイルを選択すると、自動解析されて登録されます。

###### 方法 C: クリップボードから追加
1. Outlook や Teams 等の招待テキスト（会議 ID やパスコード、URL が含まれる文章）をコピー (`Ctrl+C` / `Cmd+C`) します。
2. キーボードショートカット `Alt+M` (macOS: `Option+M`) を押すか、サイドバー上部の `+` (追加) アイコンをクリックします。
3. 自動抽出された項目を確認・決定して登録完了です。

> **⚠️ ICS ファイルの繰り返し設定に関するご注意**
> メール本文添付や特定の通知メールから保存された `.ics` ファイルには、特定回（インスタンス）の情報（`RECURRENCE-ID`）のみが含まれ、繰り返しルール（`RRULE`）が含まれていない場合があります。この場合、ファイル仕様に基づき「単発（1回のみ）」の会議として登録されます。
> 単発として登録された場合でも、サイドバーで登録された会議を展開し、**「繰り返し: 単発 (1回のみ)」の項目をクリック**（または右クリックメニュー「繰り返し設定の変更」）することで、サポートされている繰り返しパターン（日次・毎週・平日・月次・年次）および詳細設定（間隔・曜日・開催日・終了日など）をいつでも簡単に変更できます。

##### 👤 個人 (Personal) 向け Teams の場合

###### クリップボード / テキストから追加
1. 個人向け Teams の会議参加リンク（例: `https://teams.live.com/meet/...`）や案内テキストをコピー (`Ctrl+C` / `Cmd+C`) します。
2. キーボードショートカット `Alt+M` (macOS: `Option+M`) を押すか、サイドバー上部の `+` アイコンをクリックします（またはテキストをサイドバーへドラッグ＆ドロップします）。
3. 抽出された URL・タイトル・日時を確認し、繰り返しパターン（単発・日次・毎週・平日・月次・年次）を選択して登録完了です。

#### 2. 会議に参加する・チャットを開く
- **ステータスバーから**: ステータスバーの `Next Teams: ...` をクリックするとクイックピックが開き、会議参加やチャットアイコン `$(comment-discussion)` によるチャット画面オープンが可能です。
- **サイドバーから**: 会議項目の右側に表示される外部リンクアイコン（`Teamsに参加`）をクリックして会議に参加できます。また、チャット対応会議では吹き出しアイコン（`チャットを開く`）をクリックしてチャット画面を開くことができます。
- **通知から**: 5分前通知または開始時の通知トーストに表示される **「Teamsに参加」** または **「チャットを開く」** ボタンをクリックします。

#### 3. 会議を管理・変更・削除する
- **繰り返し設定の変更**: サイドバーの会議を展開し、繰り返し項目のクリックまたは右クリックメニュー（`繰り返し設定の変更`）から、繰り返しの種類や詳細ルールを変更できます。
- **削除**: サイドバーの会議項目ホバー時に表示されるゴミ箱アイコン（`削除`）をクリックすると、登録を削除できます。
- **手動更新**: サイドバー上部の更新アイコンをクリックすると、表示を手動更新できます。

---

### ⌨️ コマンド & キーバインド

| コマンド名 | コマンド ID | ショートカットキー | 説明 |
| :--- | :--- | :--- | :--- |
| **クリップボードから会議を追加** | `meetdock-solo.addFromClipboard` | `Alt+M` (Win/Linux)<br>`Option+M` (macOS) | クリップボードのテキストから Teams URL、件名、開始日時を解析して登録 |
| **.ics ファイルから会議を追加** | `meetdock-solo.addFromFile` | - | ファイル選択ダイアログを開き、`.ics` ファイルから会議を登録 |
| **Teamsに参加** | `meetdock-solo.openMeeting` | - | 選択された会議の URL をブラウザまたは Teams アプリで開く |
| **チャットを開く** | `meetdock-solo.openChat` | - | 選択された会議のチャットスレッドをブラウザまたは Teams アプリで開く |
| **会議を削除** | `meetdock-solo.deleteMeeting` | - | 登録済みの会議を削除する |
| **繰り返し設定の変更** | `meetdock-solo.editRecurrence` | - | 登録済み会議の繰り返しパターン・詳細設定を変更する |
| **更新** | `meetdock-solo.refreshView` | - | サイドバーの会議一覧表示を更新する |
| **ミーティング一覧から選択** | `meetdock-solo.selectMeeting` | - | クイックピックで登録済み会議一覧を表示し、選択して参加する |
| **ガイド表示の切替** | `meetdock-solo.toggleGuide` | - | サイドバー下部の使い方ガイドを表示・フォーカスする |

---

### 📋 動作要件 (Requirements)

- **VS Code**: `v1.109.0` 以降
- **対応 OS**: Windows, macOS, Linux
- Microsoft Teams の会議 URL (`https://teams.microsoft.com/...` または `https://teams.live.com/...`) を使用する環境

---

### 🔒 データの保存について

本拡張機能で登録した会議情報を、拡張機能自身が独自の外部サーバーへ送信することはありません。すべてのデータは VS Code の `ExtensionContext.globalState` を通じてローカル環境に保存されます。会議への参加やチャットのオープンを選択した場合のみ、`src/extension.ts` および `src/reminderService.ts` の `openExternal` 処理により、選択した会議 URL またはチャットディープリンクが既定のブラウザまたは Teams アプリへ渡されます。

---

### 🛠️ 開発者向けドキュメント

- システムの詳細な動作フローやコンポーネント構造: [docs/architecture.md](docs/architecture.md)
- Open VSX Registry への初回パブリッシュ設定手順: [docs/open-vsx-setup.md](docs/open-vsx-setup.md)

---

### 📄 ライセンス

[MIT License](LICENSE)
