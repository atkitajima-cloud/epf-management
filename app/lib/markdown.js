import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const STATUSES = ['backlog', 'ready', 'doing', 'review', 'done'];
export const PRIORITIES = ['low', 'medium', 'high'];
export const TARGET_REPOSITORIES = ['epf-project', 'epf-management', 'epf-backend', 'epf-frontend', 'common'];
export const REQUIRED_FIELDS = ['id', 'title', 'status', 'owner', 'priority', 'target_repo'];

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
  const preferred = ['id', 'title', 'status', 'completed_at', 'owner', 'priority', 'target_repo', 'start', 'due', 'depends_on', 'requirement', 'plan'];
  const legacy = new Set(['frontend_repo', 'backend_repo']);
  const keys = [...preferred.filter((key) => key in data), ...Object.keys(data).filter((key) => !preferred.includes(key) && !legacy.has(key))];
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
  if (!TARGET_REPOSITORIES.includes(task.target_repo)) throw new Error(`target_repoは${TARGET_REPOSITORIES.join(', ')}のいずれかである必要があります`);
  if (task.completed_at && !/^\d{4}-\d{2}-\d{2}$/.test(task.completed_at)) throw new Error('completed_atはYYYY-MM-DD形式で指定してください');
  if (task.status !== 'done' && task.completed_at) throw new Error('completed_atはstatusがdoneのTaskだけに指定できます');
  if (task.status === 'done' && !task.completed_at) throw new Error('statusがdoneのTaskにはcompleted_atが必要です');
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

function todayInJapan() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts();
  const value = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
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

// Task ID以外のパスを受け取らず、ローカルのTask MarkdownだけをVS Code URLへ変換する。
export function vscodeUriForTask(root, id) {
  const tasksDir = path.resolve(root, 'tasks');
  const target = path.resolve(taskPath(root, id));
  if (!target.startsWith(`${tasksDir}${path.sep}`)) throw new Error('Taskファイルがtasks配下にありません');
  return `vscode://file${pathToFileURL(target).pathname}`;
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

export function sortTasksForBoard(tasks) {
  const active = tasks.filter((task) => task.status !== 'done');
  const completed = tasks.filter((task) => task.status === 'done').sort((a, b) =>
    (b.completed_at || '').localeCompare(a.completed_at || '') || b.id.localeCompare(a.id));
  return [...active, ...completed];
}

export async function readTask(root, id) {
  const parsed = parseMarkdown(await fs.readFile(taskPath(root, id), 'utf8'));
  validateTask(parsed.data);
  return { ...parsed.data, body: parsed.body };
}

const OWNERS_FILE = 'masters/owners.md';

// masters/owners.mdの「- ID」形式の行だけを担当者として読む。ファイルがなければ空配列を返す。
export async function listOwners(root) {
  let source;
  try { source = await fs.readFile(path.join(root, OWNERS_FILE), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const owners = [];
  for (const line of source.replace(/\r\n/g, '\n').split('\n')) {
    const id = line.match(/^- ([A-Za-z0-9_-]+)\s*$/)?.[1];
    if (id && !owners.includes(id)) owners.push(id);
  }
  return owners;
}

async function requireOwners(root) {
  const owners = await listOwners(root);
  if (!owners.length) throw new Error(`担当者マスタ（${OWNERS_FILE}）が見つからないか、担当者が登録されていません`);
  return owners;
}

function ownerNotFoundMessage(owner) {
  return `担当者 ${owner} は担当者マスタ（${OWNERS_FILE}）にありません`;
}

export async function updateTask(root, id, changes) {
  const existing = await readTask(root, id);
  const allowed = ['title', 'status', 'owner', 'priority', 'target_repo', 'start', 'due', 'depends_on', 'requirement', 'plan'];
  const data = { ...existing };
  delete data.body;
  delete data.frontend_repo;
  delete data.backend_repo;
  for (const key of allowed) if (key in changes) data[key] = String(changes[key] ?? '').trim();
  if (data.status === 'done' && existing.status !== 'done') data.completed_at = todayInJapan();
  if (data.status !== 'done') data.completed_at = '';
  const body = 'body' in changes ? String(changes.body ?? '') : existing.body;
  validateTask(data);
  // 担当者を変更するときだけマスタと照合する。担当者を変えない更新は、マスタ未登録の値でも失敗させない。
  if (data.owner !== existing.owner && !(await requireOwners(root)).includes(data.owner)) throw new Error(ownerNotFoundMessage(data.owner));
  await fs.writeFile(taskPath(root, id), serializeMarkdown(data, body), 'utf8');
  return { ...data, body };
}

export async function nextTaskId(root) {
  const tasks = await listTasks(root);
  const max = tasks.reduce((value, task) => Math.max(value, Number(task.id?.slice(4)) || 0), 0);
  return `EPF-${String(max + 1).padStart(4, '0')}`;
}

export const BODY_TEMPLATE = `# 背景

（未記入）

# 目的

（未記入）

# 完了条件

- [ ] 
- [ ] 
- [ ] 

# 関連

（未記入）`;

export async function listRequirements(root) {
  const directory = path.join(root, 'requirements');
  const files = (await fs.readdir(directory).catch(() => [])).filter((name) => /^REQ-\d{4}\.md$/.test(name)).sort();
  const results = [];
  for (const file of files) {
    let title = '';
    try { title = parseMarkdown(await fs.readFile(path.join(directory, file), 'utf8')).data.title || ''; } catch { /* タイトルなしで一覧に出す */ }
    results.push({ id: file.replace('.md', ''), title });
  }
  return results;
}

export async function createTask(root, input) {
  const text = (value) => String(value ?? '').trim();
  const choose = (value, defaultValue) => value || defaultValue;
  const requirement = text(input.requirement);
  const data = {
    title: text(input.title),
    status: choose(input.status, 'backlog'),
    owner: text(input.owner),
    priority: choose(input.priority, 'medium'), target_repo: choose(text(input.target_repo), 'common'),
    completed_at: '',
    start: text(input.start), due: text(input.due), depends_on: text(input.depends_on), requirement
  };
  if (data.status === 'done') data.completed_at = todayInJapan();
  validateTask({ id: 'EPF-0000', ...data });
  const owners = await requireOwners(root);
  if (!owners.includes(data.owner)) throw new Error(ownerNotFoundMessage(data.owner));
  const requirements = await listRequirements(root);
  if (requirement && !requirements.some((item) => item.id === requirement)) throw new Error(`${requirement}は存在しません`);
  const existing = new Set((await listTasks(root)).map((task) => task.id));
  for (const id of parseDependencies(data.depends_on)) if (!existing.has(id)) throw new Error(`先行Task ${id}は存在しません`);
  const body = text(input.body) || BODY_TEMPLATE;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = await nextTaskId(root);
    try {
      await fs.writeFile(taskPath(root, id), serializeMarkdown({ id, ...data }, body), { encoding: 'utf8', flag: 'wx' });
      return { id, ...data, body };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  throw new Error('Task IDの採番に失敗しました。再度お試しください');
}

// today（YYYY-MM-DD）は日程判定の基準日。テストで固定するために指定できる。
export async function generateWbs(root, today) {
  const tasks = (await listTasks(root)).filter((task) => !task.invalid);
  const ganttById = new Map(buildGanttData(tasks, today).tasks.map((task) => [task.id, task]));
  const order = new Map(STATUSES.map((status, index) => [status, index]));
  tasks.sort((a, b) => order.get(a.status) - order.get(b.status) || a.id.localeCompare(b.id));
  const escape = (value) => String(value || '').replaceAll('|', '\\|').replaceAll('\n', ' ');
  const lines = [
    '# WBS', '', '> このファイルは `tasks/*.md` から生成される派生Viewです。直接編集しないでください。', '',
    '| ID | Task | Status | Completed at | Owner | Priority | Target repo | Start | Due | Progress | Schedule | Dependencies | Requirement |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...tasks.map((task) => {
      const item = ganttById.get(task.id);
      return `| ${task.id} | ${escape(task.title)} | ${task.status} | ${task.completed_at || '-'} | ${escape(task.owner)} | ${task.priority} | ${task.target_repo} | ${task.start || '-'} | ${task.due || '-'} | ${item.progress.value}%${item.progress.estimated ? ' (推定)' : ''} | ${item.scheduleStatus} | ${item.dependencies.join(', ') || '-'} | ${task.requirement || '-'} |`;
    }), ''
  ];
  await fs.writeFile(path.join(root, 'views', 'wbs.md'), lines.join('\n'), 'utf8');
  return { path: 'views/wbs.md', taskCount: tasks.length };
}
