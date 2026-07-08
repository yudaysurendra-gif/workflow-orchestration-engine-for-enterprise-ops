/**
 * registry.js
 * -----------
 * Central registry of all available workflow definitions.
 * Add new workflow files to ./workflows and register them here.
 */

const employeeOnboarding = require('./employeeOnboarding');
const nightlyDataPipeline = require('./nightlyDataPipeline');

const registry = new Map();
[employeeOnboarding, nightlyDataPipeline].forEach((wf) => registry.set(wf.id, wf));

module.exports = registry;
