import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

export class MockCodexAdapter {
  name = 'mock';

  async run(message) {
    const text = String(message).trim();
    const requirement = text.match(/REQ-\d{4}/)?.[0] || 'REQ-0001';

    if (/WBS|wbs/.test(text) && /(作|生成|更新)/.test(text)) {
      return { message: '現在のTaskからWBSを再生成します。', action: 'generate_wbs' };
    }
    if (/(タスク|Task).*(作って|追加して|作成して)|(?:作って|追加して|作成して).*(タスク|Task)/i.test(text)) {
      const title = text
        .replace(/REQ-\d{4}/g, '')
        .replace(/(の)?タスクを?(作って|追加して|作成して).*$/i, '')
        .replace(/^(タスクを?|Taskを?)/i, '')
        .trim() || 'AI Chatからの新規タスク';
      return {
        message: `「${title}」をBacklogへ追加します。`,
        action: 'create_task',
        task: { title, status: 'backlog', owner: 'unassigned', priority: 'medium', requirement: text.match(/REQ-\d{4}/)?.[0] || '' }
      };
    }
    if (/分割/.test(text)) {
      return { message: '分割案です。1) 調査と受入条件の確定 2) 実装 3) テストと利用確認。既存Taskは変更していません。', action: 'none' };
    }
    if (/優先順位|優先度/.test(text)) {
      return { message: '提案: 基盤となるMarkdown更新とTask作成をhigh、分析系をmedium、利用フィードバックをlowのままにします。自動変更はしていません。', action: 'none' };
    }
    if (/漏れ|抜け/.test(text)) {
      return { message: `${requirement}に対する候補: エラー時の復旧、同時編集時の競合、Markdown破損時の表示を受入観点として確認してください。`, action: 'none' };
    }
    return { message: 'PoCでは、タスク追加・分割案・優先順位見直し・抜け漏れ分析・WBS生成を依頼できます。', action: 'none' };
  }
}

export class CodexAdapter {
  name = 'codex';

  constructor({ root, schemaPath, timeoutMs = 120000 }) {
    this.root = root;
    this.schemaPath = schemaPath;
    this.timeoutMs = timeoutMs;
  }

  async run(message) {
    const outputPath = path.join(os.tmpdir(), `epf-codex-${process.pid}-${Date.now()}.json`);
    const prompt = [
      'あなたはローカルプロジェクト管理アプリの分析Adapterです。',
      '現在のリポジトリ内のcontext, requirements, tasks, plansをread-onlyで確認してください。',
      'ファイルは絶対に変更しないでください。出力schemaに従うJSONだけを最終回答にしてください。',
      'actionは、明示的なタスク作成依頼ならcreate_task、WBS生成依頼ならgenerate_wbs、それ以外はnoneです。',
      '分割、優先順位変更、抜け漏れ分析は提案だけをmessageに書き、actionはnoneにしてください。',
      'create_taskではtaskにtitle/status/owner/priority/requirement/bodyを設定してください。',
      `ユーザー依頼: ${message}`
    ].join('\n');
    const args = [
      '--ask-for-approval', 'never', 'exec', '--ephemeral', '--sandbox', 'read-only',
      '--cd', this.root, '--output-schema', this.schemaPath,
      '--output-last-message', outputPath, '-'
    ];

    try {
      await runProcess('codex', args, prompt, this.timeoutMs);
      const result = JSON.parse(await fs.readFile(outputPath, 'utf8'));
      if (!['none', 'create_task', 'generate_wbs'].includes(result.action)) throw new Error('Codexが不正なactionを返しました');
      return result;
    } finally {
      await fs.rm(outputPath, { force: true }).catch(() => {});
    }
  }
}

function runProcess(command, args, input, timeoutMs) {
  return new Promise((resolve, reject) => {
    const invocation = resolveInvocation(command, args);
    const child = spawn(invocation.executable, invocation.args, { windowsHide: true });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Codex CLIがタイムアウトしました'));
    }, timeoutMs);
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Codex CLI終了コード ${code}: ${stderr.slice(-1000)}`));
    });
    child.stdin.end(input);
  });
}

function resolveInvocation(command, args) {
  if (process.env.CODEX_CLI_PATH) {
    const configured = path.resolve(process.env.CODEX_CLI_PATH);
    return configured.endsWith('.js')
      ? { executable: process.execPath, args: [configured, ...args] }
      : { executable: configured, args };
  }
  if (process.platform === 'win32') {
    const npmCli = path.join(
      process.env.APPDATA || '',
      'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js'
    );
    if (existsSync(npmCli)) return { executable: process.execPath, args: [npmCli, ...args] };
    return { executable: `${command}.exe`, args };
  }
  return { executable: command, args };
}
export function createAdapter(options) {
  const mock = new MockCodexAdapter();
  if ((process.env.AI_ADAPTER || 'mock').toLowerCase() !== 'codex') {
    return { adapter: mock, fallback: null };
  }
  return { adapter: new CodexAdapter(options), fallback: mock };
}
