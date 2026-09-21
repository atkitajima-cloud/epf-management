export function buildDependencyPaths(tasks, bars) {
  const visible = new Map(tasks.map((task) => [task.id, task]));
  const paths = [];
  for (const target of tasks) {
    const targetBar = bars.get(target.id);
    if (!targetBar) continue;
    for (const sourceId of target.dependencies || []) {
      const source = visible.get(sourceId);
      const sourceBar = bars.get(sourceId);
      if (!source || !sourceBar || sourceId === target.id) continue;
      const turnX = Math.max(sourceBar.endX, targetBar.endX) + 14;
      paths.push({
        sourceId,
        targetId: target.id,
        d: `M ${sourceBar.endX} ${sourceBar.centerY} H ${turnX} V ${targetBar.centerY}`
      });
    }
  }
  return paths;
}

export function orderTasksByDependency(tasks) {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const order = new Map(tasks.map((task, index) => [task.id, index]));
  const indegree = new Map(tasks.map((task) => [task.id, 0]));
  const dependents = new Map(tasks.map((task) => [task.id, []]));

  for (const target of tasks) {
    const sources = new Set((target.dependencies || []).filter((sourceId) => tasksById.has(sourceId)));
    for (const sourceId of sources) {
      indegree.set(target.id, indegree.get(target.id) + 1);
      dependents.get(sourceId).push(target.id);
    }
  }

  const compareByOriginalOrder = (left, right) => order.get(left) - order.get(right);
  const ready = tasks.filter((task) => indegree.get(task.id) === 0).map((task) => task.id);
  ready.sort(compareByOriginalOrder);
  const orderedIds = [];
  while (ready.length) {
    const sourceId = ready.shift();
    orderedIds.push(sourceId);
    for (const targetId of dependents.get(sourceId)) {
      indegree.set(targetId, indegree.get(targetId) - 1);
      if (indegree.get(targetId) === 0) {
        ready.push(targetId);
        ready.sort(compareByOriginalOrder);
      }
    }
  }

  const unresolvedTaskIds = tasks.filter((task) => !orderedIds.includes(task.id)).map((task) => task.id);
  return {
    tasks: [...orderedIds, ...unresolvedTaskIds].map((id) => tasksById.get(id)),
    unresolvedTaskIds
  };
}
