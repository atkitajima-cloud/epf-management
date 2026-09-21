const state = { data: null, scale: 'week', filter: { owner: '', status: '', requirement: '', schedule: '' } };
const labels = { done: '完了', overdue: '期限超過', start_late: '着手遅れ', blocked: '依存待ち', at_risk: '要注意', on_track: '予定どおり', unscheduled: '日程未設定', invalid: '日程矛盾' };

async function api(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]); }
function dayNumber(value) { return Math.floor(Date.parse(`${value}T00:00:00Z`) / 86_400_000); }
function dateString(number) { return new Date(number * 86_400_000).toISOString().slice(0, 10); }
function addDays(value, days) { return dateString(dayNumber(value) + days); }
function unique(values) { return [...new Set(values.filter(Boolean))].sort(); }
function monday(value) { const date = new Date(`${value}T00:00:00Z`); const day = (date.getUTCDay() + 6) % 7; return addDays(value, -day); }

function fillSelect(id, values, current) {
  const select = document.querySelector(id);
  const extra = id === '#scheduleFilter' ? '<option value="risk">要注意（全種別）</option>' : id === '#statusFilter' ? '<option value="not_done">完了以外</option><option value="active">進行中（Doing / Review）</option>' : '';
  select.innerHTML = `<option value="">すべて</option>${extra}${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(labels[value] || value)}</option>`).join('')}`;
  select.value = current;
}
function updateFilters() {
  const tasks = state.data.tasks;
  fillSelect('#ownerFilter', unique(tasks.map((task) => task.owner)), state.filter.owner);
  fillSelect('#statusFilter', unique(tasks.map((task) => task.status)), state.filter.status);
  fillSelect('#requirementFilter', unique(tasks.map((task) => task.requirement)), state.filter.requirement);
  fillSelect('#scheduleFilter', unique(tasks.map((task) => task.scheduleStatus)), state.filter.schedule);
}
function filteredTasks() {
  return state.data.tasks.filter((task) =>
    (!state.filter.owner || task.owner === state.filter.owner) &&
    (!state.filter.status || (state.filter.status === 'not_done' ? task.status !== 'done' : state.filter.status === 'active' ? ['doing', 'review'].includes(task.status) : task.status === state.filter.status)) &&
    (!state.filter.requirement || task.requirement === state.filter.requirement) &&
    (!state.filter.schedule || (state.filter.schedule === 'risk' ? ['at_risk', 'start_late', 'blocked'].includes(task.scheduleStatus) : task.scheduleStatus === state.filter.schedule))
  );
}
function summaryCard(key, label, value, status = '') {
  return `<button class="summary-card ${status}" data-summary="${key}"><span>${label}</span><strong>${value}</strong><small>該当Taskを表示</small></button>`;
}
function renderSummary() {
  const { summary } = state.data;
  document.querySelector('#summary').innerHTML = [
    summaryCard('', '全Task', summary.total), summaryCard('active', '進行中', summary.inProgress),
    summaryCard('overdue', '期限超過', summary.overdue, 'overdue'), summaryCard('risk', '要注意', summary.atRisk, 'at_risk'),
    summaryCard('unscheduled', '日程未設定', summary.unscheduled, 'unscheduled')
  ].join('');
  document.querySelectorAll('[data-summary]').forEach((button) => button.addEventListener('click', () => {
    const key = button.dataset.summary;
    state.filter.schedule = key === 'overdue' ? 'overdue' : key === 'unscheduled' ? 'unscheduled' : key === 'risk' ? 'risk' : '';
    state.filter.status = key === 'active' ? 'active' : '';
    updateFilters(); renderGantt();
  }));
}
function buildTimeline(range) {
  const start = state.scale === 'week' ? monday(range.start) : range.start;
  const end = state.scale === 'week' ? addDays(monday(range.end), 6) : range.end;
  const step = state.scale === 'week' ? 7 : 1;
  const units = [];
  for (let date = start; date <= end; date = addDays(date, step)) units.push(date);
  return { start, end, units, step };
}
function renderGantt() {
  const tasks = filteredTasks();
  const timeline = buildTimeline(state.data.range);
  const columnWidth = state.scale === 'week' ? 116 : 38;
  const timelineWidth = timeline.units.length * columnWidth;
  const todayIndex = Math.floor((dayNumber(state.data.today) - dayNumber(timeline.start)) / timeline.step);
  const grid = timeline.units.map((date) => `<div class="time-head" style="width:${columnWidth}px">${state.scale === 'week' ? `${date.slice(5)}週` : date.slice(8)}</div>`).join('');
  const rows = tasks.map((task) => {
    let bar = '<span class="no-schedule">日程未設定</span>';
    if (task.start && task.due && task.start <= task.due) {
      const left = ((dayNumber(task.start) - dayNumber(timeline.start)) / timeline.step) * columnWidth;
      const width = Math.max(columnWidth / timeline.step, ((dayNumber(task.due) - dayNumber(task.start) + 1) / timeline.step) * columnWidth);
      bar = `<button class="bar ${task.scheduleStatus}" data-id="${task.id}" style="left:${left}px;width:${width}px" title="${escapeHtml(task.id)}: ${escapeHtml(labels[task.scheduleStatus])}"><span style="width:${task.progress.value}%"></span><b>${task.progress.value}%${task.progress.estimated ? ' 推定' : ''}</b></button>`;
    }
    const dependency = task.dependencies.length ? `<small>先行: ${escapeHtml(task.dependencies.join(', '))}</small>` : '';
    const warnings = task.warnings.length ? `<small class="row-warning">${escapeHtml(task.warnings.join(' / '))}</small>` : '';
    return `<div class="task-row"><button class="task-cell" data-id="${task.id}"><b>${task.id}</b><span>${escapeHtml(task.title)}</span>${dependency}${warnings}</button><div class="owner-cell">${escapeHtml(task.owner)}</div><div class="progress-cell">${task.progress.value}%${task.progress.estimated ? '*' : ''}</div><div class="status-cell"><span class="status-pill ${task.scheduleStatus}">${labels[task.scheduleStatus]}</span></div><div class="timeline-row" style="width:${timelineWidth}px;background-size:${columnWidth}px 100%">${bar}</div></div>`;
  }).join('');
  const todayLine = todayIndex >= 0 && todayIndex < timeline.units.length ? `<div class="today-line" style="left:${todayIndex * columnWidth}px"><span>今日</span></div>` : '';
  document.querySelector('#emptyState').hidden = tasks.length > 0;
  document.querySelector('#gantt').innerHTML = `<div class="gantt-inner"><div class="table-head"><div>Task</div><div>担当者</div><div>進捗</div><div>判定</div><div class="timeline-head" style="width:${timelineWidth}px">${grid}</div></div><div class="rows">${rows}</div><div class="today-overlay" style="left:560px;width:${timelineWidth}px">${todayLine}</div></div>`;
  document.querySelectorAll('[data-id]').forEach((element) => element.addEventListener('click', () => window.location.href = `/?task=${element.dataset.id}`));
}
function renderWarnings() {
  const section = document.querySelector('#warnings');
  section.hidden = !state.data.warnings.length;
  section.querySelector('ul').innerHTML = state.data.warnings.map((warning) => `<li><b>${escapeHtml(warning.id)}</b> ${escapeHtml(warning.message)}</li>`).join('');
}
function scrollToday() {
  const timeline = buildTimeline(state.data.range);
  const index = Math.floor((dayNumber(state.data.today) - dayNumber(timeline.start)) / timeline.step);
  document.querySelector('#gantt').scrollLeft = Math.max(0, 560 + index * (state.scale === 'week' ? 116 : 38) - 250);
}
function toast(message) { const element = document.querySelector('#toast'); element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 2600); }
async function load() {
  try {
    state.data = await api('/api/gantt'); updateFilters(); renderSummary(); renderGantt(); renderWarnings();
    document.querySelector('#generatedAt').textContent = `更新: ${new Date(state.data.generatedAt).toLocaleString('ja-JP')}`;
    scrollToday();
  } catch (error) { toast(error.message); }
}
for (const [id, field] of [['#ownerFilter', 'owner'], ['#statusFilter', 'status'], ['#requirementFilter', 'requirement'], ['#scheduleFilter', 'schedule']]) {
  document.querySelector(id).addEventListener('change', (event) => { state.filter[field] = event.target.value; renderGantt(); });
}
document.querySelectorAll('[data-scale]').forEach((button) => button.addEventListener('click', () => { state.scale = button.dataset.scale; document.querySelectorAll('[data-scale]').forEach((item) => item.classList.toggle('active', item === button)); renderGantt(); scrollToday(); }));
document.querySelector('#todayButton').addEventListener('click', scrollToday);
load();
