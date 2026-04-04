import { describe, it } from "node:test";
import assert from "node:assert";
import { PluginLoader } from "../plugin-loader.js";

const mockPlugin = {
  name: "test-plugin",
  tools: {
    list_items: {
      description: "List items",
      async handler(bridge, params) {
        return [{ id: 1, name: "item1" }];
      },
    },
    create_item: {
      description: "Create an item",
      async handler(bridge, params) {
        return { ok: true, name: params.name };
      },
    },
  },
};

describe("PluginLoader", () => {
  it("registers a plugin", () => {
    const loader = new PluginLoader();
    loader.register(mockPlugin);
    assert.ok(loader.has("test-plugin"));
  });

  it("lists plugin names", () => {
    const loader = new PluginLoader();
    loader.register(mockPlugin);
    loader.register({ name: "other", tools: {} });
    assert.deepStrictEqual(loader.listPlugins(), ["test-plugin", "other"]);
  });

  it("lists tools for a plugin", () => {
    const loader = new PluginLoader();
    loader.register(mockPlugin);
    const tools = loader.listTools("test-plugin");
    assert.strictEqual(tools.length, 2);
    assert.strictEqual(tools[0].name, "list_items");
    assert.strictEqual(tools[0].description, "List items");
    assert.strictEqual(tools[1].name, "create_item");
  });

  it("gets a handler", async () => {
    const loader = new PluginLoader();
    loader.register(mockPlugin);
    const handler = loader.getHandler("test-plugin", "list_items");
    const result = await handler(null, {});
    assert.deepStrictEqual(result, [{ id: 1, name: "item1" }]);
  });

  it("passes params to handler", async () => {
    const loader = new PluginLoader();
    loader.register(mockPlugin);
    const handler = loader.getHandler("test-plugin", "create_item");
    const result = await handler(null, { name: "foo" });
    assert.deepStrictEqual(result, { ok: true, name: "foo" });
  });

  it("throws for unknown plugin", () => {
    const loader = new PluginLoader();
    assert.throws(() => loader.listTools("nope"), /Plugin not found/);
    assert.throws(() => loader.getHandler("nope", "t"), /Plugin not found/);
  });

  it("throws for unknown tool", () => {
    const loader = new PluginLoader();
    loader.register(mockPlugin);
    assert.throws(() => loader.getHandler("test-plugin", "nope"), /Tool not found/);
  });

  it("rejects plugin without name or tools", () => {
    const loader = new PluginLoader();
    assert.throws(() => loader.register({}), /must have name and tools/);
    assert.throws(() => loader.register({ name: "x" }), /must have name and tools/);
  });

  it("loads from nonexistent dir without error", async () => {
    const loader = new PluginLoader();
    await loader.loadDir("/tmp/nonexistent-plugins-dir-" + Date.now());
    assert.strictEqual(loader.listPlugins().length, 0);
  });
});
