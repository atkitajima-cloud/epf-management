import { orderTasksForKanban } from './kanban-order.js';

// hintは列の見出しの下に常に表示する短い説明、descriptionはマウスを重ねたときに表示する定義。README.mdの表と合わせる。
const statuses = [
  {
    id: 'backlog', label: 'Backlog', color: '#8b94a7', hint: '確認前の候補',
    description: 'まだ確認していない候補。完了条件・担当者・先行Taskが未確認で、着手の順番も決まっていない。'
  },
  {
    id: 'ready', label: 'Ready', color: '#4385d0', hint: '着手できる',
    description: '人が確認済みで、いつでも着手できる状態。完了条件が書かれ、担当者が決まり、先行Taskが終わっているか待つ必要がない。'
  },
  { id: 'doing', label: 'Doing', color: '#d18a2d', hint: '作業中', description: '着手して、作業している。' },
  {
    id: 'review', label: 'Review', color: '#8b59c5', hint: '確認・レビュー待ち',
    description: '作業は終わり、完了条件を満たしているかの確認（レビュー・検証）を待っている。'
  },
  { id: 'done', label: 'Done', color: '#3d9871', hint: '完了条件を満たした', description: '完了条件をすべて満たし、確認が済んだ。' }
];
const state = { tasks: [], repositories: [], draggingId: null };
const board = document.querySelector('#board');
const dialog = document.querySelector('#taskDialog');
const taskForm = document.querySelector('#taskForm');

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

// 処理中のボタンを無効にし、aria-busyで「使えない」状態と区別する（待機カーソルは処理中だけに使う）。
function setBusy(button, busy) {
  button.disabled = busy;
  if (busy) button.setAttribute('aria-busy', 'true');
  else button.removeAttribute('aria-busy');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function repositoryFor(value) {
  return state.repositories.find((repository) => repository.value === value);
}

function repositoryOptions(current = '') {
  return state.repositories.map((repository) => `<option value="${escapeHtml(repository.value)}"${repository.value === current ? ' selected' : ''}>${escapeHtml(repository.label)}</option>`).join('');
}

function repositoryBadge(value) {
  const repository = repositoryFor(value);
  if (!repository) return `<span class="repository">${escapeHtml(value)}</span>`;
  return `<span class="repository" style="color:${repository.color};background:${repository.background}">${escapeHtml(repository.label)}</span>`;
}

function renderInvalidTaskWarning() {
  const invalidTasks = state.tasks.filter((task) => task.invalid);
  const section = document.querySelector('#invalidTaskWarning');
  section.hidden = invalidTasks.length === 0;
  section.querySelector('ul').innerHTML = invalidTasks.map((task) => `<li><b>${escapeHtml(task.id)}</b>: ${escapeHtml(task.error)}</li>`).join('');
}

function renderBoard() {
  const taskOrder = orderTasksForKanban(state.tasks.filter((task) => !task.invalid));
  board.innerHTML = statuses.map((status) => {
    const tasks = status.id === 'done'
      ? taskOrder.doneTasks
      : taskOrder.activeTasks.filter((task) => task.status === status.id);
    return `
      <section class="column" data-status="${status.id}" style="--status-color:${status.color}" title="${escapeHtml(status.description)}">
        <header class="column-head">
          <span class="column-title"><span class="status-dot"></span>${status.label}</span>
          <span class="column-count">${tasks.length}</span>
        </header>
        <p class="column-desc">${escapeHtml(status.hint)}</p>
        <div class="card-list">
          ${tasks.map(renderCard).join('')}
        </div>
      </section>`;
  }).join('');
  document.querySelector('#taskCount').textContent = `${state.tasks.filter((task) => !task.invalid).length} tasks`;
  renderInvalidTaskWarning();
  wireBoardEvents();
}

function renderCard(task) {
  return `
    <article class="task-card" draggable="true" tabindex="0" data-id="${task.id}" aria-label="${escapeHtml(task.title)}">
      <div class="card-top"><span class="task-id">${task.id}</span><span class="card-badges">${repositoryBadge(task.target_repo)}<span class="priority ${task.priority}">${task.priority}</span></span></div>
      <div class="card-title">${escapeHtml(task.title)}</div>
      <div class="card-meta"><span class="owner">◉ ${escapeHtml(task.owner)}</span><span>${task.status === 'done' ? `完了 ${task.completed_at?.slice(5) || '日付不明'}` : task.due ? `◷ ${task.due.slice(5)}` : '期限なし'}</span></div>
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
        const { task: updated } = await api(`/api/tasks/${task.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: task.status, revision: task.revision }) });
        Object.assign(task, updated);
        renderBoard();
        toast(`${task.id} を ${task.status} に更新しました`);
        loadGit();
      } catch (error) {
        if (error.status === 409) {
          await loadTasks();
          toast('他の人が先に更新しました。最新の状態です。もう一度変更してください');
          return;
        }
        task.status = previous;
        renderBoard();
        toast(error.message);
      }
    });
  });
}

async function loadTasks() {
  const { tasks, targetRepositories } = await api('/api/tasks');
  state.tasks = tasks;
  state.repositories = targetRepositories;
  taskForm.elements.target_repo.innerHTML = repositoryOptions();
  createForm.elements.target_repo.innerHTML = repositoryOptions('common');
  renderBoard();
}

function ownerOptions(owners, current) {
  const options = owners.map((owner) => `<option value="${escapeHtml(owner)}">${escapeHtml(owner)}</option>`);
  if (current && !owners.includes(current)) options.push(`<option value="${escapeHtml(current)}">${escapeHtml(current)}（マスタ未登録）</option>`);
  return options.join('');
}

async function openTask(id) {
  try {
    const [{ task, vscodeUri }, { owners }] = await Promise.all([api(`/api/tasks/${id}`), api('/api/owners')]);
    taskForm.elements.owner.innerHTML = ownerOptions(owners, task.owner);
    taskForm.elements.target_repo.innerHTML = repositoryOptions(task.target_repo);
    document.querySelector('#dialogTaskId').textContent = task.id;
    document.querySelector('#openTaskInVscode').href = vscodeUri;
    taskForm.elements.revision.value = task.revision;
    for (const field of ['title', 'status', 'owner', 'priority', 'target_repo', 'start', 'due', 'depends_on', 'requirement', 'body']) {
      taskForm.elements[field].value = task[field] || '';
    }
    document.querySelector('#saveStatus').textContent = '';
    document.querySelector('#acceptanceStatus').textContent = task.accepted_by
      ? `受入済み: ${task.accepted_by}（${task.actual_completed_at}）` : '受入未記録';
    document.querySelector('#acceptTaskButton').disabled = task.status !== 'review' || Boolean(task.accepted_by);
    document.querySelector('#deleteTaskButton').hidden = task.status === 'done';
    dialog.showModal();
  } catch (error) { toast(error.message); }
}

taskForm.elements.status.innerHTML = statuses.map((status) => `<option value="${status.id}">${status.label}</option>`).join('');
taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = document.querySelector('#dialogTaskId').textContent;
  const payload = Object.fromEntries(new FormData(taskForm));
  const button = taskForm.querySelector('[type="submit"]');
  setBusy(button, true);
  try {
    await api(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    dialog.close();
    await Promise.all([loadTasks(), loadGit()]);
    toast(`${id} を保存しました`);
  } catch (error) {
    document.querySelector('#saveStatus').textContent = error.message;
    if (error.status === 409 && window.confirm('他の人が先に更新しました。最新の内容を読み直しますか？\n読み直すと入力中の変更は失われます。')) await openTask(id);
  } finally { setBusy(button, false); }
});
const createDialog = document.querySelector('#createDialog');
const createForm = document.querySelector('#createForm');
createForm.elements.status.innerHTML = statuses.filter((status) => status.id !== 'done')
  .map((status) => `<option value="${status.id}">${status.label}</option>`).join('');

document.querySelector('#acceptTaskButton').addEventListener('click', async () => {
  const id = document.querySelector('#dialogTaskId').textContent;
  if (!window.confirm(`${id} の成果物を確認し、人間受入を記録しますか？`)) return;
  const button = document.querySelector('#acceptTaskButton');
  setBusy(button, true);
  try {
    await api(`/api/tasks/${id}/accept`, { method: 'POST', body: JSON.stringify({ revision: taskForm.elements.revision.value }) });
    dialog.close();
    await Promise.all([loadTasks(), loadGit()]);
    await openTask(id);
    toast(`${id} の受入を記録しました。完了への変更は別操作で行ってください`);
  } catch (error) {
    document.querySelector('#saveStatus').textContent = error.message;
    if (error.status === 409 && window.confirm('他の人が先に更新しました。最新の内容を読み直しますか？\n読み直すと入力中の変更は失われます。')) await openTask(id);
  } finally { setBusy(button, false); }
});

document.querySelector('#deleteTaskButton').addEventListener('click', async () => {
  const id = document.querySelector('#dialogTaskId').textContent;
  if (!window.confirm(`${id} を削除しますか？この操作はGit履歴には残りますが、画面からは消えます。`)) return;
  const button = document.querySelector('#deleteTaskButton');
  setBusy(button, true);
  try {
    await api(`/api/tasks/${id}`, { method: 'DELETE', body: JSON.stringify({ revision: taskForm.elements.revision.value }) });
    dialog.close();
    await Promise.all([loadTasks(), loadGit()]);
    toast(`${id} を削除しました`);
  } catch (error) {
    document.querySelector('#saveStatus').textContent = error.message;
    if (error.status === 409 && window.confirm('他の人が先に更新しました。最新の内容を読み直しますか？')) await openTask(id);
  } finally { setBusy(button, false); }
});

document.querySelector('#newTaskButton').addEventListener('click', async () => {
  try {
    const [{ requirements, bodyTemplate }, { owners }] = await Promise.all([api('/api/requirements'), api('/api/owners')]);
    createForm.elements.owner.innerHTML = ownerOptions(owners);
    createForm.elements.requirement.innerHTML = ['<option value=""></option>', ...requirements
      .map((item) => `<option value="${item.id}">${escapeHtml(item.id)} ${escapeHtml(item.title)}</option>`)].join('');
    createForm.reset();
    createForm.elements.target_repo.innerHTML = repositoryOptions('common');
    createForm.elements.target_repo.value = 'common';
    createForm.elements.body.value = bodyTemplate;
    if (owners.includes('unassigned')) createForm.elements.owner.value = 'unassigned';
    document.querySelector('#createStatus').textContent = '';
    createDialog.showModal();
  } catch (error) { toast(error.message); }
});
createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(createForm));
  const button = createForm.querySelector('[type="submit"]');
  setBusy(button, true);
  try {
    const { task } = await api('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
    createDialog.close();
    await Promise.all([loadTasks(), loadGit()]);
    toast(`${task.id} を作成しました`);
  } catch (error) {
    document.querySelector('#createStatus').textContent = error.message;
  } finally { setBusy(button, false); }
});
document.querySelector('#closeCreateDialog').addEventListener('click', () => createDialog.close());
document.querySelector('#cancelCreateDialog').addEventListener('click', () => createDialog.close());
document.querySelector('#closeDialog').addEventListener('click', () => dialog.close());
document.querySelector('#cancelDialog').addEventListener('click', () => dialog.close());

const historyFieldLabels = {
  title: 'タイトル', status: '状態', owner: '担当者', priority: '優先度',
  target_repo: '対象リポジトリ', start: '開始日', due: '期限', completed_at: '完了日', requirement: 'Requirement', depends_on: '先行Task'
};

function historyDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(date);
}

function historyValue(value) {
  return value === '' || value == null ? '未設定' : value;
}

function renderHistoryEntry(entry) {
  const tasks = entry.taskChanges.map((task) => {
    const details = task.action === 'created'
      ? '<div class=\'history-change\'>Taskを追加</div>'
      : task.changes.length
        ? task.changes.map((change) => `<div class='history-change'>${escapeHtml(historyFieldLabels[change.field] || change.field)}: ${escapeHtml(historyValue(change.before))} → ${escapeHtml(historyValue(change.after))}</div>`).join('')
        : '<div class=\'history-change\'>Taskを変更</div>';
    return `<div class='history-task'>
      <div><span class='history-task-id'>${escapeHtml(task.taskId)}</span></div>
      ${task.taskTitle ? `<div class='history-task-title'>${escapeHtml(task.taskTitle)}</div>` : ''}
      ${details}
    </div>`;
  }).join('');
  const fallback = tasks ? '' : `<div class='history-files'>変更ファイル ${entry.files.length}件</div>`;
  return `<article class='history-entry'>
    <div class='history-meta'><time datetime='${escapeHtml(entry.date)}'>${escapeHtml(historyDate(entry.date))}</time><span class='history-author'>${escapeHtml(entry.author)}</span><span class='history-hash'>${escapeHtml(entry.hash)}</span></div>
    ${tasks}
    <div class='history-message'>${escapeHtml(entry.message)}</div>
    ${fallback}
  </article>`;
}

async function loadHistory() {
  const container = document.querySelector('#historyList');
  try {
    const result = await api('/api/git/history');
    if (!result.isRepository) return void (container.innerHTML = '<div class=\'history-empty\'>Git repositoryではありません</div>');
    container.innerHTML = result.history.length
      ? result.history.map(renderHistoryEntry).join('')
      : '<div class=\'history-empty\'>履歴はありません</div>';
  } catch (error) {
    container.textContent = error.message;
  }
}

// fetch: trueのときだけ共有側の最新を取得する（通信するため、ページ表示時などには行わない）。
async function loadGit({ fetch = false } = {}) {
  const container = document.querySelector('#gitStatus');
  try {
    const git = await api(`/api/git/status${fetch ? '?fetch=1' : ''}`);
    if (!git.isRepository) return void (container.textContent = 'Git repositoryではありません');
    document.querySelector('#pullButton').disabled = !git.upstream || git.changes.length > 0;
    document.querySelector('#commitPushButton').disabled = !git.upstream || (git.changes.length === 0 && git.ahead === 0);
    const sync = [git.ahead ? `pushしていないcommit ${git.ahead}件` : '', git.behind ? `共有側の更新 ${git.behind}件` : ''].filter(Boolean);
    container.innerHTML = `<strong>${escapeHtml(git.branch)}</strong> · ${git.changes.length} changes` +
      (sync.length ? `<div>${sync.join(' · ')}</div>` : '') +
      (git.fetchError ? `<div class="git-error">共有側を確認できませんでした: ${escapeHtml(git.fetchError)}</div>` : '') +
      (git.changes.length ? `<div class="git-files">${git.changes.map((item) => `${escapeHtml(item.status)} ${escapeHtml(item.path)}`).join('<br>')}</div>` : '<div>作業ツリーはクリーンです</div>');
  } catch (error) { container.textContent = error.message; }
}

document.querySelector('#historyRefresh').addEventListener('click', loadHistory);
document.querySelector('#gitRefresh').addEventListener('click', () => loadGit({ fetch: true }));
async function gitPreview() { return api('/api/git/preview'); }
async function runGitOperation(button, busyText, action) {
  const original = button.textContent;
  setBusy(button, true);
  button.textContent = busyText;
  try { await action(); } finally { button.textContent = original; button.removeAttribute('aria-busy'); await loadGit(); }
}
// 自動では取り込めなかった場合（他の人と同じ場所を変更した場合）の案内。自分の変更は元の状態に戻してある。
function alertConflict(result) {
  const files = result.files || [];
  const hint = files.some((file) => /^tasks\/EPF-(?:\d{4}|\d{17}|\d{8}-\d{6}-\d{3})\.md$/.test(file))
    ? '\n\n同じ番号のTaskを、別々に作成した場合にも起こります。Taskを作成する前にPullすると避けられます。' : '';
  window.alert(`他の人の変更と同じ場所を変更していたため、自動では取り込めませんでした。\n自分の変更は失われていません（操作前の状態に戻しました）。\n\n対象ファイル:\n${files.join('\n')}${hint}\n\n詳しい人に相談してください。`);
}

document.querySelector('#pullButton').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  try {
    const preview = await gitPreview();
    if (!preview.canPull) throw new Error(preview.conflicts ? 'Git競合を解消してからPullしてください' : preview.changes.length ? '未コミット変更があります。先にCommit & Pushしてください' : 'upstreamが設定されていません');
    const pending = preview.ahead ? `pushしていないcommitが${preview.ahead}件あります。他の人の更新を取り込んだ上に、それらを置き直します。` : '';
    if (!window.confirm(`${preview.upstream} から他の人の更新を取り込みます。${pending}続行しますか？`)) return;
    await runGitOperation(button, '取得中...', async () => {
      const result = await api('/api/git/pull', { method: 'POST' });
      if (result.outcome === 'conflict') return alertConflict(result);
      if (result.outcome === 'fetch-failed') return toast(`共有側を確認できませんでした: ${result.error}`);
      if (result.outcome === 'error') return toast(result.error);
      await Promise.all([loadHistory(), result.outcome === 'integrated' ? loadTasks() : Promise.resolve()]);
      if (result.outcome === 'up-to-date') return toast('他の人の更新はありませんでした');
      toast('他の人の更新を取り込みました');
    });
  } catch (error) { toast(error.message); }
});
document.querySelector('#commitPushButton').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  try {
    const preview = await gitPreview();
    if (!preview.canCommitPush) throw new Error(preview.conflicts ? 'Git競合を解消してからCommit & Pushしてください' : !preview.upstream ? 'upstreamが設定されていません' : '送信する変更はありません');
    let commitMessage = '';
    if (preview.changes.length) {
      const files = preview.changes.map((item) => `${item.status} ${item.path}`).join('\n');
      commitMessage = window.prompt(`以下の変更をCommit & Pushします。\n他の人の更新があれば、取り込んでから送信します。\n\n${files}\n\nコミットメッセージ:`, '変更を更新');
      if (commitMessage === null) return;
    } else if (!window.confirm(`pushしていないcommitが${preview.ahead}件あります。他の人の更新があれば取り込んでから、送信します。続行しますか？`)) return;
    await runGitOperation(button, '送信中...', async () => {
      const changes = preview.changes.map(({ status, path, fingerprint }) => ({ status, path, fingerprint }));
      const result = await api('/api/git/commit-push', { method: 'POST', body: JSON.stringify({ message: commitMessage, changes }) });
      const saved = result.committed ? `${result.commit} をコミットしました。` : '';
      if (result.outcome === 'task-conflict') {
        const files = result.files || [];
        const localChanges = preview.changes.filter((item) => files.includes(item.path));
        const update = window.confirm(`他の人が先に次のTaskを共有しました。\n${files.join('\n')}\n\n最新版に更新して、変更をやり直しますか？\n更新すると、この作業ツリーに保存した該当Taskの変更は失われます。`);
        if (!update) return toast('変更を残しました。共有はしていません');
        await api('/api/git/update-conflicted-tasks', {
          method: 'POST',
          body: JSON.stringify({ files: localChanges.map(({ path, fingerprint }) => ({ id: path.match(/EPF-(?:\d{4}|\d{17}|\d{8}-\d{6}-\d{3})/)?.[0], fingerprint })) })
        });
        await Promise.all([loadTasks(), loadGit()]);
        return toast('最新版に更新しました。必要な変更をやり直してください');
      }
      if (result.outcome === 'conflict') return alertConflict(result);
      if (result.outcome === 'fetch-failed') return toast(`${saved}共有側を確認できなかったため、送信していません: ${result.error}`);
      if (result.outcome === 'error') return toast(`${saved}${result.error}`);
      if (result.outcome === 'push-failed') return toast(`${saved}送信に失敗しました。もう一度Commit & Pushを押してください: ${result.pushError}`);
      await Promise.all([loadHistory(), result.integrated ? loadTasks() : Promise.resolve()]);
      toast(`${result.integrated ? '他の人の更新を取り込んで、' : ''}${result.commit} を ${result.upstream} へ送信しました`);
    });
  } catch (error) { toast(error.message); }
});
document.querySelector('#wbsButton').addEventListener('click', async (event) => {
  setBusy(event.currentTarget, true);
  try {
    const result = await api('/api/wbs', { method: 'POST' });
    toast(`${result.taskCount}件からWBSを生成しました`);
    loadGit();
  } catch (error) { toast(error.message); }
  finally { setBusy(event.currentTarget, false); }
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
Promise.all([loadTasks(), loadGit(), loadHistory()]).then(() => {
  if (/^EPF-(?:\d{4}|\d{17}|\d{8}-\d{6}-\d{3})$/.test(taskFromGantt || '')) openTask(taskFromGantt);
}).catch((error) => toast(error.message));
