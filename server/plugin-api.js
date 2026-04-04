/**
 * Plugin API — registers the 7 plugin MCP tools on the server.
 */

import { z } from "zod";

/**
 * @param {Function} [onJobResult] - Optional callback(result, jobInfo) for background job results
 */
export function registerPluginTools(server, loader, scheduler, bridge, onJobResult) {
  server.tool("plugins", "List activated (ready) plugins", {}, async () => {
    return ok(loader.listActivatedPlugins());
  });

  server.tool("all_plugins", "List all available plugins with their state", {}, async () => {
    return ok(loader.getAllStates());
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
    "init_plugin",
    "Initialize a plugin: open tab, check login, return status",
    { plugin: z.string().describe("Plugin name") },
    async ({ plugin }) => {
      const result = await loader.initPlugin(plugin, bridge);
      return ok(result);
    }
  );

  server.tool(
    "get",
    "Read data from a plugin",
    {
      plugin: z.string().describe("Plugin name"),
      tool: z.string().describe("Tool name"),
      params: z.string().optional().describe("Tool parameters as JSON string"),
    },
    async ({ plugin, tool, params }) => {
      const handler = loader.getHandler(plugin, tool);
      const parsed = params ? JSON.parse(params) : {};
      const result = await handler(bridge, parsed);
      return ok(result);
    }
  );

  server.tool(
    "post",
    "Perform an action via a plugin",
    {
      plugin: z.string().describe("Plugin name"),
      tool: z.string().describe("Tool name"),
      params: z.string().optional().describe("Tool parameters as JSON string"),
    },
    async ({ plugin, tool, params }) => {
      const handler = loader.getHandler(plugin, tool);
      const parsed = params ? JSON.parse(params) : {};
      const result = await handler(bridge, parsed);
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
      params: z.string().optional().describe("Tool parameters as JSON string"),
    },
    async ({ plugin, tool, type, ms, params }) => {
      const handler = loader.getHandler(plugin, tool);
      const parsed = params ? JSON.parse(params) : {};
      const fn = () => handler(bridge, parsed);
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
