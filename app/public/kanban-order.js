import { orderTasksByDependency } from './gantt-dependencies.js';

function completedAt(task) {
  return Date.parse(task.actual_completed_at || '')
    || Date.parse(`${task.completed_at || ''}T00:00:00Z`)
    || Number.NEGATIVE_INFINITY;
}

export function formatCompletionTimestamp(task) {
  if (!task.actual_completed_at) return task.completed_at?.replaceAll('-', '/') || '日付不明';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).format(new Date(task.actual_completed_at));
}

export function orderTasksForKanban(tasks) {
  const tasksWithDependencies = tasks.map((task) => ({
    ...task,
    dependencies: Array.isArray(task.dependencies)
      ? task.dependencies
      : String(task.depends_on || '').split(',').map((id) => id.trim()).filter(Boolean),
  }));
  const dependencyOrder = orderTasksByDependency(tasksWithDependencies);
  const doneTasks = tasks.filter((task) => task.status === 'done').sort((a, b) =>
    completedAt(b) - completedAt(a) || b.id.localeCompare(a.id));

  return {
    activeTasks: dependencyOrder.tasks.filter((task) => task.status !== 'done'),
    doneTasks,
    unresolvedTaskIds: dependencyOrder.unresolvedTaskIds,
  };
}
