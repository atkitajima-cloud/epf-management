import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildGanttData, createTask, generateWbs, listRequirements, listTasks, parseMarkdown, progressForTask, serializeMarkdown, updateTask } from '../lib/markdown.js';

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
async function makeRoot(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'epf-management-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'tasks'));
  await fs.mkdir(path.join(root, 'requirements'));
  await fs.writeFile(path.join(root, 'requirements', 'REQ-0001.md'), '---\nid: REQ-0001\ntitle: 要件\n---\n', 'utf8');
  await fs.writeFile(path.join(root, 'tasks', 'EPF-0001.md'), serializeMarkdown(sample, '# Sample'), 'utf8');
  return root;
}

test('画面からのTask作成は共通の雛形を使い、planを書かず、往復できる', async (context) => {
  const root = await makeRoot(context);
  const created = await createTask(root, { title: '画面から', owner: 'tester', requirement: 'REQ-0001', depends_on: 'EPF-0001', status: 'ready' }, { strict: true });
  assert.equal(created.id, 'EPF-0002');
  const source = await fs.readFile(path.join(root, 'tasks', 'EPF-0002.md'), 'utf8');
  assert.doesNotMatch(source, /^plan:/m);
  const parsed = parseMarkdown(source);
  assert.equal(parsed.data.status, 'ready');
  assert.equal(parsed.body.trim(), '# 背景\n\n（未記入）\n\n# 目的\n\n（未記入）\n\n# 完了条件\n\n- [ ] \n- [ ] \n- [ ] \n\n# 関連\n\n（未記入）');
  const own = await createTask(root, { title: '本文あり', owner: 'tester', requirement: 'REQ-0001', body: '# 独自' }, { strict: true });
  assert.equal(own.body, '# 独自');
  assert.deepEqual(await listRequirements(root), [{ id: 'REQ-0001', title: '要件' }]);
});

test('画面からのTask作成は不正な入力を補完せず、ファイルを作らない', async (context) => {
  const root = await makeRoot(context);
  const valid = { title: 'ok', owner: 'tester', requirement: 'REQ-0001' };
  const cases = [
    { ...valid, title: '' },
    { ...valid, owner: '' },
    { ...valid, status: 'unknown' },
    { ...valid, priority: 'urgent' },
    { ...valid, start: '2026/09/01' },
    { ...valid, start: '2026-09-10', due: '2026-09-01' },
    { ...valid, requirement: '' },
    { ...valid, requirement: 'REQ-9999' },
    { ...valid, depends_on: 'EPF-9999' }
  ];
  for (const input of cases) await assert.rejects(createTask(root, input, { strict: true }), undefined, JSON.stringify(input));
  assert.equal((await listTasks(root)).length, 1);
});

test('AIチャット用の作成は従来どおり補完し、planを書かない', async (context) => {
  const root = await makeRoot(context);
  const created = await createTask(root, { title: '', requirement: 'bad', status: 'bad' });
  assert.equal(created.title, '新しいタスク');
  assert.equal(created.requirement, 'REQ-0001');
  assert.equal(created.status, 'backlog');
  assert.doesNotMatch(await fs.readFile(path.join(root, 'tasks', `${created.id}.md`), 'utf8'), /^plan:/m);
});

test('同時作成してもIDが重複しない', async (context) => {
  const root = await makeRoot(context);
  const results = await Promise.all(Array.from({ length: 4 }, (_, index) =>
    createTask(root, { title: `t${index}`, owner: 'tester', requirement: 'REQ-0001' }, { strict: true })));
  assert.equal(new Set(results.map((task) => task.id)).size, 4);
});
