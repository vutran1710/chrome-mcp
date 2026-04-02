# chrome-mcp

Chrome extension + local MCP server for browser automation. No remote bridges, no account matching — purely localhost.

## Architecture

```
Claude Code CLI
    ↕ stdio (MCP protocol)
MCP Server (Node.js)
    ↕ HTTP (localhost:7331)
Chrome Extension (Manifest V3, background service worker)
    ↕ Chrome Extensions API
Web pages
```

## Components

### 1. Chrome Extension

Manifest V3 extension. Background service worker runs an HTTP server on `localhost:7331` using `chrome.offscreen` or direct fetch handling.

Actually — Chrome extensions can't run HTTP servers directly. The extension instead:
- Listens for messages via `chrome.runtime.onMessageExternal`
- A **native messaging host** bridges HTTP to the extension

Revised architecture:

```
Claude Code CLI
    ↕ stdio (MCP protocol)
MCP Server (Node.js)
    ↕ HTTP (localhost:7331)
Bridge Server (Node.js, same process as MCP server)
    ↕ Native Messaging (stdio)
Chrome Extension (Manifest V3)
    ↕ Chrome Extensions API
Web pages
```

Simpler alternative: skip native messaging entirely. The MCP server connects to Chrome via **Chrome DevTools Protocol (CDP)** on the debugging port. The extension is only needed for tab-level permissions. Or even simpler:

**Simplest viable architecture:**

```
Claude Code CLI
    ↕ stdio (MCP protocol)
MCP Server (Node.js)
    ↕ WebSocket (localhost:7331)
Chrome Extension (Manifest V3, service worker)
    ↕ Chrome Extensions API + chrome.debugger
Web pages
```

Extension opens a WebSocket server? No — service workers can't do that.

**Final architecture (proven pattern):**

```
Claude Code CLI
    ↕ stdio (MCP protocol)
MCP Server + WebSocket Server (Node.js, localhost:7331)
    ↕ WebSocket
Chrome Extension (connects as WS client to localhost:7331)
    ↕ Chrome Extensions API
Web pages
```

The Node.js process runs both the MCP server (stdio) and a WebSocket server. The Chrome extension connects to the WS server as a client on load. Commands flow: Claude → MCP stdio → Node.js → WS → extension → Chrome API → result back.

## API

### MCP Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `tabs_list` | — | List all tabs |
| `tab_create` | `url` | Create new tab |
| `tab_navigate` | `tabId`, `url` | Navigate tab to URL |
| `tab_close` | `tabId` | Close a tab |
| `tab_switch` | `tabId` | Focus/activate a tab |
| `page_read` | `tabId` | Get accessibility tree / DOM snapshot |
| `page_click` | `tabId`, `selector` or `x,y` | Click element |
| `page_type` | `tabId`, `text` | Type text |
| `page_screenshot` | `tabId` | Capture screenshot (base64 PNG) |

### WebSocket Protocol (between Node server and extension)

```json
// Request (server → extension)
{"id": "uuid", "method": "tabs_list", "params": {}}

// Response (extension → server)  
{"id": "uuid", "result": [...]}

// Error
{"id": "uuid", "error": "message"}
```

## File Structure

```
chrome-mcp/
├── extension/
│   ├── manifest.json
│   ├── background.js      # Service worker, WS client, Chrome API calls
│   └── content.js         # Injected into pages for DOM access
├── server/
│   ├── index.js            # MCP server (stdio) + WebSocket server
│   └── package.json
├── mcp-config.json         # Example config for claude --mcp-config
└── README.md
```

## Usage

```bash
# 1. Install extension in Chrome (load unpacked)
# 2. Start MCP server
node server/index.js

# 3. Use with Claude Code
claude --mcp-config mcp-config.json -p "go to discord and check messages"
```

## MCP Config

```json
{
  "mcpServers": {
    "chrome": {
      "command": "node",
      "args": ["/path/to/chrome-mcp/server/index.js"]
    }
  }
}
```
