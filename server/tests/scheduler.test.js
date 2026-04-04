import { describe, it, afterEach } from "node:test";
import assert from "node:assert";
import { Scheduler } from "../scheduler.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe("Scheduler", () => {
  let scheduler;

  afterEach(() => {
    scheduler?.clear();
  });

  it("creates an interval job and runs it", async () => {
    scheduler = new Scheduler();
    let count = 0;
    scheduler.create("test", "counter", "interval", 50, async () => ++count);
    await sleep(180);
    assert.ok(count >= 3, `expected >= 3 runs, got ${count}`);
  });

  it("creates a timeout job and runs it once", async () => {
    scheduler = new Scheduler();
    let count = 0;
    scheduler.create("test", "once", "timeout", 50, async () => ++count);
    await sleep(200);
    assert.strictEqual(count, 1);
  });

  it("calls callback with result and job info", async () => {
    scheduler = new Scheduler();
    let captured = null;
    scheduler.create("gmail", "list", "timeout", 10, async () => ["msg1"], (result, info) => {
      captured = { result, info };
    });
    await sleep(100);
    assert.deepStrictEqual(captured.result, ["msg1"]);
    assert.strictEqual(captured.info.plugin, "gmail");
    assert.strictEqual(captured.info.tool, "list");
    assert.ok(captured.info.id.startsWith("gmail:list:"));
  });

  it("lists active jobs", () => {
    scheduler = new Scheduler();
    scheduler.create("a", "t1", "interval", 1000, async () => {});
    scheduler.create("b", "t2", "timeout", 1000, async () => {});
    const jobs = scheduler.list();
    assert.strictEqual(jobs.length, 2);
    assert.strictEqual(jobs[0].plugin, "a");
    assert.strictEqual(jobs[1].plugin, "b");
    assert.ok(!("handle" in jobs[0]), "handle should be excluded from list");
  });

  it("deletes a job", () => {
    scheduler = new Scheduler();
    const id = scheduler.create("test", "t", "interval", 1000, async () => {});
    assert.strictEqual(scheduler.list().length, 1);
    assert.ok(scheduler.delete(id));
    assert.strictEqual(scheduler.list().length, 0);
  });

  it("returns false for deleting nonexistent job", () => {
    scheduler = new Scheduler();
    assert.ok(!scheduler.delete("nope"));
  });

  it("clears all jobs", () => {
    scheduler = new Scheduler();
    scheduler.create("a", "t1", "interval", 1000, async () => {});
    scheduler.create("b", "t2", "interval", 1000, async () => {});
    scheduler.clear();
    assert.strictEqual(scheduler.list().length, 0);
  });

  it("tracks runCount and lastRun", async () => {
    scheduler = new Scheduler();
    scheduler.create("test", "t", "interval", 30, async () => "ok");
    await sleep(120);
    const job = scheduler.list()[0];
    assert.ok(job.runCount >= 3);
    assert.ok(job.lastRun);
  });

  it("tracks lastError on failure", async () => {
    scheduler = new Scheduler();
    scheduler.create("test", "t", "timeout", 10, async () => { throw new Error("boom"); });
    await sleep(100);
    const job = scheduler.list()[0];
    assert.strictEqual(job.lastError, "boom");
  });

  it("rejects unknown job type", () => {
    scheduler = new Scheduler();
    assert.throws(
      () => scheduler.create("test", "t", "cron", 1000, async () => {}),
      /Unknown job type/
    );
  });
});
