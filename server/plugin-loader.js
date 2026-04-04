/**
 * Plugin loader — discovers, loads, and manages plugin lifecycle.
 *
 * Plugin states: unloaded → initializing → awaiting_login → ready | error
 *
 * Plugin interface:
 *   name: string
 *   url: string                          — app URL to open
 *   init(bridge): Promise<LoginResult>   — check/perform login, return { loggedIn, message? }
 *   tools: { [name]: { description, handler(bridge, params) } }
 */

import { readdir } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";

export class PluginLoader {
  constructor() {
    this.plugins = new Map();
    this.states = new Map();
  }

  async loadDir(dir) {
    let files;
    try {
      files = await readdir(dir);
    } catch {
      return;
    }

    for (const file of files) {
      if (!file.endsWith(".js") || file === "helpers.js") continue;
      try {
        const fullPath = join(dir, file);
        const mod = await import(pathToFileURL(fullPath).href);
        const plugin = mod.default;
        if (plugin && plugin.name && plugin.tools) {
          this.plugins.set(plugin.name, plugin);
          this.states.set(plugin.name, { state: "unloaded", tabId: null, message: null });
        }
      } catch (err) {
        process.stderr.write(`[plugin-loader] failed to load ${file}: ${err.message}\n`);
      }
    }
  }

  register(plugin) {
    if (!plugin.name || !plugin.tools) {
      throw new Error("Plugin must have name and tools");
    }
    this.plugins.set(plugin.name, plugin);
    this.states.set(plugin.name, { state: "unloaded", tabId: null, message: null });
  }

  listPlugins() {
    return Array.from(this.plugins.keys());
  }

  listActivatedPlugins() {
    return Array.from(this.plugins.keys()).filter(
      (name) => this.states.get(name)?.state === "ready"
    );
  }

  listTools(pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) throw new Error(`Plugin not found: ${pluginName}`);

    const custom = Object.entries(plugin.tools).map(([name, tool]) => ({
      name,
      description: tool.description || "",
    }));
    return custom;
  }

  getHandler(pluginName, toolName) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) throw new Error(`Plugin not found: ${pluginName}`);

    const tool = plugin.tools[toolName];
    if (!tool) throw new Error(`Tool not found: ${pluginName}.${toolName}`);

    return async (bridge, params) => {
      const state = this.getState(pluginName);
      if (state.state !== "ready") {
        throw new Error(`Plugin '${pluginName}' is not ready (state: ${state.state}). Run init first.`);
      }
      return tool.handler(bridge, params);
    };
  }

  has(pluginName) {
    return this.plugins.has(pluginName);
  }

  getState(pluginName) {
    return this.states.get(pluginName) || { state: "unknown" };
  }

  setState(pluginName, updates) {
    const current = this.states.get(pluginName) || {};
    this.states.set(pluginName, { ...current, ...updates });
  }

  getAllStates() {
    const result = {};
    for (const [name, state] of this.states) {
      result[name] = state;
    }
    return result;
  }

  /**
   * Initialize a plugin by calling its init(bridge) method.
   */
  async initPlugin(pluginName, bridge) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) throw new Error(`Plugin not found: ${pluginName}`);

    this.setState(pluginName, { state: "initializing", message: null });
    bridge.notify("plugin_status", { plugin: pluginName, state: "initializing" });

    if (!plugin.init) {
      this.setState(pluginName, { state: "ready" });
      bridge.notify("plugin_status", { plugin: pluginName, state: "ready" });
      return { ready: true };
    }

    try {
      const result = await plugin.init(bridge);

      if (result && result.loggedIn) {
        this.setState(pluginName, { state: "ready" });
        bridge.notify("plugin_status", { plugin: pluginName, state: "ready" });
        return { ready: true };
      }

      const message = result?.message || `Please log in to ${pluginName}`;
      this.setState(pluginName, { state: "awaiting_login", message });
      bridge.notify("plugin_status", { plugin: pluginName, state: "awaiting_login", message });
      return { awaiting_login: true, message };
    } catch (err) {
      this.setState(pluginName, { state: "error", message: err.message });
      bridge.notify("plugin_status", { plugin: pluginName, state: "error", message: err.message });
      return { error: err.message };
    }
  }

  /**
   * Called when user confirms login via extension popup.
   * Re-runs init to verify.
   */
  async confirmLogin(pluginName, bridge) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) throw new Error(`Plugin not found: ${pluginName}`);

    if (!plugin.init) {
      this.setState(pluginName, { state: "ready" });
      return { ready: true };
    }

    try {
      const result = await plugin.init(bridge);
      if (result && result.loggedIn) {
        this.setState(pluginName, { state: "ready", message: null });
        bridge.notify("plugin_status", { plugin: pluginName, state: "ready" });
        return { ready: true };
      }
      return { ready: false, message: result?.message || "Still not logged in" };
    } catch (err) {
      return { ready: false, message: err.message };
    }
  }
}
