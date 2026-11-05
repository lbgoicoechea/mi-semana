-- Mi semana: tabla de tareas y seguridad.
-- Pegá todo este archivo en Supabase → SQL Editor → New query → Run.
-- Se puede correr más de una vez sin romper nada.

create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 140),
  quadrant     smallint not null check (quadrant between 1 and 4),
  day          smallint not null check (day between 0 and 6),          -- 0 = lunes ... 6 = domingo
  category     text not null check (category in ('trabajo', 'personal', 'salud')),
  duration_min integer check (duration_min is null or duration_min > 0),
  start_time   text check (start_time is null or start_time ~ '^\d{2}:\d{2}$'),
  done         boolean not null default false,
  week         text not null check (week ~ '^\d{4}-W\d{2}$'),          -- semana ISO, ej. 2026-W45
  archived     boolean not null default false,                          -- true = está en el historial
  created_at   timestamptz not null default now()
);

create index if not exists tasks_user_archived_idx on public.tasks (user_id, archived);

-- Seguridad: cada usuario ve y modifica solo sus propias tareas.
alter table public.tasks enable row level security;

drop policy if exists "tasks_select_own" on public.tasks;
drop policy if exists "tasks_insert_own" on public.tasks;
drop policy if exists "tasks_update_own" on public.tasks;
drop policy if exists "tasks_delete_own" on public.tasks;

create policy "tasks_select_own" on public.tasks
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "tasks_insert_own" on public.tasks
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "tasks_update_own" on public.tasks
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "tasks_delete_own" on public.tasks
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Tiempo real: avisar a los dispositivos abiertos cuando cambia una tarea.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;
