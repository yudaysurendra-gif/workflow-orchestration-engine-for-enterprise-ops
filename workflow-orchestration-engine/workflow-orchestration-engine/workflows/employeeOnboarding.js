/**
 * employeeOnboarding.js
 * ---------------------
 * Sample enterprise-ops workflow: provisioning a new employee across
 * several systems, with some steps able to run in parallel once
 * prerequisites are met.
 *
 * DAG shape:
 *
 *   createAccount
 *       |--> provisionEmail
 *       |--> provisionLaptop
 *       |--> addToPayroll
 *                |--> sendWelcomeEmail   (depends on provisionEmail)
 *                |--> notifyManager      (depends on addToPayroll)
 */

const Task = require('../engine/Task');
const Workflow = require('../engine/Workflow');

const createAccount = new Task({
  id: 'createAccount',
  run: async (ctx) => {
    const { employeeName } = ctx.input;
    await delay(200);
    return { accountId: `ACC-${Date.now()}`, employeeName };
  },
});

const provisionEmail = new Task({
  id: 'provisionEmail',
  dependsOn: ['createAccount'],
  retries: 2,
  retryDelayMs: 500,
  run: async (ctx) => {
    const { employeeName } = ctx.results.createAccount;
    await delay(150);
    const email = `${employeeName.toLowerCase().replace(/\s+/g, '.')}@company.com`;
    return { email };
  },
});

const provisionLaptop = new Task({
  id: 'provisionLaptop',
  dependsOn: ['createAccount'],
  run: async () => {
    await delay(300);
    return { assetTag: `LAPTOP-${Math.floor(Math.random() * 9000 + 1000)}` };
  },
});

const addToPayroll = new Task({
  id: 'addToPayroll',
  dependsOn: ['createAccount'],
  run: async (ctx) => {
    await delay(250);
    return { payrollId: `PR-${ctx.results.createAccount.accountId}` };
  },
});

const sendWelcomeEmail = new Task({
  id: 'sendWelcomeEmail',
  dependsOn: ['provisionEmail'],
  run: async (ctx) => {
    await delay(100);
    return { sentTo: ctx.results.provisionEmail.email, status: 'sent' };
  },
});

const notifyManager = new Task({
  id: 'notifyManager',
  dependsOn: ['addToPayroll'],
  run: async () => {
    await delay(100);
    return { notified: true };
  },
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = new Workflow({
  id: 'employee-onboarding',
  description: 'Provisions accounts, hardware, payroll, and notifications for a new hire.',
  tasks: [
    createAccount,
    provisionEmail,
    provisionLaptop,
    addToPayroll,
    sendWelcomeEmail,
    notifyManager,
  ],
});
