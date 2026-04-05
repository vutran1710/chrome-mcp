/**
 * Plugin API — registers plugin MCP tools on the server.
 *
 * Plugin handlers return: { type: "json"|"image"|"text", data, metadata }
 * System tools (plugins, tools, list_jobs) return plain JSON via respond().
 */

import { z } from "zod";

/**
 * @param {Function} [onJobResult] - Optional callback(result, jobInfo) for background job results
 */
export function registerPluginTools(server, loader, scheduler, bridge, onJobResult) {
  server.tool("plugins", "List activated (ready) plugins", {}, async () => {
    return respond(loader.listActivatedPlugins());
  });

  server.tool("all_plugins", "List all available plugins with their state", {}, async () => {
    return respond(loader.getAllStates());
  });

  server.tool(
    "tools",
    "List available tools for a plugin",
    { plugin: z.string().describe("Plugin name") },
    async ({ plugin }) => {
      return respond(loader.listTools(plugin));
    }
  );

  server.tool(
    "init_plugin",
    "Initialize a plugin: open tab, check login, return status",
    { plugin: z.string().describe("Plugin name") },
    async ({ plugin }) => {
      const result = await loader.initPlugin(plugin, bridge);
      return respond(result);
    }
  );

  server.tool(
    "get",
    "Read data from a plugin. Returns { type, data, metadata }",
    {
      plugin: z.string().describe("Plugin name"),
      tool: z.string().describe("Tool name"),
      params: z.string().optional().describe("Tool parameters as JSON string"),
    },
    async ({ plugin, tool, params }) => {
      try {
        const handler = loader.getHandler(plugin, tool);
        const parsed = params ? JSON.parse(params) : {};
        const result = await handler(bridge, parsed);
        return toMcpResult(result);
      } catch (err) {
        return error(err.message);
      }
    }
  );

  server.tool(
    "post",
    "Perform an action via a plugin. Returns { type, data, metadata }",
    {
      plugin: z.string().describe("Plugin name"),
      tool: z.string().describe("Tool name"),
      params: z.string().optional().describe("Tool parameters as JSON string"),
    },
    async ({ plugin, tool, params }) => {
      try {
        const handler = loader.getHandler(plugin, tool);
        const parsed = params ? JSON.parse(params) : {};
        const result = await handler(bridge, parsed);
        return toMcpResult(result);
      } catch (err) {
        return error(err.message);
      }
    }
  );

  server.tool(
    "create_job",
    "Schedule a background job for a plugin tool",
    {
      plugin: z.string().describe("Plugin name"),
      tool: z.string().describe("Tool name"),
      type: z.enum(["interval", "timeout"]).describe("Job type"),
      ms: z.number().describe("Interval or delay in milliseconds"),
      params: z.string().optional().describe("Tool parameters as JSON string"),
    },
    async ({ plugin, tool, type, ms, params }) => {
      const handler = loader.getHandler(plugin, tool);
      const parsed = params ? JSON.parse(params) : {};
      const fn = () => handler(bridge, parsed);
      const id = scheduler.create(plugin, tool, type, ms, fn, onJobResult);
      return respond({ id });
    }
  );

  server.tool("list_jobs", "List all active background jobs", {}, async () => {
    return respond(scheduler.list());
  });

  server.tool(
    "delete_job",
    "Cancel a background job",
    { id: z.string().describe("Job ID") },
    async ({ id }) => {
      const deleted = scheduler.delete(id);
      if (!deleted) return error(`Job not found: ${id}`);
      return respond({ ok: true });
    }
  );
}

/** System response — plain JSON */
function respond(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/** Error response */
function error(msg) {
  return { content: [{ type: "text", text: JSON.stringify({ type: "error", data: msg }) }], isError: true };
}

/** Plugin result → MCP content. Expects { type, data, metadata } */
function toMcpResult(result) {
  if (!result || !result.type) {
    throw new Error("Plugin handler must return { type, data, metadata }");
  }

  const envelope = { type: result.type, data: result.data, metadata: result.metadata || {} };

  switch (result.type) {
    case "image":
      return {
        content: [
          { type: "text", text: JSON.stringify({ type: "image", metadata: envelope.metadata }) },
          { type: "image", data: result.data, mimeType: envelope.metadata.mimeType || "image/png" },
        ],
      };
    case "text":
      return { content: [{ type: "text", text: JSON.stringify(envelope) }] };
    case "json":
    default:
      return { content: [{ type: "text", text: JSON.stringify(envelope, null, 2) }] };
  }
}
