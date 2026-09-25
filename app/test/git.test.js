import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { commitAndPush, getGitHistory, getGitPreview, getGitStatus, pullLatest, updateConflictedTasks } from '../lib/git.js';
import { createTask } from '../lib/markdown.js';

const run = promisify(execFile);
const git = async (cwd, ...args) => (await run('git', args, { cwd })).stdout.trim();

// 共有用の空のリポジトリと、AさんとBさんの2つのcloneを一時ディレクトリに作る。実データのリポジトリは使わない。
async function setup(context) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'epf-git-'));
  context.after(() => fs.rm(base, { recursive: true, force: true }));
  const remote = path.join(base, 'remote.git');
  await git(base, 'init', '--bare', '-b', 'main', remote);
  const clone = async (name) => {
    const dir = path.join(base, name);
    // 改行の自動変換がclone直後の作業ツリーを「変更あり」にしないよう、clone時点で無効にする。
    await git(base, 'clone', '-q', '-c', 'core.autocrlf=false', remote, dir);
    await git(dir, 'config', 'user.name', name);
    await git(dir, 'config', 'user.email', `${name}@example.com`);
    return dir;
  };
  const a = await clone('a');
  await fs.mkdir(path.join(a, 'tasks'));
  await fs.mkdir(path.join(a, 'views'));
  await fs.writeFile(path.join(a, 'tasks', 'base.md'), 'line1\nline2\nline3\n', 'utf8');
  await regenerate(a)();
  await git(a, 'add', '-A');
  await git(a, 'commit', '-q', '-m', '初期状態');
  await git(a, 'push', '-q', '-u', 'origin', 'HEAD:main');
  await git(a, 'branch', '-M', 'main');
  await git(a, 'branch', '--set-upstream-to=origin/main');
  const b = await clone('b');
  return { base, remote, a, b };
}

// Taskの一覧からWBSを作る処理の代わり。tasks内のファイル名の一覧を書く。
const regenerate = (dir) => async () => {
  const names = (await fs.readdir(path.join(dir, 'tasks'))).sort();
  await fs.writeFile(path.join(dir, 'views', 'wbs.md'), `WBS:${names.join(',')}\n`, 'utf8');
};

async function commitFile(dir, file, content, subject) {
  await fs.writeFile(path.join(dir, file), content, 'utf8');
  await git(dir, 'add', '-A');
  await git(dir, 'commit', '-q', '-m', subject);
}

async function assertNotRebasing(dir) {
  for (const name of ['rebase-merge', 'rebase-apply']) {
    assert.equal(existsSync(path.join(dir, await git(dir, 'rev-parse', '--git-path', name))), false, `${name}が残っている`);
  }
  assert.equal(await git(dir, 'status', '--porcelain'), '', '作業ツリーがクリーンではない');
}

async function setupHistoryRepository(context) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'epf-history-'));
  context.after(() => fs.rm(dir, { recursive: true, force: true }));
  await git(dir, 'init', '-q', '-b', 'main');
  await git(dir, 'config', 'user.name', '履歴テスト担当');
  await git(dir, 'config', 'user.email', 'history@example.com');
  return dir;
}

const taskMarkdown = (values) => `---
id: ${values.id}
title: ${values.title}
status: ${values.status}
owner: ${values.owner}
priority: ${values.priority}
target_repo: ${values.target_repo || ''}
start: ${values.start || ''}
due: ${values.due || ''}
completed_at: ${values.completed_at || ''}
requirement: ${values.requirement || ''}
depends_on: ${values.depends_on || ''}
---

# ${values.title}
`;

async function commitAndPushConfirmed(dir, message, options = {}) {
  const preview = await getGitPreview(dir);
  const changes = preview.changes.map(({ status, path: file, fingerprint }) => ({ status, path: file, fingerprint }));
  return commitAndPush(dir, { message, changes }, options);
}

test('Git repositoryでない場合は空の履歴を返す', async (context) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'epf-not-git-'));
  context.after(() => fs.rm(dir, { recursive: true, force: true }));
  const result = await getGitHistory(dir);
  assert.equal(result.isRepository, false);
  assert.deepEqual(result.history, []);
});

test('commitがないGit repositoryは空の履歴を返す', async (context) => {
  const dir = await setupHistoryRepository(context);
  const result = await getGitHistory(dir);
  assert.equal(result.isRepository, true);
  assert.deepEqual(result.history, []);
});

test('通常commitとTask作成・Front Matter変更を新しい順に取得する', async (context) => {
  const dir = await setupHistoryRepository(context);
  await fs.writeFile(path.join(dir, 'README.md'), 'history test\n', 'utf8');
  await git(dir, 'add', '-A');
  await git(dir, 'commit', '-q', '-m', '通常の変更');

  await fs.mkdir(path.join(dir, 'tasks'));
  const taskFile = path.join(dir, 'tasks', 'EPF-0042.md');
  await fs.writeFile(taskFile, taskMarkdown({
    id: 'EPF-0042', title: '検索条件を追加する', status: 'ready', owner: 'suzuki', priority: 'medium', due: '2026-09-23'
  }), 'utf8');
  await git(dir, 'add', '-A');
  await git(dir, 'commit', '-q', '-m', 'Taskを追加');

  await fs.writeFile(taskFile, taskMarkdown({
    id: 'EPF-0042', title: '検索条件を追加する', status: 'doing', owner: 'yamada', priority: 'high', due: '2026-09-25', requirement: 'REQ-0002', depends_on: 'EPF-0003'
  }), 'utf8');
  await git(dir, 'add', '-A');
  await git(dir, 'commit', '-q', '-m', 'Taskの状態を更新');

  const { isRepository, history } = await getGitHistory(dir);
  assert.equal(isRepository, true);
  assert.equal(history.length, 3);
  assert.equal(history[0].message, 'Taskの状態を更新');
  assert.equal(history[0].author, '履歴テスト担当');
  assert.match(history[0].hash, /^[0-9a-f]+$/);
  assert.match(history[0].date, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(history[0].files, ['tasks/EPF-0042.md']);
  assert.equal(history[0].taskChanges[0].taskId, 'EPF-0042');
  assert.equal(history[0].taskChanges[0].taskTitle, '検索条件を追加する');
  assert.equal(history[0].taskChanges[0].action, 'updated');
  assert.deepEqual(history[0].taskChanges[0].changes, [
    { field: 'status', before: 'ready', after: 'doing' },
    { field: 'owner', before: 'suzuki', after: 'yamada' },
    { field: 'priority', before: 'medium', after: 'high' },
    { field: 'due', before: '2026-09-23', after: '2026-09-25' },
    { field: 'requirement', before: '', after: 'REQ-0002' },
    { field: 'depends_on', before: '', after: 'EPF-0003' }
  ]);
  assert.equal(history[1].taskChanges[0].action, 'created');
  assert.deepEqual(history[1].taskChanges[0].changes, []);
  assert.equal(history[2].message, '通常の変更');
  assert.deepEqual(history[2].taskChanges, []);
});

test('対象リポジトリと完了日だけの変更も履歴の前後値に出る', async (context) => {
  const dir = await setupHistoryRepository(context);
  await fs.mkdir(path.join(dir, 'tasks'));
  const file = path.join(dir, 'tasks', 'EPF-0045.md');
  const values = { id: 'EPF-0045', title: '履歴を確認する', status: 'doing', owner: 'kitajima', priority: 'high', target_repo: 'common' };
  const commitTask = async (message) => {
    await fs.writeFile(file, taskMarkdown(values), 'utf8');
    await git(dir, 'add', '-A');
    await git(dir, 'commit', '-q', '-m', message);
  };
  await commitTask('Taskを追加');
  values.target_repo = 'epf-management';
  await commitTask('対象リポジトリだけ変更');
  values.completed_at = '2026-09-25';
  await commitTask('完了日だけ変更');

  const { history } = await getGitHistory(dir);
  assert.deepEqual(history[1].taskChanges[0].changes, [
    { field: 'target_repo', before: 'common', after: 'epf-management' }
  ]);
  assert.deepEqual(history[0].taskChanges[0].changes, [
    { field: 'completed_at', before: '', after: '2026-09-25' }
  ]);
});

test('先にpushされていても、Commit & Pushで積み直して共有できる（merge commitを作らない）', async (context) => {
  const { remote, a, b } = await setup(context);
  await commitFile(a, 'tasks/a.md', 'A', 'Aの変更');
  await git(a, 'push', '-q');
  await fs.writeFile(path.join(b, 'tasks', 'b.md'), 'B', 'utf8');

  const result = await commitAndPushConfirmed(b, 'Bの変更', { regenerateWbs: regenerate(b) });
  assert.equal(result.pushed, true);
  assert.equal(result.integrated, true);
  assert.equal(result.committed, true);
  const files = (await git(remote, 'ls-tree', '-r', '--name-only', 'main')).split('\n');
  assert.ok(files.includes('tasks/a.md') && files.includes('tasks/b.md'));
  assert.equal(await git(remote, 'log', '--merges', '--oneline', 'main'), '');
  assert.equal((await git(remote, 'log', '--oneline', 'main')).split('\n').length, 3);
  await assertNotRebasing(b);
});

test('共有側で先に更新されたTaskはcommitせず、最新版へ更新してからやり直せる', async (context) => {
  const { remote, a, b } = await setup(context);
  const taskPath = 'tasks/EPF-0001.md';
  const original = '---\nid: EPF-0001\ntitle: original\n---\n';
  await commitFile(a, taskPath, original, 'Taskを作成');
  await git(a, 'push', '-q');
  await git(b, 'pull', '-q', '--ff-only');

  const localEdit = '---\nid: EPF-0001\ntitle: Bの変更\n---\n';
  await fs.writeFile(path.join(b, taskPath), localEdit, 'utf8');
  const unrelatedPath = path.join(b, 'tasks', 'keep.md');
  await fs.writeFile(unrelatedPath, '別ファイルの変更\n', 'utf8');
  const remoteEdit = '---\nid: EPF-0001\ntitle: Aの変更\n---\n';
  await commitFile(a, taskPath, remoteEdit, 'Aが先に更新');
  await git(a, 'push', '-q');

  const result = await commitAndPushConfirmed(b, 'Bの変更');
  assert.equal(result.outcome, 'task-conflict');
  assert.equal(result.committed, false);
  assert.equal(result.pushed, false);
  assert.deepEqual(result.files, [taskPath]);
  assert.equal(await fs.readFile(path.join(b, taskPath), 'utf8'), localEdit);
  assert.equal(await git(b, 'log', '-1', '--format=%s'), 'Taskを作成');

  const localTask = (await getGitPreview(b)).changes.find((item) => item.path === taskPath);
  const update = await updateConflictedTasks(b, [{ id: 'EPF-0001', fingerprint: localTask.fingerprint }]);
  assert.deepEqual(update.updated, ['EPF-0001']);
  assert.equal(await fs.readFile(path.join(b, taskPath), 'utf8'), remoteEdit);
  assert.equal(await fs.readFile(unrelatedPath, 'utf8'), '別ファイルの変更\n');
  assert.equal((await getGitStatus(b)).behind, 0);
  assert.deepEqual((await getGitStatus(b)).changes.map((item) => item.path), ['tasks/keep.md']);

  await fs.rm(unrelatedPath);
  await fs.writeFile(path.join(b, taskPath), '---\nid: EPF-0001\ntitle: やり直した変更\n---\n', 'utf8');
  const retried = await commitAndPushConfirmed(b, '更新後にやり直し');
  assert.equal(retried.pushed, true);
  assert.equal(await git(remote, 'show', `main:${taskPath}`), '---\nid: EPF-0001\ntitle: やり直した変更\n---');
});

test('別々のcloneで1ミリ秒異なる時刻に作成したTaskは異なるIDになる', async (context) => {
  const { a, b } = await setup(context);
  for (const root of [a, b]) {
    await fs.mkdir(path.join(root, 'masters'));
    await fs.writeFile(path.join(root, 'masters', 'owners.md'), '- tester\n', 'utf8');
  }
  const first = await createTask(a, { title: 'A', owner: 'tester' }, { clock: () => new Date('2026-09-25T03:04:05.010Z') });
  const second = await createTask(b, { title: 'B', owner: 'tester' }, { clock: () => new Date('2026-09-25T03:04:05.011Z') });
  assert.equal(first.id, 'EPF-20260925-120405-010');
  assert.equal(second.id, 'EPF-20260925-120405-011');
  assert.notEqual(first.id, second.id);
});

test('確認後にファイル内容が変わったらcommitしない', async (context) => {
  const { b } = await setup(context);
  const file = path.join(b, 'tasks', 'changed.md');
  await fs.writeFile(file, '確認した内容\n', 'utf8');
  const preview = await getGitPreview(b);
  const changes = preview.changes.map(({ status, path: filePath, fingerprint }) => ({ status, path: filePath, fingerprint }));
  await fs.writeFile(file, '確認後の内容\n', 'utf8');
  await assert.rejects(commitAndPush(b, { message: '確認済み', changes }), /確認後に変更内容が変わりました/);
  assert.equal(await git(b, 'log', '-1', '--format=%s'), '初期状態');
  assert.equal(await fs.readFile(file, 'utf8'), '確認後の内容\n');
});

test('確認後に追加されたstage変更はcommitしない', async (context) => {
  const { b } = await setup(context);
  const confirmedFile = path.join(b, 'tasks', 'confirmed.md');
  const unconfirmedFile = path.join(b, 'tasks', 'unconfirmed.md');
  await fs.writeFile(confirmedFile, '確認済み\n', 'utf8');
  const preview = await getGitPreview(b);
  const changes = preview.changes.map(({ status, path: file, fingerprint }) => ({ status, path: file, fingerprint }));
  await fs.writeFile(unconfirmedFile, '未確認\n', 'utf8');
  await git(b, 'add', '--', 'tasks/unconfirmed.md');
  await assert.rejects(commitAndPush(b, { message: '確認済み', changes }), /確認後に変更内容が変わりました/);
  assert.equal(await git(b, 'log', '-1', '--format=%s'), '初期状態');
  assert.equal(await git(b, 'diff', '--cached', '--name-only'), 'tasks/unconfirmed.md');
  assert.equal(await fs.readFile(unconfirmedFile, 'utf8'), '未確認\n');
});

test('commit済みでpushできていない状態は、変更がなくてもCommit & Pushで共有できる', async (context) => {
  const { remote, a, b } = await setup(context);
  await commitFile(a, 'tasks/a.md', 'A', 'Aの変更');
  await git(a, 'push', '-q');
  await commitFile(b, 'tasks/b.md', 'B', 'Bの変更');

  const preview = await getGitPreview(b);
  assert.equal(preview.ahead, 1);
  assert.equal(preview.changes.length, 0);
  assert.equal(preview.canCommitPush, true);
  const result = await commitAndPushConfirmed(b, '', { regenerateWbs: regenerate(b) });
  assert.equal(result.pushed, true);
  assert.equal(result.committed, false);
  assert.ok((await git(remote, 'ls-tree', '-r', '--name-only', 'main')).includes('tasks/b.md'));
});

test('共有するものがなければCommit & Pushは拒否される', async (context) => {
  const { b } = await setup(context);
  await assert.rejects(commitAndPush(b, 'x'), /送信する変更はありません/);
});

test('Pullは自分の未共有のcommitがあっても取り込める。未コミットの変更があると拒否する', async (context) => {
  const { a, b } = await setup(context);
  await commitFile(a, 'tasks/a.md', 'A', 'Aの変更');
  await git(a, 'push', '-q');
  await commitFile(b, 'tasks/b.md', 'B', 'Bの変更');

  await fs.writeFile(path.join(b, 'tasks', 'dirty.md'), 'x', 'utf8');
  await assert.rejects(pullLatest(b), /未コミット変更があります/);
  await fs.rm(path.join(b, 'tasks', 'dirty.md'));

  const result = await pullLatest(b, { regenerateWbs: regenerate(b) });
  assert.equal(result.outcome, 'integrated');
  assert.equal(result.ahead, 1);
  assert.equal(result.behind, 0);
  assert.ok(existsSync(path.join(b, 'tasks', 'a.md')) && existsSync(path.join(b, 'tasks', 'b.md')));
  assert.equal((await pullLatest(b)).outcome, 'up-to-date');
});

test('同じ場所を変更して競合した場合は、元の状態に戻して対象ファイルを返す', async (context) => {
  const { remote, a, b } = await setup(context);
  await commitFile(a, 'tasks/base.md', 'line1\nAの変更\nline3\n', 'Aの変更');
  await git(a, 'push', '-q');
  await fs.writeFile(path.join(b, 'tasks', 'base.md'), 'line1\nBの変更\nline3\n', 'utf8');

  const result = await commitAndPushConfirmed(b, 'Bの変更', { regenerateWbs: regenerate(b) });
  assert.equal(result.pushed, false);
  assert.equal(result.outcome, 'conflict');
  assert.deepEqual(result.files, ['tasks/base.md']);
  assert.equal(result.committed, true);
  await assertNotRebasing(b);
  assert.equal(await git(b, 'log', '-1', '--format=%s'), 'Bの変更');
  assert.equal(await fs.readFile(path.join(b, 'tasks', 'base.md'), 'utf8'), 'line1\nBの変更\nline3\n');
  assert.equal(await git(remote, 'log', '-1', '--format=%s', 'main'), 'Aの変更');
});

test('views/wbs.mdだけが競合した場合は、Taskから再生成して自動で解決する', async (context) => {
  const { remote, a, b } = await setup(context);
  await fs.writeFile(path.join(a, 'tasks', 'a.md'), 'A', 'utf8');
  await regenerate(a)();
  await git(a, 'add', '-A');
  await git(a, 'commit', '-q', '-m', 'Aの変更');
  await git(a, 'push', '-q');
  await fs.writeFile(path.join(b, 'tasks', 'b.md'), 'B', 'utf8');
  await regenerate(b)();

  const result = await commitAndPushConfirmed(b, 'Bの変更', { regenerateWbs: regenerate(b) });
  assert.equal(result.pushed, true);
  assert.equal(result.integrated, true);
  assert.equal(await git(remote, 'show', 'main:views/wbs.md'), 'WBS:a.md,b.md,base.md');
  await assertNotRebasing(b);
});

test('wbs.md以外も競合した場合は、自動解決せず元に戻す', async (context) => {
  const { a, b } = await setup(context);
  await fs.writeFile(path.join(a, 'tasks', 'base.md'), 'line1\nAの変更\nline3\n', 'utf8');
  await fs.writeFile(path.join(a, 'views', 'wbs.md'), 'Aのwbs\n', 'utf8');
  await git(a, 'add', '-A');
  await git(a, 'commit', '-q', '-m', 'Aの変更');
  await git(a, 'push', '-q');
  await fs.writeFile(path.join(b, 'tasks', 'base.md'), 'line1\nBの変更\nline3\n', 'utf8');
  await fs.writeFile(path.join(b, 'views', 'wbs.md'), 'Bのwbs\n', 'utf8');

  const result = await commitAndPushConfirmed(b, 'Bの変更', { regenerateWbs: regenerate(b) });
  assert.equal(result.outcome, 'conflict');
  assert.deepEqual([...result.files].sort(), ['tasks/base.md', 'views/wbs.md']);
  await assertNotRebasing(b);
  assert.equal(await fs.readFile(path.join(b, 'views', 'wbs.md'), 'utf8'), 'Bのwbs\n');
});

test('共有側の取得に失敗した場合はcommitせず、ローカル変更を残す', async (context) => {
  const { base, b } = await setup(context);
  await git(b, 'remote', 'set-url', 'origin', path.join(base, 'missing.git'));
  await fs.writeFile(path.join(b, 'tasks', 'b.md'), 'B', 'utf8');

  const result = await commitAndPushConfirmed(b, 'Bの変更');
  assert.equal(result.outcome, 'fetch-failed');
  assert.equal(result.pushed, false);
  assert.equal(result.committed, false);
  assert.equal(await git(b, 'log', '-1', '--format=%s'), '初期状態');
  assert.equal(await fs.readFile(path.join(b, 'tasks', 'b.md'), 'utf8'), 'B');
  assert.equal(await git(b, 'status', '--porcelain'), '?? tasks/b.md');
});

test('Git状態は、共有していないcommitと共有側の更新の件数を返す', async (context) => {
  const { a, b } = await setup(context);
  await commitFile(a, 'tasks/a.md', 'A', 'Aの変更');
  await git(a, 'push', '-q');
  await commitFile(b, 'tasks/b.md', 'B', 'Bの変更');

  const local = await getGitStatus(b);
  assert.equal(local.ahead, 1);
  assert.equal(local.behind, 0);
  const fetched = await getGitStatus(b, { fetch: true });
  assert.equal(fetched.ahead, 1);
  assert.equal(fetched.behind, 1);
  assert.equal(fetched.fetchError, null);
});
