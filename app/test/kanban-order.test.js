import assert from 'node:assert/strict';
import test from 'node:test';
import { orderTasksForKanban } from '../public/kanban-order.js';

test('未完了Taskを依存順、完了Taskを完了日降順に並べる', () => {
  const result = orderTasksForKanban([
    { id: 'EPF-0030', status: 'ready', depends_on: 'EPF-0028' },
    { id: 'EPF-0027', status: 'ready', depends_on: '' },
    { id: 'EPF-0001', status: 'done', completed_at: '2026-09-21', depends_on: '' },
    { id: 'EPF-0028', status: 'ready', depends_on: '' },
    { id: 'EPF-0002', status: 'done', completed_at: '2026-09-22', depends_on: '' },
  ]);

  assert.deepEqual(result.activeTasks.map((task) => task.id), ['EPF-0027', 'EPF-0028', 'EPF-0030']);
  assert.deepEqual(result.doneTasks.map((task) => task.id), ['EPF-0002', 'EPF-0001']);
  assert.deepEqual(result.unresolvedTaskIds, []);
});
