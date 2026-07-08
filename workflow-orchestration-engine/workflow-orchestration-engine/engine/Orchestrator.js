/**
 * Orchestrator.js
 * ---------------
 * Executes a Workflow DAG:
 *  - Runs tasks in dependency order, parallelizing independent tasks.
 *  - Passes a shared `context` object between tasks so downstream tasks
 *    can read upstream outputs via `context.results[taskId]`.
 *  - Handles retries, timeouts, and short-circuits downstream tasks
 *    (marks them SKIPPED) if a dependency fails.
 *  - Emits lifecycle events so a UI/API layer can stream progress.
 */

const EventEmitter = require('events');
const { WorkflowRun, TASK_STATUS, RUN_STATUS } = require('./WorkflowRun');

function withTimeout(promise, ms, label) {
  if (!ms) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Task "${label}" timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class Orchestrator extends EventEmitter {
  constructor(registry) {
    super();
    this.registry = registry; // Map<workflowId, Workflow>
    this.runs = new Map(); // Map<runId, WorkflowRun>
  }

  getRun(runId) {
    return this.runs.get(runId);
  }

  listRuns(workflowId) {
    const all = [...this.runs.values()];
    return workflowId ? all.filter((r) => r.workflowId === workflowId) : all;
  }

  /**
   * Kicks off a workflow run. Returns immediately with the run object;
   * execution proceeds asynchronously. Subscribe to events for progress,
   * or poll getRun(runId).
   */
  trigger(workflowId, input = {}) {
    const workflow = this.registry.get(workflowId);
    if (!workflow) throw new Error(`Unknown workflow: "${workflowId}"`);

    const run = new WorkflowRun(workflow, input);
    this.runs.set(run.id, run);

    this._execute(workflow, run).catch((err) => {
      // Safety net: should already be handled inside _execute, but avoid
      // unhandled promise rejections from ever escaping.
      run.status = RUN_STATUS.FAILED;
      run.finishedAt = Date.now();
      this.emit('run:failed', { runId: run.id, error: err.message });
    });

    return run;
  }

  async _execute(workflow, run) {
    run.status = RUN_STATUS.RUNNING;
    run.startedAt = Date.now();
    this.emit('run:started', { runId: run.id, workflowId: workflow.id });

    const context = { input: run.input, results: {} };
    const levels = workflow.getExecutionLevels();
    const failedTasks = new Set();

    for (const level of levels) {
      await Promise.all(
        level.map(async (taskId) => {
          const task = workflow.tasks.get(taskId);
          const state = run.tasks[taskId];

          // If any dependency failed, skip this task.
          const blocked = task.dependsOn.some((dep) => failedTasks.has(dep));
          if (blocked) {
            state.status = TASK_STATUS.SKIPPED;
            failedTasks.add(taskId); // propagate skip downstream too
            this.emit('task:skipped', { runId: run.id, taskId });
            return;
          }

          state.status = TASK_STATUS.RUNNING;
          state.startedAt = Date.now();
          this.emit('task:started', { runId: run.id, taskId });

          let attempt = 0;
          let lastError = null;

          while (attempt <= task.retries) {
            attempt += 1;
            state.attempts = attempt;
            try {
              const output = await withTimeout(
                Promise.resolve(task.run(context)),
                task.timeoutMs,
                task.id
              );
              state.status = TASK_STATUS.SUCCESS;
              state.output = output ?? null;
              state.finishedAt = Date.now();
              context.results[taskId] = output;
              this.emit('task:success', { runId: run.id, taskId, output });
              return;
            } catch (err) {
              lastError = err;
              if (attempt <= task.retries) {
                this.emit('task:retry', {
                  runId: run.id,
                  taskId,
                  attempt,
                  error: err.message,
                });
                await sleep(task.retryDelayMs);
              }
            }
          }

          // Exhausted retries
          state.status = TASK_STATUS.FAILED;
          state.error = lastError ? lastError.message : 'Unknown error';
          state.finishedAt = Date.now();
          failedTasks.add(taskId);
          this.emit('task:failed', { runId: run.id, taskId, error: state.error });
        })
      );
    }

    run.finishedAt = Date.now();
    run.status = failedTasks.size > 0 ? RUN_STATUS.FAILED : RUN_STATUS.SUCCESS;
    this.emit(run.status === RUN_STATUS.SUCCESS ? 'run:success' : 'run:failed', {
      runId: run.id,
      workflowId: workflow.id,
    });
  }
}

module.exports = Orchestrator;
