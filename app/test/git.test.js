import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { commitAndPush, getGitPreview, getGitStatus, pullLatest } from '../lib/git.js';

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

test('先にpushされていても、Commit & Pushで積み直して共有できる（merge commitを作らない）', async (context) => {
  const { remote, a, b } = await setup(context);
  await commitFile(a, 'tasks/a.md', 'A', 'Aの変更');
  await git(a, 'push', '-q');
  await fs.writeFile(path.join(b, 'tasks', 'b.md'), 'B', 'utf8');

  const result = await commitAndPush(b, 'Bの変更', { regenerateWbs: regenerate(b) });
  assert.equal(result.pushed, true);
  assert.equal(result.integrated, true);
  assert.equal(result.committed, true);
  const files = (await git(remote, 'ls-tree', '-r', '--name-only', 'main')).split('\n');
  assert.ok(files.includes('tasks/a.md') && files.includes('tasks/b.md'));
  assert.equal(await git(remote, 'log', '--merges', '--oneline', 'main'), '');
  assert.equal((await git(remote, 'log', '--oneline', 'main')).split('\n').length, 3);
  await assertNotRebasing(b);
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
  const result = await commitAndPush(b, '', { regenerateWbs: regenerate(b) });
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

  const result = await commitAndPush(b, 'Bの変更', { regenerateWbs: regenerate(b) });
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

  const result = await commitAndPush(b, 'Bの変更', { regenerateWbs: regenerate(b) });
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

  const result = await commitAndPush(b, 'Bの変更', { regenerateWbs: regenerate(b) });
  assert.equal(result.outcome, 'conflict');
  assert.deepEqual([...result.files].sort(), ['tasks/base.md', 'views/wbs.md']);
  await assertNotRebasing(b);
  assert.equal(await fs.readFile(path.join(b, 'views', 'wbs.md'), 'utf8'), 'Bのwbs\n');
});

test('共有側の取得に失敗した場合は、commitだけ残してpushしない', async (context) => {
  const { base, b } = await setup(context);
  await git(b, 'remote', 'set-url', 'origin', path.join(base, 'missing.git'));
  await fs.writeFile(path.join(b, 'tasks', 'b.md'), 'B', 'utf8');

  const result = await commitAndPush(b, 'Bの変更');
  assert.equal(result.outcome, 'fetch-failed');
  assert.equal(result.pushed, false);
  assert.equal(result.committed, true);
  assert.equal(await git(b, 'log', '-1', '--format=%s'), 'Bの変更');
  await assertNotRebasing(b);
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
