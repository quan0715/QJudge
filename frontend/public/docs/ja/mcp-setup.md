QJudge は [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) を通じて AI ツールから試験問題の作成、採点、確認を直接行えます。接続後は、Web UI を手で操作しなくても自然言語で QJudge を操作できます。

## 対応 AI ツール

| ツール | 状態 |
|------|------|
| remote MCP 対応の AI ツール | `https://mcp.q-judge.com/mcp` を貼り付けて利用可能 |
| [Claude Code](https://claude.ai/claude-code) | 完全対応 |
| [Cursor](https://cursor.com) | 完全対応 |
| [Codex CLI](https://github.com/openai/codex) | 完全対応 |
| ChatGPT / Claude Desktop / VS Code など | remote MCP 設定で利用可能な想定 |

## 前提条件

- **教師** または **TA** 権限を持つ QJudge アカウント
- 上記のいずれかの AI ツール

QJudge の MCP 認証は OAuth 2.1 で行われるため、API token を手動で発行する必要はありません。

## クイック接続

AI ツールに MCP、Connectors、Integrations の設定画面がある場合は、この方法を優先してください。

1. custom / remote MCP server を追加する
2. 次の URL を貼り付ける
3. 保存してツールを再読み込みする
4. 初回呼び出し時にブラウザで OAuth を完了する

```text
https://mcp.q-judge.com/mcp
```

## ツール別設定

### Claude Code

```bash
claude mcp add --transport http qjudge https://mcp.q-judge.com/mcp
```

### Cursor

`.cursor/mcp.json` に追加します。

```json
{
  "mcpServers": {
    "qjudge": {
      "type": "http",
      "url": "https://mcp.q-judge.com/mcp"
    }
  }
}
```

### Codex CLI

```bash
codex mcp add --transport http qjudge https://mcp.q-judge.com/mcp
```
