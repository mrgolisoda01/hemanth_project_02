-- ============================================================
--  SAFC Tracker — Supabase schema
--  Run this ONCE in the Supabase dashboard:
--    Dashboard -> SQL Editor -> paste -> Run
-- ============================================================

-- 1) ENTRIES  (proper relational table — one row per daily lead entry)
create table if not exists public.entries (
    id          uuid primary key default gen_random_uuid(),
    entry_date  date,
    state       text,
    city        text,
    leads       integer default 0,
    eligible    integer default 0,
    mv          integer default 0,
    sales       integer default 0,
    source      text    default 'Manual',
    entered_by  text,
    status      text    default 'pending',
    notes       text,
    created_at  timestamptz default now()
);

-- Helpful indexes for dashboard queries
create index if not exists entries_date_idx  on public.entries (entry_date);
create index if not exists entries_state_idx on public.entries (state);
create index if not exists entries_city_idx  on public.entries (city);

-- 2) KV_STORE  (structured config the tracker uses: targeted cities,
--    managers, settings, bottles, HR, modules, awareness, logs, etc.)
create table if not exists public.kv_store (
    k           text primary key,
    v           text,
    updated_at  timestamptz default now()
);

-- ------------------------------------------------------------
--  Row Level Security
--  The anon key is used by the Flask backend. For a single shared
--  team dataset, we allow the anon role full access to these two
--  tables. (Lock this down further later if you add auth.)
-- ------------------------------------------------------------
alter table public.entries  enable row level security;
alter table public.kv_store enable row level security;

-- Drop existing policies if re-running
drop policy if exists "anon all entries"  on public.entries;
drop policy if exists "anon all kv"        on public.kv_store;

create policy "anon all entries"
    on public.entries
    for all
    to anon
    using (true)
    with check (true);

create policy "anon all kv"
    on public.kv_store
    for all
    to anon
    using (true)
    with check (true);
