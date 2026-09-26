import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

const WBS_PATH = 'views/wbs.md';
const MAX_WBS_RESOLUTIONS = 20;
const NETWORK_TIMEOUT_MS = 60000;
const HISTORY_LIMIT = 20;
const TASK_FIELDS = ['title', 'status', 'owner', 'priority', 'target_repo', 'start', 'due', 'completed_at', 'requirement', 'depends_on'];
const TASK_FILE_PATTERN = /^tasks\/(EPF-(?:\d{4}|\d{17}|\d{8}-\d{6}-\d{3}))\.md$/;

async function git(root, args, { timeout } = {}) {
  // エディタや認証の入力待ちで止まらないようにする。
  return exec('git', args, { cwd: root, timeout, env: { ...process.env, GIT_EDITOR: 'true', GIT_TERMINAL_PROMPT: '0' } });
}

function message(error) {
  return String(error.stderr || error.message || 'Git command failed').trim();
}

async function optional(root, args) {
  try { return (await git(root, args)).stdout.trim(); } catch { return ''; }
}

const isConflictStatus = (status) => /U/.test(status) || status === 'AA' || status === 'DD';

// 共有していないcommit（ahead）と、取得済みの共有側の更新（behind）の件数。upstreamがなければ0。
async function aheadBehind(root) {
  const [ahead, behind] = (await optional(root, ['rev-list', '--left-right', '--count', 'HEAD...@{u}'])).split(/\s+/).map(Number);
  return Number.isInteger(ahead) && Number.isInteger(behind) ? { ahead, behind } : { ahead: 0, behind: 0 };
}

async function rebaseInProgress(root) {
  for (const name of ['rebase-merge', 'rebase-apply']) {
    const target = await optional(root, ['rev-parse', '--git-path', name]);
    if (target && existsSync(path.resolve(root, target))) return true;
  }
  return false;
}

async function fetchUpstream(root) {
  try {
    await git(root, ['fetch'], { timeout: NETWORK_TIMEOUT_MS });
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

// 共有側だけが分岐後に変更したファイル。自分の未pushのcommitがこのファイルを変更していても、
// 共有側にその変更がなければ含めない（2点比較のHEAD @{u}は自分のahead分も差分に含めてしまい誤検知する）。
async function remoteChangedPaths(root) {
  const { stdout } = await git(root, ['diff', '--name-only', '-z', 'HEAD...@{u}']);
  return new Set(stdout.split('\0').filter(Boolean));
}

function taskIdsIn(paths) {
  return paths.flatMap((file) => {
    const match = file.match(TASK_FILE_PATTERN);
    return match ? [{ id: match[1], file }] : [];
  });
}

// 共有側で同じTaskが先に更新されていたら、localの変更を残したままCommitを止める。
export async function updateConflictedTasks(root, files) {
  if (!Array.isArray(files) || !files.length) throw new Error('更新するTaskがありません');
  const beforeFetch = await getGitPreview(root);
  if (!beforeFetch.upstream) throw new Error('upstreamが設定されていません');
  const fetched = await fetchUpstream(root);
  if (!fetched.ok) throw new Error(`共有側を確認できませんでした: ${fetched.error}`);
  const preview = await getGitPreview(root);
  if (preview.ahead > 0) throw new Error('pushしていないcommitがあるため、自動更新できません。Gitで確認してください');
  const remoteChanges = await remoteChangedPaths(root);
  const tasks = files.map((item) => {
    const match = String(item?.id || '').match(/^(EPF-(?:\d{4}|\d{17}|\d{8}-\d{6}-\d{3}))$/);
    if (!match) throw new Error('不正なTask IDです');
    return { id: match[1], file: `tasks/${match[1]}.md`, fingerprint: item.fingerprint };
  });
  if (new Set(tasks.map((item) => item.id)).size !== tasks.length) throw new Error('Taskが重複しています');
  const requestedFiles = new Set(tasks.map((item) => item.file));
  const otherOverlaps = preview.changes.filter((change) => remoteChanges.has(change.path) && !requestedFiles.has(change.path));
  if (otherOverlaps.length) throw new Error(`他の変更も共有側と重なっています: ${otherOverlaps.map((item) => item.path).join(', ')}`);
  for (const task of tasks) {
    const { id, file } = task;
    if (!remoteChanges.has(file)) throw new Error(`${id} は共有側で更新されていません。画面を更新してください`);
    const local = preview.changes.find((change) => change.path === file);
    if (!local || local.fingerprint !== task.fingerprint) throw new Error(`${id} のローカル変更が変わりました。画面を更新してください`);
    if (local.status[0] !== ' ' || local.status[1] !== 'M') throw new Error(`${id} はstage済みまたは作成状態のため、自動更新できません。Gitで確認してください`);
    try { await git(root, ['cat-file', '-e', `@{u}:${file}`]); }
    catch { throw new Error(`${id} は共有側から削除されています。Gitで確認してください`); }
  }
  await git(root, ['restore', '--source=@{u}', '--staged', '--worktree', '--', ...tasks.map((item) => item.file)]);
  await git(root, ['merge', '--ff-only', '@{u}']);
  return { updated: tasks.map((item) => item.id) };
}

export async function getGitStatus(root, { fetch = false } = {}) {
  try {
    await git(root, ['rev-parse', '--is-inside-work-tree']);
    const fetched = fetch ? await fetchUpstream(root) : null;
    const [{ stdout }, branch, upstream, counts] = await Promise.all([
      git(root, ['status', '--porcelain=v1', '--untracked-files=all']),
      optional(root, ['branch', '--show-current']),
      optional(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']),
      aheadBehind(root)
    ]);
    const changes = await Promise.all(stdout.replace(/\r/g, '').trimEnd().split('\n').filter(Boolean)
      .map(async (line) => {
        const status = line.slice(0, 2);
        const file = line.slice(3);
        if (status.includes('R') || status.includes('C') || file.includes(' -> ')) {
          return { status, path: file, fingerprint: null, unsupported: true };
        }
        const target = path.resolve(root, file);
        if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('リポジトリ外のファイルはcommitできません');
        const fingerprint = status.includes('D') ? null : (await git(root, ['hash-object', `--path=${file}`, '--', file])).stdout.trim();
        return { status, path: file, fingerprint };
      }));
    return {
      isRepository: true, branch, upstream: upstream || null, changes, ...counts,
      fetchError: fetched && !fetched.ok ? fetched.error : null
    };
  } catch (error) {
    return { isRepository: false, branch: '', upstream: null, changes: [], ahead: 0, behind: 0, fetchError: null, error: message(error) };
  }
}

function parseFrontMatter(source) {
  const match = String(source || '').replace(/\r/g, '').match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) return null;
  return Object.fromEntries(match[1].split('\n').flatMap((line) => {
    const field = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!field) return [];
    const value = field[2].trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_, double, single) => double ?? single);
    return [[field[1], value]];
  }));
}

async function taskAt(root, revision, file) {
  if (!revision) return null;
  const source = await optional(root, ['show', `${revision}:${file}`]);
  return source ? parseFrontMatter(source) : null;
}

async function taskChange(root, hash, status, file) {
  const match = file.match(/^tasks\/(EPF-(?:\d{4}|\d{17}|\d{8}-\d{6}-\d{3}))\.md$/);
  if (!match || !['A', 'M'].includes(status[0])) return null;
  const [before, after] = await Promise.all([
    status[0] === 'A' ? null : taskAt(root, `${hash}^`, file),
    taskAt(root, hash, file)
  ]);
  if (!after) return null;
  const changes = status[0] === 'A'
    ? []
    : TASK_FIELDS.flatMap((field) => (before?.[field] ?? '') === (after[field] ?? '') ? [] : [{
      field, before: before?.[field] ?? '', after: after[field] ?? ''
    }]);
  return {
    taskId: after.id || match[1],
    taskTitle: after.title || before?.title || '',
    action: status[0] === 'A' ? 'created' : 'updated',
    changes
  };
}

async function historyEntry(root, hash) {
  const [{ stdout: metadata }, { stdout: changed }] = await Promise.all([
    git(root, ['show', '-s', '--format=%H%x00%h%x00%an%x00%aI%x00%s', hash]),
    git(root, ['diff-tree', '--root', '--no-commit-id', '--name-status', '-r', '--find-renames', hash])
  ]);
  const [fullHash, shortHash, author, date, commitMessage] = metadata.trimEnd().split('\0');
  const rows = changed.replace(/\r/g, '').trim().split('\n').filter(Boolean).map((line) => {
    const [status, ...paths] = line.split('\t');
    return { status, file: paths.at(-1) };
  });
  const taskChanges = (await Promise.all(rows.map(({ status, file }) => taskChange(root, hash, status, file)))).filter(Boolean);
  return {
    hash: shortHash,
    fullHash,
    author,
    date,
    message: commitMessage,
    files: rows.map(({ file }) => file),
    taskChanges
  };
}

export async function getGitHistory(root, { limit = HISTORY_LIMIT } = {}) {
  try {
    await git(root, ['rev-parse', '--is-inside-work-tree']);
    const safeLimit = Math.min(HISTORY_LIMIT, Math.max(0, Number.parseInt(limit, 10) || HISTORY_LIMIT));
    const hashes = (await optional(root, ['log', `-${safeLimit}`, '--format=%H'])).split(/\r?\n/).filter(Boolean);
    return { isRepository: true, history: await Promise.all(hashes.map((hash) => historyEntry(root, hash))) };
  } catch (error) {
    return { isRepository: false, history: [], error: message(error) };
  }
}

export async function getGitPreview(root) {
  const status = await getGitStatus(root);
  if (!status.isRepository) throw new Error('Git repositoryではありません');
  const conflicts = status.changes.some((item) => isConflictStatus(item.status)) || await rebaseInProgress(root);
  const hasUpstream = Boolean(status.upstream);
  return {
    ...status, conflicts,
    canPull: !conflicts && status.changes.length === 0 && hasUpstream,
    canCommitPush: !conflicts && hasUpstream && (status.changes.length > 0 || status.ahead > 0)
  };
}

async function conflictedFiles(root) {
  const { stdout } = await git(root, ['diff', '--name-only', '--diff-filter=U']);
  return stdout.replace(/\r/g, '').split('\n').filter(Boolean);
}

// 積み直しを取り消し、操作前の状態（自分のcommitが手つかずの状態）に戻す。
async function abortRebase(root) {
  try { await git(root, ['rebase', '--abort']); } catch { /* 下で状態を確認する */ }
  return !(await rebaseInProgress(root));
}

async function abortWithResult(root, outcome) {
  const restored = await abortRebase(root);
  if (!restored) return { outcome: 'error', error: '自動での取り込みを元に戻せませんでした。詳しい人に相談してください' };
  return outcome;
}

// 積み直しの途中で止まった状態を扱う。競合しているのがviews/wbs.mdだけなら、Taskから再生成して続行する。
// それ以外の競合や想定外の失敗は、必ず元に戻す。
async function resolveRebaseConflict(root, regenerateWbs, firstError) {
  let lastError = firstError;
  for (let round = 0; round < MAX_WBS_RESOLUTIONS; round += 1) {
    if (!(await rebaseInProgress(root))) return { outcome: 'error', error: message(lastError) };
    const files = await conflictedFiles(root);
    if (!files.length) return abortWithResult(root, { outcome: 'error', error: message(lastError) });
    if (!regenerateWbs || files.length !== 1 || files[0] !== WBS_PATH) return abortWithResult(root, { outcome: 'conflict', files });
    try {
      await regenerateWbs();
      await git(root, ['add', WBS_PATH]);
      const hasStaged = await git(root, ['diff', '--cached', '--quiet']).then(() => false, () => true);
      await git(root, ['rebase', hasStaged ? '--continue' : '--skip']);
      return { outcome: 'integrated' };
    } catch (error) { lastError = error; }
  }
  return abortWithResult(root, { outcome: 'conflict', files: [WBS_PATH] });
}

// 共有側の最新を取得し、自分の未共有のcommitをその上に積み直す。force pushやmerge commitは使わない。
async function integrateUpstream(root, regenerateWbs) {
  const fetched = await fetchUpstream(root);
  if (!fetched.ok) return { outcome: 'fetch-failed', error: fetched.error };
  if ((await aheadBehind(root)).behind === 0) return { outcome: 'up-to-date' };
  try {
    await git(root, ['-c', 'rebase.autoStash=false', 'rebase', '@{u}']);
    return { outcome: 'integrated' };
  } catch (error) {
    return resolveRebaseConflict(root, regenerateWbs, error);
  }
}

export async function pullLatest(root, { regenerateWbs } = {}) {
  const preview = await getGitPreview(root);
  if (preview.conflicts) throw new Error('Git競合を解消してからPullしてください');
  if (preview.changes.length) throw new Error('未コミット変更があります。先にCommit & Pushしてください');
  if (!preview.upstream) throw new Error('upstreamが設定されていません');
  const result = await integrateUpstream(root, regenerateWbs);
  return { ...result, ...(await getGitStatus(root)), outcome: result.outcome };
}

export async function commitAndPush(root, input, { regenerateWbs } = {}) {
  const preview = await getGitPreview(root);
  const hasChanges = preview.changes.length > 0;
  if (preview.conflicts) throw new Error('Git競合を解消してからCommit & Pushしてください');
  if (!preview.upstream) throw new Error('upstreamが設定されていません');
  if (!hasChanges && preview.ahead === 0) throw new Error('送信する変更はありません');
  const baseHead = await optional(root, ['rev-parse', 'HEAD']);
  if (hasChanges) {
    if (!Array.isArray(input?.changes)) throw new Error('確認した変更一覧がありません。画面を更新して再確認してください');
    if (preview.changes.some((item) => item.unsupported)) throw new Error('名前変更または特殊なファイルの変更があります。Gitで確認してください');
    const expected = preview.changes.map(({ status, path: file, fingerprint }) => ({ status, path: file, fingerprint }));
    if (JSON.stringify(input.changes) !== JSON.stringify(expected)) throw new Error('確認後に変更内容が変わりました。画面を更新して再確認してください');
    const commitMessage = String(input.message || '').trim();
    if (!commitMessage || /[\r\n]/.test(commitMessage) || commitMessage.length > 200) throw new Error('コミットメッセージは改行なし200文字以内で入力してください');
    const fetched = await fetchUpstream(root);
    if (!fetched.ok) return {
      committed: false, pushed: false, branch: preview.branch, upstream: preview.upstream,
      outcome: 'fetch-failed', error: fetched.error
    };
    const remoteChanges = await remoteChangedPaths(root);
    const conflicts = taskIdsIn(expected.filter((item) => remoteChanges.has(item.path)).map((item) => item.path));
    if (conflicts.length) return {
      committed: false, pushed: false, branch: preview.branch, upstream: preview.upstream,
      outcome: 'task-conflict', files: conflicts.map((item) => item.file)
    };
    try {
      const files = expected.map(({ path: file }) => file);
      // `git add -- <deleted file>` は pathspec 不一致になるため、追加・更新・削除を同じ確認済み一覧から
      // stage できる `-A` を使う。対象パスは直前に preview で検証済みである。
      await git(root, ['add', '-A', '--', ...files]);
      for (const item of expected) {
        const stagedHash = await optional(root, ['rev-parse', `:${item.path}`]);
        if (item.fingerprint === null ? Boolean(stagedHash) : stagedHash !== item.fingerprint) {
          throw new Error('確認後に変更内容が変わりました');
        }
      }
      const stagedFiles = (await git(root, ['diff', '--cached', '--name-only', '-z'])).stdout.split('\0').filter(Boolean).sort();
      if (JSON.stringify(stagedFiles) !== JSON.stringify([...files].sort())) throw new Error('確認していない変更がすでにstageされています');
      await git(root, ['commit', '-m', commitMessage]);
    } catch (error) { throw new Error(`Commitに失敗しました: ${message(error)}`); }
  }
  const summary = async (extra) => ({
    committed: hasChanges, commit: await optional(root, ['rev-parse', '--short', 'HEAD']),
    branch: preview.branch, upstream: preview.upstream, ...extra
  });

  let integrated = false;
  // 取得からpushまでの間に別の人がpushした場合に備えて、1回だけやり直す。
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const sync = await integrateUpstream(root, regenerateWbs);
    if (!['up-to-date', 'integrated'].includes(sync.outcome)) {
      const conflicts = sync.outcome === 'conflict' ? taskIdsIn(sync.files || []) : [];
      if (hasChanges && conflicts.length) {
        // Fetchとの間に同じTaskが更新された場合、新しく作ったcommitだけを外して編集を残す。
        await git(root, ['reset', '--mixed', baseHead]);
        return summary({ committed: false, pushed: false, outcome: 'task-conflict', files: conflicts.map((item) => item.file) });
      }
      return summary({ pushed: false, ...sync });
    }
    integrated ||= sync.outcome === 'integrated';
    try {
      await git(root, ['push'], { timeout: NETWORK_TIMEOUT_MS });
      return summary({ pushed: true, outcome: 'pushed', integrated });
    } catch (error) {
      const text = message(error);
      if (attempt === 0 && /rejected|fetch first|non-fast-forward/i.test(text)) continue;
      return summary({ pushed: false, outcome: 'push-failed', pushError: text });
    }
  }
}
