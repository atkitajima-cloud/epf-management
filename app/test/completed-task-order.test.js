import assert from 'node:assert/strict';
import test from 'node:test';
import { sortTasksForBoard } from '../lib/markdown.js';
import { formatCompletionTimestamp, orderTasksForKanban } from '../public/kanban-order.js';

const doneTasks = [
  { id: 'EPF-0001', status: 'done', completed_at: '2026-09-27', actual_completed_at: '2026-09-27T01:02:03.000Z' },
  { id: 'EPF-0002', status: 'done', completed_at: '2026-09-27', actual_completed_at: '2026-09-27T03:02:03.000Z' },
  { id: 'EPF-0003', status: 'done', completed_at: '2026-09-27' },
  { id: 'EPF-0004', status: 'done', completed_at: '2026-09-27' },
];

test('common board sorting orders completed tasks by timestamp', () => {
  const sorted = sortTasksForBoard([{ id: 'EPF-0005', status: 'ready' }, ...doneTasks]);
  assert.deepEqual(sorted.map((task) => task.id), ['EPF-0005', 'EPF-0002', 'EPF-0001', 'EPF-0004', 'EPF-0003']);
});

test('Kanban sorting and timestamp display retain a stable fallback', () => {
  const sorted = orderTasksForKanban(doneTasks).doneTasks;
  assert.deepEqual(sorted.map((task) => task.id), ['EPF-0002', 'EPF-0001', 'EPF-0004', 'EPF-0003']);
  assert.equal(formatCompletionTimestamp(sorted[0]), '2026/09/27 12:02:03');
  assert.equal(formatCompletionTimestamp(sorted[2]), '2026/09/27');
});
