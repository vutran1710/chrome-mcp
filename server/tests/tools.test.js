import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TOOLS } from "../tools.js";

describe("TOOLS", () => {
  const EXPECTED_TOOLS = [
    "tabs_list", "tab_create", "tab_navigate", "tab_close",
    "tab_switch", "page_read", "page_click", "page_type", "page_screenshot",
  ];

  it("defines all expected tools", () => {
    const names = TOOLS.map((t) => t.name);
    assert.deepEqual(names, EXPECTED_TOOLS);
  });

  it("every tool has name, description, and inputSchema", () => {
    for (const tool of TOOLS) {
      assert.ok(tool.name, `missing name`);
      assert.ok(tool.description, `${tool.name}: missing description`);
      assert.ok(tool.inputSchema, `${tool.name}: missing inputSchema`);
      assert.equal(tool.inputSchema.type, "object", `${tool.name}: schema type must be object`);
    }
  });

  it("tools with required params declare them", () => {
    const requireTabId = ["tab_navigate", "tab_close", "tab_switch", "page_read", "page_click", "page_type", "page_screenshot"];
    for (const name of requireTabId) {
      const tool = TOOLS.find((t) => t.name === name);
      assert.ok(tool.inputSchema.required?.includes("tabId"), `${name}: should require tabId`);
    }
  });

  it("tab_navigate requires url", () => {
    const tool = TOOLS.find((t) => t.name === "tab_navigate");
    assert.ok(tool.inputSchema.required.includes("url"));
  });

  it("page_type requires text", () => {
    const tool = TOOLS.find((t) => t.name === "page_type");
    assert.ok(tool.inputSchema.required.includes("text"));
  });

  it("tabs_list and tab_create have no required params", () => {
    for (const name of ["tabs_list", "tab_create"]) {
      const tool = TOOLS.find((t) => t.name === name);
      assert.ok(!tool.inputSchema.required, `${name}: should have no required params`);
    }
  });
});
