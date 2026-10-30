# Open VSX Registry パブリッシュ初期設定ガイド

このドキュメントは、**MeetDock-Solo** を **Open VSX Registry** (open-vsx.org) に初回パブリッシュする際の設定手順およびトラブルシューティングをまとめたガイドです。

---

## 1. エラーの原因

GitHub Actions のリリースワークフローにおいて以下のエラーが発生した場合：

```text
❌ Unknown publisher: masanori-satake
Use the 'create-namespace' command to create a namespace corresponding to your publisher name.
See the documentation for more information:
https://github.com/eclipse/openvsx/wiki/Publishing-Extensions
```

これは、Open VSX Registry 上に `package.json` の `publisher` フィールドに指定されているパブリッシャー名（`masanori-satake`）の**ネームスペース（Namespace）が未登録**であることが原因です。

Visual Studio Marketplace と Open VSX Registry は独立したサービスであるため、Visual Studio Marketplace でパブリッシャーを作成済みであっても、Open VSX 上で別途ネームスペースの作成と所有権の確認を行う必要があります。

---

## 2. 初回パブリッシュのための設定手順

### ステップ 1: Open VSX アカウントの作成・ログイン
1. [Open VSX Registry](https://open-vsx.org/) にアクセスします。
2. 右上の **"Log In"** から、GitHub アカウントを使用してログインします。

---

### ステップ 2: ネームスペース (`masanori-satake`) の作成
パブリッシャー名に対応するネームスペースを作成します。以下のいずれかの方法で行えます。

#### 方法 A: Web UI から作成（推奨）
1. ログイン後、右上プロフィールアイコンから **"User Settings"** > **"Namespaces"** を開きます。
2. **"Create Namespace"** をクリックします。
3. ネームスペース名に `masanori-satake` （`package.json` の `publisher` と一致するもの）を入力して作成します。
   - ※ GitHub アカウント名と同一の場合、自動的に所有権が承認されます。

#### 方法 B: CLI (`ovsx`) から作成
ローカルの端末から Personal Access Token を使用して作成することも可能です：
```bash
npx ovsx create-namespace masanori-satake -p <YOUR_OVSX_PAT>
```

---

### ステップ 3: Access Token (OVSX_PAT) の生成
1. Open VSX ログイン後、**"User Settings"** > **"Access Tokens"** を開きます。
2. **"Create Token"** をクリックし、トークン名を入力してアクセストークンを生成します。
3. 生成されたトークン文字列をコピーします。

---

### ステップ 4: GitHub Secrets への登録
1. 本リポジトリの GitHub ページを開き、**"Settings"** > **"Secrets and variables"** > **"Actions"** に移動します。
2. **"Repository secrets"** の `OVSX_PAT` を更新（または新規追加）します。
3. ステップ 3 で取得したアクセストークンを貼り付けて保存します。

---

## 3. 再実行とパブリッシュ確認

上記の設定完了後、以下のいずれかの方法で GitHub Actions を手動実行または再トリガーします：
1. **GitHub Actions 画面からの手動実行**:
   - リポジトリの **"Actions"** タブを開きます。
   - **"Build, Package and Release"** ワークフローを選択します。
   - **"Run workflow"** をクリックして実行します。
2. ワークフロー完了後、[Open VSX Registry](https://open-vsx.org/extension/masanori-satake/meetdock-solo) にてパブリッシュされた拡張機能ページが作成されていることを確認します。
