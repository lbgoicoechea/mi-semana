// Lógica de la app: sesión, estado, render, filtros, modal y drag & drop.
// Los datos viven en Supabase (ver storage.js).

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

// ---------- Estado ----------
const state = { user: null, tasks: [], currentWeek: isoWeek(), loading: false };
const filters = { day: 'all', category: 'all' };
let editingId = null;

// ---------- Utilidades ----------
const $ = (id) => document.getElementById(id);

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

function tag(label, colorClass) {
  return el('span', { class: `tag ${colorClass}` }, label);
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

let toastTimer = null;
function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
}

// ---------- Sincronización ----------

/** Vuelve a leer las tareas de la base y redibuja. */
async function refresh() {
  if (!state.user) return;
  try {
    state.tasks = await db.fetchTasks();
    render();
  } catch (err) {
    console.error(err);
    showToast('No se pudieron cargar las tareas. Revisá tu conexión.');
  }
}

let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 250);
}

/**
 * Los cambios se muestran al instante (optimista) y se guardan en segundo plano.
 * Si falla, se avisa y se recarga lo que hay en la base.
 */
async function save(promise) {
  try {
    await promise;
  } catch (err) {
    console.error(err);
    showToast('No se pudo guardar el cambio. Revisá tu conexión.');
    await refresh();
  }
}

async function checkWeekChange() {
  const nowWeek = isoWeek();
  if (nowWeek !== state.currentWeek) {
    state.currentWeek = nowWeek;
    $('week-label').textContent = weekRangeLabel();
  }
  try {
    await db.rollover(state.currentWeek);
  } catch (err) {
    console.error(err);
  }
}

// ---------- Render ----------
function render() {
  renderDayFilter();
  renderCategoryFilter();
  renderMatrix();
}

function renderDayFilter() {
  const wrap = $('day-filter');
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
  const wrap = $('cat-filter');
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
  const matrix = $('matrix');
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
      onchange: (e) => {
        t.done = e.target.checked;
        render();
        save(db.updateTask(t.id, { done: t.done }));
      },
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
      render();
      save(db.updateTask(task.id, { quadrant: q }));
    }
  });
}

// ---------- Modal crear / editar ----------
const dialog = $('task-dialog');
const form = $('task-form');
const fTitle = $('f-title');
const fDay = $('f-day');
const fCategory = $('f-category');
const fDuration = $('f-duration');
const fTime = $('f-time');
const btnDelete = $('btn-delete');

function setupForm() {
  fDay.replaceChildren(...DAYS_LONG.map((d, i) => el('option', { value: i }, d)));
  fCategory.replaceChildren(...Object.entries(CATEGORIES).map(([k, c]) => el('option', { value: k }, c.label)));
  $('f-quadrant').replaceChildren(
    ...[1, 2, 3, 4].map((q) => el('span', { class: `tag-opt ${QUADRANTS[q].color}` },
      el('input', { type: 'radio', name: 'quadrant', id: `q-${q}`, value: q, required: q === 1 }),
      el('label', { for: `q-${q}`, class: 'tag', title: QUADRANTS[q].sub }, QUADRANTS[q].title),
    )),
  );
}

function openDialog(task, defaults = {}) {
  editingId = task ? task.id : null;
  $('dialog-title').textContent = task ? 'Editar tarea' : 'Nueva tarea';
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
    const task = state.tasks.find((t) => t.id === editingId);
    if (task) Object.assign(task, data);
    save(db.updateTask(editingId, data));
  } else {
    const task = {
      id: crypto.randomUUID(), ...data, done: false, week: state.currentWeek, createdAt: Date.now(),
    };
    state.tasks.push(task);
    save(db.insertTasks([task]));
  }
  dialog.close();
  render();
});

$('btn-cancel').addEventListener('click', () => dialog.close());

btnDelete.addEventListener('click', () => {
  const task = state.tasks.find((t) => t.id === editingId);
  if (!task || !confirm(`¿Borrar "${task.title}"?`)) return;
  state.tasks = state.tasks.filter((t) => t.id !== task.id);
  dialog.close();
  render();
  save(db.deleteTask(task.id));
});

// ---------- Historial ----------
const historyDialog = $('history-dialog');

function weekLabel(isoWeekStr) {
  const [year, w] = isoWeekStr.split('-W').map(Number);
  // Lunes de la semana ISO: el 4 de enero siempre cae en la semana 1.
  const mon = mondayOf(new Date(year, 0, 4));
  mon.setDate(mon.getDate() + (w - 1) * 7);
  return `Semana del ${mon.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

async function openHistory() {
  const list = $('history-list');
  list.replaceChildren(el('p', { class: 'muted' }, 'Cargando…'));
  historyDialog.showModal();

  let archived;
  try {
    archived = await db.fetchHistory();
  } catch (err) {
    console.error(err);
    list.replaceChildren(el('p', { class: 'muted' }, 'No se pudo cargar el historial.'));
    return;
  }

  if (!archived.length) {
    list.replaceChildren(el('p', { class: 'muted' }, 'Todavía no hay semanas cerradas. Las tareas hechas aparecen acá cuando empieza una semana nueva.'));
    return;
  }

  const byWeek = new Map();
  for (const t of archived) {
    if (!byWeek.has(t.week)) byWeek.set(t.week, []);
    byWeek.get(t.week).push(t);
  }

  list.replaceChildren(...[...byWeek].map(([week, tasks]) => {
    const minutes = tasks.reduce((s, t) => s + (t.durationMin || 0), 0);
    return el('div', { class: 'history-week' },
      el('h3', {}, el('span', {}, weekLabel(week)),
        el('span', { class: 'meta' }, `${tasks.length} hecha${tasks.length === 1 ? '' : 's'}${minutes ? ' · ' + fmtDuration(minutes) : ''}`)),
      el('ul', {}, tasks.map((t) => el('li', {},
        el('span', {}, t.title),
        tag(QUADRANTS[t.quadrant].title, QUADRANTS[t.quadrant].color),
        el('span', { class: 'muted' }, DAYS_LONG[t.day]),
      ))),
    );
  }));
}

$('btn-history').addEventListener('click', openHistory);
$('btn-history-close').addEventListener('click', () => historyDialog.close());

// ---------- Migración de las tareas guardadas en este navegador ----------
function checkLegacyMigration() {
  const legacy = loadLegacyLocal();
  const banner = $('migrate-banner');
  if (!legacy) { banner.hidden = true; return; }

  const count = legacy.tasks.length + legacy.history.reduce((n, h) => n + (h.tasks?.length || 0), 0);
  $('migrate-text').textContent =
    `Tenés ${count} tarea${count === 1 ? '' : 's'} guardada${count === 1 ? '' : 's'} solo en este navegador. ¿Las subo a tu cuenta para verlas en todos tus dispositivos?`;
  banner.hidden = false;
}

function legacyToTask(t, extra) {
  const quadrant = [1, 2, 3, 4].includes(t.quadrant) ? t.quadrant : 2;
  const day = Number.isInteger(t.day) && t.day >= 0 && t.day <= 6 ? t.day : todayIndex();
  return {
    id: crypto.randomUUID(),
    title: String(t.title || 'Sin título').trim().slice(0, 140) || 'Sin título',
    quadrant,
    day,
    category: CATEGORIES[t.category] ? t.category : 'personal',
    durationMin: t.durationMin > 0 ? Math.round(t.durationMin) : null,
    time: /^\d{2}:\d{2}$/.test(t.time || '') ? t.time : null,
    done: Boolean(t.done),
    ...extra,
  };
}

async function uploadLegacy() {
  const legacy = loadLegacyLocal();
  if (!legacy) return;
  const btn = $('btn-migrate');
  btn.disabled = true;
  btn.textContent = 'Subiendo…';

  const weekOk = (w) => /^\d{4}-W\d{2}$/.test(w || '');
  const rows = [
    ...legacy.tasks.map((t) => legacyToTask(t, { week: weekOk(t.week) ? t.week : state.currentWeek, archived: false })),
    ...legacy.history.flatMap((h) => (h.tasks || []).map((t) =>
      legacyToTask(t, { done: true, week: weekOk(h.week) ? h.week : state.currentWeek, archived: true }))),
  ];

  try {
    await db.insertTasks(rows);
    markLegacyMigrated();
    $('migrate-banner').hidden = true;
    await checkWeekChange();
    await refresh();
    showToast(`Listo: subí ${rows.length} tarea${rows.length === 1 ? '' : 's'} a tu cuenta.`);
  } catch (err) {
    console.error(err);
    showToast('No se pudieron subir las tareas. Probá de nuevo.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Subir a mi cuenta';
  }
}

$('btn-migrate').addEventListener('click', uploadLegacy);
$('btn-migrate-later').addEventListener('click', () => { $('migrate-banner').hidden = true; });

// ---------- Sesión ----------
function showView(name) {
  $('boot').hidden = name !== 'boot';
  $('auth-view').hidden = name !== 'auth';
  $('app-view').hidden = name !== 'app';
}

let activeUserId;
async function handleSession(session) {
  const user = session?.user || null;
  if ((user?.id || null) === activeUserId) return;
  activeUserId = user?.id || null;
  state.user = user;

  if (!user) {
    db.unsubscribe();
    state.tasks = [];
    showView('auth');
    return;
  }

  $('btn-logout').title = `Sesión iniciada como ${user.email}`;
  $('week-label').textContent = weekRangeLabel();
  showView('app');
  render();
  await checkWeekChange();
  await refresh();
  db.subscribe(scheduleRefresh);
  checkLegacyMigration();
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('login-email').value.trim();
  const msg = $('login-msg');
  const btn = $('login-submit');
  if (!email) return;

  btn.disabled = true;
  msg.className = 'login-msg';
  msg.textContent = 'Enviando…';
  try {
    await db.signIn(email);
    msg.classList.add('ok');
    msg.textContent = `Te mandé un link a ${email}. Abrilo desde este dispositivo para entrar.`;
  } catch (err) {
    console.error(err);
    msg.classList.add('error');
    msg.textContent = /rate|limit/i.test(err.message || '')
      ? 'Pediste muchos links seguidos. Esperá unos minutos y probá de nuevo.'
      : 'No se pudo enviar el link. Revisá el email y probá de nuevo.';
  } finally {
    btn.disabled = false;
  }
});

$('btn-logout').addEventListener('click', async () => {
  if (!confirm('¿Cerrar sesión en este dispositivo?')) return;
  await db.signOut();
  handleSession(null);
});

// Al volver a la pestaña: revisar el cambio de semana y traer lo último
// (por si la conexión en tiempo real se cortó mientras tanto).
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !state.user) return;
  await checkWeekChange();
  await refresh();
});

// ---------- Inicio ----------
$('btn-new').addEventListener('click', () => openDialog(null));
setupForm();

async function start() {
  if (!db.configured) {
    showView('auth');
    $('login-form').hidden = true;
    $('config-missing').hidden = false;
    return;
  }
  db.onAuthChange(handleSession);
  try {
    await handleSession(await db.getSession());
  } catch (err) {
    console.error(err);
    showView('auth');
  }
}

start();
