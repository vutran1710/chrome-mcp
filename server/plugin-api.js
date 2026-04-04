/**
 * Plugin API — registers the 7 plugin MCP tools on the server.
 */

import { z } from "zod";

/**
 * @param {Function} [onJobResult] - Optional callback(result, jobInfo) for background job results
 */
export function registerPluginTools(server, loader, scheduler, bridge, onJobResult) {
  server.tool("plugins", "List all installed plugins", {}, async () => {
    return ok(loader.listPlugins());
  });

  server.tool(
    "tools",
    "List available tools for a plugin",
    { plugin: z.string().describe("Plugin name") },
    async ({ plugin }) => {
      return ok(loader.listTools(plugin));
    }
  );

  server.tool(
    "get",
    "Read data from a plugin",
    {
      plugin: z.string().describe("Plugin name"),
      tool: z.string().describe("Tool name"),
      params: z.record(z.any()).optional().describe("Tool parameters"),
    },
    async ({ plugin, tool, params }) => {
      const handler = loader.getHandler(plugin, tool);
      const result = await handler(bridge, params || {});
      return ok(result);
    }
  );

  server.tool(
    "post",
    "Perform an action via a plugin",
    {
      plugin: z.string().describe("Plugin name"),
      tool: z.string().describe("Tool name"),
      params: z.record(z.any()).optional().describe("Tool parameters"),
    },
    async ({ plugin, tool, params }) => {
      const handler = loader.getHandler(plugin, tool);
      const result = await handler(bridge, params || {});
      return ok(result);
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
      params: z.record(z.any()).optional().describe("Tool parameters"),
    },
    async ({ plugin, tool, type, ms, params }) => {
      const handler = loader.getHandler(plugin, tool);
      const fn = () => handler(bridge, params || {});
      const id = scheduler.create(plugin, tool, type, ms, fn, onJobResult);
      return ok({ id });
    }
  );

  server.tool("list_jobs", "List all active background jobs", {}, async () => {
    return ok(scheduler.list());
  });

  server.tool(
    "delete_job",
    "Cancel a background job",
    { id: z.string().describe("Job ID") },
    async ({ id }) => {
      const deleted = scheduler.delete(id);
      if (!deleted) return err(`Job not found: ${id}`);
      return ok({ ok: true });
    }
  );
}

function ok(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function err(msg) {
  return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
}
