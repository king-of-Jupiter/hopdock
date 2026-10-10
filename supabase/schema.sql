-- Hopdock sync schema: opaque per-item blobs, last-writer-wins.
-- Private keys and passwords are NEVER stored here, only public metadata.
create table if not exists vault_items (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  vault_id text not null,
  kind text not null check (kind in ('host', 'group', 'key', 'snippet')),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table vault_items enable row level security;

drop policy if exists "own rows" on vault_items;
create policy "own rows" on vault_items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists vault_items_updated_idx on vault_items (updated_at);
