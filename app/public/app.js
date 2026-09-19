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
    for (const field of ['title', 'status', 'owner', 'priority', 'due', 'requirement', 'body']) {
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

document.querySelector('#chatForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.querySelector('#chatInput');
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

Promise.all([loadTasks(), loadGit(), loadMeta()]).catch((error) => toast(error.message));
