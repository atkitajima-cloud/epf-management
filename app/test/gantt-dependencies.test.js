import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDependencyPaths, orderTasksByDependency } from '../public/gantt-dependencies.js';

test('表示中かつ日程設定済みの依存関係だけを矢印線にする', () => {
  const tasks = [
    { id: 'EPF-0001', dependencies: [] },
    { id: 'EPF-0002', dependencies: ['EPF-0001', 'EPF-9999'] },
    { id: 'EPF-0003', dependencies: ['EPF-0003'] }
  ];
  const bars = new Map([
    ['EPF-0001', { startX: 10, endX: 50, centerY: 20 }],
    ['EPF-0002', { startX: 80, endX: 120, centerY: 81 }]
  ]);
  assert.deepEqual(buildDependencyPaths(tasks, bars), [{
    sourceId: 'EPF-0001', targetId: 'EPF-0002', d: 'M 50 20 H 134 V 81'
  }]);
});

test('先行Taskが後続Taskより下にあっても矢印線を作る', () => {
  const tasks = [
    { id: 'EPF-0002', dependencies: ['EPF-0001'] },
    { id: 'EPF-0001', dependencies: [] }
  ];
  const bars = new Map([
    ['EPF-0001', { startX: 100, endX: 140, centerY: 90 }],
    ['EPF-0002', { startX: 160, endX: 200, centerY: 25 }]
  ]);
  assert.deepEqual(buildDependencyPaths(tasks, bars), [{
    sourceId: 'EPF-0001', targetId: 'EPF-0002', d: 'M 140 90 H 214 V 25'
  }]);
});

test('依存関係を満たしつつ独立Taskの順序を維持して並べる', () => {
  const result = orderTasksByDependency([
    { id: 'EPF-0003', dependencies: ['EPF-0002'] },
    { id: 'EPF-0004', dependencies: [] },
    { id: 'EPF-0002', dependencies: ['EPF-0001'] },
    { id: 'EPF-0001', dependencies: [] }
  ]);
  assert.deepEqual(result.tasks.map((task) => task.id), ['EPF-0004', 'EPF-0001', 'EPF-0002', 'EPF-0003']);
  assert.deepEqual(result.unresolvedTaskIds, []);
});

test('フィルタ外の先行Taskは表示中Taskの並びを制約しない', () => {
  const result = orderTasksByDependency([
    { id: 'EPF-0002', dependencies: ['EPF-0001'] },
    { id: 'EPF-0003', dependencies: [] }
  ]);
  assert.deepEqual(result.tasks.map((task) => task.id), ['EPF-0002', 'EPF-0003']);
  assert.deepEqual(result.unresolvedTaskIds, []);
});

test('循環依存とその後続を末尾へ残して警告対象にする', () => {
  const result = orderTasksByDependency([
    { id: 'EPF-0001', dependencies: ['EPF-0002'] },
    { id: 'EPF-0002', dependencies: ['EPF-0001'] },
    { id: 'EPF-0003', dependencies: [] },
    { id: 'EPF-0004', dependencies: ['EPF-0001'] }
  ]);
  assert.deepEqual(result.tasks.map((task) => task.id), ['EPF-0003', 'EPF-0001', 'EPF-0002', 'EPF-0004']);
  assert.deepEqual(result.unresolvedTaskIds, ['EPF-0001', 'EPF-0002', 'EPF-0004']);
});

test('同時に着手できるTaskは開始日の早い順に並べる', () => {
  const result = orderTasksByDependency([
    { id: 'EPF-0001', start: '2026-09-27', dependencies: ['EPF-0003'] },
    { id: 'EPF-0002', start: '2026-09-26', dependencies: [] },
    { id: 'EPF-0003', start: '2026-09-25', dependencies: [] },
    { id: 'EPF-0004', start: '2026-09-24', dependencies: [] }
  ]);
  assert.deepEqual(result.tasks.map((task) => task.id), ['EPF-0004', 'EPF-0003', 'EPF-0002', 'EPF-0001']);
});

test('開始日のないTaskは開始日のあるTaskより後ろへ置く', () => {
  const result = orderTasksByDependency([
    { id: 'EPF-0001', start: '', dependencies: [] },
    { id: 'EPF-0002', start: '2026-09-30', dependencies: [] },
    { id: 'EPF-0003', start: '', dependencies: [] }
  ]);
  assert.deepEqual(result.tasks.map((task) => task.id), ['EPF-0002', 'EPF-0001', 'EPF-0003']);
});
