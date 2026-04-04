/**
 * Job scheduler — manages interval and timeout background jobs.
 * Each job calls a function on a schedule and invokes a callback with the result.
 */

let jobCounter = 0;

export class Scheduler {
  constructor() {
    this.jobs = new Map();
  }

  /**
   * Create a background job.
   * @param {string} plugin - Plugin name
   * @param {string} tool - Tool name
   * @param {string} type - "interval" or "timeout"
   * @param {number} ms - Interval or delay in milliseconds
   * @param {Function} fn - Async function to execute
   * @param {Function} [callback] - Called with (result, jobInfo) on each run
   * @returns {string} Job ID
   */
  create(plugin, tool, type, ms, fn, callback) {
    const id = `${plugin}:${tool}:${++jobCounter}`;

    const wrappedFn = async () => {
      const job = this.jobs.get(id);
      if (!job) return;
      try {
        const result = await fn();
        job.lastRun = new Date().toISOString();
        job.runCount++;
        if (callback) {
          callback(result, { id, plugin, tool, timestamp: job.lastRun });
        }
      } catch (err) {
        job.lastError = err.message;
      }
    };

    let handle;
    if (type === "interval") {
      handle = setInterval(wrappedFn, ms);
    } else if (type === "timeout") {
      handle = setTimeout(() => {
        wrappedFn().then(() => {
          const job = this.jobs.get(id);
          if (job) job.status = "done";
        });
      }, ms);
    } else {
      throw new Error(`Unknown job type: ${type}`);
    }

    this.jobs.set(id, {
      id,
      plugin,
      tool,
      type,
      ms,
      handle,
      status: "active",
      lastRun: null,
      lastError: null,
      runCount: 0,
      createdAt: new Date().toISOString(),
    });

    return id;
  }

  delete(id) {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (job.type === "interval") clearInterval(job.handle);
    if (job.type === "timeout") clearTimeout(job.handle);
    this.jobs.delete(id);
    return true;
  }

  list() {
    return Array.from(this.jobs.values()).map(({ handle, ...rest }) => rest);
  }

  clear() {
    for (const id of this.jobs.keys()) {
      this.delete(id);
    }
  }
}
