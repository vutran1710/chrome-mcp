#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { ChromeBridge } from "./bridge.js";
import { TOOLS } from "./tools.js";
import { PluginLoader } from "./plugin-loader.js";
import { Scheduler } from "./scheduler.js";
import { registerPluginTools } from "./plugin-api.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.CHROME_MCP_PORT || "7331");
const PLUGINS_DIR = process.env.PLUGINS_DIR || join(__dirname, "..", "plugins");

const bridge = new ChromeBridge(PORT);

const server = new McpServer({
  name: "chrome-lite-mcp",
  version: "0.2.0",
});

// Core browser tools
for (const [name, tool] of Object.entries(TOOLS)) {
  server.tool(name, tool.description, tool.schema, async (params) => {
    try {
      const result = await bridge.send(name, params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  });
}

// Plugins
const loader = new PluginLoader();
await loader.loadDir(PLUGINS_DIR);

const scheduler = new Scheduler();

// Optional: job result callback — logs by default, wire to anything
const onJobResult = (result, info) => {
  process.stderr.write(`[job] ${info.id}: ${JSON.stringify(result).slice(0, 200)}\n`);
};

registerPluginTools(server, loader, scheduler, bridge, onJobResult);

// Start
await bridge.start();
const transport = new StdioServerTransport();
await server.connect(transport);

const pluginNames = loader.listPlugins();
if (pluginNames.length > 0) {
  process.stderr.write(`[chrome-lite-mcp] plugins loaded: ${pluginNames.join(", ")}\n`);
}
