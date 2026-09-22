import { orderTasksByDependency } from './gantt-dependencies.js';

export function orderTasksForKanban(tasks) {
  const tasksWithDependencies = tasks.map((task) => ({
    ...task,
    dependencies: Array.isArray(task.dependencies)
      ? task.dependencies
      : String(task.depends_on || '').split(',').map((id) => id.trim()).filter(Boolean),
  }));
  const dependencyOrder = orderTasksByDependency(tasksWithDependencies);
  const doneTasks = tasks.filter((task) => task.status === 'done').sort((a, b) =>
    (b.completed_at || '').localeCompare(a.completed_at || '') || b.id.localeCompare(a.id));

  return {
    activeTasks: dependencyOrder.tasks.filter((task) => task.status !== 'done'),
    doneTasks,
    unresolvedTaskIds: dependencyOrder.unresolvedTaskIds,
  };
}
