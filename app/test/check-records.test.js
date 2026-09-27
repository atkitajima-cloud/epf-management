import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { serializeMarkdown, taskSyncFingerprint } from '../lib/markdown.js';

const managementRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repos = ['epf-project', 'epf-management', 'epf-backend', 'epf-frontend'];
const taskBody = '# 背景\n\n検証\n\n# 目的\n\n検証\n\n# 完了条件\n\n- [x] 完了\n\n# 関連\n\n- なし';

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

function baseTask(status) {
  return {
    id: 'EPF-9001', title: '遷移検証', status, completed_at: '', actual_started_at: '2026-09-27T00:00:00.000Z',
    owner: 'tester', priority: 'high', target_repo: 'common', start: '', due: '', depends_on: '', requirement: '', exec_plan: ''
  };
}

async function makeWorkspace(context, task) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'epf-check-records-'));
  context.after(() => fs.rm(workspace, { recursive: true, force: true }));
  for (const repo of repos) {
    const root = path.join(workspace, repo);
    await fs.mkdir(root, { recursive: true });
    git(root, ['init']);
    git(root, ['config', 'user.name', 'test']);
    git(root, ['config', 'user.email', 'test@example.com']);
    await fs.writeFile(path.join(root, '.keep'), '', 'utf8');
    git(root, ['add', '.keep']);
    git(root, ['commit', '-m', 'init']);
  }

  const root = path.join(workspace, 'epf-management');
  await fs.mkdir(path.join(root, 'scripts'), { recursive: true });
  await fs.mkdir(path.join(root, 'app', 'lib'), { recursive: true });
  await fs.mkdir(path.join(root, 'config'), { recursive: true });
  await fs.mkdir(path.join(root, 'tasks'), { recursive: true });
  await fs.copyFile(path.join(managementRoot, 'scripts', 'check-records.mjs'), path.join(root, 'scripts', 'check-records.mjs'));
  await fs.copyFile(path.join(managementRoot, 'app', 'lib', 'markdown.js'), path.join(root, 'app', 'lib', 'markdown.js'));
  await fs.copyFile(path.join(managementRoot, 'config', 'task-validation-baseline.json'), path.join(root, 'config', 'task-validation-baseline.json'));
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}\n', 'utf8');
  await fs.writeFile(path.join(root, 'tasks', `${task.id}.md`), serializeMarkdown(task, taskBody), 'utf8');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'task']);
  return workspace;
}

async function stageTask(workspace, task) {
  const root = path.join(workspace, 'epf-management');
  await fs.writeFile(path.join(root, 'tasks', `${task.id}.md`), serializeMarkdown(task, taskBody), 'utf8');
  git(root, ['add', `tasks/${task.id}.md`]);
}

function check(workspace) {
  return spawnSync(process.execPath, ['scripts/check-records.mjs', '--staged', '--repo', 'epf-management'], {
    cwd: path.join(workspace, 'epf-management'), encoding: 'utf8'
  });
}

test('commit前検査はreviewを経由しないdone遷移を拒否する', async (context) => {
  const before = baseTask('doing');
  const workspace = await makeWorkspace(context, before);
  const after = {
    ...before, status: 'done', completed_at: '2026-09-27', actual_completed_at: '2026-09-27T00:00:00.000Z',
    sync_status: 'passed', sync_target: 'done', sync_at: '2026-09-27T00:00:00.000Z'
  };
  after.sync_fingerprint = taskSyncFingerprint(after, taskBody);
  await stageTask(workspace, after);
  const result = check(workspace);
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, /doneへの変更はreview状態/);
});

test('commit前検査は別の遷移先に保存した人間確認を再利用しない', async (context) => {
  const before = {
    ...baseTask('doing'), human_checked: 'true', human_checked_target: 'doing', human_checked_at: '2026-09-27T00:00:00.000Z'
  };
  before.human_checked_fingerprint = taskSyncFingerprint(before, taskBody);
  const workspace = await makeWorkspace(context, before);
  await stageTask(workspace, { ...before, status: 'review' });
  const result = check(workspace);
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, /reviewへの変更には有効な同期証跡または人間確認が必要/);
});

test('commit前検査はreviewから有効な証跡を持つdone遷移を許可する', async (context) => {
  const before = baseTask('review');
  const workspace = await makeWorkspace(context, before);
  const after = {
    ...before, status: 'done', completed_at: '2026-09-27', actual_completed_at: '2026-09-27T00:00:00.000Z',
    sync_status: 'passed', sync_target: 'done', sync_at: '2026-09-27T00:00:00.000Z'
  };
  after.sync_fingerprint = taskSyncFingerprint(after, taskBody);
  await stageTask(workspace, after);
  const result = check(workspace);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
