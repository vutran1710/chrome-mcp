// Chrome MCP — Background Service Worker
// Connects to local WebSocket server and handles browser automation commands

const WS_URL = "ws://localhost:7331";
let ws = null;
let reconnectTimer = null;

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log("[chrome-lite-mcp] connected to server");
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

    // Handle plugin status notifications (no response needed)
    if (msg.method === "plugin_status") {
      updatePluginState(msg.params);
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
    console.log("[chrome-lite-mcp] disconnected, reconnecting...");
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
    case "page_eval":
      return pageEval(params);
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

async function pageRead({ tabId, selector, mode }) {
  if (!tabId) throw new Error("tabId required");
  const readMode = mode || "text";

  // Try accessibility tree first (best for SPAs)
  if (readMode === "accessibility") {
    return readAccessibilityTree(tabId);
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    args: [selector || null, readMode],
    func: (rootSelector, m) => {
      const SKIP_TAGS = new Set([
        "script", "style", "noscript", "svg", "path", "meta", "link",
        "br", "hr", "img", "video", "audio", "canvas", "iframe",
      ]);
      const INTERACTIVE_TAGS = new Set([
        "a", "button", "input", "textarea", "select", "details", "summary",
      ]);
      const SEMANTIC_ROLES = new Set([
        "button", "link", "textbox", "checkbox", "radio", "tab", "tabpanel",
        "menu", "menuitem", "dialog", "alert", "navigation", "main",
        "heading", "listitem", "option", "row", "cell", "columnheader",
      ]);

      function getTextContent(el) {
        let text = "";
        for (const child of el.childNodes || []) {
          if (child.nodeType === 3) {
            const t = child.textContent?.trim();
            if (t) text += t + " ";
          }
        }
        return text.trim();
      }

      function isVisible(el) {
        if (!el.offsetParent && el.tagName !== "BODY" && el.tagName !== "HTML") {
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") return false;
        }
        return true;
      }

      function buildTree(el, depth) {
        if (depth > 30) return null;
        const tag = el.tagName?.toLowerCase() || "";
        if (SKIP_TAGS.has(tag)) return null;
        if (!isVisible(el)) return null;

        const role = el.getAttribute?.("role") || "";
        const ariaLabel = el.getAttribute?.("aria-label") || "";
        const directText = getTextContent(el);

        // Build children first
        const children = [];
        for (const child of el.children || []) {
          const childNode = buildTree(child, depth + 1);
          if (childNode) children.push(childNode);
        }

        // In text mode, skip non-semantic wrappers
        if (m === "text") {
          // Flatten: if node is just a wrapper with no own text/role, hoist children
          if (!directText && !role && !ariaLabel && !INTERACTIVE_TAGS.has(tag) && children.length > 0) {
            if (children.length === 1) return children[0];
            // Multiple children — keep as container but strip tag
            return { children };
          }
          // Skip empty leaves
          if (!directText && children.length === 0 && !ariaLabel) return null;
        }

        if (m === "interactive") {
          const isInteractive = INTERACTIVE_TAGS.has(tag) || SEMANTIC_ROLES.has(role);
          if (!isInteractive && children.length === 0) return null;
          if (!isInteractive && children.length > 0) {
            if (children.length === 1) return children[0];
            return { children };
          }
        }

        const node = {};
        if (tag && tag !== "div" && tag !== "span") node.tag = tag;
        if (role) node.role = role;
        if (directText) node.text = directText;
        if (ariaLabel) node.label = ariaLabel;

        // Collect relevant attributes
        const attrs = {};
        for (const attr of ["href", "placeholder", "type", "name", "value"]) {
          const val = el.getAttribute?.(attr);
          if (val) attrs[attr] = val;
        }
        if (Object.keys(attrs).length > 0) node.attrs = attrs;
        if (children.length > 0) node.children = children;

        // Skip if truly empty
        if (!node.tag && !node.role && !node.text && !node.label && !node.attrs && (!node.children || node.children.length === 0)) {
          return null;
        }

        return node;
      }

      const root = rootSelector ? document.querySelector(rootSelector) : document.body;
      if (!root) return { error: `Selector not found: ${rootSelector}` };

      const tree = buildTree(root, 0);
      return {
        title: document.title,
        url: window.location.href,
        tree,
      };
    },
  });

  return results[0]?.result || { error: "no result" };
}

// Read the Chrome accessibility tree via debugger protocol
async function readAccessibilityTree(tabId) {
  const target = { tabId };
  try {
    await chrome.debugger.attach(target, "1.3");
    const { nodes } = await chrome.debugger.sendCommand(target, "Accessibility.getFullAXTree", {});

    // Convert AX tree to a compact representation
    const compact = [];
    for (const node of nodes) {
      const role = node.role?.value || "";
      const name = node.name?.value || "";
      const value = node.value?.value || "";

      // Skip generic/invisible nodes
      if (role === "none" || role === "generic" || role === "InlineTextBox") continue;
      if (!name && !value && !node.children?.length) continue;

      const entry = { role };
      if (name) entry.name = name;
      if (value) entry.value = value;
      if (node.properties) {
        for (const prop of node.properties) {
          if (prop.name === "focused" && prop.value?.value) entry.focused = true;
          if (prop.name === "checked") entry.checked = prop.value?.value;
          if (prop.name === "disabled" && prop.value?.value) entry.disabled = true;
          if (prop.name === "expanded") entry.expanded = prop.value?.value;
        }
      }
      compact.push(entry);
    }

    await chrome.debugger.detach(target);

    const tab = await chrome.tabs.get(tabId);
    return { title: tab.title, url: tab.url, nodes: compact };
  } catch (err) {
    try { await chrome.debugger.detach(target); } catch {}
    throw new Error(`Accessibility tree failed: ${err.message}`);
  }
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

      el.focus();

      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        el.value = txt;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
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
  const tab = await chrome.tabs.get(tabId);
  await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  await sleep(200);

  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "png",
  });
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  return { image: base64, format: "png" };
}

// page_eval: Uses chrome.debugger Runtime.evaluate to bypass CSP
async function pageEval({ tabId, code }) {
  if (!tabId || !code) throw new Error("tabId and code required");
  const target = { tabId };
  try {
    await chrome.debugger.attach(target, "1.3");
    const result = await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
      expression: code,
      returnByValue: true,
      awaitPromise: true,
    });
    await chrome.debugger.detach(target);

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || result.exceptionDetails.exception?.description || "Evaluation failed");
    }
    return result.result?.value ?? null;
  } catch (err) {
    try { await chrome.debugger.detach(target); } catch {}
    throw err;
  }
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
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Keep service worker alive with alarms (fires every 25s)
chrome.alarms.create("keep-alive", { periodInMinutes: 25 / 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keep-alive") {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ id: "ping", method: "ping" }));
    } else {
      connect();
    }
  }
});

// --- Plugin state management ---

function updatePluginState(params) {
  chrome.storage.local.get("pluginStates", (data) => {
    const states = data.pluginStates || {};
    states[params.plugin] = {
      state: params.state,
      message: params.message || null,
      tabId: params.tabId || null,
    };
    chrome.storage.local.set({ pluginStates: states });
  });
}

// Handle messages from popup (e.g., confirm login)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "plugin_confirm" && ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      id: "confirm",
      method: "plugin_confirm",
      params: { plugin: msg.plugin },
    }));
  }
});

// Open side panel on extension icon click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Connect on startup
connect();

// Reconnect when service worker wakes up
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
