/**
 * WorkflowRun.js
 * --------------
 * Tracks the state of a single execution of a Workflow: per-task status,
 * timing, output/errors, and overall run status.
 */

const { randomUUID } = require('crypto');

const TASK_STATUS = Object.freeze({
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
});

const RUN_STATUS = Object.freeze({
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
});

class WorkflowRun {
  constructor(workflow, input = {}) {
    this.id = randomUUID();
    this.workflowId = workflow.id;
    this.input = input;
    this.status = RUN_STATUS.PENDING;
    this.startedAt = null;
    this.finishedAt = null;

    this.tasks = {};
    for (const taskId of workflow.tasks.keys()) {
      this.tasks[taskId] = {
        status: TASK_STATUS.PENDING,
        attempts: 0,
        startedAt: null,
        finishedAt: null,
        output: null,
        error: null,
      };
    }
  }

  toJSON() {
    return {
      id: this.id,
      workflowId: this.workflowId,
      status: this.status,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      durationMs:
        this.startedAt && this.finishedAt
          ? this.finishedAt - this.startedAt
          : null,
      tasks: this.tasks,
    };
  }
}

module.exports = { WorkflowRun, TASK_STATUS, RUN_STATUS };
