# Configuring MCP Connections

MCP (Model Context Protocol) is an open connection protocol that allows external AI tools to call system functions. For instructors and administrators, its utility is direct: you can inspect classroom information, organize questions, or retrieve submission statistics directly from your preferred AI tools (such as Cursor, Claude Desktop, or MCP-compatible code editors) without having to constantly switch back to your browser.

MCP is an **optional feature**. If you only author questions, grade submissions, and run evaluations through the QJudge web interface, you do not need to configure it.

## Step 1: Verify the MCP Service Is Ready

QJudge natively provides a Remote HTTP MCP endpoint by default, located at your public domain plus `/mcp`:

```text
https://judge.example.edu/mcp
```

> **Important**: External AI tools (such as Claude Desktop or Cursor) generally require remote endpoints to use **HTTPS**. If your server currently uses only a local IP or has not configured an SSL certificate yet, follow [Deployment Guide](#/docs/deployment) or [Ingress & Optional Features](#/docs/deployment-options) to set up a domain name and HTTPS (for example, using Cloudflare Tunnel or a reverse proxy).

## Step 2: Add the Connection in Your AI Tool

Different AI tools refer to this feature as MCP, Connectors, Integrations, or External Tools, but the configuration logic remains identical.

### Using Claude Desktop

Add an `mcpServers` block to your Claude Desktop configuration file (such as `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "qjudge": {
      "type": "http",
      "url": "https://judge.example.edu/mcp"
    }
  }
}
```

### Using Cursor

1. Open Cursor **Settings** > **Features** > **MCP Servers**.
2. Click **Add New MCP Server**.
3. Set Name to `qjudge` and Type to `http` (or SSE/Remote).
4. Enter your QJudge MCP URL (e.g. `https://judge.example.edu/mcp`) and save.

### Using ChatGPT Desktop (macOS / Windows)

The ChatGPT desktop application supports connecting to external developer tools and MCP services:

1. Open the ChatGPT desktop application.
2. Click your profile avatar or settings icon to open **Settings**.
3. Navigate to **Apps & Integrations** or **Developer** > **MCP Servers**.
4. Click **Add Server**:
   - **Name**: `qjudge`
   - **Type**: Select `HTTP` (or Remote)
   - **URL**: Enter `https://judge.example.edu/mcp`
5. If using a JSON configuration file, the structure is identical to Claude Desktop:
   ```json
   {
     "mcpServers": {
      "qjudge": {
        "type": "http",
        "url": "https://judge.example.edu/mcp"
      }
     }
   }
   ```
6. Save and restart or reload the conversation to enable QJudge actions in chat.

### Using ChatGPT Web

When using [chatgpt.com](https://chatgpt.com/) in your browser, you can connect using either method depending on feature availability:

#### Method A: Via Connected Apps (Developer / MCP Connections Enabled)
1. Go to ChatGPT Web, click your profile settings > **Connected Apps** (or **Developer Tools**).
2. Click **Connect Tool** or **Add MCP Endpoint**.
3. Enter your QJudge MCP endpoint: `https://judge.example.edu/mcp`.
4. Click Connect; the browser will open a QJudge OAuth authorization window to complete the connection.

#### Method B: Via Custom GPTs (Custom GPT Actions Integration)
If you want to build a dedicated "Course TA GPT":
1. Navigate to **Explore GPTs** > click **Create a GPT**.
2. Switch to the **Configure** tab, scroll to the bottom, and click **Create new action** under **Actions**.
3. Select **OAuth** under Authentication:
   - **Authorization URL**: `https://judge.example.edu/o/authorize/`
   - **Token URL**: `https://judge.example.edu/o/token/`
   - **Scope**: `read write`
4. Enter your QJudge endpoint to enable the GPT to query classrooms and draft questions.

> **Security Note**: **Never write usernames, passwords, or secret tokens into configuration files**. QJudge uses a secure OAuth 2.0 flow; connection tokens are dynamically issued via browser authorization, eliminating the need to hard-code credentials.

## Step 3: Initial Authorization and Login

After configuring your tool, reload or restart it:

1. When the AI tool first attempts to call a QJudge tool, your browser will automatically pop up or prompt you to open the QJudge authorization page.
2. Log into your QJudge account in the browser.
3. Review the permissions requested by the tool, and click **Authorize**.
4. Once authorization succeeds, close the browser window and return to your AI tool.

## Permissions and Security Boundaries

The permissions granted to the MCP tool **strictly match your logged-in QJudge account**:

- **Teacher Accounts**: Can only query and manage their own classrooms, assignments, exams, and student rosters; cannot view other instructors' private questions.
- **Administrator Accounts**: Can query site-level system statuses and global settings.

MCP does not bypass QJudge's internal permission checks, nor can it access data outside your personal account's authorized scope.

## Step 4: Testing Your First Prompt

Once configured, test the connection with a simple read-only query to confirm connectivity and permissions:

Enter the following into your AI tool's chat prompt:

> "Please check what classrooms I have access to on QJudge."

If the AI lists your course classroom names and IDs, your MCP connection is fully operational!

[Previous: Configuring AI Models & Services](#/docs/ai-setup) · [Next: Third-Party Authentication Setup](#/docs/auth-setup)
