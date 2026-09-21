import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildGanttData, createTask, generateWbs, listOwners, listRequirements, listTasks, parseMarkdown, readTask, progressForTask, serializeMarkdown, sortTasksForBoard, updateTask, validateTask } from '../lib/markdown.js';

const sample = {
  id: 'EPF-0001', title: 'Sample', status: 'backlog', owner: 'tester',
  priority: 'medium', target_repo: 'common', start: '2026-09-20', due: '2026-09-30', depends_on: '', requirement: 'REQ-0001', plan: 'PLAN-0001'
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
  await fs.mkdir(path.join(root, 'masters'));
  await fs.writeFile(path.join(root, 'masters', 'owners.md'), '- unassigned\n- tester\n- agent\n', 'utf8');
  await fs.writeFile(path.join(root, 'tasks', 'EPF-0001.md'), serializeMarkdown(sample, '# Sample'), 'utf8');

  const created = await createTask(root, {
    title: '新しいTask', owner: 'tester', priority: 'high', body: '# 目的\n\nTest'
  });
  assert.equal(created.id, 'EPF-0002');
  assert.equal((await listTasks(root)).length, 2);

  const updated = await updateTask(root, 'EPF-0002', { status: 'doing', owner: 'agent' });
  assert.equal(updated.status, 'doing');
  assert.equal(updated.owner, 'agent');
  assert.equal(updated.target_repo, 'common');

  const result = await generateWbs(root);
  assert.equal(result.taskCount, 2);
  const wbs = await fs.readFile(path.join(root, 'views', 'wbs.md'), 'utf8');
  assert.match(wbs, /EPF-0002/);
  assert.match(wbs, /Target repo/);
  assert.match(wbs, /新しいTask/);
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
  await fs.mkdir(path.join(root, 'masters'));
  await fs.writeFile(path.join(root, 'masters', 'owners.md'), '# 担当者\n\n- unassigned\n- tester\n- agent\n', 'utf8');
  await fs.writeFile(path.join(root, 'requirements', 'REQ-0001.md'), '---\nid: REQ-0001\ntitle: 要件\n---\n', 'utf8');
  await fs.writeFile(path.join(root, 'tasks', 'EPF-0001.md'), serializeMarkdown(sample, '# Sample'), 'utf8');
  return root;
}

test('画面からのTask作成は共通の雛形を使い、planを書かず、往復できる', async (context) => {
  const root = await makeRoot(context);
  const created = await createTask(root, { title: '画面から', owner: 'tester', requirement: 'REQ-0001', depends_on: 'EPF-0001', status: 'ready' });
  assert.equal(created.id, 'EPF-0002');
  const source = await fs.readFile(path.join(root, 'tasks', 'EPF-0002.md'), 'utf8');
  assert.doesNotMatch(source, /^plan:/m);
  const parsed = parseMarkdown(source);
  assert.equal(parsed.data.status, 'ready');
  assert.equal(parsed.data.target_repo, 'common');
  assert.equal(parsed.body.trim(), '# 背景\n\n（未記入）\n\n# 目的\n\n（未記入）\n\n# 完了条件\n\n- [ ] \n- [ ] \n- [ ] \n\n# 関連\n\n（未記入）');
  const own = await createTask(root, { title: '本文あり', owner: 'tester', requirement: 'REQ-0001', body: '# 独自' });
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
    { ...valid, target_repo: 'unknown' },
    { ...valid, start: '2026/09/01' },
    { ...valid, start: '2026-09-10', due: '2026-09-01' },
    { ...valid, requirement: 'REQ-9999' },
    { ...valid, requirement: 'bad' },
    { ...valid, depends_on: 'EPF-9999' }
  ];
  for (const input of cases) await assert.rejects(createTask(root, input), undefined, JSON.stringify(input));
  assert.equal((await listTasks(root)).length, 1);
});

test('対象リポジトリを作成・更新でき、旧repo項目は保存しない', async (context) => {
  const root = await makeRoot(context);
  const created = await createTask(root, { title: 'backend Task', owner: 'tester', target_repo: 'epf-backend' });
  assert.equal(created.target_repo, 'epf-backend');
  const updated = await updateTask(root, created.id, { target_repo: 'epf-frontend' });
  assert.equal(updated.target_repo, 'epf-frontend');
  const source = await fs.readFile(path.join(root, 'tasks', `${created.id}.md`), 'utf8');
  assert.match(source, /^target_repo: epf-frontend$/m);
  assert.doesNotMatch(source, /^(frontend_repo|backend_repo):/m);
  await assert.rejects(updateTask(root, created.id, { target_repo: 'invalid' }), /target_repo/);
});

test('完了日を自動記録し、完了Taskを新しい順に並べる', async (context) => {
  const root = await makeRoot(context);
  const created = await createTask(root, { title: '完了で作成', owner: 'tester', status: 'done' });
  assert.match(created.completed_at, /^\d{4}-\d{2}-\d{2}$/);
  const completed = await updateTask(root, 'EPF-0001', { status: 'done' });
  assert.match(completed.completed_at, /^\d{4}-\d{2}-\d{2}$/);
  const reopened = await updateTask(root, 'EPF-0001', { status: 'ready' });
  assert.equal(reopened.completed_at, '');
  const recompleted = await updateTask(root, 'EPF-0001', { status: 'done' });
  assert.match(recompleted.completed_at, /^\d{4}-\d{2}-\d{2}$/);
  assert.throws(() => validateTask({ ...sample, status: 'done', completed_at: '' }), /completed_at/);
  const sorted = sortTasksForBoard([
    { ...sample, id: 'EPF-0001', status: 'done', completed_at: '2026-09-20' },
    { ...sample, id: 'EPF-0002', status: 'done', completed_at: '2026-09-21' },
    { ...sample, id: 'EPF-0003', status: 'done', completed_at: '' },
    { ...sample, id: 'EPF-0004', status: 'ready', completed_at: '' }
  ]);
  assert.deepEqual(sorted.map((task) => task.id), ['EPF-0004', 'EPF-0002', 'EPF-0001', 'EPF-0003']);
});

test('Requirementは空欄でTaskを作成でき、一覧・更新・WBSでも不正扱いにならない', async (context) => {
  const root = await makeRoot(context);
  await fs.mkdir(path.join(root, 'views'));
  const created = await createTask(root, { title: 'Requirementなし', owner: 'tester' });
  assert.equal(created.requirement, '');
  assert.match(await fs.readFile(path.join(root, 'tasks', `${created.id}.md`), 'utf8'), /^requirement:$/m);
  const listed = (await listTasks(root)).find((task) => task.id === created.id);
  assert.equal(listed.invalid, undefined);
  assert.equal((await updateTask(root, created.id, { status: 'doing' })).status, 'doing');
  await generateWbs(root);
  assert.match(await fs.readFile(path.join(root, 'views', 'wbs.md'), 'utf8'), /Requirementなし .*\| - \|$/m);
  assert.equal(buildGanttData(await listTasks(root)).tasks.length, 2);
});

test('同時作成してもIDが重複しない', async (context) => {
  const root = await makeRoot(context);
  const results = await Promise.all(Array.from({ length: 4 }, (_, index) =>
    createTask(root, { title: `t${index}`, owner: 'tester', requirement: 'REQ-0001' })));
  assert.equal(new Set(results.map((task) => task.id)).size, 4);
});

test('担当者マスタは「- ID」形式の行だけを読み、重複と不正な行を除く', async (context) => {
  const root = await makeRoot(context);
  await fs.writeFile(path.join(root, 'masters', 'owners.md'),
    '# 担当者マスタ\r\n\r\n説明文\r\n\r\n- unassigned\r\n- sato\r\n- sato\r\n- bad name\r\n-nospace\r\n  - indented\r\n- ai-team_2\r\n', 'utf8');
  assert.deepEqual(await listOwners(root), ['unassigned', 'sato', 'ai-team_2']);
  await fs.rm(path.join(root, 'masters'), { recursive: true });
  assert.deepEqual(await listOwners(root), []);
});

test('画面からの作成は、マスタにない担当者を拒否してファイルを作らない', async (context) => {
  const root = await makeRoot(context);
  await assert.rejects(createTask(root, { title: 'x', owner: 'stranger' }), /stranger.*担当者マスタ/);
  assert.equal((await listTasks(root)).length, 1);
  assert.equal((await createTask(root, { title: 'x', owner: 'agent' })).owner, 'agent');
});

test('更新は担当者を変更するときだけマスタと照合する', async (context) => {
  const root = await makeRoot(context);
  await fs.writeFile(path.join(root, 'tasks', 'EPF-0001.md'), serializeMarkdown({ ...sample, owner: 'legacy' }, '# Sample'), 'utf8');
  const before = await fs.readFile(path.join(root, 'tasks', 'EPF-0001.md'), 'utf8');
  assert.equal((await updateTask(root, 'EPF-0001', { status: 'doing' })).owner, 'legacy');
  assert.equal((await updateTask(root, 'EPF-0001', { owner: 'legacy', title: '改題' })).owner, 'legacy');
  await assert.rejects(updateTask(root, 'EPF-0001', { owner: 'stranger' }), /stranger.*担当者マスタ/);
  assert.equal((await readTask(root, 'EPF-0001')).owner, 'legacy');
  assert.equal((await updateTask(root, 'EPF-0001', { owner: 'agent' })).owner, 'agent');
  assert.notEqual(before, await fs.readFile(path.join(root, 'tasks', 'EPF-0001.md'), 'utf8'));
});

test('マスタがない場合は、作成と担当者の変更を理由付きで拒否する', async (context) => {
  const root = await makeRoot(context);
  await fs.rm(path.join(root, 'masters'), { recursive: true });
  await assert.rejects(createTask(root, { title: 'x', owner: 'tester' }), /masters\/owners\.md/);
  await assert.rejects(createTask(root, { title: 'x', owner: 'tester' }), /masters\/owners\.md/);
  await assert.rejects(updateTask(root, 'EPF-0001', { owner: 'agent' }), /masters\/owners\.md/);
  assert.equal((await updateTask(root, 'EPF-0001', { status: 'doing' })).status, 'doing');
  assert.equal((await listTasks(root)).length, 1);
});

test('WBSは生成日時を含まず、Taskと基準日が同じなら再生成しても内容が変わらない', async (context) => {
  const root = await makeRoot(context);
  await fs.mkdir(path.join(root, 'views'));
  await generateWbs(root, '2026-09-19');
  const first = await fs.readFile(path.join(root, 'views', 'wbs.md'), 'utf8');
  await new Promise((resolve) => setTimeout(resolve, 20));
  await generateWbs(root, '2026-09-19');
  assert.equal(await fs.readFile(path.join(root, 'views', 'wbs.md'), 'utf8'), first);
  assert.doesNotMatch(first, /生成日時|20\d\d-\d\d-\d\dT/);
  assert.match(first, /EPF-0001/);
});
