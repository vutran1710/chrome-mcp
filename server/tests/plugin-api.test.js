import { describe, it, afterEach } from "node:test";
import assert from "node:assert";
import { PluginLoader } from "../plugin-loader.js";
import { Scheduler } from "../scheduler.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mockBridge = {
  send() {},
  notify() {},
};

const mockPlugin = {
  name: "mock",
  url: "https://example.com",
  async init() { return { loggedIn: true }; },
  tools: {
    fetch_data: {
      description: "Fetch some data",
      async handler(bridge, params) {
        const items = [1, 2, 3];
        return { type: "json", data: { items, filter: params.filter || "all" }, metadata: { count: 3 } };
      },
    },
    do_action: {
      description: "Perform an action",
      async handler(bridge, params) {
        return { type: "json", data: { ok: true, action: params.action }, metadata: {} };
      },
    },
  },
};

describe("Plugin API integration", () => {
  let scheduler;

  afterEach(() => {
    scheduler?.clear();
  });

  it("get calls plugin handler and returns result", async () => {
    const loader = new PluginLoader();
    loader.register(mockPlugin);
    await loader.initPlugin("mock", mockBridge);
    const handler = loader.getHandler("mock", "fetch_data");
    const result = await handler(mockBridge, { filter: "unread" });
    assert.strictEqual(result.type, "json");
    assert.deepStrictEqual(result.data, { items: [1, 2, 3], filter: "unread" });
  });

  it("post calls plugin handler and returns result", async () => {
    const loader = new PluginLoader();
    loader.register(mockPlugin);
    await loader.initPlugin("mock", mockBridge);
    const handler = loader.getHandler("mock", "do_action");
    const result = await handler(mockBridge, { action: "delete" });
    assert.strictEqual(result.type, "json");
    assert.deepStrictEqual(result.data, { ok: true, action: "delete" });
  });

  it("create_job schedules and runs plugin handler", async () => {
    const loader = new PluginLoader();
    loader.register(mockPlugin);
    await loader.initPlugin("mock", mockBridge);
    scheduler = new Scheduler();

    let captured = null;
    const handler = loader.getHandler("mock", "fetch_data");
    const fn = () => handler(mockBridge, {});
    scheduler.create("mock", "fetch_data", "timeout", 10, fn, (result, info) => {
      captured = { result, info };
    });

    await sleep(100);
    assert.ok(captured);
    assert.strictEqual(captured.result.type, "json");
    assert.deepStrictEqual(captured.result.data, { items: [1, 2, 3], filter: "all" });
    assert.strictEqual(captured.info.plugin, "mock");
  });

  it("create_job with interval runs multiple times", async () => {
    const loader = new PluginLoader();
    loader.register(mockPlugin);
    await loader.initPlugin("mock", mockBridge);
    scheduler = new Scheduler();

    let count = 0;
    const handler = loader.getHandler("mock", "fetch_data");
    const fn = () => handler(mockBridge, {});
    scheduler.create("mock", "fetch_data", "interval", 30, fn, () => { count++; });

    await sleep(120);
    assert.ok(count >= 3, `expected >= 3 runs, got ${count}`);
  });

  it("end-to-end: init → plugins → tools → get → create_job → list → delete", async () => {
    const loader = new PluginLoader();
    loader.register(mockPlugin);
    scheduler = new Scheduler();

    // Before init: not activated
    assert.deepStrictEqual(loader.listActivatedPlugins(), []);

    // Init
    await loader.initPlugin("mock", mockBridge);
    assert.deepStrictEqual(loader.listActivatedPlugins(), ["mock"]);

    // Tools
    const tools = loader.listTools("mock");
    assert.strictEqual(tools.length, 2);

    // Get
    const handler = loader.getHandler("mock", "fetch_data");
    const data = await handler(mockBridge, {});
    assert.ok(data.data.items);

    // Create job
    const fn = () => handler(mockBridge, {});
    const id = scheduler.create("mock", "fetch_data", "interval", 1000, fn);
    assert.ok(id.startsWith("mock:fetch_data:"));

    // List jobs
    assert.strictEqual(scheduler.list().length, 1);

    // Delete job
    assert.ok(scheduler.delete(id));
    assert.strictEqual(scheduler.list().length, 0);
  });
});
