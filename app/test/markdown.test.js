import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildGanttData, createTask, generateWbs, listTasks, parseMarkdown, progressForTask, serializeMarkdown, updateTask } from '../lib/markdown.js';

const sample = {
  id: 'EPF-0001', title: 'Sample', status: 'backlog', owner: 'tester',
  priority: 'medium', start: '2026-09-20', due: '2026-09-30', depends_on: '', requirement: 'REQ-0001', plan: 'PLAN-0001'
};

test('Front Matterと本文を往復できる', () => {
  const source = serializeMarkdown(sample, '# 完了条件\n\n- [ ] test');
  const parsed = parseMarkdown(source);
  assert.deepEqual(parsed.data, sample);
  assert.match(parsed.body, /完了条件/);
});

test('Task作成・status更新・WBS生成がMarkdownへ反映される', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'epf-management-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'tasks'));
  await fs.mkdir(path.join(root, 'views'));
  await fs.writeFile(path.join(root, 'tasks', 'EPF-0001.md'), serializeMarkdown(sample, '# Sample'), 'utf8');

  const created = await createTask(root, {
    title: 'AI created', priority: 'high', requirement: 'REQ-0001', body: '# 目的\n\nTest'
  });
  assert.equal(created.id, 'EPF-0002');
  assert.equal((await listTasks(root)).length, 2);

  const updated = await updateTask(root, 'EPF-0002', { status: 'doing', owner: 'agent' });
  assert.equal(updated.status, 'doing');
  assert.equal(updated.owner, 'agent');

  const result = await generateWbs(root);
  assert.equal(result.taskCount, 2);
  const wbs = await fs.readFile(path.join(root, 'views', 'wbs.md'), 'utf8');
  assert.match(wbs, /EPF-0002/);
  assert.match(wbs, /AI created/);
});

test('ガント用の進捗率と遅延判定をTask正本から生成できる', () => {
  const tasks = [
    { ...sample, id: 'EPF-0001', status: 'done', body: '# 完了条件\n\n- [x] 完了', depends_on: '' },
    { ...sample, id: 'EPF-0002', status: 'doing', start: '2026-09-01', due: '2026-09-18', depends_on: 'EPF-0001', body: '# 完了条件\n\n- [x] 調査\n- [ ] 実装' },
    { ...sample, id: 'EPF-0003', status: 'ready', start: '', due: '', depends_on: 'EPF-9999', body: '# 完了条件\n\n- [ ] 確認' }
  ];
  assert.deepEqual(progressForTask(tasks[1]), { value: 50, estimated: false, completed: 1, total: 2 });
  const gantt = buildGanttData(tasks, '2026-09-19');
  assert.equal(gantt.tasks.find((task) => task.id === 'EPF-0001').scheduleStatus, 'done');
  assert.equal(gantt.tasks.find((task) => task.id === 'EPF-0002').scheduleStatus, 'overdue');
  assert.equal(gantt.tasks.find((task) => task.id === 'EPF-0003').scheduleStatus, 'unscheduled');
  assert.match(gantt.warnings[0].message, /存在しない先行Task/);
});