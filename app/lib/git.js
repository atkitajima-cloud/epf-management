import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

async function git(root, args) {
  return exec('git', args, { cwd: root });
}

function message(error) {
  return String(error.stderr || error.message || 'Git command failed').trim();
}

async function optional(root, args) {
  try { return (await git(root, args)).stdout.trim(); } catch { return ''; }
}

export async function getGitStatus(root) {
  try {
    await git(root, ['rev-parse', '--is-inside-work-tree']);
    const [{ stdout }, branch, upstream] = await Promise.all([
      git(root, ['status', '--porcelain=v1']),
      optional(root, ['branch', '--show-current']),
      optional(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])
    ]);
    const changes = stdout.replace(/\r/g, '').trimEnd().split('\n').filter(Boolean)
      .map((line) => ({ status: line.slice(0, 2), path: line.slice(3) }));
    return { isRepository: true, branch, upstream: upstream || null, changes };
  } catch (error) {
    return { isRepository: false, branch: '', upstream: null, changes: [], error: message(error) };
  }
}

export async function getGitPreview(root) {
  const status = await getGitStatus(root);
  if (!status.isRepository) throw new Error('Git repositoryではありません');
  const conflicts = status.changes.some((item) => item.status.includes('U'));
  return { ...status, conflicts, canPull: !conflicts && status.changes.length === 0 && Boolean(status.upstream), canCommitPush: !conflicts && status.changes.length > 0 && Boolean(status.upstream) };
}

export async function pullFastForward(root) {
  const preview = await getGitPreview(root);
  if (preview.conflicts) throw new Error('Git競合を解消してからPullしてください');
  if (preview.changes.length) throw new Error('未コミット変更があります。先に確認・commitしてからPullしてください');
  if (!preview.upstream) throw new Error('upstreamが設定されていません');
  try {
    const { stdout } = await git(root, ['pull', '--ff-only']);
    return { ...await getGitStatus(root), output: stdout.trim() || 'Already up to date.' };
  } catch (error) { throw new Error(`Pullに失敗しました: ${message(error)}`); }
}

export async function commitAndPush(root, input) {
  const preview = await getGitPreview(root);
  const commitMessage = String(input || '').trim();
  if (!commitMessage || /[\r\n]/.test(commitMessage) || commitMessage.length > 200) throw new Error('コミットメッセージは改行なし200文字以内で入力してください');
  if (preview.conflicts) throw new Error('Git競合を解消してからCommit & Pushしてください');
  if (!preview.changes.length) throw new Error('コミットする変更はありません');
  if (!preview.upstream) throw new Error('upstreamが設定されていません');
  try {
    await git(root, ['add', '-A']);
    await git(root, ['commit', '-m', commitMessage]);
  } catch (error) { throw new Error(`Commitに失敗しました: ${message(error)}`); }
  const commit = await optional(root, ['rev-parse', '--short', 'HEAD']);
  try {
    await git(root, ['push']);
    return { committed: true, pushed: true, commit, branch: preview.branch, upstream: preview.upstream };
  } catch (error) {
    return { committed: true, pushed: false, commit, branch: preview.branch, upstream: preview.upstream, pushError: message(error) };
  }
}