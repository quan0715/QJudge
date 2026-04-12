QJudge supports [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) so AI tools can manage exams, questions, and grading directly. Once connected, you can ask your AI assistant to create questions, grade answers, and inspect contest data without manually navigating the web UI.

## Supported AI tools

| Tool | Status |
|------|--------|
| Remote MCP-capable AI tools | Fully supported by pasting `https://mcp.q-judge.com/mcp` |
| [Claude Code](https://claude.ai/claude-code) | Fully supported (Streamable HTTP) |
| [Cursor](https://cursor.com) | Fully supported |
| [Codex CLI](https://github.com/openai/codex) | Fully supported |
| [ChatGPT](https://chatgpt.com/) / Claude Desktop / VS Code and similar remote MCP clients | Expected to work with direct remote MCP setup |
| Other MCP-compatible tools | Should work if they support remote MCP or Streamable HTTP transport |

## Prerequisites

- A QJudge account with **teacher** or **TA** permissions
- One of the AI tools above

QJudge uses OAuth 2.1 for MCP authorization, so you do not need to create API tokens manually.

## Quick connect

If your AI tool has built-in MCP, Connectors, or Integrations settings, prefer that flow. It matches the general pattern used by guides like Notion's "Connect through your AI tool":

1. Add a custom or remote MCP server in the tool settings
2. Paste the QJudge MCP server URL
3. Save the configuration and reload the tool
4. The first time you invoke a QJudge tool, complete the browser OAuth flow

```text
https://mcp.q-judge.com/mcp
```

This usually applies to ChatGPT, Claude Desktop, VS Code, and other clients that support remote MCP.

## Installation guides

### Claude Code

Run:

```bash
claude mcp add --transport http qjudge https://mcp.q-judge.com/mcp
```

After restarting Claude Code, run `/mcp` to confirm that `qjudge` appears in the server list.

### Cursor

Add this to `.cursor/mcp.json`:

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

After restarting Cursor, QJudge tools should be available in Agent mode.

### Codex CLI

Run:

```bash
codex mcp add --transport http qjudge https://mcp.q-judge.com/mcp
```

## If your tool does not support remote MCP

If your AI tool only supports local JSON config files or CLI-based setup, use the Claude Code, Cursor, or Codex CLI examples above. The important part is that every client points to the same remote server URL:

```text
https://mcp.q-judge.com/mcp
```

## Automatic authorization flow

After the MCP server is added, the first tool invocation opens the QJudge login page in your browser. Once authorization completes, the AI tool stores and reuses your credentials automatically.

## Available capabilities

Once connected, the AI tool can access these QJudge MCP tool groups:

### Discover and browse (`qjudge_discover`)

| Action | Description |
|--------|-------------|
| `list_classrooms` | List classrooms you manage |
| `list_contests` | Search contests by name or status |
| `get_contest` | Inspect contest details |
| `browse_banks` | List your question banks |
| `browse_bank_questions` | List questions inside a bank |
| `create_bank_question` | Create a new bank question, including coding problems |

### Manage exam questions (`qjudge_exam`)

| Action | Description |
|--------|-------------|
| `list` | List all exam questions in a contest |
| `get` | Get one exam question |
| `create` | Create true/false, single-choice, multi-choice, short-answer, or essay questions |
| `update` | Update question content |
| `delete` | Delete a question |
| `reorder` | Reorder questions |
| `import_from_bank` | Import questions from a bank |

### Manage coding problems (`qjudge_coding`)

| Action | Description |
|--------|-------------|
| `list` | List coding problems in a contest |
| `get` | Get coding problem details |
| `create` | Create a coding problem |
| `import_from_bank` | Import a coding problem from a bank |
| `update_score` | Update scoring |
| `delete` | Delete a coding problem |
| `test_run` | Run code against built-in or custom test cases |

### Review and grade answers (`qjudge_grading`)

| Action | Description |
|--------|-------------|
| `list_answers` | List student answers, optionally filtered |
| `question_detail` | Inspect answer distribution and per-question analysis |
| `dashboard` | Review grading overview for a contest |
| `grade` | Grade one answer |
| `batch_grade` | Grade multiple answers |
| `ungrade` | Revert grading |

## Security notes

- MCP uses **OAuth 2.1 with PKCE**
- The AI tool stores and manages credentials; the exact storage location depends on the client
- Access tokens expire after 1 hour and refresh automatically
- Refresh tokens expire after 30 days, after which re-authorization is required
- AI tools can only access classrooms and contests you are authorized to manage
- All changes are recorded in the contest activity log

## Troubleshooting

### Connection failed

- Verify the MCP server URL is `https://mcp.q-judge.com/mcp`
- Verify your account has teacher or TA permissions
- If authorization expired, repeat the setup flow and re-authorize

### Permission denied (403)

- Verify you are an owner or manager of the target contest
- Some updates are blocked after students have started an exam

### Response too large

- Filter by `question_id` when listing answers
- Prefer `batch_grade` over many individual `grade` calls
