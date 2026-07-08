/**
 * server.js
 * ---------
 * REST API + static dashboard for the Workflow Orchestration Engine.
 *
 * Endpoints:
 *   GET  /api/workflows              -> list registered workflows + DAG shape
 *   GET  /api/workflows/:id          -> get a single workflow definition
 *   POST /api/workflows/:id/trigger  -> start a new run (body = input JSON)
 *   GET  /api/runs                   -> list all runs (optional ?workflowId=)
 *   GET  /api/runs/:runId            -> get status of a single run
 *   GET  /api/events                 -> Server-Sent Events stream of live run updates
 */

const path = require('path');
const express = require('express');
const Orchestrator = require('../engine/Orchestrator');
const registry = require('../workflows/registry');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const orchestrator = new Orchestrator(registry);

// --- SSE subscribers for live dashboard updates ---
const sseClients = new Set();

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) res.write(payload);
}

[
  'run:started', 'run:success', 'run:failed',
  'task:started', 'task:success', 'task:failed', 'task:retry', 'task:skipped',
].forEach((eventName) => {
  orchestrator.on(eventName, (data) => broadcast(eventName, data));
});

app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// --- Workflow definitions ---

function serializeWorkflow(workflow) {
  return {
    id: workflow.id,
    description: workflow.description,
    tasks: [...workflow.tasks.values()].map((t) => ({
      id: t.id,
      dependsOn: t.dependsOn,
      retries: t.retries,
      timeoutMs: t.timeoutMs,
    })),
    executionLevels: workflow.getExecutionLevels(),
  };
}

app.get('/api/workflows', (req, res) => {
  const all = [...registry.values()].map(serializeWorkflow);
  res.json(all);
});

app.get('/api/workflows/:id', (req, res) => {
  const workflow = registry.get(req.params.id);
  if (!workflow) return res.status(404).json({ error: `Unknown workflow: ${req.params.id}` });
  res.json(serializeWorkflow(workflow));
});

// --- Triggering & inspecting runs ---

app.post('/api/workflows/:id/trigger', (req, res) => {
  try {
    const run = orchestrator.trigger(req.params.id, req.body || {});
    res.status(202).json(run.toJSON());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/runs', (req, res) => {
  const runs = orchestrator.listRuns(req.query.workflowId);
  res.json(runs.map((r) => r.toJSON()));
});

app.get('/api/runs/:runId', (req, res) => {
  const run = orchestrator.getRun(req.params.runId);
  if (!run) return res.status(404).json({ error: `Unknown run: ${req.params.runId}` });
  res.json(run.toJSON());
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Workflow Orchestration Engine running at http://localhost:${PORT}`);
});

module.exports = app;
