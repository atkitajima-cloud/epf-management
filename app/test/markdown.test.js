import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { BODY_TEMPLATE, buildGanttData, createTask, deleteTask, generateWbs, listOwners, listRequirements, listTasks, parseMarkdown, readTask, progressForTask, serializeMarkdown, sortTasksForBoard, TARGET_REPOSITORIES, TARGET_REPOSITORY_OPTIONS, taskIdForDate, updateTask, validateTask, vscodeUriForTask } from '../lib/markdown.js';

const sample = {
  id: 'EPF-0001', title: 'Sample', status: 'backlog', owner: 'tester',
  priority: 'medium', target_repo: 'common', start: '2026-09-20', due: '2026-09-30', depends_on: '', requirement: 'REQ-0001', exec_plan: 'epf-management/plans/PLAN-0001.md'
};

async function updateCurrent(root, id, changes) {
  const current = await readTask(root, id);
  return updateTask(root, id, changes, current.revision);
}

test('ReviewからDoneへ一度の状態変更で完了日時を記録する', async (context) => {
  const root = await makeRoot(context);
  await updateCurrent(root, 'EPF-0001', { body: '# 完了条件\n\n- [x] 完了' });
  await updateCurrent(root, 'EPF-0001', { status: 'review' });
  const completed = await updateCurrent(root, 'EPF-0001', { status: 'done' });
  assert.equal(completed.status, 'done');
  assert.match(completed.actual_completed_at, /Z$/);
  assert.match(completed.completed_at, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(completed.accepted_by ?? '', '');
  const reopened = await updateCurrent(root, 'EPF-0001', { status: 'ready' });
  assert.equal(reopened.actual_completed_at ?? '', '');
  assert.equal(reopened.completed_at, '');
});

test('Review以外からDoneへの状態変更は拒否する', async (context) => {
  const root = await makeRoot(context);
  await assert.rejects(updateCurrent(root, 'EPF-0001', { status: 'done' }), /review状態/);
  await updateCurrent(root, 'EPF-0001', { status: 'doing' });
  await assert.rejects(updateCurrent(root, 'EPF-0001', { status: 'done' }), /review状態/);
});

test('未チェックの完了条件があるTaskはReviewへ進めない', async (context) => {
  const root = await makeRoot(context);
  await updateCurrent(root, 'EPF-0001', { body: '# 完了条件\n\n- [ ] 未完了' });
  await assert.rejects(updateCurrent(root, 'EPF-0001', { status: 'review' }), /未チェックの完了条件/);
  assert.equal((await readTask(root, 'EPF-0001')).status, 'backlog');
  await updateCurrent(root, 'EPF-0001', { body: '# 完了条件\n\n- [x] 完了' });
  await updateCurrent(root, 'EPF-0001', { status: 'review' });
  const completed = await updateCurrent(root, 'EPF-0001', { status: 'done' });
  assert.equal(completed.status, 'done');
});

test('Front Matterと本文を往復できる', () => {
  const source = serializeMarkdown(sample, '# 完了条件\n\n- [ ] test');
  const parsed = parseMarkdown(source);
  assert.deepEqual(parsed.data, sample);
  assert.match(parsed.body, /完了条件/);
});

test('exec_planは旧Planまたは主Task IDを含むExecPlanだけを受け入れる', () => {
  const valid = [
    'epf-management/plans/PLAN-0001.md',
    'epf-management/plans/PLAN-0016-target-repository-validation.md',
    'epf-project/docs/exec-plans/active/EP-PJ-0048-01.md',
    'epf-backend/docs/exec-plans/completed/EP-BE-20260926-143204-441-02.md'
  ];
  for (const exec_plan of valid) validateTask({ ...sample, exec_plan });

  const invalid = [
    'PLAN-0001',
    'epf-project/docs/exec-plans/active/EP-MG-0048-01.md',
    'epf-project/docs/exec-plans/active/EP-PJ-0048.md',
    'epf-project/docs/exec-plans/active/EP-PJ-0048-001.md',
    'epf-project/docs/exec-plans/active/EP-PJ-0048-日本語名.md'
  ];
  for (const exec_plan of invalid) assert.throws(() => validateTask({ ...sample, exec_plan }), /exec_plan/);
  assert.throws(() => validateTask({ ...sample, plan: 'PLAN-0001' }), /plan/);
  const serialized = serializeMarkdown({ ...sample, plan: 'PLAN-0001' }, '# Sample');
  assert.doesNotMatch(serialized, /^plan:/m);
});

test('exec_planはTask更新で保存され、読み直しても保持される', async (context) => {
  const root = await makeRoot(context);
  const exec_plan = 'epf-project/docs/exec-plans/active/EP-PJ-0048-01.md';
  const updated = await updateCurrent(root, 'EPF-0001', { exec_plan });
  assert.equal(updated.exec_plan, exec_plan);
  assert.equal((await readTask(root, 'EPF-0001')).exec_plan, exec_plan);
  assert.match(await fs.readFile(path.join(root, 'tasks', 'EPF-0001.md'), 'utf8'), /^exec_plan: epf-project\/docs\/exec-plans\/active\/EP-PJ-0048-01\.md$/m);
});

test('未完了Taskを論理削除してdone列に残し、削除済みTaskは変更できない', async (context) => {
  const root = await makeRoot(context);
  const current = await readTask(root, 'EPF-0001');
  const deleted = await deleteTask(root, 'EPF-0001', current.revision);
  assert.equal(deleted.id, 'EPF-0001');
  assert.match(deleted.deleted_at, /Z$/);
  const saved = await readTask(root, 'EPF-0001');
  assert.equal(saved.status, 'done');
  assert.equal(saved.deleted_at, deleted.deleted_at);
  assert.equal(saved.accepted_by ?? '', '');
  assert.equal((await listTasks(root)).some((task) => task.id === 'EPF-0001'), true);
  await assert.rejects(deleteTask(root, 'EPF-0001', saved.revision), /すでに削除済み/);
  await assert.rejects(updateTask(root, 'EPF-0001', { title: '変更' }, saved.revision), /削除済みTaskは変更できません/);
});

test('Task MarkdownだけをVS Code URLへ変換できる', () => {
  assert.equal(taskIdForDate(new Date('2026-09-25T03:04:05.006Z')), 'EPF-20260925-120405-006');
  const uri = vscodeUriForTask('C:\\workspace with space\\epf-management', 'EPF-0001');
  assert.match(uri, /^vscode:\/\/file\//);
  assert.match(uri, /epf-management\/tasks\/EPF-0001\.md$/);
  assert.match(uri, /workspace%20with%20space/);
  assert.throws(() => vscodeUriForTask('C:\\workspace\\epf-management', '../README'), /不正なTask ID/);
  const timestampUri = vscodeUriForTask('C:\\workspace\\epf-management', 'EPF-20260925123456789');
  assert.match(timestampUri, /EPF-20260925123456789\.md$/);
  const formattedTimestampUri = vscodeUriForTask('C:\\workspace\\epf-management', 'EPF-20260925-123456-789');
  assert.match(formattedTimestampUri, /EPF-20260925-123456-789\.md$/);
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
    title: '新しいTask', owner: 'tester', priority: 'high', body: BODY_TEMPLATE,
  }, { clock: () => new Date('2026-09-25T03:04:05.006Z') });
  assert.equal(created.id, taskIdForDate(new Date('2026-09-25T03:04:05.006Z')));
  assert.match(created.id, /^EPF-\d{8}-\d{6}-\d{3}$/);
  assert.equal((await listTasks(root)).length, 2);

  const updated = await updateCurrent(root, created.id, { status: 'doing', owner: 'agent' });
  assert.equal(updated.status, 'doing');
  assert.equal(updated.owner, 'agent');
  assert.equal(updated.target_repo, 'common');

  const result = await generateWbs(root);
  assert.equal(result.taskCount, 2);
  const wbs = await fs.readFile(path.join(root, 'views', 'wbs.md'), 'utf8');
  assert.match(wbs, new RegExp(created.id));
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
  assert.equal(gantt.summary.unfinished, 2);
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

test('画面からのTask作成は共通の雛形を使い、exec_planを書き、往復できる', async (context) => {
  const root = await makeRoot(context);
  const created = await createTask(root, { title: '画面から', owner: 'tester', requirement: 'REQ-0001', depends_on: 'EPF-0001', status: 'ready' }, { clock: () => new Date('2026-09-25T03:04:05.010Z') });
  assert.match(created.id, /^EPF-\d{8}-\d{6}-\d{3}$/);
  const source = await fs.readFile(path.join(root, 'tasks', `${created.id}.md`), 'utf8');
  assert.doesNotMatch(source, /^plan:/m);
  assert.match(source, /^exec_plan:$/m);
  const parsed = parseMarkdown(source);
  assert.equal(parsed.data.status, 'ready');
  assert.equal(parsed.data.target_repo, 'common');
  assert.equal(parsed.body.trim(), BODY_TEMPLATE.trim());
  const own = await createTask(root, { title: '本文あり', owner: 'tester', requirement: 'REQ-0001', body: BODY_TEMPLATE.replace('（未記入）', '独自') }, { clock: () => new Date('2026-09-25T03:04:05.011Z') });
  assert.match(own.body, /独自/);
  await assert.rejects(createTask(root, { title: '見出しなし', owner: 'tester', body: '# 独自' }), /見出しが必要/);
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
  const updated = await updateCurrent(root, created.id, { target_repo: 'epf-frontend' });
  assert.equal(updated.target_repo, 'epf-frontend');
  const source = await fs.readFile(path.join(root, 'tasks', `${created.id}.md`), 'utf8');
  assert.match(source, /^target_repo: epf-frontend$/m);
  assert.doesNotMatch(source, /^(frontend_repo|backend_repo):/m);
  await assert.rejects(updateCurrent(root, created.id, { target_repo: 'invalid' }), /target_repo/);
});

test('対象リポジトリの保存値・表示名・色は共通定義から導出される', () => {
  assert.deepEqual(TARGET_REPOSITORIES, TARGET_REPOSITORY_OPTIONS.map((repository) => repository.value));
  assert.deepEqual(TARGET_REPOSITORY_OPTIONS.find((repository) => repository.value === 'epf-backend'), {
    value: 'epf-backend', label: 'backend', color: '#2869b4', background: '#e4f0ff'
  });
  assert.throws(() => validateTask({ ...sample, target_repo: 'backend' }), /target_repo/);
});

test('Markdown直接編集による無効な対象repoのTaskはIDと理由を保持して返す', async (context) => {
  const root = await makeRoot(context);
  await fs.writeFile(path.join(root, 'tasks', 'EPF-0002.md'), serializeMarkdown({ ...sample, id: 'EPF-0002', target_repo: 'backend' }, '# 不正値'), 'utf8');
  const invalid = (await listTasks(root)).find((task) => task.id === 'EPF-0002');
  assert.equal(invalid.invalid, true);
  assert.match(invalid.error, /target_repo/);
  assert.equal(buildGanttData(await listTasks(root)).tasks.some((task) => task.id === 'EPF-0002'), false);
});

test('直接編集の受入欄欠落と不正な実日時は無効Taskになる', async (context) => {
  const root = await makeRoot(context);
  const direct = { ...sample, id: 'EPF-0002', status: 'done', completed_at: '2026-09-24' };
  await fs.writeFile(path.join(root, 'tasks', 'EPF-0002.md'), serializeMarkdown(direct, BODY_TEMPLATE), 'utf8');
  const invalid = (await listTasks(root)).find((task) => task.id === 'EPF-0002');
  assert.equal(invalid.invalid, true);
  assert.match(invalid.error, /actual_completed_at/);
  assert.throws(() => validateTask({ ...sample, actual_started_at: 'きのう' }), /actual_started_at/);
  assert.throws(() => validateTask({ ...sample, actual_completed_at: '2026-02-30T12:00:00+09:00' }), /actual_completed_at/);
});

test('Requirementは空欄でTaskを作成でき、一覧・更新・WBSでも不正扱いにならない', async (context) => {
  const root = await makeRoot(context);
  await fs.mkdir(path.join(root, 'views'));
  const created = await createTask(root, { title: 'Requirementなし', owner: 'tester' });
  assert.equal(created.requirement, '');
  assert.match(await fs.readFile(path.join(root, 'tasks', `${created.id}.md`), 'utf8'), /^requirement:$/m);
  const listed = (await listTasks(root)).find((task) => task.id === created.id);
  assert.equal(listed.invalid, undefined);
  assert.equal((await updateCurrent(root, created.id, { status: 'doing' })).status, 'doing');
  await generateWbs(root);
  assert.match(await fs.readFile(path.join(root, 'views', 'wbs.md'), 'utf8'), /Requirementなし .*\| - \|$/m);
  assert.equal(buildGanttData(await listTasks(root)).tasks.length, 2);
});

test('独立した作業ツリーで1ミリ秒異なる時刻から別IDを作れる', async (context) => {
  const firstRoot = await makeRoot(context);
  const secondRoot = await makeRoot(context);
  const first = await createTask(firstRoot, { title: 'A', owner: 'tester' }, { clock: () => new Date('2026-09-25T03:04:05.010Z') });
  const second = await createTask(secondRoot, { title: 'B', owner: 'tester' }, { clock: () => new Date('2026-09-25T03:04:05.011Z') });
  assert.notEqual(first.id, second.id);
  assert.match(first.id, /^EPF-\d{8}-\d{6}-\d{3}$/);
  assert.match(second.id, /^EPF-\d{8}-\d{6}-\d{3}$/);
});

test('同じ版から同時更新した場合は先の保存を残し、後の保存を拒否する', async (context) => {
  const root = await makeRoot(context);
  const original = await readTask(root, 'EPF-0001');
  const first = updateTask(root, 'EPF-0001', { title: '先の更新' }, original.revision);
  const second = updateTask(root, 'EPF-0001', { title: '後の更新' }, original.revision);
  const results = await Promise.allSettled([first, second]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[1].reason.code, 'TASK_CONFLICT');
  assert.equal((await readTask(root, 'EPF-0001')).title, '先の更新');
  await assert.rejects(updateTask(root, 'EPF-0001', { title: '古い版の更新' }, original.revision), (error) => error.code === 'TASK_CONFLICT');
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
  assert.equal((await updateCurrent(root, 'EPF-0001', { status: 'doing' })).owner, 'legacy');
  assert.equal((await updateCurrent(root, 'EPF-0001', { owner: 'legacy', title: '改題' })).owner, 'legacy');
  await assert.rejects(updateCurrent(root, 'EPF-0001', { owner: 'stranger' }), /stranger.*担当者マスタ/);
  assert.equal((await readTask(root, 'EPF-0001')).owner, 'legacy');
  assert.equal((await updateCurrent(root, 'EPF-0001', { owner: 'agent' })).owner, 'agent');
  assert.notEqual(before, await fs.readFile(path.join(root, 'tasks', 'EPF-0001.md'), 'utf8'));
});

test('マスタがない場合は、作成と担当者の変更を理由付きで拒否する', async (context) => {
  const root = await makeRoot(context);
  await fs.rm(path.join(root, 'masters'), { recursive: true });
  await assert.rejects(createTask(root, { title: 'x', owner: 'tester' }), /masters\/owners\.md/);
  await assert.rejects(createTask(root, { title: 'x', owner: 'tester' }), /masters\/owners\.md/);
  await assert.rejects(updateCurrent(root, 'EPF-0001', { owner: 'agent' }), /masters\/owners\.md/);
  assert.equal((await updateCurrent(root, 'EPF-0001', { status: 'doing' })).status, 'doing');
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
