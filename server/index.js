#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ChromeBridge } from "./bridge.js";
import { TOOLS } from "./tools.js";

const PORT = parseInt(process.env.CHROME_MCP_PORT || "7331");
const bridge = new ChromeBridge(PORT);

const server = new McpServer({
  name: "chrome-mcp",
  version: "0.1.0",
});

for (const tool of TOOLS) {
  server.tool(tool.name, tool.description, tool.inputSchema, async (params) => {
    try {
      const result = await bridge.send(tool.name, params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  });
}

bridge.start();
const transport = new StdioServerTransport();
await server.connect(transport);
