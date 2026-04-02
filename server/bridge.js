import { WebSocketServer } from "ws";
import { randomUUID } from "crypto";

export class ChromeBridge {
  constructor(port = 7331) {
    this.port = port;
    this.client = null;
    this.pending = new Map();
    this.wss = null;
  }

  start() {
    this.wss = new WebSocketServer({ port: this.port });
    this.wss.on("connection", (ws) => {
      this.client = ws;
      ws.on("message", (data) => this._handleResponse(data));
      ws.on("close", () => { this.client = null; });
    });
  }

  stop() {
    this.wss?.close();
  }

  get connected() {
    return this.client?.readyState === 1;
  }

  send(method, params = {}, timeout = 30000) {
    if (!this.connected) {
      return Promise.reject(new Error("Chrome extension not connected"));
    }

    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout: ${method}`));
      }, timeout);

      this.pending.set(id, { resolve, reject, timer });
      this.client.send(JSON.stringify({ id, method, params }));
    });
  }

  _handleResponse(data) {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    const req = this.pending.get(msg.id);
    if (!req) return;

    this.pending.delete(msg.id);
    clearTimeout(req.timer);

    if (msg.error) {
      req.reject(new Error(msg.error));
    } else {
      req.resolve(msg.result);
    }
  }
}
