import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createTask, generateWbs, listTasks, parseMarkdown, serializeMarkdown, updateTask } from '../lib/markdown.js';

const sample = {
  id: 'EPF-0001', title: 'Sample', status: 'backlog', owner: 'tester',
  priority: 'medium', due: '2026-09-30', requirement: 'REQ-0001', plan: 'PLAN-0001'
};

test('Front Matterと本文を往復できる', () => {
  const source = serializeMarkdown(sample, '# 完了条件\n\n- [ ] test');
  const parsed = parseMarkdown(source);
  assert.deepEqual(parsed.data, sample);
  assert.match(parsed.body, /完了条件/);
});

test('Task作成・status更新・WBS生成がMarkdownへ反映される', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'epf-management-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'tasks'));
  await fs.mkdir(path.join(root, 'views'));
  await fs.writeFile(path.join(root, 'tasks', 'EPF-0001.md'), serializeMarkdown(sample, '# Sample'), 'utf8');

  const created = await createTask(root, {
    title: 'AI created', priority: 'high', requirement: 'REQ-0001', body: '# 目的\n\nTest'
  });
  assert.equal(created.id, 'EPF-0002');
  assert.equal((await listTasks(root)).length, 2);

  const updated = await updateTask(root, 'EPF-0002', { status: 'doing', owner: 'agent' });
  assert.equal(updated.status, 'doing');
  assert.equal(updated.owner, 'agent');

  const result = await generateWbs(root);
  assert.equal(result.taskCount, 2);
  const wbs = await fs.readFile(path.join(root, 'views', 'wbs.md'), 'utf8');
  assert.match(wbs, /EPF-0002/);
  assert.match(wbs, /AI created/);
});
