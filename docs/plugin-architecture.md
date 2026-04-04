# Chrome Lite MCP — Plugin Architecture

## Overview

Chrome Lite MCP is a long-running Node.js MCP server with two modes:
1. **On-demand** — Claude calls MCP tools to interact with plugins
2. **Background** — Plugins run scheduled jobs autonomously, pushing results to a data store

Plugins are discovered at startup from the `plugins/` directory. Each plugin is a JS module that exposes a bag of tools.

## MCP Tools

Five core MCP tools handle all plugin interactions:

| Tool | Params | Returns | Description |
|------|--------|---------|-------------|
| `plugins` | — | `string[]` | List installed plugin names |
| `tools` | `plugin` | `{ name, description }[]` | List tools for a plugin |
| `get` | `plugin`, `{ tool, ...params }` | result | Read data from a plugin |
| `post` | `plugin`, `{ tool, ...params }` | result | Perform an action via a plugin |
| `create_job` | `plugin`, `{ tool, type, ms?, cron?, ...params }` | `{ id }` | Schedule a background job |

Plus existing core tools: `tabs_list`, `tab_create`, `tab_navigate`, `page_read`, `page_click`, `page_type`, `page_eval`, `page_screenshot`.

### Discovery

```
Claude: "what plugins are available?"
  → plugins()
  → ["gmail", "discord", "zalo", "github"]

Claude: "what can gmail do?"
  → tools("gmail")
  → [
      { name: "list_emails", description: "List inbox emails with sender, subject, unread status" },
      { name: "mark_read", description: "Mark emails as read by sender" },
      { name: "delete", description: "Delete emails by sender" },
      { name: "reply", description: "Reply to an email" },
    ]
```

### Read data

```
Claude: "show me unread emails"
  → get("gmail", { tool: "list_emails", filter: "unread" })
  → [{ sender: "Vu Tran", subject: "CI failed", unread: true, ... }]
```

### Perform action

```
Claude: "delete all LinkedIn emails"
  → post("gmail", { tool: "delete", senders: ["LinkedIn Job Alerts"] })
  → { deleted: 5 }

Claude: "reply to Bruno on Discord"
  → post("discord", { tool: "send_message", channel: "Bruno", text: "Hey!" })
  → { ok: true }
```

### Background jobs

```
Claude: "check my gmail every 5 minutes"
  → create_job("gmail", { tool: "list_emails", type: "interval", ms: 300000 })
  → { id: "gmail:list_emails:1" }

Claude: "check discord once in 30 seconds"
  → create_job("discord", { tool: "list_dms", type: "timeout", ms: 30000 })
  → { id: "discord:list_dms:2" }

Claude: "poll zalo every day at 9am"
  → create_job("zalo", { tool: "list_chats", type: "cron", cron: "0 9 * * *" })
  → { id: "zalo:list_chats:3" }
```

Job results are automatically pushed to the configured data store (e.g., am-server `/ingest` endpoint).

### Job management

| Tool | Params | Description |
|------|--------|-------------|
| `list_jobs` | — | List all active background jobs |
| `delete_job` | `{ id }` | Cancel a background job |

```
Claude: "what jobs are running?"
  → list_jobs()
  → [
      { id: "gmail:list_emails:1", plugin: "gmail", tool: "list_emails", type: "interval", ms: 300000, lastRun: "2m ago" },
      { id: "zalo:list_chats:3", plugin: "zalo", tool: "list_chats", type: "cron", cron: "0 9 * * *", lastRun: "3h ago" },
    ]

Claude: "stop polling gmail"
  → delete_job({ id: "gmail:list_emails:1" })
  → { ok: true }
```

## Plugin Interface

Each plugin is a JS file in `plugins/` that exports:

```js
// plugins/gmail.js
export default {
  name: "gmail",

  tools: {
    list_emails: {
      description: "List inbox emails with sender, subject, unread status",
      async handler(bridge, params) {
        const tabId = await ensureTab(bridge, "https://mail.google.com");
        return await bridge.send("page_eval", { tabId, code: `...` });
      }
    },

    mark_read: {
      description: "Mark emails as read, optionally filtered by sender",
      async handler(bridge, params) {
        // params.senders: string[]
        const tabId = await ensureTab(bridge, "https://mail.google.com");
        // select emails, click mark as read
        return { ok: true };
      }
    },

    delete: {
      description: "Delete emails by sender",
      async handler(bridge, params) {
        // params.senders: string[]
        return { deleted: count };
      }
    },

    reply: {
      description: "Reply to an email",
      async handler(bridge, params) {
        // params.to, params.subject, params.body
        return { ok: true };
      }
    },
  }
}
```

### Plugin contract

```
Plugin {
  name: string                              // unique identifier
  tools: {
    [toolName]: {
      description: string                   // human-readable description
      handler(bridge, params): Promise<any> // bridge = Chrome WebSocket bridge
    }
  }
}
```

- `bridge` is the same WebSocket bridge used by core tools — plugins have full access to Chrome
- `params` is whatever the caller passes (from `get`, `post`, or `create_job`)
- Return value is passed back to the MCP client (or stored by the job scheduler)

### Plugin examples

```js
// plugins/discord.js
export default {
  name: "discord",
  tools: {
    list_dms: {
      description: "List Discord DMs with unread status",
      async handler(bridge, params) { /* ... */ }
    },
    read_chat: {
      description: "Read messages from a DM or channel",
      async handler(bridge, params) { /* params.channel */ }
    },
    send_message: {
      description: "Send a message to a DM or channel",
      async handler(bridge, params) { /* params.channel, params.text */ }
    },
  }
}

// plugins/github.js
export default {
  name: "github",
  tools: {
    list_prs: {
      description: "List open PRs for a repo",
      async handler(bridge, params) { /* params.repo */ }
    },
    list_notifications: {
      description: "List GitHub notifications",
      async handler(bridge, params) { /* ... */ }
    },
    merge_pr: {
      description: "Merge a pull request",
      async handler(bridge, params) { /* params.repo, params.pr */ }
    },
  }
}
```

## Architecture

```
Chrome Lite MCP Server (Node.js, long-running)
├── MCP Transport (stdio)
│   └── 7 MCP tools: plugins, tools, get, post, create_job, list_jobs, delete_job
│   └── Core tools: tabs_list, page_read, page_eval, etc.
│
├── Plugin Loader
│   └── Discovers and loads plugins from plugins/ directory
│
├── Job Scheduler
│   ├── Manages interval/timeout/cron jobs
│   ├── Calls plugin tool handlers on schedule
│   └── Pushes results to data store (am-server)
│
├── Chrome Bridge (WebSocket, port 7331)
│   └── Shared by core tools and all plugins
│
└── Chrome Extension (Manifest V3)
    └── Executes commands in the browser
```

## File Structure

```
chrome-lite-mcp/
├── server/
│   ├── index.js            # MCP server entrypoint
│   ├── bridge.js           # WebSocket bridge to Chrome
│   ├── tools.js            # Core browser tools (page_read, etc.)
│   ├── plugin-loader.js    # Discovers and loads plugins
│   ├── scheduler.js        # Job scheduler (interval/timeout/cron)
│   └── plugin-api.js       # MCP tool handlers for plugins/tools/get/post/create_job
├── plugins/
│   ├── gmail.js
│   ├── discord.js
│   ├── zalo.js
│   ├── messenger.js
│   ├── github.js
│   └── slack.js
├── extension/
│   ├── manifest.json
│   ├── background.js
│   └── content.js
└── docs/
    ├── design.md
    ├── skills.md
    └── plugin-architecture.md
```

## Data Store Integration

The job scheduler pushes results to a configurable data store endpoint. Default: am-server.

```
Environment variables:
  DATA_STORE_URL=http://localhost:8090/ingest
  DATA_STORE_KEY=<api-key>
```

Job results are POSTed as:

```json
{
  "source": "<plugin-name>",
  "data": <handler-return-value>,
  "job_id": "<job-id>",
  "timestamp": "<ISO8601>"
}
```

If no data store is configured, job results are logged and discarded.

## Flow

### On-demand (Claude-driven)

```
User: "check my emails"
  → Claude calls: get("gmail", { tool: "list_emails" })
  → MCP server: finds gmail plugin, calls list_emails.handler(bridge, params)
  → Handler: navigates Chrome to Gmail, runs page_eval, returns emails
  → Claude: summarizes and responds to user
```

### Background (autonomous)

```
Claude: "poll gmail every 5 min"
  → Claude calls: create_job("gmail", { tool: "list_emails", type: "interval", ms: 300000 })
  → MCP server: registers job in scheduler
  → Every 5 min: scheduler calls list_emails.handler(bridge, {})
  → Results POSTed to am-server
  → User can query am-server anytime, or ask Claude "what's new?"
```
