import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTask, generateWbs, listTasks, readTask, updateTask } from './lib/markdown.js';
import { getGitStatus } from './lib/git.js';
import { createAdapter } from './lib/adapters.js';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(appDir, '..');
const publicDir = path.join(appDir, 'public');
const port = Number(process.env.PORT || 4173);
const { adapter, fallback } = createAdapter({ root, schemaPath: path.join(appDir, 'codex-response.schema.json') });

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let source = '';
  for await (const chunk of request) {
    source += chunk;
    if (Buffer.byteLength(source) > 1_000_000) throw new Error('リクエストが大きすぎます');
  }
  try { return source ? JSON.parse(source) : {}; }
  catch { throw new Error('JSONが不正です'); }
}

async function runAi(message) {
  try {
    return { result: await adapter.run(message), adapter: adapter.name, fallbackUsed: false };
  } catch (error) {
    if (!fallback) throw error;
    return { result: await fallback.run(message), adapter: fallback.name, fallbackUsed: true, warning: error.message };
  }
}

async function handleApi(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/api/tasks') {
    return sendJson(response, 200, { tasks: await listTasks(root) });
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(EPF-\d{4})$/);
  if (request.method === 'GET' && taskMatch) {
    return sendJson(response, 200, { task: await readTask(root, taskMatch[1]) });
  }
  if (request.method === 'PUT' && taskMatch) {
    return sendJson(response, 200, { task: await updateTask(root, taskMatch[1], await readJson(request)) });
  }
  if (request.method === 'PATCH' && url.pathname.match(/^\/api\/tasks\/EPF-\d{4}\/status$/)) {
    const id = url.pathname.split('/')[3];
    const { status } = await readJson(request);
    return sendJson(response, 200, { task: await updateTask(root, id, { status }) });
  }
  if (request.method === 'POST' && url.pathname === '/api/chat') {
    const { message } = await readJson(request);
    if (!String(message || '').trim()) return sendJson(response, 400, { error: 'メッセージを入力してください' });
    const ai = await runAi(String(message));
    let createdTask = null;
    let wbs = null;
    if (ai.result.action === 'create_task') createdTask = await createTask(root, ai.result.task || {});
    if (ai.result.action === 'generate_wbs') wbs = await generateWbs(root);
    return sendJson(response, 200, { ...ai, createdTask, wbs });
  }
  if (request.method === 'POST' && url.pathname === '/api/wbs') {
    return sendJson(response, 200, await generateWbs(root));
  }
  if (request.method === 'GET' && url.pathname === '/api/git/status') {
    return sendJson(response, 200, await getGitStatus(root));
  }
  if (request.method === 'GET' && url.pathname === '/api/meta') {
    return sendJson(response, 200, { adapter: adapter.name, fallback: fallback?.name || null, port });
  }
  return false;
}

async function serveStatic(response, url) {
  const requested = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const target = path.resolve(publicDir, requested);
  if (target !== publicDir && !target.startsWith(`${publicDir}${path.sep}`)) return sendJson(response, 403, { error: 'Forbidden' });
  try {
    const content = await fs.readFile(target);
    response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(target)] || 'application/octet-stream' });
    response.end(content);
  } catch (error) {
    if (error.code === 'ENOENT') return sendJson(response, 404, { error: 'Not found' });
    throw error;
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const handled = await handleApi(request, response, url);
      if (handled === false) sendJson(response, 404, { error: 'API not found' });
    } else {
      await serveStatic(response, url);
    }
  } catch (error) {
    const status = error.code === 'ENOENT' ? 404 : 400;
    sendJson(response, status, { error: error.message });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`EPF Management: http://localhost:${port}`);
  console.log(`AI Adapter: ${adapter.name}${fallback ? ` (fallback: ${fallback.name})` : ''}`);
});
