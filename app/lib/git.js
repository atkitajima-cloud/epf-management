import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

const WBS_PATH = 'views/wbs.md';
const MAX_WBS_RESOLUTIONS = 20;
const NETWORK_TIMEOUT_MS = 60000;

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

export async function getGitStatus(root, { fetch = false } = {}) {
  try {
    await git(root, ['rev-parse', '--is-inside-work-tree']);
    const fetched = fetch ? await fetchUpstream(root) : null;
    const [{ stdout }, branch, upstream, counts] = await Promise.all([
      git(root, ['status', '--porcelain=v1']),
      optional(root, ['branch', '--show-current']),
      optional(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']),
      aheadBehind(root)
    ]);
    const changes = stdout.replace(/\r/g, '').trimEnd().split('\n').filter(Boolean)
      .map((line) => ({ status: line.slice(0, 2), path: line.slice(3) }));
    return {
      isRepository: true, branch, upstream: upstream || null, changes, ...counts,
      fetchError: fetched && !fetched.ok ? fetched.error : null
    };
  } catch (error) {
    return { isRepository: false, branch: '', upstream: null, changes: [], ahead: 0, behind: 0, fetchError: null, error: message(error) };
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
  if (hasChanges) {
    const commitMessage = String(input || '').trim();
    if (!commitMessage || /[\r\n]/.test(commitMessage) || commitMessage.length > 200) throw new Error('コミットメッセージは改行なし200文字以内で入力してください');
    try {
      await git(root, ['add', '-A']);
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
    if (!['up-to-date', 'integrated'].includes(sync.outcome)) return summary({ pushed: false, ...sync });
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
