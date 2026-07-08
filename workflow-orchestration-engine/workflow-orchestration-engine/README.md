# Workflow Orchestration Engine for Enterprise Ops

A lightweight, dependency-graph (DAG) based workflow orchestration engine —
think "mini Airflow" — built for automating multi-step enterprise operations
(employee onboarding, nightly ETL jobs, approval chains, IT provisioning, etc).

## Features

- **DAG-based execution** — define tasks with `dependsOn` relationships; the
  engine automatically parallelizes independent tasks and sequences dependent ones.
- **Cycle & dependency validation** — invalid workflows (missing deps, circular
  dependencies) are rejected at load time, not at runtime.
- **Retries & timeouts** — per-task retry count/delay and execution timeout.
- **Failure propagation** — if a task fails permanently, downstream tasks that
  depend on it are automatically marked `SKIPPED` rather than run against
  incomplete data.
- **Shared execution context** — tasks can read the outputs of upstream tasks
  via `context.results[taskId]`.
- **Three interfaces**:
  1. **REST API** (Express) to trigger and monitor runs programmatically.
  2. **Live dashboard** (SSE-powered) to visualize DAGs and watch runs in real time.
  3. **CLI** for cron jobs / scripted / headless execution.

## Project Structure

```
workflow-orchestration-engine/
├── engine/
│   ├── Task.js            # Single unit of work (id, deps, run(), retries, timeout)
│   ├── Workflow.js         # DAG container: validates deps + detects cycles
│   ├── WorkflowRun.js       # Tracks per-run, per-task state
│   └── Orchestrator.js     # Executes DAGs level-by-level, emits lifecycle events
├── workflows/
│   ├── employeeOnboarding.js   # Sample workflow: new-hire provisioning
│   ├── nightlyDataPipeline.js  # Sample workflow: ETL + BI refresh
│   └── registry.js             # Central list of all registered workflows
├── api/
│   └── server.js           # Express REST API + SSE event stream
├── public/
│   └── index.html          # Live dashboard (vanilla JS, no build step)
├── cli.js                  # Headless CLI runner
├── package.json
└── README.md
```

## Setup

```bash
cd workflow-orchestration-engine
npm install
```

Requires Node.js 18+.

## Running the Web Dashboard + API

```bash
npm start
```

Open **http://localhost:4000** to:
- Browse registered workflows and their DAG shape
- Trigger a run with one click
- Watch live task-by-task progress (colors update via Server-Sent Events)
- View recent run history

## Using the REST API Directly

**List workflows:**
```bash
curl http://localhost:4000/api/workflows
```

**Trigger a run:**
```bash
curl -X POST http://localhost:4000/api/workflows/employee-onboarding/trigger \
  -H "Content-Type: application/json" \
  -d '{"employeeName": "Jordan Rivera"}'
```
Returns immediately with a run id and `RUNNING` status; execution continues async.

**Check run status:**
```bash
curl http://localhost:4000/api/runs/<runId>
```

**List all runs:**
```bash
curl http://localhost:4000/api/runs?workflowId=employee-onboarding
```

## Using the CLI (no server required)

```bash
node cli.js list
node cli.js run employee-onboarding --input '{"employeeName":"Jordan Rivera"}'
node cli.js run nightly-data-pipeline
```

The CLI blocks until the run finishes, prints a per-task summary, and exits
with code `0` on success or `1` on failure — convenient for cron jobs and CI.

## Defining a New Workflow

Create a file in `workflows/`:

```js
const Task = require('../engine/Task');
const Workflow = require('../engine/Workflow');

const stepA = new Task({
  id: 'stepA',
  run: async (ctx) => {
    // ctx.input      -> the input passed when triggering the run
    // ctx.results.X  -> output of a previously completed task "X"
    return { someValue: 42 };
  },
});

const stepB = new Task({
  id: 'stepB',
  dependsOn: ['stepA'],
  retries: 2,          // retry up to 2 times on failure
  retryDelayMs: 500,   // wait 500ms between retries
  timeoutMs: 10000,    // fail if it takes longer than 10s
  run: async (ctx) => {
    const { someValue } = ctx.results.stepA;
    return { doubled: someValue * 2 };
  },
});

module.exports = new Workflow({
  id: 'my-new-workflow',
  description: 'What this workflow does',
  tasks: [stepA, stepB],
});
```

Then register it in `workflows/registry.js`:

```js
const myNewWorkflow = require('./myNewWorkflow');
registry.set(myNewWorkflow.id, myNewWorkflow);
```

## Included Sample Workflows

1. **`employee-onboarding`** — creates an account, then fans out to
   provision email, laptop, and payroll in parallel, then sends a
   welcome email and notifies the manager once their respective
   prerequisites finish.

2. **`nightly-data-pipeline`** — a linear ETL chain (extract → validate →
   transform → load → refresh dashboard) demonstrating retries on the
   validation step and a tighter timeout on the load step.

## Extending This Project

- **Persistence**: runs currently live in memory; swap `Orchestrator.runs`
  for a database-backed store (Postgres/Redis) for durability across restarts.
- **Scheduling**: add a cron layer (e.g. `node-cron`) that calls
  `orchestrator.trigger(workflowId)` on a schedule for recurring jobs.
- **Distributed execution**: for very large workloads, tasks could be
  dispatched to a job queue (BullMQ/Celery-equivalent) instead of running
  in-process.
- **Auth**: add an auth middleware layer to the Express app before exposing
  the trigger endpoint outside a trusted network.
- **Notifications**: subscribe to `run:failed` events to page/alert on-call
  staff automatically.
