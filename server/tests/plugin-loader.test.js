import { describe, it } from "node:test";
import assert from "node:assert";
import { PluginLoader } from "../plugin-loader.js";

const mockPlugin = {
  name: "test-plugin",
  url: "https://example.com",
  async init() {
    return { loggedIn: true };
  },
  tools: {
    list_items: {
      description: "List items",
      async handler(bridge, params) {
        return { type: "json", data: [{ id: 1, name: "item1" }], metadata: {} };
      },
    },
    create_item: {
      description: "Create an item",
      async handler(bridge, params) {
        return { type: "json", data: { ok: true, name: params.name }, metadata: {} };
      },
    },
  },
};

// Mock bridge
const mockBridge = {
  send() {},
  notify() {},
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

  it("lists tools for a plugin (no built-in init/status)", () => {
    const loader = new PluginLoader();
    loader.register(mockPlugin);
    const tools = loader.listTools("test-plugin");
    assert.strictEqual(tools.length, 2);
    assert.strictEqual(tools[0].name, "list_items");
    assert.strictEqual(tools[1].name, "create_item");
  });

  it("gets a handler after init", async () => {
    const loader = new PluginLoader();
    loader.register(mockPlugin);
    await loader.initPlugin("test-plugin", mockBridge);
    const handler = loader.getHandler("test-plugin", "list_items");
    const result = await handler(null, {});
    assert.strictEqual(result.type, "json");
    assert.deepStrictEqual(result.data, [{ id: 1, name: "item1" }]);
  });

  it("passes params to handler", async () => {
    const loader = new PluginLoader();
    loader.register(mockPlugin);
    await loader.initPlugin("test-plugin", mockBridge);
    const handler = loader.getHandler("test-plugin", "create_item");
    const result = await handler(null, { name: "foo" });
    assert.strictEqual(result.type, "json");
    assert.deepStrictEqual(result.data, { ok: true, name: "foo" });
  });

  it("throws if plugin not ready", () => {
    const loader = new PluginLoader();
    loader.register(mockPlugin);
    const handler = loader.getHandler("test-plugin", "list_items");
    assert.rejects(() => handler(null, {}), /not ready/);
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

  it("initPlugin marks ready when init returns loggedIn", async () => {
    const loader = new PluginLoader();
    loader.register(mockPlugin);
    const result = await loader.initPlugin("test-plugin", mockBridge);
    assert.deepStrictEqual(result, { ready: true });
    assert.strictEqual(loader.getState("test-plugin").state, "ready");
  });

  it("initPlugin marks awaiting_login when not logged in", async () => {
    const loader = new PluginLoader();
    loader.register({
      ...mockPlugin,
      name: "needs-login",
      async init() { return { loggedIn: false, message: "Please log in" }; },
    });
    const result = await loader.initPlugin("needs-login", mockBridge);
    assert.strictEqual(result.awaiting_login, true);
    assert.strictEqual(loader.getState("needs-login").state, "awaiting_login");
  });

  it("listActivatedPlugins only returns ready plugins", async () => {
    const loader = new PluginLoader();
    loader.register(mockPlugin);
    loader.register({ name: "other", tools: {}, async init() { return { loggedIn: false }; } });
    await loader.initPlugin("test-plugin", mockBridge);
    await loader.initPlugin("other", mockBridge);
    assert.deepStrictEqual(loader.listActivatedPlugins(), ["test-plugin"]);
  });
});
