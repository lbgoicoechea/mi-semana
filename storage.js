// Guardado en localStorage y lógica de semanas.
// Se carga como script clásico (sin módulos) para que la app funcione
// también abriendo index.html con doble clic.

const STORAGE_KEY = 'tareas-semana';
const SCHEMA_VERSION = 1;

/** Semana ISO de una fecha, ej. "2026-W45". */
function isoWeek(date = new Date()) {
  const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = t.getUTCDay() || 7; // lunes=1 ... domingo=7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum); // jueves de esa semana
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Día de hoy como índice 0 (lunes) ... 6 (domingo). */
function todayIndex(date = new Date()) {
  return (date.getDay() + 6) % 7;
}

/** Lunes de la semana de una fecha (a medianoche local). */
function mondayOf(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - todayIndex(d));
  return d;
}

function defaultState() {
  return { version: SCHEMA_VERSION, currentWeek: isoWeek(), tasks: [], history: [] };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.tasks)) return defaultState();
    return {
      version: SCHEMA_VERSION,
      currentWeek: data.currentWeek || isoWeek(),
      tasks: data.tasks,
      history: Array.isArray(data.history) ? data.history : [],
    };
  } catch (err) {
    console.warn('No se pudieron leer los datos guardados', err);
    return defaultState();
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('No se pudieron guardar los datos', err);
  }
}

/**
 * Si cambió la semana: archiva las tareas hechas en el historial y pasa
 * las pendientes a la semana actual (conservan su día y cuadrante).
 * Devuelve true si hubo cambios.
 */
function rolloverWeek(state, nowWeek = isoWeek()) {
  if (state.currentWeek === nowWeek) return false;
  const done = state.tasks.filter((t) => t.done);
  const pending = state.tasks.filter((t) => !t.done);
  if (done.length) {
    state.history.unshift({ week: state.currentWeek, tasks: done });
  }
  state.tasks = pending.map((t) => ({ ...t, week: nowWeek }));
  state.currentWeek = nowWeek;
  return true;
}
