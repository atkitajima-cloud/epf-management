const statuses = [
  { id: 'backlog', label: 'Backlog', color: '#8b94a7' },
  { id: 'ready', label: 'Ready', color: '#4385d0' },
  { id: 'doing', label: 'Doing', color: '#d18a2d' },
  { id: 'review', label: 'Review', color: '#8b59c5' },
  { id: 'done', label: 'Done', color: '#3d9871' }
];

const state = { tasks: [], draggingId: null };
const board = document.querySelector('#board');
const dialog = document.querySelector('#taskDialog');
const taskForm = document.querySelector('#taskForm');
const messages = document.querySelector('#messages');

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function renderBoard() {
  board.innerHTML = statuses.map((status) => {
    const tasks = state.tasks.filter((task) => task.status === status.id && !task.invalid);
    return `
      <section class="column" data-status="${status.id}" style="--status-color:${status.color}">
        <header class="column-head">
          <span class="column-title"><span class="status-dot"></span>${status.label}</span>
          <span class="column-count">${tasks.length}</span>
        </header>
        <div class="card-list">
          ${tasks.map(renderCard).join('')}
        </div>
      </section>`;
  }).join('');
  document.querySelector('#taskCount').textContent = `${state.tasks.filter((task) => !task.invalid).length} tasks`;
  wireBoardEvents();
}

function renderCard(task) {
  return `
    <article class="task-card" draggable="true" tabindex="0" data-id="${task.id}" aria-label="${escapeHtml(task.title)}">
      <div class="card-top"><span class="task-id">${task.id}</span><span class="priority ${task.priority}">${task.priority}</span></div>
      <div class="card-title">${escapeHtml(task.title)}</div>
      <div class="card-meta"><span class="owner">◉ ${escapeHtml(task.owner)}</span><span>${task.due ? `◷ ${task.due.slice(5)}` : '期限なし'}</span></div>
    </article>`;
}

function wireBoardEvents() {
  document.querySelectorAll('.task-card').forEach((card) => {
    card.addEventListener('click', () => openTask(card.dataset.id));
    card.addEventListener('keydown', (event) => { if (event.key === 'Enter') openTask(card.dataset.id); });
    card.addEventListener('dragstart', () => {
      state.draggingId = card.dataset.id;
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => {
      state.draggingId = null;
      card.classList.remove('dragging');
      document.querySelectorAll('.drag-over').forEach((element) => element.classList.remove('drag-over'));
    });
  });
  document.querySelectorAll('.column').forEach((column) => {
    column.addEventListener('dragover', (event) => { event.preventDefault(); column.classList.add('drag-over'); });
    column.addEventListener('dragleave', () => column.classList.remove('drag-over'));
    column.addEventListener('drop', async (event) => {
      event.preventDefault();
      column.classList.remove('drag-over');
      const task = state.tasks.find((item) => item.id === state.draggingId);
      if (!task || task.status === column.dataset.status) return;
      const previous = task.status;
      task.status = column.dataset.status;
      renderBoard();
      try {
        await api(`/api/tasks/${task.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: task.status }) });
        toast(`${task.id} を ${task.status} に更新しました`);
        loadGit();
      } catch (error) {
        task.status = previous;
        renderBoard();
        toast(error.message);
      }
    });
  });
}

async function loadTasks() {
  const { tasks } = await api('/api/tasks');
  state.tasks = tasks;
  renderBoard();
}

async function openTask(id) {
  try {
    const { task } = await api(`/api/tasks/${id}`);
    document.querySelector('#dialogTaskId').textContent = task.id;
    for (const field of ['title', 'status', 'owner', 'priority', 'start', 'due', 'depends_on', 'requirement', 'body']) {
      taskForm.elements[field].value = task[field] || '';
    }
    document.querySelector('#saveStatus').textContent = '';
    dialog.showModal();
  } catch (error) { toast(error.message); }
}

taskForm.elements.status.innerHTML = statuses.map((status) => `<option value="${status.id}">${status.label}</option>`).join('');
taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = document.querySelector('#dialogTaskId').textContent;
  const payload = Object.fromEntries(new FormData(taskForm));
  const button = taskForm.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    await api(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    dialog.close();
    await Promise.all([loadTasks(), loadGit()]);
    toast(`${id} を保存しました`);
  } catch (error) {
    document.querySelector('#saveStatus').textContent = error.message;
  } finally { button.disabled = false; }
});
const createDialog = document.querySelector('#createDialog');
const createForm = document.querySelector('#createForm');
createForm.elements.status.innerHTML = statuses.map((status) => `<option value="${status.id}">${status.label}</option>`).join('');

document.querySelector('#newTaskButton').addEventListener('click', async () => {
  try {
    const { requirements } = await api('/api/requirements');
    createForm.elements.requirement.innerHTML = requirements
      .map((item) => `<option value="${item.id}">${escapeHtml(item.id)} ${escapeHtml(item.title)}</option>`).join('');
    createForm.reset();
    document.querySelector('#createStatus').textContent = '';
    createDialog.showModal();
  } catch (error) { toast(error.message); }
});
createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(createForm));
  const button = createForm.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const { task } = await api('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
    createDialog.close();
    await Promise.all([loadTasks(), loadGit()]);
    toast(`${task.id} を作成しました`);
  } catch (error) {
    document.querySelector('#createStatus').textContent = error.message;
  } finally { button.disabled = false; }
});
document.querySelector('#closeCreateDialog').addEventListener('click', () => createDialog.close());
document.querySelector('#cancelCreateDialog').addEventListener('click', () => createDialog.close());
document.querySelector('#closeDialog').addEventListener('click', () => dialog.close());
document.querySelector('#cancelDialog').addEventListener('click', () => dialog.close());

function addMessage(text, type = 'assistant') {
  const element = document.createElement('div');
  element.className = `message ${type}`;
  element.textContent = text;
  messages.append(element);
  messages.scrollTop = messages.scrollHeight;
  return element;
}

const chatForm = document.querySelector('#chatForm');
const chatInput = document.querySelector('#chatInput');

chatInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = chatInput;
  const message = input.value.trim();
  if (!message) return;
  addMessage(message, 'user');
  input.value = '';
  const pending = addMessage('分析中...', 'assistant');
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  try {
    const response = await api('/api/chat', { method: 'POST', body: JSON.stringify({ message }) });
    pending.textContent = response.result.message;
    if (response.createdTask) pending.textContent += `\n\n${response.createdTask.id} を作成しました。`;
    if (response.wbs) pending.textContent += `\n\n${response.wbs.taskCount}件からWBSを更新しました。`;
    if (response.fallbackUsed) addMessage(`Codexを利用できなかったためMockで継続しました: ${response.warning}`, 'warning');
    await Promise.all([loadTasks(), loadGit()]);
  } catch (error) {
    pending.textContent = `エラー: ${error.message}`;
    pending.classList.add('warning');
  } finally { button.disabled = false; }
});

async function loadGit() {
  const container = document.querySelector('#gitStatus');
  try {
    const git = await api('/api/git/status');
    if (!git.isRepository) return void (container.textContent = 'Git repositoryではありません');
    document.querySelector('#pullButton').disabled = !git.upstream || git.changes.length > 0;
    document.querySelector('#commitPushButton').disabled = !git.upstream || git.changes.length === 0;
    container.innerHTML = `<strong>${escapeHtml(git.branch)}</strong> · ${git.changes.length} changes` +
      (git.changes.length ? `<div class="git-files">${git.changes.map((item) => `${escapeHtml(item.status)} ${escapeHtml(item.path)}`).join('<br>')}</div>` : '<div>作業ツリーはクリーンです</div>');
  } catch (error) { container.textContent = error.message; }
}

async function loadMeta() {
  try {
    const meta = await api('/api/meta');
    document.querySelector('#adapterBadge').textContent = `AI: ${meta.adapter}${meta.fallback ? ` → ${meta.fallback}` : ''}`;
  } catch { document.querySelector('#adapterBadge').textContent = 'AI: unavailable'; }
}

document.querySelector('#refreshButton').addEventListener('click', () => Promise.all([loadTasks(), loadGit()]));
document.querySelector('#gitRefresh').addEventListener('click', loadGit);
async function gitPreview() { return api('/api/git/preview'); }
async function runGitOperation(button, busyText, action) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = busyText;
  try { await action(); } finally { button.textContent = original; await loadGit(); }
}
document.querySelector('#pullButton').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  try {
    const preview = await gitPreview();
    if (!preview.canPull) throw new Error(preview.changes.length ? '未コミット変更があります。先にCommit & Pushしてください' : 'upstreamが設定されていません');
    if (!window.confirm(`${preview.upstream} から早送り更新のみでPullします。続行しますか？`)) return;
    await runGitOperation(button, '取得中...', async () => {
      const result = await api('/api/git/pull', { method: 'POST' });
      await loadTasks(); toast(result.output || 'Pullが完了しました');
    });
  } catch (error) { toast(error.message); }
});
document.querySelector('#commitPushButton').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  try {
    const preview = await gitPreview();
    if (!preview.canCommitPush) throw new Error(preview.changes.length ? 'Git競合またはupstream未設定です' : 'コミットする変更はありません');
    const files = preview.changes.map((item) => `${item.status} ${item.path}`).join('\n');
    const commitMessage = window.prompt(`以下の変更をCommit & Pushします。\n\n${files}\n\nコミットメッセージ:`, '変更を更新');
    if (commitMessage === null) return;
    await runGitOperation(button, 'コミット中...', async () => {
      const result = await api('/api/git/commit-push', { method: 'POST', body: JSON.stringify({ message: commitMessage }) });
      toast(result.pushed ? `${result.commit} を ${result.upstream} へ送信しました` : `${result.commit} をコミットしました。Pushに失敗: ${result.pushError}`);
    });
  } catch (error) { toast(error.message); }
});
document.querySelector('#wbsButton').addEventListener('click', async (event) => {
  event.currentTarget.disabled = true;
  try {
    const result = await api('/api/wbs', { method: 'POST' });
    toast(`${result.taskCount}件からWBSを生成しました`);
    loadGit();
  } catch (error) { toast(error.message); }
  finally { event.currentTarget.disabled = false; }
});

let toastTimer;
function toast(message) {
  const element = document.querySelector('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 2600);
}

const taskFromGantt = new URLSearchParams(window.location.search).get('task');
Promise.all([loadTasks(), loadGit(), loadMeta()]).then(() => {
  if (/^EPF-\d{4}$/.test(taskFromGantt || '')) openTask(taskFromGantt);
}).catch((error) => toast(error.message));
