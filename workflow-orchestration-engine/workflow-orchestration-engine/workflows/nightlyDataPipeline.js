/**
 * nightlyDataPipeline.js
 * ----------------------
 * Sample ETL-style enterprise-ops workflow. Demonstrates retries and
 * downstream skip behavior when a task fails permanently.
 *
 * DAG shape:
 *
 *   extractData
 *       |--> validateData
 *                |--> transformData
 *                         |--> loadToWarehouse
 *                                  |--> refreshDashboard
 */

const Task = require('../engine/Task');
const Workflow = require('../engine/Workflow');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const extractData = new Task({
  id: 'extractData',
  run: async () => {
    await delay(200);
    return { rows: 1500, source: 'sales_db' };
  },
});

const validateData = new Task({
  id: 'validateData',
  dependsOn: ['extractData'],
  retries: 2,
  retryDelayMs: 400,
  run: async (ctx) => {
    await delay(150);
    const { rows } = ctx.results.extractData;
    if (rows < 100) throw new Error('Row count below minimum threshold');
    return { valid: true, rows };
  },
});

const transformData = new Task({
  id: 'transformData',
  dependsOn: ['validateData'],
  run: async (ctx) => {
    await delay(300);
    return { transformedRows: ctx.results.validateData.rows };
  },
});

const loadToWarehouse = new Task({
  id: 'loadToWarehouse',
  dependsOn: ['transformData'],
  timeoutMs: 5000,
  run: async (ctx) => {
    await delay(250);
    return { loaded: ctx.results.transformData.transformedRows, table: 'fact_sales' };
  },
});

const refreshDashboard = new Task({
  id: 'refreshDashboard',
  dependsOn: ['loadToWarehouse'],
  run: async () => {
    await delay(100);
    return { dashboard: 'sales-overview', refreshed: true };
  },
});

module.exports = new Workflow({
  id: 'nightly-data-pipeline',
  description: 'Extracts, validates, transforms, and loads sales data, then refreshes BI dashboards.',
  tasks: [extractData, validateData, transformData, loadToWarehouse, refreshDashboard],
});
