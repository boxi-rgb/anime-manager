# ユーザー定義プロトコル (User Global Protocol)

## 🌐 言語運用ルール (Language Policy)
**優先度: 最高 (P0) - 他の全ルールに優先する**

1. **応答と成果物 (Response & Artifacts)**:
   - ユーザーへの回答、Walkthrough、Implementation Plan、Taskなど作成するドキュメント、コード内コメントは **100% 日本語** で記述すること。
   - 英語の使用は、固有名詞、コード、API識別子のみに限定される。

2. **自己修正 (Self-Correction)**:
   - 出力生成前に「この出力は日本語か？」を自問すること。
   - 誤って英語で生成した場合は、ユーザーに提示する前に破棄し、日本語で再生成すること。

## 🛠️ エンコーディング・環境ルール (P0)
**文字化けとデータ破壊を防止するため、以下の手順を必ず実行すること。**

1. **シェル実行時の UTF-8 強制**:
   - **PowerShell**: 冒頭に `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;` を付与。
   - **CMD**: 冒頭に `chcp 65001 > nul &&` を付与。
2. **ファイル操作の安全**:
   - PowerShell 等での読み書きは必ず UTF-8 (`-Encoding UTF8`) を明示。Shift-JIS による読み書きは「データ破壊」とみなす。
   - インデントが強制される場合は `Set-Content` とヒアドキュメントで生のテキストを書き込む。
3. **Python**: AIエージェントとのデータ受け渡しエラーを防ぐため、常に UTF-8 入出力を強制。

## ⚠️ 順守違反のみなし (Enforcement)
英語での記述が含まれた成果物は「不完全」または「バグ」とみなされる。

## 📂 命名規則 (Naming Convention)
以下の基準を厳守すること。迷った場合は `kebab-case` をデフォルトとする。

| 対象 (Target) | 形式 (Format) | 例 (Example) |
|---|---|---|
| **ディレクトリ** | `kebab-case` | `src/my-utils`, `components` |
| **一般ファイル** | `kebab-case` | `user-guide.md`, `styles.css` |
| **Python script** | `snake_case` | `data_processor.py`, `main_script.py` |
| **React Component** | `PascalCase` | `Button.tsx`, `PageLayout.jsx` |
| **TypeScript/JS** | `camelCase` | `utils.ts`, `apiConfig.js` |
| **Class/Type** | `PascalCase` | `UserInterface`, `class DataManager` |

> [!NOTE]
> `README.md`, `Dockerfile`, `.gitignore` などの慣習的な固定名は例外として許可される。

## 🧠 記憶の圧縮（Truncation/Checkpoint）への対応 (P0)
会話履歴が `{{ CHECKPOINT }}` によって圧縮（切り詰め）されたことを検知した場合、**直後の応答の冒頭**でユーザーに必ずその旨を報告すること。

1. **報告義務**: 「会話が圧縮されました」という事実を明示せよ。
2. **記憶の再同期**: 圧縮後にシステムから提供される要約（Summary）を精査し、以前の「ノリ」や「未完了の約束（例：特定言語の禁止、ペルソナ維持）」を再確認せよ。
3. **継続性の宣言**: 記憶の断絶にかかわらず、現在のスタイルと誠実な姿勢を引き継ぐことをユーザーに宣言すること。
