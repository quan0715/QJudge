QJudge는 [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) 를 통해 AI 도구에서 시험 문제 생성, 채점, 조회를 직접 수행할 수 있습니다. 연결 후에는 웹 UI를 수동으로 조작하지 않아도 자연어로 QJudge를 사용할 수 있습니다.

## 지원 AI 도구

| 도구 | 상태 |
|------|------|
| remote MCP 지원 AI 도구 | `https://mcp.q-judge.com/mcp` 를 붙여 넣어 사용 가능 |
| [Claude Code](https://claude.ai/claude-code) | 완전 지원 |
| [Cursor](https://cursor.com) | 완전 지원 |
| [Codex CLI](https://github.com/openai/codex) | 완전 지원 |
| ChatGPT / Claude Desktop / VS Code 등 | remote MCP 설정으로 사용 가능할 것으로 예상 |

## 사전 조건

- **교사** 또는 **TA** 권한이 있는 QJudge 계정
- 위 목록 중 하나의 AI 도구

QJudge MCP 인증은 OAuth 2.1을 사용하므로 API token을 수동으로 만들 필요가 없습니다.

## 빠른 연결

AI 도구에 MCP, Connectors, Integrations 설정 화면이 있다면 이 방법을 우선 사용하세요.

1. custom / remote MCP server를 추가합니다.
2. 아래 URL을 붙여 넣습니다.
3. 저장 후 도구를 다시 불러옵니다.
4. 첫 호출 시 브라우저에서 OAuth를 완료합니다.

```text
https://mcp.q-judge.com/mcp
```

## 도구별 설정

### Claude Code

```bash
claude mcp add --transport http qjudge https://mcp.q-judge.com/mcp
```

### Cursor

`.cursor/mcp.json` 에 추가합니다.

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
