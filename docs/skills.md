# Chrome MCP — App Skills Reference

Patterns and techniques for automating specific web apps via Chrome MCP.
These apps use heavy JavaScript frameworks that require specific handling.

---

## General Principles

### Gmail, Discord, etc. use custom event systems
Simple `el.click()` often fails. Use full mouse event sequences:

```js
function realClick(el) {
  for (const type of ['mousedown', 'mouseup', 'click']) {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  }
}
```

### CSP blocks script injection on many sites
Gmail, Discord, and others block inline script execution via Content Security Policy.
The `page_eval` tool routes through `chrome.debugger` protocol's `Runtime.evaluate` to bypass this,
similar to running code in the browser DevTools console.

### page_read modes
- `text` (default) — Flattened readable content, skips invisible/decorative nodes, depth up to 30
- `interactive` — Only buttons, links, inputs, form elements
- `accessibility` — Chrome's accessibility tree via debugger protocol (cleanest for SPAs)

### Service worker keep-alive
Chrome kills inactive service workers after ~30s. The extension uses `chrome.alarms` to ping every 25s.

---

## Gmail (mail.google.com)

Gmail uses Google Closure Library with custom event delegation.

### List emails

Use the `page_eval` tool with this expression:

```js
(() => {
  const rows = document.querySelectorAll('tr.zA');
  const emails = [];
  rows.forEach((row, i) => {
    const isUnread = row.classList.contains('zE');
    const sender = row.querySelector('.yW .zF, .yW .yP');
    const subject = row.querySelector('.bog');
    const snippet = row.querySelector('.y2');
    emails.push({
      index: i,
      unread: isUnread,
      sender: sender?.getAttribute('name') || sender?.textContent?.trim() || '',
      subject: subject?.textContent?.trim() || '',
      snippet: snippet?.textContent?.trim()?.slice(0, 100) || '',
    });
  });
  return emails;
})()
```

### Select all emails

```js
(() => {
  function realClick(el) {
    for (const type of ['mousedown', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
  }
  const selectAll = document.querySelector('span[role="checkbox"]');
  if (selectAll && selectAll.getAttribute('aria-checked') !== 'true') {
    realClick(selectAll);
  }
  return { checked: selectAll?.getAttribute('aria-checked') };
})()
```

### Select emails by sender

```js
(() => {
  function realClick(el) {
    for (const type of ['mousedown', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
  }
  const targetSenders = ['LinkedIn Job Alerts', 'GitBook', 'Ghost Changelog'];
  const rows = document.querySelectorAll('tr.zA');
  let selected = 0;
  rows.forEach(row => {
    const sender = row.querySelector('.yW .zF, .yW .yP');
    const name = sender?.getAttribute('name') || sender?.textContent?.trim() || '';
    if (targetSenders.includes(name)) {
      const checkbox = row.querySelector('div[role="checkbox"]');
      if (checkbox) { realClick(checkbox); selected++; }
    }
  });
  return { selected };
})()
```

### Mark as read / Delete / Archive

After selecting emails, click toolbar buttons using `aria-label`:

```js
(() => {
  function realClick(el) {
    for (const type of ['mousedown', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
  }
  // Available labels: 'Mark as read', 'Mark as unread', 'Delete', 'Archive',
  //                   'Report spam', 'Snooze', 'Move to', 'Labels'
  const action = 'Mark as read';
  const allBtns = document.querySelectorAll('[role="button"]');
  for (const btn of allBtns) {
    if (btn.getAttribute('aria-label') === action) {
      realClick(btn);
      return { ok: true, action };
    }
  }
  return { error: action + ' button not found' };
})()
```

### Search emails

```
1. page_click  → selector: input[aria-label="Search mail"]
2. page_type   → text: "from:someone@example.com is:unread"
3. page_click  → selector: button[aria-label="Search mail"]
```

### Important notes
- `el.click()` does NOT work for Gmail toolbar buttons — must use `realClick()` with full MouseEvent sequence
- Gmail's unread class is `zE` on `tr.zA` rows
- Sender name is in `.yW .zF` (single sender) or `.yW .yP` (multiple senders)
- The `name` attribute on sender elements has the clean display name
- Title format: `Inbox (N) - email - domain Mail` where N is total unread count

---

## Discord (discord.com)

Discord is a React SPA with deeply nested virtual DOM. Class names are hashed (e.g., `message_abc123`).

### Read DM list

Use `page_read` with `mode: "text"` — works well for the sidebar. Look for items under the "Direct Messages" group.

### Read chat messages

```js
// Use with page_eval tool
(() => {
  const msgs = document.querySelectorAll('[class*="message_"]');
  const results = [];
  msgs.forEach(m => {
    const author = m.querySelector('[class*="username_"]')?.textContent || '';
    const timestamp = m.querySelector('time')?.textContent || '';
    const content = m.querySelector('[class*="messageContent_"]')?.textContent || '';
    if (content || author) {
      results.push({ author, timestamp, content });
    }
  });
  return results.slice(-20);
})()
```

### Navigate to a DM

```
page_click → selector: [aria-label*="UserName"][aria-label*="direct message"]
```

### Send a message

```js
// Discord uses Slate.js editor — document.execCommand works
(() => {
  const editor = document.querySelector('[role="textbox"][class*="textArea_"]');
  if (!editor) return { error: 'textbox not found' };
  editor.focus();
  document.execCommand('insertText', false, 'Hello!');
  return { ok: true };
})()
```

### Navigate to a server/channel

```
page_click → selector: [aria-label="ServerName"]   // click server
page_click → selector: [aria-label="ChannelName"]   // then channel
```

### Important notes
- Discord hashes CSS class names — always use partial matches: `[class*="message_"]`
- `page_read` with `mode: "accessibility"` gives cleanest view of Discord's UI
- DM links use format: `https://discord.com/channels/@me/{channelId}`
- Server channels: `https://discord.com/channels/{serverId}/{channelId}`
- Chat messages are in `[class*="message_"]` containers
- Discord uses Slate.js for the text editor — `page_type` may not work; use `document.execCommand('insertText', ...)` instead

---

## Zalo (chat.zalo.me)

Zalo Web is a React-based chat app, similar structure to Discord.

### Read conversation list

```js
// Use with page_eval tool
(() => {
  const convos = document.querySelectorAll('[class*="conv-item"], [class*="conversation"]');
  const results = [];
  convos.forEach(c => {
    const name = c.querySelector('[class*="conv-name"], [class*="truncate"]')?.textContent || '';
    const lastMsg = c.querySelector('[class*="conv-last-msg"], [class*="subtitle"]')?.textContent || '';
    const unread = c.querySelector('[class*="badge"], [class*="unread"]')?.textContent || '';
    if (name) results.push({ name, lastMsg, unread: unread || null });
  });
  return results;
})()
```

### Read chat messages

```js
(() => {
  const msgs = document.querySelectorAll('[class*="chat-message"], [class*="message-view"]');
  const results = [];
  msgs.forEach(m => {
    const author = m.querySelector('[class*="sender-name"], [class*="author"]')?.textContent || '';
    const content = m.querySelector('[class*="message-content"], [class*="chat-content"]')?.textContent || '';
    const time = m.querySelector('[class*="message-time"], time')?.textContent || '';
    if (content) results.push({ author, content, time });
  });
  return results.slice(-20);
})()
```

### Navigate to a chat

```
1. page_click → selector: input[placeholder*="Search"], input[placeholder*="Tim"]
2. page_type  → text: "Contact Name"
3. Click the search result
```

### Important notes
- Zalo URL: `https://chat.zalo.me`
- Class names may be hashed — use partial `[class*="..."]` matches
- Zalo may require login via QR code on first visit
- Message input is typically a `contenteditable` div
- The above selectors are approximate — Zalo updates its frontend frequently; use `page_read` with `mode: "interactive"` to discover current selectors

---

## Facebook Messenger (messenger.com)

Messenger is a React SPA with obfuscated class names.

### Read conversation list

```js
// Use with page_eval tool
(() => {
  const convos = document.querySelectorAll('[role="row"], [role="listitem"]');
  const results = [];
  convos.forEach(c => {
    const name = c.querySelector('[class*="x1lliihq"]')?.textContent ||
                 c.querySelector('span[dir="auto"]')?.textContent || '';
    const lastMsg = c.querySelectorAll('span[dir="auto"]');
    const msg = lastMsg.length > 1 ? lastMsg[lastMsg.length - 1]?.textContent : '';
    if (name && name.length > 1) results.push({ name, lastMsg: msg || '' });
  });
  return results.slice(0, 20);
})()
```

### Read chat messages

```js
(() => {
  const rows = document.querySelectorAll('[role="row"]');
  const messages = [];
  rows.forEach(row => {
    const texts = row.querySelectorAll('[dir="auto"]');
    const content = Array.from(texts).map(t => t.textContent).join(' ').trim();
    if (content && content.length > 0) {
      messages.push({ content });
    }
  });
  return messages.slice(-20);
})()
```

### Navigate to a conversation

```
1. page_click → selector: input[aria-label="Search Messenger"]
2. page_type  → text: "Contact Name"
3. Click the search result
```

### Send a message

```js
// Messenger uses a contenteditable paragraph
(() => {
  const editor = document.querySelector('[role="textbox"][contenteditable="true"]');
  if (!editor) return { error: 'textbox not found' };
  editor.focus();
  document.execCommand('insertText', false, 'Hello!');
  return { ok: true };
})()
```

### Important notes
- Messenger URL: `https://www.messenger.com` or `https://www.facebook.com/messages`
- Class names are fully obfuscated (e.g., `x1lliihq`) — prefer `[role]` and `[aria-label]` selectors
- Use `page_read` with `mode: "accessibility"` for the most reliable view
- Message input is `[role="textbox"][contenteditable="true"]`
- Messenger may show a login wall — user must be logged in
- Facebook aggressively changes DOM structure; always verify selectors with `page_read` first

---

## Slack (app.slack.com)

Slack web app is a React SPA with data-attributes and ARIA labels.

### Read channel/DM list

```js
// Use with page_eval tool
(() => {
  const items = document.querySelectorAll('[data-qa="channel_sidebar_item"], .p-channel_sidebar__channel');
  const results = [];
  items.forEach(item => {
    const name = item.querySelector('[data-qa="channel_sidebar_label_text"]')?.textContent ||
                 item.querySelector('.p-channel_sidebar__name span')?.textContent || '';
    const unread = item.querySelector('[data-qa="channel_sidebar_unread_badge"]')?.textContent || '';
    if (name) results.push({ name, unread: unread || null });
  });
  return results;
})()
```

### Read messages in current channel

```js
(() => {
  const msgs = document.querySelectorAll('[data-qa="message_container"], .c-message_kit__message');
  const results = [];
  msgs.forEach(m => {
    const author = m.querySelector('[data-qa="message_sender_name"]')?.textContent || '';
    const content = m.querySelector('[data-qa="message-text"], .p-rich_text_section')?.textContent || '';
    const time = m.querySelector('[data-qa="message_time"]')?.textContent ||
                 m.querySelector('time')?.getAttribute('datetime') || '';
    if (content) results.push({ author, content, time });
  });
  return results.slice(-20);
})()
```

### Navigate to a channel

```js
(() => {
  const items = document.querySelectorAll('[data-qa="channel_sidebar_item"]');
  for (const item of items) {
    const label = item.querySelector('[data-qa="channel_sidebar_label_text"]');
    if (label?.textContent?.trim() === 'general') {
      item.click();
      return { ok: true };
    }
  }
  return { error: 'channel not found' };
})()
```

### Send a message

```js
// Slack uses a rich text editor
(() => {
  const editor = document.querySelector('[data-qa="message_input"] [role="textbox"], .ql-editor');
  if (!editor) return { error: 'message input not found' };
  editor.focus();
  document.execCommand('insertText', false, 'Hello!');
  return { ok: true };
})()
```

Then press Enter or click send:
```
page_click → selector: [data-qa="texty_send_button"], button[aria-label="Send"]
```

### Search messages

```
1. page_click → selector: [data-qa="search_input_wrapper"], button[data-qa="search"]
2. page_type  → text: "search query"
```

### Important notes
- Slack URL: `https://app.slack.com/client/{workspaceId}/{channelId}`
- Slack uses `data-qa` attributes extensively — prefer these over class names
- Channel sidebar items: `[data-qa="channel_sidebar_item"]`
- Message containers: `[data-qa="message_container"]`
- Message input: `[data-qa="message_input"] [role="textbox"]`
- Slack requires workspace login — user must be authenticated
- Use `page_read` with `mode: "interactive"` to discover available actions
- Thread replies are in a separate panel — look for `[data-qa="threads_flexpane"]`

---

## Workflow: Check All Messaging Apps

A common workflow to check all messaging apps at once:

```
1. tab_create  -> https://mail.google.com
   - page_eval -> list unread emails
   - Categorize: important vs promo vs noise

2. tab_create  -> https://discord.com/channels/@me
   - page_read mode: "text" -> check DM list for unread
   - page_eval -> read recent messages from unread DMs

3. tab_create  -> https://chat.zalo.me
   - page_eval -> list conversations with unread badges
   - Click into unread chats, read messages

4. tab_create  -> https://www.messenger.com
   - page_eval -> list conversations
   - Read unread threads

5. tab_create  -> https://app.slack.com
   - page_eval -> list channels with unread badges
   - Read unread channels/DMs
```

### Tips
- Open all apps in parallel tabs first, let them load, then read each one
- Use `page_read mode: "accessibility"` as fallback when selectors break
- Always verify selectors with a quick `page_read` if results are empty — apps update their DOM frequently
- For sending messages, prefer `document.execCommand('insertText', ...)` over `page_type` for contenteditable editors

---

## am-server Integration

After reading messages from apps via Chrome MCP, push structured data to am-server for persistent storage and later querying.

### am-server API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/ingest` | Push messages (single or array) |
| GET | `/api/messages` | List/search messages |
| GET | `/api/messages/{id}` | Get single message |
| GET | `/api/stats` | Message counts by source |
| GET | `/healthz` | Health check |

**Auth:** `X-API-Key` header. Key is in `~/.agent-mesh/config.toml`.
**Server:** `http://localhost:8090`

### Message schema

```json
{
  "id": "optional, auto-generated if omitted",
  "source": "gmail|discord|zalo|messenger|slack",
  "sender": "Display Name",
  "subject": "Email subject or chat name",
  "preview": "First ~100 chars of message content",
  "raw": {},
  "source_ts": "2026-04-02T10:00:00Z"
}
```

Accepts a single object or an array. Duplicate IDs are ignored.

### Workflow: Read apps and push to am-server

After reading messages from each app, push them to am-server using `curl` or `fetch`:

```bash
# Push Gmail messages
curl -s -X POST http://localhost:8090/ingest \
  -H "X-API-Key: $AM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[
    {"source": "gmail", "sender": "Vu Tran", "subject": "CI failed", "preview": "Rebuild Index failed..."},
    {"source": "gmail", "sender": "Google", "subject": "Security alert", "preview": "New sign-in on Mac..."}
  ]'

# Push Discord messages
curl -s -X POST http://localhost:8090/ingest \
  -H "X-API-Key: $AM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[
    {"source": "discord", "sender": "Bruno", "subject": "DM", "preview": "how are you"}
  ]'

# Push Zalo messages
curl -s -X POST http://localhost:8090/ingest \
  -H "X-API-Key: $AM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[
    {"source": "zalo", "sender": "Tuấn Anh", "subject": "1Chat", "preview": "anh cần rửa 2-3tr..."}
  ]'
```

### Query messages later

```bash
# Get all unread from Gmail
curl -s "http://localhost:8090/api/messages?source=gmail" \
  -H "X-API-Key: $AM_API_KEY"

# Search across all sources
curl -s "http://localhost:8090/api/messages?q=security+alert" \
  -H "X-API-Key: $AM_API_KEY"

# Messages since a specific time
curl -s "http://localhost:8090/api/messages?since=2026-04-02T00:00:00Z" \
  -H "X-API-Key: $AM_API_KEY"

# Stats by source
curl -s "http://localhost:8090/api/stats" \
  -H "X-API-Key: $AM_API_KEY"
```

### Full scheduled workflow

When Claude Code runs on a schedule (e.g., every 30 minutes):

```
1. Read AM_API_KEY from ~/.agent-mesh/config.toml

2. For each app (Gmail, Discord, Zalo, Messenger, Slack):
   a. Use Chrome MCP to navigate and read messages
   b. Structure results as am-server messages
   c. POST to /ingest

3. Optionally summarize what's new and alert the user
```

This way:
- **Chrome MCP** handles the browser automation (reading, replying)
- **am-server** stores the structured message history
- **Claude Code** orchestrates both, runs on schedule, and can reason about messages
- **You** can query am-server anytime without Claude running
