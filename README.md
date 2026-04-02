# chrome-mcp

Local Chrome browser automation for Claude Code via MCP. No remote bridges, no account matching — purely localhost.

## How It Works

```
Claude Code ←stdio→ MCP Server ←WebSocket→ Chrome Extension ←Chrome API→ Web Pages
```

The Chrome extension connects to a local WebSocket server. Claude Code talks to the MCP server via stdio. Everything stays on localhost.

## Setup

### 1. Install the extension

Open Chrome → `chrome://extensions` → Enable Developer Mode → Load unpacked → select `extension/`

### 2. Install server dependencies

```bash
cd server && npm install
```

### 3. Use with Claude Code

```bash
claude --mcp-config mcp-config.json -p "list all open tabs"
```

Or add to your Claude Code MCP settings permanently.

## Tools

| Tool | Description |
|------|-------------|
| `tabs_list` | List all open tabs |
| `tab_create` | Create a new tab |
| `tab_navigate` | Navigate a tab to a URL |
| `tab_close` | Close a tab |
| `tab_switch` | Activate a tab |
| `page_read` | Read page DOM tree |
| `page_click` | Click by CSS selector or coordinates |
| `page_type` | Type text into an element |
| `page_screenshot` | Capture visible tab as PNG |

## Testing

```bash
cd server && npm test
```
