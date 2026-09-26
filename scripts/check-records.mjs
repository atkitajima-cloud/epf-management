#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const managementRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.dirname(managementRoot);
const repos = ['epf-project', 'epf-management', 'epf-backend', 'epf-frontend'];
const argumentsList = process.argv.slice(2);
const staged = argumentsList.includes('--staged');
const report = argumentsList.includes('--report');
const repoOption = argumentsList.indexOf('--repo');
const currentRepo = repoOption < 0 ? null : argumentsList[repoOption + 1];
if (currentRepo && !repos.includes(currentRepo)) throw new Error(`不正なrepo: ${currentRepo}`);

function git(repo, args) {
  return execFileSync('git', args, { cwd: path.join(workspace, repo), encoding: 'utf8', maxBuffer: 10_000_000 });
}

function names(repo) {
  const args = staged && repo === currentRepo
    ? ['ls-files', '--cached', '-z']
    : ['ls-files', '--cached', '--others', '--exclude-standard', '-z'];
  return new Set(git(repo, args).split('\0').filter(Boolean));
}

const indexed = new Map(repos.map((repo) => [repo, names(repo)]));
const stagedPaths = staged && currentRepo
  ? new Set(git(currentRepo, ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).split('\0').filter(Boolean))
  : new Set();
function configSource(repo, name) {
  if (staged && repo === currentRepo) return git(repo, ['show', `:${name}`]);
  return fs.readFileSync(path.join(workspace, repo, name), 'utf8');
}

const taskBaseline = JSON.parse(configSource('epf-management', 'config/task-validation-baseline.json'));
const { parseMarkdown, validateTask } = await import(pathToFileURL(path.join(workspace, 'epf-management', 'app', 'lib', 'markdown.js')).href);
const legacyDone = new Set(taskBaseline.legacyDoneTaskIds);
const uncheckedExceptions = new Set(taskBaseline.uncheckedDoneExceptionIds);
const missingHeadingExceptions = new Set(taskBaseline.missingHeadingExceptionIds || []);
const implementationTasks = new Set(taskBaseline.implementationTaskIds || []);
const errors = [];
const findings = [];

function read(repo, name) {
  if (staged && repo === currentRepo) {
    try { return git(repo, ['show', `:${name}`]); }
    catch { return null; }
  }
  const file = path.join(workspace, repo, name);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

function relativeName(file) {
  return path.relative(workspace, file).replaceAll('\\', '/');
}

function linkedPlan(source) {
  if (!source) return null;
  const links = [...source.matchAll(/\]\(([^)]+\/(?:docs\/exec-plans\/(active|completed)\/[^)]+|plans\/PLAN-\d{4}[^)]*)\.md)\)/g)];
  const managementPlanId = source.match(/^plan:\s*(PLAN-\d{4})\s*$/m)?.[1];
  return (managementPlanId && links.find((match) => match[1].includes(`/plans/${managementPlanId}`)))
    || links.find((match) => match[1].includes('/docs/exec-plans/'))
    || null;
}

function activeLinks(source) {
  const blank = (text) => text.replace(/[^\n]/g, ' ');
  const withoutFences = source.replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[ \t]*$/gm, blank);
  const clean = withoutFences.replace(/`[^`\n]*`/g, blank);
  const definitions = new Map([...clean.matchAll(/^\s{0,3}\[([^\]]+)\]:\s*<?([^>\s]+)>?/gm)]
    .map((match) => [match[1].trim().toLowerCase(), match[2]]));
  const targets = [...clean.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)].map((match) => match[1]);
  for (const match of clean.matchAll(/\[([^\]\n]+)\]\[([^\]\n]*)\]/g)) {
    const key = (match[2] || match[1]).trim().toLowerCase();
    if (definitions.has(key)) targets.push(definitions.get(key));
    else errors.push(`未定義の参照リンク: ${key}`);
  }
  return targets;
}

function targetExists(sourceRepo, sourceName, target) {
  const cleanTarget = target.trim().split('#')[0].replace(/^<|>$/g, '');
  if (!cleanTarget || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(cleanTarget)) return true;
  const absolute = path.resolve(workspace, sourceRepo, path.dirname(sourceName), decodeURIComponent(cleanTarget));
  const relative = relativeName(absolute);
  const [repo, ...parts] = relative.split('/');
  if (!repos.includes(repo)) return fs.existsSync(absolute);
  const name = parts.join('/');
  return indexed.get(repo).has(name) || (!staged && fs.existsSync(absolute));
}

for (const repo of repos) {
  for (const name of indexed.get(repo)) {
    if (!name.endsWith('.md')) continue;
    const source = read(repo, name);
    if (source === null) continue;
    for (const target of activeLinks(source)) {
      if (targetExists(repo, name, target)) continue;
      const sourceName = `${repo}/${name}`;
      const entry = { source: sourceName, target: target.split('#')[0] };
      findings.push(entry);
      errors.push(`切れリンク: ${entry.source} → ${entry.target}`);
    }
  }
}

for (const name of indexed.get('epf-management')) {
  if (!/^tasks\/EPF-(?:\d{4}|\d{17}|\d{8}-\d{6}-\d{3})\.md$/.test(name)) continue;
  const source = read('epf-management', name);
  if (source === null) continue;
  try {
    const task = parseMarkdown(source);
    validateTask(task.data, { legacyDone });
    const id = task.data.id;
    const isNew = staged && currentRepo === 'epf-management' && stagedPaths.has(name)
      && git('epf-management', ['diff', '--cached', '--name-status', '--', name]).startsWith('A');
    if ((isNew || !missingHeadingExceptions.has(id)) && !['# 背景', '# 目的', '# 完了条件', '# 関連'].every((heading) => task.body.split(/\r?\n/).includes(heading))) {
      errors.push(`${id}: Taskテンプレートの見出しが不足`);
    }
    if (task.data.status === 'done') {
      if (!uncheckedExceptions.has(id) && /^\s*-\s+\[ \]\s+/m.test(task.body)) errors.push(`${id}: 未チェックの完了条件`);
      const recordRequired = implementationTasks.has(id) || (!legacyDone.has(id) && ['epf-backend', 'epf-frontend'].includes(task.data.target_repo));
      if (recordRequired) {
        const section = task.body.split(/^## 実装記録\s*$/m)[1]?.split(/^##? /m)[0];
        if (!section || !['branch:', 'Pull Request:', 'merge commit:', 'Pipeline:', '検証:', 'cleanup:'].every((field) => section.includes(field))) {
          errors.push(`${id}: 実装記録の必須項目が不足`);
        }
      }
    }
    const plan = linkedPlan(source);
    if (plan) {
      const planFile = path.resolve(workspace, 'epf-management', 'tasks', plan[1]);
      if (task.data.status === 'done' && plan[2] === 'active') errors.push(`${id}: doneだがExecPlanがactive`);
      if (task.data.status !== 'done' && plan[2] === 'completed' && fs.existsSync(planFile)) errors.push(`${id}: 未完了だがExecPlanがcompleted`);
    }
  } catch (error) { errors.push(`${name}: ${error.message}`); }
}

if (report) console.log(JSON.stringify({ findings, errors }, null, 2));
else {
  for (const error of errors) console.error(error);
  console.log(`文書検査: ${errors.length}件のエラー、切れたリンク${findings.length}件`);
}
if (errors.length && !report) process.exitCode = 1;
