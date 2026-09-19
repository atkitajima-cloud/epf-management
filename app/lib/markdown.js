import fs from 'node:fs/promises';
import path from 'node:path';

export const STATUSES = ['backlog', 'ready', 'doing', 'review', 'done'];
export const PRIORITIES = ['low', 'medium', 'high'];
export const REQUIRED_FIELDS = ['id', 'title', 'status', 'owner', 'priority', 'requirement'];

function parseScalar(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseMarkdown(source) {
  const normalized = source.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/);
  if (!match) throw new Error('Front Matterが見つかりません');

  const data = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim()) continue;
    const separator = line.indexOf(':');
    if (separator < 1) throw new Error(`不正なFront Matter行: ${line}`);
    const key = line.slice(0, separator).trim();
    data[key] = parseScalar(line.slice(separator + 1));
  }
  return { data, body: match[2].trimEnd() };
}

function formatScalar(value) {
  const text = String(value ?? '').trim();
  if (/[\r\n]/.test(text)) throw new Error('Front Matter値に改行は使用できません');
  if (/[:#]|^[-?!&*{}[\],>|%@`]|^(true|false|null|~|\d+(?:\.\d+)?)$/i.test(text)) {
    return JSON.stringify(text);
  }
  return text;
}

export function serializeMarkdown(data, body) {
  const preferred = [
    'id', 'title', 'status', 'owner', 'priority', 'due', 'requirement', 'plan',
    'frontend_repo', 'backend_repo'
  ];
  const keys = [...preferred.filter((key) => key in data), ...Object.keys(data).filter((key) => !preferred.includes(key))];
  const frontMatter = keys.map((key) => `${key}: ${formatScalar(data[key])}`).join('\n');
  return `---\n${frontMatter}\n---\n\n${String(body ?? '').trim()}\n`;
}

export function validateTask(task) {
  for (const field of REQUIRED_FIELDS) {
    if (!String(task[field] ?? '').trim()) throw new Error(`${field}は必須です`);
  }
  if (!/^EPF-\d{4}$/.test(task.id)) throw new Error('idはEPF-0000形式で指定してください');
  if (!STATUSES.includes(task.status)) throw new Error(`statusは${STATUSES.join(', ')}のいずれかです`);
  if (!PRIORITIES.includes(task.priority)) throw new Error(`priorityは${PRIORITIES.join(', ')}のいずれかです`);
  if (task.requirement && !/^REQ-\d{4}$/.test(task.requirement)) throw new Error('requirementはREQ-0000形式で指定してください');
  if (task.due && !/^\d{4}-\d{2}-\d{2}$/.test(task.due)) throw new Error('dueはYYYY-MM-DD形式で指定してください');
}

function taskPath(root, id) {
  if (!/^EPF-\d{4}$/.test(id)) throw new Error('不正なTask IDです');
  return path.join(root, 'tasks', `${id}.md`);
}

export async function listTasks(root) {
  const directory = path.join(root, 'tasks');
  const files = (await fs.readdir(directory)).filter((name) => /^EPF-\d{4}\.md$/.test(name)).sort();
  const results = [];
  for (const file of files) {
    try {
      const parsed = parseMarkdown(await fs.readFile(path.join(directory, file), 'utf8'));
      validateTask(parsed.data);
      results.push({ ...parsed.data, body: parsed.body });
    } catch (error) {
      results.push({ id: file.replace('.md', ''), invalid: true, error: error.message });
    }
  }
  return results;
}

export async function readTask(root, id) {
  const parsed = parseMarkdown(await fs.readFile(taskPath(root, id), 'utf8'));
  validateTask(parsed.data);
  return { ...parsed.data, body: parsed.body };
}

export async function updateTask(root, id, changes) {
  const existing = await readTask(root, id);
  const allowed = ['title', 'status', 'owner', 'priority', 'due', 'requirement', 'plan', 'frontend_repo', 'backend_repo'];
  const data = { ...existing };
  delete data.body;
  for (const key of allowed) {
    if (key in changes) data[key] = String(changes[key] ?? '').trim();
  }
  const body = 'body' in changes ? String(changes.body ?? '') : existing.body;
  validateTask(data);
  await fs.writeFile(taskPath(root, id), serializeMarkdown(data, body), 'utf8');
  return { ...data, body };
}

export async function nextTaskId(root) {
  const tasks = await listTasks(root);
  const max = tasks.reduce((value, task) => Math.max(value, Number(task.id?.slice(4)) || 0), 0);
  return `EPF-${String(max + 1).padStart(4, '0')}`;
}

export async function createTask(root, input) {
  const id = await nextTaskId(root);
  const data = {
    id,
    title: String(input.title || '新しいタスク').trim(),
    status: STATUSES.includes(input.status) ? input.status : 'backlog',
    owner: String(input.owner || 'unassigned').trim(),
    priority: PRIORITIES.includes(input.priority) ? input.priority : 'medium',
    due: String(input.due || '').trim(),
    requirement: /^REQ-\d{4}$/.test(input.requirement || '') ? input.requirement : 'REQ-0001',
    plan: String(input.plan || 'PLAN-0001').trim()
  };
  const body = String(input.body || `# 背景\n\nAI Chatから作成されたタスク。\n\n# 目的\n\n${data.title}を実現する。\n\n# 完了条件\n\n- [ ] 実装方針を確認する\n- [ ] 変更を実装する\n- [ ] 動作確認する\n\n# 関連\n\n- Requirement: ${data.requirement}\n- Plan: ${data.plan}`);
  validateTask(data);
  await fs.writeFile(taskPath(root, id), serializeMarkdown(data, body), { encoding: 'utf8', flag: 'wx' });
  return { ...data, body };
}

export async function generateWbs(root) {
  const tasks = (await listTasks(root)).filter((task) => !task.invalid);
  const order = new Map(STATUSES.map((status, index) => [status, index]));
  tasks.sort((a, b) => order.get(a.status) - order.get(b.status) || a.id.localeCompare(b.id));
  const escape = (value) => String(value || '').replaceAll('|', '\\|').replaceAll('\n', ' ');
  const lines = [
    '# WBS', '',
    '> このファイルは `tasks/*.md` から生成される派生Viewです。直接編集しないでください。', '',
    `生成日時: ${new Date().toISOString()}`, '',
    '| ID | Task | Status | Owner | Priority | Due | Requirement |',
    '|---|---|---|---|---|---|---|',
    ...tasks.map((task) => `| ${task.id} | ${escape(task.title)} | ${task.status} | ${escape(task.owner)} | ${task.priority} | ${task.due || '-'} | ${task.requirement} |`),
    ''
  ];
  const target = path.join(root, 'views', 'wbs.md');
  await fs.writeFile(target, lines.join('\n'), 'utf8');
  return { path: 'views/wbs.md', taskCount: tasks.length };
}
