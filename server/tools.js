export const TOOLS = [
  {
    name: "tabs_list",
    description: "List all open browser tabs",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "tab_create",
    description: "Create a new tab",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to open" },
      },
    },
  },
  {
    name: "tab_navigate",
    description: "Navigate a tab to a URL",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Tab ID" },
        url: { type: "string", description: "URL to navigate to" },
      },
      required: ["tabId", "url"],
    },
  },
  {
    name: "tab_close",
    description: "Close a tab",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Tab ID" },
      },
      required: ["tabId"],
    },
  },
  {
    name: "tab_switch",
    description: "Switch to (activate) a tab",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Tab ID" },
      },
      required: ["tabId"],
    },
  },
  {
    name: "page_read",
    description: "Read page content as a simplified DOM tree with text, roles, and attributes",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Tab ID" },
      },
      required: ["tabId"],
    },
  },
  {
    name: "page_click",
    description: "Click an element by CSS selector or coordinates",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Tab ID" },
        selector: { type: "string", description: "CSS selector" },
        x: { type: "number", description: "X coordinate" },
        y: { type: "number", description: "Y coordinate" },
      },
      required: ["tabId"],
    },
  },
  {
    name: "page_type",
    description: "Type text into an element",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Tab ID" },
        text: { type: "string", description: "Text to type" },
        selector: { type: "string", description: "CSS selector (optional, defaults to active element)" },
      },
      required: ["tabId", "text"],
    },
  },
  {
    name: "page_screenshot",
    description: "Capture a screenshot of the visible tab area",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Tab ID" },
      },
      required: ["tabId"],
    },
  },
];
