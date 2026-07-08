/**
 * Task.js
 * -------
 * Represents a single unit of work inside a workflow DAG.
 *
 * A task has:
 *  - an id (unique within its workflow)
 *  - a list of dependency task ids (`dependsOn`)
 *  - a `run(context)` function that performs the actual work
 *  - retry configuration
 */

class Task {
  /**
   * @param {Object} config
   * @param {string} config.id - Unique task identifier within the workflow.
   * @param {string[]} [config.dependsOn] - IDs of tasks that must succeed first.
   * @param {(context: object) => Promise<any>} config.run - Task logic.
   * @param {number} [config.retries] - Number of retry attempts on failure.
   * @param {number} [config.retryDelayMs] - Delay between retries.
   * @param {number} [config.timeoutMs] - Max time allowed for the task to run.
   */
  constructor({ id, dependsOn = [], run, retries = 0, retryDelayMs = 1000, timeoutMs = 30000 }) {
    if (!id) throw new Error('Task requires an id');
    if (typeof run !== 'function') throw new Error(`Task "${id}" requires a run() function`);

    this.id = id;
    this.dependsOn = dependsOn;
    this.run = run;
    this.retries = retries;
    this.retryDelayMs = retryDelayMs;
    this.timeoutMs = timeoutMs;
  }
}

module.exports = Task;
