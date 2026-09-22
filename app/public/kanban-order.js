import { orderTasksByDependency } from './gantt-dependencies.js';

export function orderTasksForKanban(tasks) {
  const dependencyOrder = orderTasksByDependency(tasks);
  const doneTasks = tasks.filter((task) => task.status === 'done').sort((a, b) =>
    (b.completed_at || '').localeCompare(a.completed_at || '') || b.id.localeCompare(a.id));

  return {
    activeTasks: dependencyOrder.tasks.filter((task) => task.status !== 'done'),
    doneTasks,
    unresolvedTaskIds: dependencyOrder.unresolvedTaskIds,
  };
}
