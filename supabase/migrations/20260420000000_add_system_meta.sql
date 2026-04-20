-- System-level metadata: key/value store for things like last aggregate run.
-- Kept separate from domain tables so it can carry its own RLS policy.

create table system_meta (
  key         text primary key,
  value       text,
  updated_at  timestamptz not null default now()
);

alter table system_meta enable row level security;

create policy "public read system_meta" on system_meta for select using (true);
-- Writes remain service_role only (no insert/update policy).
