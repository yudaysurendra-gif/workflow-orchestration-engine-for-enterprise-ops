#!/usr/bin/env node
/**
 * cli.js
 * ------
 * Run a workflow directly from the terminal, without starting the API server.
 * Useful for cron jobs, CI pipelines, or local testing.
 *
 * Usage:
 *   node cli.js list
 *   node cli.js run employee-onboarding
 *   node cli.js run nightly-data-pipeline --input '{"foo":"bar"}'
 */

const Orchestrator = require('./engine/Orchestrator');
const registry = require('./workflows/registry');

const orchestrator = new Orchestrator(registry);

function printRun(run) {
  console.log(`\nRun ${run.id} — ${run.status}`);
  for (const [taskId, state] of Object.entries(run.tasks)) {
    const duration =
      state.startedAt && state.finishedAt ? `${state.finishedAt - state.startedAt}ms` : '-';
    console.log(`  ${taskId.padEnd(24)} ${state.status.padEnd(10)} ${duration}`);
    if (state.error) console.log(`    error: ${state.error}`);
  }
}

async function waitForCompletion(runId, pollMs = 100) {
  return new Promise((resolve) => {
    const check = () => {
      const run = orchestrator.getRun(runId);
      if (run.status === 'SUCCESS' || run.status === 'FAILED') {
        resolve(run);
      } else {
        setTimeout(check, pollMs);
      }
    };
    check();
  });
}

async function main() {
  const [, , command, workflowId, ...rest] = process.argv;

  if (command === 'list') {
    console.log('Available workflows:');
    for (const wf of registry.values()) {
      console.log(`  ${wf.id.padEnd(28)} ${wf.description}`);
    }
    return;
  }

  if (command === 'run') {
    if (!workflowId) {
      console.error('Usage: node cli.js run <workflowId> [--input \'{"key":"value"}\']');
      process.exit(1);
    }

    let input = {};
    const inputFlagIndex = rest.indexOf('--input');
    if (inputFlagIndex !== -1 && rest[inputFlagIndex + 1]) {
      input = JSON.parse(rest[inputFlagIndex + 1]);
    }

    orchestrator.on('task:started', (d) => console.log(`  -> ${d.taskId} started`));
    orchestrator.on('task:success', (d) => console.log(`  ✓  ${d.taskId} succeeded`));
    orchestrator.on('task:failed', (d) => console.log(`  ✗  ${d.taskId} failed: ${d.error}`));
    orchestrator.on('task:skipped', (d) => console.log(`  »  ${d.taskId} skipped`));

    const run = orchestrator.trigger(workflowId, input);
    console.log(`Triggered run ${run.id} for workflow "${workflowId}"`);

    const finished = await waitForCompletion(run.id);
    printRun(finished);
    process.exit(finished.status === 'SUCCESS' ? 0 : 1);
  }

  console.log('Usage:');
  console.log('  node cli.js list');
  console.log('  node cli.js run <workflowId> [--input \'{"key":"value"}\']');
}

main();
