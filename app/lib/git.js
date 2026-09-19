import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function getGitStatus(root) {
  try {
    await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root });
    const { stdout } = await execFileAsync('git', ['status', '--porcelain=v1', '--branch'], { cwd: root });
    const lines = stdout.replace(/\r/g, '').trimEnd().split('\n').filter(Boolean);
    return {
      isRepository: true,
      branch: (lines[0] || '').replace(/^##\s*/, ''),
      changes: lines.slice(1).map((line) => ({ status: line.slice(0, 2), path: line.slice(3) }))
    };
  } catch (error) {
    return { isRepository: false, branch: '', changes: [], error: error.message };
  }
}
