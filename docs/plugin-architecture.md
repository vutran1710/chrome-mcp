# Chrome Lite MCP — Plugin Architecture

## Overview

Chrome Lite MCP is a long-running Node.js MCP server with two modes:
1. **On-demand** — MCP client calls tools to interact with plugins
2. **Background** — Scheduled jobs run plugin tools autonomously, delivering results via webhook

Plugins are JS modules discovered at startup from the `plugins/` directory.

## MCP Tools

### Core browser tools

| Tool | Params | Description |
|------|--------|-------------|
| `tabs_list` | — | List all open browser tabs |
| `tab_create` | `url` | Create a new tab |
| `tab_navigate` | `tabId`, `url` | Navigate a tab to a URL |
| `tab_close` | `tabId` | Close a tab |
| `tab_switch` | `tabId` | Activate a tab |
| `page_read` | `tabId`, `mode?`, `selector?` | Read page content (text/interactive/accessibility) |
| `page_click` | `tabId`, `selector`/`x,y` | Click an element |
| `page_type` | `tabId`, `text`, `selector?` | Type text into an element |
| `page_eval` | `tabId`, `code` | Execute JS via DevTools Protocol (bypasses CSP) |
| `page_screenshot` | `tabId` | Capture screenshot |

### Plugin tools

| Tool | Params | Description |
|------|--------|-------------|
| `all_plugins` | — | List all available plugins with state |
| `plugins` | — | List activated (ready) plugins only |
| `tools` | `plugin` | List tools for a plugin |
| `init_plugin` | `plugin` | Initialize plugin: open tab, check login |
| `get` | `plugin`, `tool`, `params?` | Read data from a plugin |
| `post` | `plugin`, `tool`, `params?` | Perform an action via a plugin |
| `create_job` | `plugin`, `tool`, `type`, `ms`, `params?`, `webhook?`, `webhookHeaders?` | Schedule a background job |
| `list_jobs` | — | List all active background jobs |
| `delete_job` | `id` | Cancel a background job |

## Plugin Lifecycle

```
unloaded → init_plugin() → ready
                         → awaiting_login → user confirms via extension → ready
                         → error
```

- `all_plugins()` shows all plugins with state
- `plugins()` shows only ready plugins
- Plugin tools (via `get`/`post`) are guarded — must be ready before use

## Plugin Interface

```js
export default {
  name: "gmail",
  url: "https://mail.google.com",

  // Called by init_plugin. Returns { loggedIn: true } or { loggedIn: false, message }
  async init(bridge) {
    const tabId = await ensureTab(bridge, "https://mail.google.com");
    // check login state...
    return { loggedIn: true };
  },

  tools: {
    list_emails: {
      description: "List inbox emails",
      async handler(bridge, params) {
        // use bridge to interact with Chrome
        return { type: "json", data: [...], metadata: { count: 50 } };
      },
    },
    mark_read: {
      description: "Mark selected emails as read",
      async handler(bridge, params) {
        // perform action
        return { type: "text", data: "done", metadata: {} };
      },
    },
  },
}
```

### Contract

- `name` — unique plugin identifier
- `url` — app URL to open during init
- `init(bridge)` — check/perform login, return `{ loggedIn, message? }`
- `tools` — map of tool name → `{ description, handler(bridge, params) }`

### Handler return format

Handlers must return `{ type, data, metadata }`:

```js
// JSON data
{ type: "json", data: [...emails], metadata: { count: 50, unread: 10 } }

// Image
{ type: "image", data: "base64...", metadata: { mimeType: "image/png" } }

// Text (for simple actions)
{ type: "text", data: "done", metadata: {} }
```

Errors: throw an exception. The plugin API catches it and returns `{ type: "error", data: "message" }`.

## Background Jobs

Jobs run plugin tools on a schedule without involving the MCP client.

### Creating a job

```
create_job({
  plugin: "gmail",
  tool: "get_unread",
  type: "interval",        // "interval" or "timeout"
  ms: 300000,              // 5 minutes
  webhook: "http://localhost:8090/ingest",
  webhookHeaders: "{\"X-API-Key\": \"abc123\"}"
})
→ { id: "gmail:get_unread:1" }
```

### Webhook delivery

When a job runs, results are POSTed to the webhook:

```json
POST http://localhost:8090/ingest
Content-Type: application/json
X-API-Key: abc123

{
  "source": "gmail",
  "tool": "get_unread",
  "data": { "type": "json", "data": [...], "metadata": {...} },
  "timestamp": "2026-04-05T08:40:00Z"
}
```

No webhook = results are discarded (fire and forget).

### Managing jobs

```
list_jobs()
→ [{ id, plugin, tool, type, ms, status, lastRun, runCount, lastError }]

delete_job({ id: "gmail:get_unread:1" })
```

## Extension UI

The Chrome extension includes a side panel showing plugin status:

- Click the extension icon to open the side panel
- Shows each plugin with state (unloaded/initializing/awaiting_login/ready/error)
- "Confirm" button for plugins awaiting login
- Auto-updates when plugin state changes

## File Structure

```
chrome-lite-mcp/
├── server/
│   ├── index.js            # MCP server entrypoint
│   ├── bridge.js           # WebSocket bridge to Chrome extension
│   ├── tools.js            # Core browser tools
│   ├── plugin-loader.js    # Plugin discovery, lifecycle, state management
│   ├── plugin-api.js       # Plugin MCP tool handlers
│   ├── scheduler.js        # Background job scheduler
│   └── tests/
│       ├── bridge.test.js
│       ├── scheduler.test.js
│       ├── plugin-loader.test.js
│       ├── plugin-api.test.js
│       └── plugins.test.js
├── plugins/
│   ├── helpers.js          # Shared utilities (ensureTab, evaluate, realClick, sleep)
│   ├── gmail.js
│   ├── discord.js
│   ├── zalo.js
│   ├── messenger.js
│   └── slack.js
├── extension/
│   ├── manifest.json
│   ├── background.js       # WebSocket client, plugin status, side panel
│   ├── panel.html          # Side panel UI
│   ├── panel.js
│   └── content.js
└── docs/
```

## Included Plugins

### Gmail

| Tool | Description |
|------|-------------|
| `list_emails` | List inbox emails with sender, email, subject, snippet, date, unread, starred, hasAttachment |
| `read_email` | Read full email content by index |
| `get_unread` | Batch read all unread emails with full content |
| `select_by_sender` | Select emails by sender names |
| `select_all` | Select all visible emails |
| `mark_read` | Mark selected as read |
| `delete_selected` | Delete selected |
| `archive_selected` | Archive selected |

### Discord

| Tool | Description |
|------|-------------|
| `list_dms` | List DMs with online status |
| `read_chat` | Read messages from a DM or channel |
| `send_message` | Send a message in the current chat |

### Zalo

| Tool | Description |
|------|-------------|
| `list_chats` | List conversations with last message preview |
| `read_chat` | Read messages from a conversation |
| `send_message` | Send a message in the current chat |

### Messenger

| Tool | Description |
|------|-------------|
| `list_chats` | List conversations with last message preview |
| `read_chat` | Read messages from a conversation |
| `send_message` | Send a message in the current chat |

### Slack

| Tool | Description |
|------|-------------|
| `list_channels` | List channels and DMs with unread status |
| `read_messages` | Read messages from a channel |
| `send_message` | Send a message in the current channel |
