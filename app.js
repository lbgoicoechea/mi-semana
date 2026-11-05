// Lógica de la app: estado, render, filtros, modal y drag & drop.

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DAYS_LONG = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// `color` es una clase de color de etiqueta definida en styles.css (c-red, c-blue...).
const QUADRANTS = {
  1: { title: 'Hacer ya', sub: 'Urgente e importante', color: 'c-red' },
  2: { title: 'Planificar', sub: 'Importante, no urgente', color: 'c-blue' },
  3: { title: 'Delegar / rápido', sub: 'Urgente, no importante', color: 'c-orange' },
  4: { title: 'Después', sub: 'Ni urgente ni importante', color: 'c-gray' },
};

const CATEGORIES = {
  trabajo: { label: 'Trabajo', color: 'c-blue' },
  personal: { label: 'Personal', color: 'c-purple' },
  salud: { label: 'Entrenamiento / salud', color: 'c-green' },
};

function tag(label, colorClass) {
  return el('span', { class: `tag ${colorClass}` }, label);
}

// ---------- Estado ----------
const state = loadState();
if (rolloverWeek(state)) saveState(state);

const filters = { day: 'all', category: 'all' };
let editingId = null;

function persist() {
  saveState(state);
  render();
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------- Utilidades ----------
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

function fmtDuration(min) {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function weekRangeLabel() {
  const mon = mondayOf();
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  return `Semana del ${fmt(mon)} al ${fmt(sun)}`;
}

function matchesFilters(t) {
  if (filters.day !== 'all' && t.day !== filters.day) return false;
  if (filters.category !== 'all' && t.category !== filters.category) return false;
  return true;
}

function sortTasks(a, b) {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.day !== b.day) return a.day - b.day;
  const ta = a.time || '99:99';
  const tb = b.time || '99:99';
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.createdAt - b.createdAt;
}

// ---------- Render ----------
function render() {
  renderDayFilter();
  renderCategoryFilter();
  renderMatrix();
}

function renderDayFilter() {
  const wrap = document.getElementById('day-filter');
  const today = todayIndex();
  const pendingByDay = DAYS.map((_, i) => state.tasks.filter((t) => !t.done && t.day === i).length);
  const total = pendingByDay.reduce((a, b) => a + b, 0);

  const tab = (value, label, count, isToday) =>
    el('button', {
      type: 'button',
      class: 'tab',
      'aria-selected': String(filters.day === value),
      title: isToday ? 'Hoy' : null,
      onclick: () => { filters.day = value; render(); },
    },
    isToday ? el('span', { class: 'today-dot', 'aria-label': 'Hoy' }) : null,
    label,
    count ? el('span', { class: 'count' }, count) : null);

  wrap.replaceChildren(
    tab('all', 'Toda la semana', total, false),
    ...DAYS.map((d, i) => tab(i, d, pendingByDay[i], i === today)),
  );
}

function renderCategoryFilter() {
  const wrap = document.getElementById('cat-filter');
  const pill = (value, label, color) =>
    el('button', {
      type: 'button',
      class: 'filter-pill' + (color ? ` ${color}` : ''),
      'aria-pressed': String(filters.category === value),
      onclick: () => { filters.category = value; render(); },
    }, color ? el('span', { class: 'swatch', style: 'background:var(--tag-bg)' }) : null, label);

  wrap.replaceChildren(
    pill('all', 'Todas las categorías'),
    ...Object.entries(CATEGORIES).map(([k, c]) => pill(k, c.label, c.color)),
  );
}

function renderMatrix() {
  const matrix = document.getElementById('matrix');
  matrix.querySelectorAll('.quadrant').forEach((n) => n.remove());

  for (const q of [1, 2, 3, 4]) {
    const tasks = state.tasks.filter((t) => t.quadrant === q && matchesFilters(t)).sort(sortTasks);
    const pending = tasks.filter((t) => !t.done);
    const minutes = pending.reduce((sum, t) => sum + (t.durationMin || 0), 0);

    const info = QUADRANTS[q];
    const section = el('section', { class: `quadrant ${info.color}`, 'data-q': q, 'aria-label': info.title },
      el('div', { class: 'q-head' },
        tag(info.title, info.color),
        el('span', { class: 'q-count', title: 'Pendientes' }, pending.length),
        el('span', { class: 'q-sub' }, minutes ? `${fmtDuration(minutes)} · ${info.sub}` : info.sub),
      ),
      el('ul', { class: 'task-list' }, tasks.map(renderTask)),
      el('button', {
        type: 'button', class: 'q-new',
        'aria-label': `Nueva tarea en ${info.title}`,
        onclick: () => openDialog(null, { quadrant: q }),
      }, el('span', { class: 'plus' }, '+'), 'Nueva'),
    );

    addDropZone(section, q);
    matrix.append(section);
  }
}

function renderTask(t) {
  const cat = CATEGORIES[t.category];
  const when = [t.time, fmtDuration(t.durationMin)].filter(Boolean).join(' · ');
  const meta = el('div', { class: 'task-props' },
    tag(DAYS_LONG[t.day], 'c-gray'),
    cat ? tag(cat.label, cat.color) : null,
    when ? el('span', { class: 'meta' }, when) : null,
  );

  const li = el('li', { class: 'task' + (t.done ? ' done' : ''), draggable: 'true', 'data-id': t.id },
    el('input', {
      type: 'checkbox',
      class: 'check',
      checked: t.done,
      'aria-label': t.done ? 'Marcar como pendiente' : 'Marcar como hecha',
      onchange: (e) => { t.done = e.target.checked; persist(); },
    }),
    el('div', { class: 'task-body', ondblclick: () => openDialog(t) },
      el('div', { class: 'task-title' }, t.title),
      meta,
    ),
    el('button', { type: 'button', class: 'icon-btn', title: 'Editar', 'aria-label': 'Editar', onclick: () => openDialog(t) }, '✎'),
  );

  li.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', t.id);
    e.dataTransfer.effectAllowed = 'move';
    li.classList.add('dragging');
  });
  li.addEventListener('dragend', () => li.classList.remove('dragging'));
  return li;
}

function addDropZone(section, q) {
  let depth = 0; // evita parpadeo al pasar por elementos hijos
  section.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; section.classList.add('drag-over'); });
  section.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; section.classList.remove('drag-over'); } });
  section.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
  section.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    section.classList.remove('drag-over');
    const task = state.tasks.find((t) => t.id === e.dataTransfer.getData('text/plain'));
    if (task && task.quadrant !== q) {
      task.quadrant = q;
      persist();
    }
  });
}

// ---------- Modal crear / editar ----------
const dialog = document.getElementById('task-dialog');
const form = document.getElementById('task-form');
const fTitle = document.getElementById('f-title');
const fDay = document.getElementById('f-day');
const fCategory = document.getElementById('f-category');
const fDuration = document.getElementById('f-duration');
const fTime = document.getElementById('f-time');
const btnDelete = document.getElementById('btn-delete');

function setupForm() {
  fDay.replaceChildren(...DAYS_LONG.map((d, i) => el('option', { value: i }, d)));
  fCategory.replaceChildren(...Object.entries(CATEGORIES).map(([k, c]) => el('option', { value: k }, c.label)));
  document.getElementById('f-quadrant').replaceChildren(
    ...[1, 2, 3, 4].map((q) => el('span', { class: `tag-opt ${QUADRANTS[q].color}` },
      el('input', { type: 'radio', name: 'quadrant', id: `q-${q}`, value: q, required: q === 1 }),
      el('label', { for: `q-${q}`, class: 'tag', title: QUADRANTS[q].sub }, QUADRANTS[q].title),
    )),
  );
}

function openDialog(task, defaults = {}) {
  editingId = task ? task.id : null;
  document.getElementById('dialog-title').textContent = task ? 'Editar tarea' : 'Nueva tarea';
  btnDelete.hidden = !task;

  const src = task || {
    title: '',
    quadrant: defaults.quadrant || 2,
    day: filters.day !== 'all' ? filters.day : todayIndex(),
    category: filters.category !== 'all' ? filters.category : 'trabajo',
  };

  fTitle.value = src.title;
  form.querySelector(`input[name="quadrant"][value="${src.quadrant}"]`).checked = true;
  fDay.value = String(src.day);
  fCategory.value = src.category;
  fDuration.value = src.durationMin || '';
  fTime.value = src.time || '';

  dialog.showModal();
  fTitle.focus();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = fTitle.value.trim();
  if (!title) { fTitle.focus(); return; }

  const duration = parseInt(fDuration.value, 10);
  const data = {
    title,
    quadrant: Number(form.querySelector('input[name="quadrant"]:checked').value),
    day: Number(fDay.value),
    category: fCategory.value,
    durationMin: duration > 0 ? duration : null,
    time: fTime.value || null,
  };

  if (editingId) {
    Object.assign(state.tasks.find((t) => t.id === editingId), data);
  } else {
    state.tasks.push({ id: newId(), ...data, done: false, createdAt: Date.now(), week: state.currentWeek });
  }
  dialog.close();
  persist();
});

document.getElementById('btn-cancel').addEventListener('click', () => dialog.close());

btnDelete.addEventListener('click', () => {
  const task = state.tasks.find((t) => t.id === editingId);
  if (!task || !confirm(`¿Borrar "${task.title}"?`)) return;
  state.tasks = state.tasks.filter((t) => t.id !== editingId);
  dialog.close();
  persist();
});

// ---------- Historial ----------
const historyDialog = document.getElementById('history-dialog');

function weekLabel(isoWeekStr) {
  const [year, w] = isoWeekStr.split('-W').map(Number);
  // Lunes de la semana ISO: el 4 de enero siempre cae en la semana 1.
  const jan4 = new Date(year, 0, 4);
  const mon = mondayOf(jan4);
  mon.setDate(mon.getDate() + (w - 1) * 7);
  return `Semana del ${mon.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function openHistory() {
  const list = document.getElementById('history-list');
  if (!state.history.length) {
    list.replaceChildren(el('p', { class: 'muted' }, 'Todavía no hay semanas cerradas. Las tareas hechas aparecen acá cuando empieza una semana nueva.'));
  } else {
    list.replaceChildren(...state.history.map((h) => {
      const minutes = h.tasks.reduce((s, t) => s + (t.durationMin || 0), 0);
      return el('div', { class: 'history-week' },
        el('h3', {}, el('span', {}, weekLabel(h.week)),
          el('span', { class: 'meta' }, `${h.tasks.length} hecha${h.tasks.length === 1 ? '' : 's'}${minutes ? ' · ' + fmtDuration(minutes) : ''}`)),
        el('ul', {}, h.tasks.map((t) => el('li', {},
          el('span', {}, t.title),
          tag(QUADRANTS[t.quadrant].title, QUADRANTS[t.quadrant].color),
          el('span', { class: 'muted' }, DAYS_LONG[t.day]),
        ))),
      );
    }));
  }
  historyDialog.showModal();
}

document.getElementById('btn-history').addEventListener('click', openHistory);
document.getElementById('btn-history-close').addEventListener('click', () => historyDialog.close());

// ---------- Inicio ----------
document.getElementById('btn-new').addEventListener('click', () => openDialog(null));
document.getElementById('week-label').textContent = weekRangeLabel();

// Si la app queda abierta y cambia la semana, hacer el traspaso al volver a la pestaña.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && rolloverWeek(state)) {
    document.getElementById('week-label').textContent = weekRangeLabel();
    persist();
  }
});

setupForm();
render();
