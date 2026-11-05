// Guardado en Supabase, utilidades de semana y lectura de los datos
// viejos de localStorage (para migrarlos a la nube una sola vez).

// ---------- Semanas ----------

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

// ---------- Datos viejos de localStorage ----------

const LEGACY_KEY = 'tareas-semana';
const LEGACY_BACKUP_KEY = 'tareas-semana-migradas';

/** Devuelve { tasks, history } guardados antes de usar Supabase, o null. */
function loadLegacyLocal() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
    const history = Array.isArray(data?.history) ? data.history : [];
    return tasks.length || history.length ? { tasks, history } : null;
  } catch {
    return null;
  }
}

/** Guarda una copia de respaldo y deja de ofrecer la migración. */
function markLegacyMigrated() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) localStorage.setItem(LEGACY_BACKUP_KEY, raw);
    localStorage.removeItem(LEGACY_KEY);
  } catch { /* sin acceso a localStorage: no pasa nada */ }
}

// ---------- Supabase ----------

const db = (() => {
  const cfg = window.APP_CONFIG || {};
  const configured = Boolean(
    window.supabase &&
    cfg.supabaseUrl && cfg.supabaseAnonKey &&
    !cfg.supabaseUrl.includes('TU_PROYECTO') && cfg.supabaseAnonKey !== 'TU_ANON_KEY'
  );
  const client = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  let channel = null;

  // Nombre en la app → columna en la base.
  const FIELDS = {
    id: 'id', title: 'title', quadrant: 'quadrant', day: 'day', category: 'category',
    durationMin: 'duration_min', time: 'start_time', done: 'done', week: 'week', archived: 'archived',
  };

  function toRow(obj) {
    const row = {};
    for (const [key, col] of Object.entries(FIELDS)) {
      if (obj[key] !== undefined) row[col] = obj[key];
    }
    return row;
  }

  function fromRow(r) {
    return {
      id: r.id,
      title: r.title,
      quadrant: r.quadrant,
      day: r.day,
      category: r.category,
      durationMin: r.duration_min,
      time: r.start_time,
      done: r.done,
      week: r.week,
      archived: r.archived,
      createdAt: Date.parse(r.created_at),
    };
  }

  function check({ data, error }) {
    if (error) throw error;
    return data;
  }

  return {
    configured,

    // --- Sesión ---
    async getSession() {
      const { data } = await client.auth.getSession();
      return data.session;
    },
    onAuthChange(callback) {
      // No llamar a Supabase dentro del callback: se difiere para evitar bloqueos.
      client.auth.onAuthStateChange((_event, session) => setTimeout(() => callback(session), 0));
    },
    async signIn(email) {
      check(await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: location.origin + location.pathname },
      }));
    },
    async signOut() {
      await client.auth.signOut();
    },

    // --- Tareas ---
    async fetchTasks() {
      return check(await client.from('tasks').select('*').eq('archived', false)).map(fromRow);
    },
    async fetchHistory() {
      return check(
        await client.from('tasks').select('*').eq('archived', true)
          .order('week', { ascending: false }).order('created_at'),
      ).map(fromRow);
    },
    async insertTasks(tasks) {
      if (tasks.length) check(await client.from('tasks').insert(tasks.map(toRow)));
    },
    async updateTask(id, patch) {
      check(await client.from('tasks').update(toRow(patch)).eq('id', id));
    },
    async deleteTask(id) {
      check(await client.from('tasks').delete().eq('id', id));
    },

    /**
     * Cambio de semana: las tareas hechas de semanas anteriores pasan al
     * historial y las pendientes se mueven a la semana actual.
     */
    async rollover(week) {
      check(await client.from('tasks').update({ archived: true })
        .eq('archived', false).eq('done', true).neq('week', week));
      check(await client.from('tasks').update({ week })
        .eq('archived', false).eq('done', false).neq('week', week));
    },

    // --- Tiempo real ---
    subscribe(onChange) {
      this.unsubscribe();
      channel = client
        .channel('tasks-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, onChange)
        .subscribe();
    },
    unsubscribe() {
      if (channel) {
        client.removeChannel(channel);
        channel = null;
      }
    },
  };
})();
