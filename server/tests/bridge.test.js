import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { ChromeBridge } from "../bridge.js";

describe("ChromeBridge", () => {
  let bridge;
  const PORT = 17331;

  beforeEach(() => {
    bridge = new ChromeBridge(PORT);
    bridge.start();
  });

  afterEach(() => {
    bridge.stop();
  });

  it("starts and accepts connections", async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise((r) => ws.on("open", r));
    assert.equal(bridge.connected, true);
    ws.close();
  });

  it("reports disconnected when no client", () => {
    assert.equal(bridge.connected, false);
  });

  it("sends command and receives response", async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise((r) => ws.on("open", r));

    ws.on("message", (data) => {
      const msg = JSON.parse(data);
      ws.send(JSON.stringify({ id: msg.id, result: { tabs: [] } }));
    });

    const result = await bridge.send("tabs_list");
    assert.deepEqual(result, { tabs: [] });
    ws.close();
  });

  it("rejects when extension not connected", async () => {
    await assert.rejects(
      () => bridge.send("tabs_list"),
      { message: "Chrome extension not connected" }
    );
  });

  it("rejects on timeout", async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise((r) => ws.on("open", r));

    await assert.rejects(
      () => bridge.send("tabs_list", {}, 100),
      { message: "Timeout: tabs_list" }
    );
    ws.close();
  });

  it("rejects when extension returns error", async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise((r) => ws.on("open", r));

    ws.on("message", (data) => {
      const msg = JSON.parse(data);
      ws.send(JSON.stringify({ id: msg.id, error: "tab not found" }));
    });

    await assert.rejects(
      () => bridge.send("tab_close", { tabId: 999 }),
      { message: "tab not found" }
    );
    ws.close();
  });

  it("handles multiple concurrent requests", async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise((r) => ws.on("open", r));

    ws.on("message", (data) => {
      const msg = JSON.parse(data);
      ws.send(JSON.stringify({ id: msg.id, result: { method: msg.method } }));
    });

    const [r1, r2] = await Promise.all([
      bridge.send("tabs_list"),
      bridge.send("tab_create", { url: "https://example.com" }),
    ]);

    assert.deepEqual(r1, { method: "tabs_list" });
    assert.deepEqual(r2, { method: "tab_create" });
    ws.close();
  });

  it("ignores malformed messages", async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise((r) => ws.on("open", r));

    ws.send("not json");
    ws.send(JSON.stringify({ id: "unknown-id", result: {} }));

    await assert.rejects(
      () => bridge.send("tabs_list", {}, 200),
      { message: "Timeout: tabs_list" }
    );
    ws.close();
  });

  it("cleans up pending on disconnect", async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise((r) => ws.on("open", r));

    const promise = bridge.send("tabs_list", {}, 500);
    ws.close();

    await assert.rejects(() => promise, { message: "Timeout: tabs_list" });
  });
});
