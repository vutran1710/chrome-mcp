/**
 * Plugin loader — discovers and loads plugins from a directory.
 * Each plugin is a JS module with { name, tools: { [toolName]: { description, handler } } }
 */

import { readdir } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";

export class PluginLoader {
  constructor() {
    this.plugins = new Map();
  }

  async loadDir(dir) {
    let files;
    try {
      files = await readdir(dir);
    } catch {
      return; // plugins dir doesn't exist, that's ok
    }

    for (const file of files) {
      if (!file.endsWith(".js")) continue;
      try {
        const fullPath = join(dir, file);
        const mod = await import(pathToFileURL(fullPath).href);
        const plugin = mod.default;
        if (plugin && plugin.name && plugin.tools) {
          this.plugins.set(plugin.name, plugin);
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
  }

  listPlugins() {
    return Array.from(this.plugins.keys());
  }

  listTools(pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) throw new Error(`Plugin not found: ${pluginName}`);
    return Object.entries(plugin.tools).map(([name, tool]) => ({
      name,
      description: tool.description || "",
    }));
  }

  getHandler(pluginName, toolName) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) throw new Error(`Plugin not found: ${pluginName}`);
    const tool = plugin.tools[toolName];
    if (!tool) throw new Error(`Tool not found: ${pluginName}.${toolName}`);
    return tool.handler;
  }

  has(pluginName) {
    return this.plugins.has(pluginName);
  }
}
