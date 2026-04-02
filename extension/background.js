// Chrome MCP — Background Service Worker
// Connects to local WebSocket server and handles browser automation commands

const WS_URL = "ws://localhost:7331";
let ws = null;
let reconnectTimer = null;

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log("[chrome-mcp] connected to server");
    if (reconnectTimer) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    }
  };

  ws.onmessage = async (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    try {
      const result = await handleCommand(msg.method, msg.params || {});
      ws.send(JSON.stringify({ id: msg.id, result }));
    } catch (err) {
      ws.send(JSON.stringify({ id: msg.id, error: err.message }));
    }
  };

  ws.onclose = () => {
    console.log("[chrome-mcp] disconnected, reconnecting...");
    ws = null;
    if (!reconnectTimer) {
      reconnectTimer = setInterval(connect, 3000);
    }
  };

  ws.onerror = () => {
    ws?.close();
  };
}

// Command handlers
async function handleCommand(method, params) {
  switch (method) {
    case "tabs_list":
      return tabsList();
    case "tab_create":
      return tabCreate(params);
    case "tab_navigate":
      return tabNavigate(params);
    case "tab_close":
      return tabClose(params);
    case "tab_switch":
      return tabSwitch(params);
    case "page_read":
      return pageRead(params);
    case "page_click":
      return pageClick(params);
    case "page_type":
      return pageType(params);
    case "page_screenshot":
      return pageScreenshot(params);
    default:
      throw new Error(`Unknown method: ${method}`);
  }
}

// --- Tab operations ---

async function tabsList() {
  const tabs = await chrome.tabs.query({});
  return tabs.map((t) => ({
    id: t.id,
    title: t.title,
    url: t.url,
    active: t.active,
    windowId: t.windowId,
  }));
}

async function tabCreate({ url }) {
  const tab = await chrome.tabs.create({ url: url || "about:blank" });
  // Wait for load
  await waitForTabLoad(tab.id);
  const updated = await chrome.tabs.get(tab.id);
  return { id: updated.id, title: updated.title, url: updated.url };
}

async function tabNavigate({ tabId, url }) {
  if (!tabId || !url) throw new Error("tabId and url required");
  await chrome.tabs.update(tabId, { url });
  await waitForTabLoad(tabId);
  const tab = await chrome.tabs.get(tabId);
  return { id: tab.id, title: tab.title, url: tab.url };
}

async function tabClose({ tabId }) {
  if (!tabId) throw new Error("tabId required");
  await chrome.tabs.remove(tabId);
  return { ok: true };
}

async function tabSwitch({ tabId }) {
  if (!tabId) throw new Error("tabId required");
  const tab = await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  return { id: tab.id, title: tab.title, url: tab.url };
}

// --- Page operations ---

async function pageRead({ tabId }) {
  if (!tabId) throw new Error("tabId required");
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Build a simplified accessibility tree
      function buildTree(el, depth = 0) {
        if (depth > 10) return null;
        const node = {
          tag: el.tagName?.toLowerCase() || "#text",
          role: el.getAttribute?.("role") || "",
          text: "",
          attrs: {},
          children: [],
        };

        // Collect relevant attributes
        for (const attr of ["href", "src", "alt", "placeholder", "type", "name", "value", "aria-label"]) {
          const val = el.getAttribute?.(attr);
          if (val) node.attrs[attr] = val;
        }

        // Get direct text content (not children's text)
        for (const child of el.childNodes || []) {
          if (child.nodeType === 3) {
            const text = child.textContent?.trim();
            if (text) node.text += text + " ";
          }
        }
        node.text = node.text.trim();

        // Recurse children
        for (const child of el.children || []) {
          const childNode = buildTree(child, depth + 1);
          if (childNode) node.children.push(childNode);
        }

        // Skip empty containers
        if (!node.text && !node.role && node.children.length === 0 && Object.keys(node.attrs).length === 0) {
          return null;
        }

        return node;
      }

      const tree = buildTree(document.body);
      return {
        title: document.title,
        url: window.location.href,
        tree,
      };
    },
  });

  return results[0]?.result || { error: "no result" };
}

async function pageClick({ tabId, selector, x, y }) {
  if (!tabId) throw new Error("tabId required");

  if (selector) {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel) => {
        const el = document.querySelector(sel);
        if (!el) return { error: `Element not found: ${sel}` };
        el.click();
        return { ok: true, tag: el.tagName, text: el.textContent?.slice(0, 50) };
      },
      args: [selector],
    });
    return results[0]?.result || { error: "no result" };
  }

  if (x !== undefined && y !== undefined) {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (cx, cy) => {
        const el = document.elementFromPoint(cx, cy);
        if (!el) return { error: `No element at (${cx}, ${cy})` };
        el.click();
        return { ok: true, tag: el.tagName, text: el.textContent?.slice(0, 50) };
      },
      args: [x, y],
    });
    return results[0]?.result || { error: "no result" };
  }

  throw new Error("selector or x,y coordinates required");
}

async function pageType({ tabId, text, selector }) {
  if (!tabId || !text) throw new Error("tabId and text required");

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (txt, sel) => {
      let el;
      if (sel) {
        el = document.querySelector(sel);
      } else {
        el = document.activeElement;
      }
      if (!el) return { error: "No element to type into" };

      // Focus the element
      el.focus();

      // For input/textarea, set value and dispatch events
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        el.value = txt;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        // For contenteditable
        el.textContent = txt;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }

      return { ok: true, tag: el.tagName };
    },
    args: [text, selector || null],
  });
  return results[0]?.result || { error: "no result" };
}

async function pageScreenshot({ tabId }) {
  if (!tabId) throw new Error("tabId required");
  // Ensure tab is active for capture
  const tab = await chrome.tabs.get(tabId);
  await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  await sleep(200);

  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "png",
  });
  // Return base64 without the data:image/png;base64, prefix
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  return { image: base64, format: "png" };
}

// --- Helpers ---

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    // Timeout after 30s
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Connect on startup
connect();

// Reconnect when service worker wakes up
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
