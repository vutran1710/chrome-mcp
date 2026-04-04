import { describe, it, afterEach } from "node:test";
import assert from "node:assert";
import { PluginLoader } from "../plugin-loader.js";
import { Scheduler } from "../scheduler.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mock bridge
const mockBridge = {
  async send(method, params) {
    return { method, params };
  },
};

// Mock plugin
const mockPlugin = {
  name: "mock",
  tools: {
    fetch_data: {
      description: "Fetch some data",
      async handler(bridge, params) {
        return { items: [1, 2, 3], filter: params.filter || "all" };
      },
    },
    do_action: {
      description: "Perform an action",
      async handler(bridge, params) {
        return { ok: true, action: params.action };
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
    const handler = loader.getHandler("mock", "fetch_data");
    const result = await handler(mockBridge, { filter: "unread" });
    assert.deepStrictEqual(result, { items: [1, 2, 3], filter: "unread" });
  });

  it("post calls plugin handler and returns result", async () => {
    const loader = new PluginLoader();
    loader.register(mockPlugin);
    const handler = loader.getHandler("mock", "do_action");
    const result = await handler(mockBridge, { action: "delete" });
    assert.deepStrictEqual(result, { ok: true, action: "delete" });
  });

  it("create_job schedules and runs plugin handler", async () => {
    const loader = new PluginLoader();
    loader.register(mockPlugin);
    scheduler = new Scheduler();

    let captured = null;
    const handler = loader.getHandler("mock", "fetch_data");
    const fn = () => handler(mockBridge, {});
    scheduler.create("mock", "fetch_data", "timeout", 10, fn, (result, info) => {
      captured = { result, info };
    });

    await sleep(100);
    assert.ok(captured);
    assert.deepStrictEqual(captured.result, { items: [1, 2, 3], filter: "all" });
    assert.strictEqual(captured.info.plugin, "mock");
    assert.strictEqual(captured.info.tool, "fetch_data");
  });

  it("create_job with interval runs multiple times", async () => {
    const loader = new PluginLoader();
    loader.register(mockPlugin);
    scheduler = new Scheduler();

    let count = 0;
    const handler = loader.getHandler("mock", "fetch_data");
    const fn = () => handler(mockBridge, {});
    scheduler.create("mock", "fetch_data", "interval", 30, fn, () => { count++; });

    await sleep(120);
    assert.ok(count >= 3, `expected >= 3 runs, got ${count}`);
  });

  it("end-to-end: plugins → tools → get → create_job → list_jobs → delete_job", async () => {
    const loader = new PluginLoader();
    loader.register(mockPlugin);
    scheduler = new Scheduler();

    // plugins
    assert.deepStrictEqual(loader.listPlugins(), ["mock"]);

    // tools
    const tools = loader.listTools("mock");
    assert.strictEqual(tools.length, 2);

    // get
    const handler = loader.getHandler("mock", "fetch_data");
    const data = await handler(mockBridge, {});
    assert.ok(data.items);

    // create_job
    const fn = () => handler(mockBridge, {});
    const id = scheduler.create("mock", "fetch_data", "interval", 1000, fn);
    assert.ok(id.startsWith("mock:fetch_data:"));

    // list_jobs
    const jobs = scheduler.list();
    assert.strictEqual(jobs.length, 1);
    assert.strictEqual(jobs[0].id, id);

    // delete_job
    assert.ok(scheduler.delete(id));
    assert.strictEqual(scheduler.list().length, 0);
  });
});
