import fs from 'node:fs/promises';
import path from 'node:path';

export const STATUSES = ['backlog', 'ready', 'doing', 'review', 'done'];
export const PRIORITIES = ['low', 'medium', 'high'];
export const REQUIRED_FIELDS = ['id', 'title', 'status', 'owner', 'priority', 'requirement'];

function parseScalar(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1);
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
    data[line.slice(0, separator).trim()] = parseScalar(line.slice(separator + 1));
  }
  return { data, body: match[2].trimEnd() };
}

function formatScalar(value) {
  const text = String(value ?? '').trim();
  if (/[\r\n]/.test(text)) throw new Error('Front Matter値に改行は使用できません');
  if (/[:#]|^[-?!&*{}[\],>|%@`]|^(true|false|null|~|\d+(?:\.\d+)?)$/i.test(text)) return JSON.stringify(text);
  return text;
}

export function serializeMarkdown(data, body) {
  const preferred = ['id', 'title', 'status', 'owner', 'priority', 'start', 'due', 'depends_on', 'requirement', 'plan', 'frontend_repo', 'backend_repo'];
  const keys = [...preferred.filter((key) => key in data), ...Object.keys(data).filter((key) => !preferred.includes(key))];
  return `---\n${keys.map((key) => data[key] === '' ? `${key}:` : `${key}: ${formatScalar(data[key])}`).join('\n')}\n---\n\n${String(body ?? '').trim()}\n`;
}

export function parseDependencies(value) {
  return String(value || '').split(',').map((id) => id.trim()).filter(Boolean);
}

export function validateTask(task) {
  for (const field of REQUIRED_FIELDS) if (!String(task[field] ?? '').trim()) throw new Error(`${field}は必須です`);
  if (!/^EPF-\d{4}$/.test(task.id)) throw new Error('idはEPF-0000形式で指定してください');
  if (!STATUSES.includes(task.status)) throw new Error(`statusは${STATUSES.join(', ')}のいずれかです`);
  if (!PRIORITIES.includes(task.priority)) throw new Error(`priorityは${PRIORITIES.join(', ')}のいずれかです`);
  if (task.requirement && !/^REQ-\d{4}$/.test(task.requirement)) throw new Error('requirementはREQ-0000形式で指定してください');
  for (const field of ['start', 'due']) {
    if (task[field] && !/^\d{4}-\d{2}-\d{2}$/.test(task[field])) throw new Error(`${field}はYYYY-MM-DD形式で指定してください`);
  }
  if (task.start && task.due && task.start > task.due) throw new Error('startはdue以前の日付を指定してください');
  for (const id of parseDependencies(task.depends_on)) if (!/^EPF-\d{4}$/.test(id)) throw new Error('depends_onはEPF-0000形式をカンマ区切りで指定してください');
}

export function progressForTask(task) {
  if (task.status === 'done') return { value: 100, estimated: false, completed: 1, total: 1 };
  const checks = [...String(task.body || '').matchAll(/^\s*-\s+\[([ xX])\]\s+/gm)];
  if (checks.length) {
    const completed = checks.filter((match) => match[1].toLowerCase() === 'x').length;
    return { value: Math.round((completed / checks.length) * 100), estimated: false, completed, total: checks.length };
  }
  return { value: ({ backlog: 0, ready: 0, doing: 50, review: 90 }[task.status] ?? 0), estimated: true, completed: 0, total: 0 };
}

function dateOffset(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function elapsedPercent(start, due, today) {
  const total = Date.parse(`${due}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  if (total <= 0) return today >= due ? 100 : 0;
  const elapsed = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
}

function findCircularDependencies(tasksById) {
  const circular = new Set();
  const visiting = new Set();
  const visited = new Set();
  function visit(id, chain = []) {
    if (visiting.has(id)) { for (const item of chain.slice(chain.indexOf(id))) circular.add(item); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of parseDependencies(tasksById.get(id)?.depends_on)) if (tasksById.has(dependency)) visit(dependency, [...chain, id]);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of tasksById.keys()) visit(id);
  return circular;
}

export function buildGanttData(tasks, today = new Date().toISOString().slice(0, 10)) {
  const validTasks = tasks.filter((task) => !task.invalid);
  const tasksById = new Map(validTasks.map((task) => [task.id, task]));
  const circular = findCircularDependencies(tasksById);
  const warnings = [];
  const scheduled = [];
  const rows = validTasks.map((task) => {
    const dependencies = parseDependencies(task.depends_on);
    const progress = progressForTask(task);
    const missingDependencies = dependencies.filter((id) => !tasksById.has(id));
    const selfDependency = dependencies.includes(task.id);
    const incompleteDependencies = dependencies.filter((id) => tasksById.get(id)?.status !== 'done');
    const invalidSchedule = Boolean(task.start && task.due && task.start > task.due);
    let scheduleStatus = 'on_track';
    if (task.status === 'done') scheduleStatus = 'done';
    else if (invalidSchedule) scheduleStatus = 'invalid';
    else if (!task.start || !task.due) scheduleStatus = 'unscheduled';
    else if (task.due < today) scheduleStatus = 'overdue';
    else if ((task.status === 'backlog' || task.status === 'ready') && task.start < today) scheduleStatus = 'start_late';
    else if (incompleteDependencies.length) scheduleStatus = 'blocked';
    else if (task.due <= dateOffset(today, 2) || elapsedPercent(task.start, task.due, today) - progress.value >= 25) scheduleStatus = 'at_risk';
    if (task.start && task.due && !invalidSchedule) scheduled.push(task);
    if (missingDependencies.length) warnings.push({ id: task.id, message: `存在しない先行Task: ${missingDependencies.join(', ')}` });
    if (selfDependency) warnings.push({ id: task.id, message: '自分自身を先行Taskに指定しています' });
    if (circular.has(task.id)) warnings.push({ id: task.id, message: '循環する依存関係があります' });
    if (invalidSchedule) warnings.push({ id: task.id, message: '開始日が期限より後です' });
    return { ...task, dependencies, progress, scheduleStatus, incompleteDependencies, warnings: warnings.filter((warning) => warning.id === task.id).map((warning) => warning.message) };
  });
  const dates = scheduled.flatMap((task) => [task.start, task.due]);
  const range = dates.length ? { start: [...dates, today].sort()[0], end: [...dates, today].sort().at(-1) } : { start: today, end: dateOffset(today, 30) };
  const count = (status) => rows.filter((task) => task.scheduleStatus === status).length;
  return {
    generatedAt: new Date().toISOString(), today, range, warnings,
    summary: { total: rows.length, inProgress: rows.filter((task) => ['doing', 'review'].includes(task.status)).length, overdue: count('overdue'), atRisk: count('at_risk') + count('start_late') + count('blocked'), unscheduled: count('unscheduled') + count('invalid') },
    tasks: rows
  };
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
    } catch (error) { results.push({ id: file.replace('.md', ''), invalid: true, error: error.message }); }
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
  const allowed = ['title', 'status', 'owner', 'priority', 'start', 'due', 'depends_on', 'requirement', 'plan', 'frontend_repo', 'backend_repo'];
  const data = { ...existing };
  delete data.body;
  for (const key of allowed) if (key in changes) data[key] = String(changes[key] ?? '').trim();
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
    id, title: String(input.title || '新しいタスク').trim(), status: STATUSES.includes(input.status) ? input.status : 'backlog',
    owner: String(input.owner || 'unassigned').trim(), priority: PRIORITIES.includes(input.priority) ? input.priority : 'medium',
    start: String(input.start || '').trim(), due: String(input.due || '').trim(), depends_on: String(input.depends_on || '').trim(),
    requirement: /^REQ-\d{4}$/.test(input.requirement || '') ? input.requirement : 'REQ-0001', plan: String(input.plan || 'PLAN-0001').trim()
  };
  const body = String(input.body || `# 背景\n\nAI Chatから作成されたタスク。\n\n# 目的\n\n${data.title}を実現する。\n\n# 完了条件\n\n- [ ] 実装方針を確認する\n- [ ] 変更を実装する\n- [ ] 動作確認する\n\n# 関連\n\n- Requirement: ${data.requirement}\n- Plan: ${data.plan}`);
  validateTask(data);
  await fs.writeFile(taskPath(root, id), serializeMarkdown(data, body), { encoding: 'utf8', flag: 'wx' });
  return { ...data, body };
}

export async function generateWbs(root) {
  const tasks = (await listTasks(root)).filter((task) => !task.invalid);
  const ganttById = new Map(buildGanttData(tasks).tasks.map((task) => [task.id, task]));
  const order = new Map(STATUSES.map((status, index) => [status, index]));
  tasks.sort((a, b) => order.get(a.status) - order.get(b.status) || a.id.localeCompare(b.id));
  const escape = (value) => String(value || '').replaceAll('|', '\\|').replaceAll('\n', ' ');
  const lines = [
    '# WBS', '', '> このファイルは `tasks/*.md` から生成される派生Viewです。直接編集しないでください。', '',
    `生成日時: ${new Date().toISOString()}`, '',
    '| ID | Task | Status | Owner | Priority | Start | Due | Progress | Schedule | Dependencies | Requirement |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...tasks.map((task) => {
      const item = ganttById.get(task.id);
      return `| ${task.id} | ${escape(task.title)} | ${task.status} | ${escape(task.owner)} | ${task.priority} | ${task.start || '-'} | ${task.due || '-'} | ${item.progress.value}%${item.progress.estimated ? ' (推定)' : ''} | ${item.scheduleStatus} | ${item.dependencies.join(', ') || '-'} | ${task.requirement} |`;
    }), ''
  ];
  await fs.writeFile(path.join(root, 'views', 'wbs.md'), lines.join('\n'), 'utf8');
  return { path: 'views/wbs.md', taskCount: tasks.length };
}
