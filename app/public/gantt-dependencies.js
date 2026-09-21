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
      const turnX = Math.max(sourceBar.endX + 12, targetBar.startX + 12);
      paths.push({
        sourceId,
        targetId: target.id,
        d: `M ${sourceBar.endX} ${sourceBar.centerY} H ${turnX} V ${targetBar.centerY} H ${targetBar.startX}`
      });
    }
  }
  return paths;
}
