// Popup reads plugin states from chrome.storage and renders them.
// Background.js updates chrome.storage when it receives plugin_status from the server.

const content = document.getElementById("content");

function dotClass(state) {
  return {
    ready: "dot-ready",
    awaiting_login: "dot-awaiting",
    error: "dot-error",
    initializing: "dot-initializing",
    unloaded: "dot-unloaded",
  }[state] || "dot-unloaded";
}

function stateLabel(state) {
  return {
    ready: "Ready",
    awaiting_login: "Needs login",
    error: "Error",
    initializing: "Initializing...",
    unloaded: "Not initialized",
  }[state] || state;
}

function render(plugins) {
  if (!plugins || Object.keys(plugins).length === 0) {
    content.className = "empty";
    content.textContent = "No plugins loaded";
    return;
  }

  content.className = "plugin-list";
  content.replaceChildren();

  for (const [name, info] of Object.entries(plugins)) {
    const item = document.createElement("div");
    item.className = "plugin-item";

    const left = document.createElement("div");
    left.className = "plugin-info";

    const dot = document.createElement("span");
    dot.className = `status-dot ${dotClass(info.state)}`;

    const label = document.createElement("div");
    const nameEl = document.createElement("div");
    nameEl.className = "plugin-name";
    nameEl.textContent = name;
    const stateEl = document.createElement("div");
    stateEl.className = "plugin-state";
    stateEl.textContent = stateLabel(info.state);
    label.appendChild(nameEl);
    label.appendChild(stateEl);

    left.appendChild(dot);
    left.appendChild(label);
    item.appendChild(left);

    if (info.state === "awaiting_login") {
      const btn = document.createElement("button");
      btn.className = "confirm-btn";
      btn.textContent = "Confirm";
      btn.addEventListener("click", () => confirmLogin(name));
      item.appendChild(btn);
    }

    content.appendChild(item);

    if (info.message && info.state === "awaiting_login") {
      const msg = document.createElement("div");
      msg.className = "message";
      msg.textContent = info.message;
      content.appendChild(msg);
    }
  }
}

function confirmLogin(pluginName) {
  chrome.runtime.sendMessage({ type: "plugin_confirm", plugin: pluginName });
  // Update UI immediately
  chrome.storage.local.get("pluginStates", (data) => {
    const states = data.pluginStates || {};
    if (states[pluginName]) {
      states[pluginName].state = "initializing";
      states[pluginName].message = "Verifying login...";
      chrome.storage.local.set({ pluginStates: states });
      render(states);
    }
  });
}

// Load and render
chrome.storage.local.get("pluginStates", (data) => {
  render(data.pluginStates || {});
});

// Listen for updates
chrome.storage.onChanged.addListener((changes) => {
  if (changes.pluginStates) {
    render(changes.pluginStates.newValue || {});
  }
});
