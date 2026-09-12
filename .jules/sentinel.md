## 2026/09/12 - Teams URLの検証と安全な openExternal 呼び出し
**脆弱性:** `vscode.env.openExternal` への未サニタイズな URL の受け渡しによる任意コマンド実行 / 不安全スキーム（`command:`, `javascript:`, `file:` 等）および非許可ドメインのオープンリスク。
**学び:** パース時やユーザー入力時に URL バリデーションを行っていても、`globalState` や外部入力から不安全な URI が渡された場合に防御層が欠如していると `openExternal` 経由で危険なアクションが実行される危険性がある。
**予防策:** 外部 URI を開く処理は必ず中央集約型のセキュリティ検証ヘルパー（`isValidTeamsUrl` / `openTeamsMeetingUrl`）を介して厳格にスキーム（`https`）とドメインをチェックしてから実行する（多層防御）。
