# chrome-lite-mcp

Browser automation MCP server with a plugin system. Control Chrome, automate web apps, run background jobs — all via the Model Context Protocol.

## Vision

A universal bridge between AI agents and the web browser. Instead of building separate integrations for every web app, write a plugin once and any MCP client can use it — read Gmail, poll Discord, interact with Slack, or automate any web app through a unified interface.

**Goals:**
- **Plugin-based** — drop a JS file into `plugins/` to add support for any web app
- **Background jobs** — schedule polling without involving the AI, deliver results via webhook
- **Login lifecycle** — plugins manage their own auth, extension UI shows status
- **Clean data** — plugin handlers return typed, structured results `{ type, data, metadata }`
- **Standalone** — works with any MCP client, not tied to any specific AI platform

## How It Works

```
MCP Client <-stdio-> MCP Server <-WebSocket-> Chrome Extension <-Chrome API-> Web Pages
                       |
                       ├── Plugin Loader (discovers plugins from plugins/)
                       ├── Scheduler (background jobs with webhook delivery)
                       └── Plugin API (get/post/init/create_job)
```

## Quick Start

```bash
# Install
cd server && npm install

# Load extension in Chrome
# chrome://extensions -> Developer Mode -> Load unpacked -> extension/

# MCP config:
{
  "mcpServers": {
    "chrome": {
      "command": "node",
      "args": ["/path/to/chrome-lite-mcp/server/index.js"]
    }
  }
}
```

## Usage

```
# Discover plugins
all_plugins()              -> all plugins with state
plugins()                  -> activated plugins only
tools("gmail")             -> list gmail tools

# Initialize (opens tab, checks login)
init_plugin("gmail")       -> { ready: true } or { awaiting_login: true }

# Read data
get("gmail", "list_emails")
get("gmail", "read_email", '{"index": 0}')
get("gmail", "get_unread")

# Perform actions
post("gmail", "mark_read")
post("gmail", "delete_selected")

# Background jobs (no AI involved)
create_job("gmail", "get_unread", "interval", 300000,
  webhook="http://localhost:8090/ingest",
  webhookHeaders='{"X-API-Key": "..."}')
list_jobs()
delete_job("gmail:get_unread:1")
```

## Included Plugins

| Plugin | Tools |
|--------|-------|
| **gmail** | list_emails, read_email, get_unread, select_by_sender, select_all, mark_read, delete_selected, archive_selected |
| **discord** | list_dms, read_chat, send_message |
| **zalo** | list_chats, read_chat, send_message |
| **messenger** | list_chats, read_chat, send_message |
| **slack** | list_channels, read_messages, send_message |

## Writing a Plugin

```js
// plugins/my-app.js
import { ensureTab, evaluate, sleep } from "./helpers.js";

export default {
  name: "my-app",
  url: "https://my-app.com",

  async init(bridge) {
    const tabId = await ensureTab(bridge, "https://my-app.com");
    await sleep(3000);
    return evaluate(bridge, tabId, `
      (() => {
        if (/* logged in */) return { loggedIn: true };
        return { loggedIn: false, message: "Please log in" };
      })()
    `);
  },

  tools: {
    list_items: {
      description: "List items from the app",
      async handler(bridge, params) {
        const tabId = await ensureTab(bridge, "https://my-app.com");
        const items = await evaluate(bridge, tabId, `/* JS */`);
        return { type: "json", data: items, metadata: { count: items.length } };
      },
    },
  },
}
```

Drop the file in `plugins/`, restart the server. Done.

## Server Deployment

```bash
# Download release
REPO="vutran1710/chrome-lite-mcp"
URL=$(curl -sL "https://api.github.com/repos/${REPO}/releases/latest" \
  | grep -o 'https://[^"]*chrome-lite-mcp-.*\.tar\.gz[^"]*' | head -1)
mkdir -p /opt/chrome-lite-mcp
curl -sL "$URL" | tar -xz -C /opt/chrome-lite-mcp

# Start
node /opt/chrome-lite-mcp/server/index.js &
chromium --load-extension=/opt/chrome-lite-mcp/extension &
```

## Docs

- [Plugin Architecture](docs/plugin-architecture.md) — full reference
- [Plugin Lifecycle](docs/plugin-lifecycle.md) — init, login, extension UI

## Testing

```bash
cd server && npm test    # 35 tests
```
