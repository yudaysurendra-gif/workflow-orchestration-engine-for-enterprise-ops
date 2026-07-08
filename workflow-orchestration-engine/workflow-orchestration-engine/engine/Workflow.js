/**
 * Workflow.js
 * -----------
 * A Workflow is a named, versioned DAG of Task objects.
 * It validates the graph (no missing deps, no cycles) at construction time.
 */

class Workflow {
  /**
   * @param {Object} config
   * @param {string} config.id - Unique workflow identifier.
   * @param {string} [config.description]
   * @param {import('./Task')[]} config.tasks - Tasks that make up the DAG.
   */
  constructor({ id, description = '', tasks = [] }) {
    if (!id) throw new Error('Workflow requires an id');
    if (!Array.isArray(tasks) || tasks.length === 0) {
      throw new Error(`Workflow "${id}" must contain at least one task`);
    }

    this.id = id;
    this.description = description;
    this.tasks = new Map(tasks.map((t) => [t.id, t]));

    this._validateDependencies();
    this._detectCycles();
  }

  _validateDependencies() {
    for (const task of this.tasks.values()) {
      for (const depId of task.dependsOn) {
        if (!this.tasks.has(depId)) {
          throw new Error(
            `Workflow "${this.id}": task "${task.id}" depends on unknown task "${depId}"`
          );
        }
      }
    }
  }

  _detectCycles() {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map([...this.tasks.keys()].map((id) => [id, WHITE]));

    const visit = (id, path) => {
      color.set(id, GRAY);
      const task = this.tasks.get(id);
      for (const depId of task.dependsOn) {
        if (color.get(depId) === GRAY) {
          throw new Error(
            `Workflow "${this.id}": cycle detected involving task "${depId}" (path: ${[...path, id, depId].join(' -> ')})`
          );
        }
        if (color.get(depId) === WHITE) {
          visit(depId, [...path, id]);
        }
      }
      color.set(id, BLACK);
    };

    for (const id of this.tasks.keys()) {
      if (color.get(id) === WHITE) visit(id, []);
    }
  }

  /** Returns task ids grouped into levels that can run in parallel. */
  getExecutionLevels() {
    const remaining = new Set(this.tasks.keys());
    const done = new Set();
    const levels = [];

    while (remaining.size > 0) {
      const ready = [...remaining].filter((id) =>
        this.tasks.get(id).dependsOn.every((dep) => done.has(dep))
      );

      if (ready.length === 0) {
        // Should never happen since cycles are already detected, but guard anyway.
        throw new Error(`Workflow "${this.id}": unable to resolve execution order`);
      }

      levels.push(ready);
      ready.forEach((id) => {
        remaining.delete(id);
        done.add(id);
      });
    }

    return levels;
  }
}

module.exports = Workflow;
