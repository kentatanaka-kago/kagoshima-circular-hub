create table mail_recipients (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  enabled     boolean not null default true,
  note        text,
  created_at  timestamptz not null default now()
);

alter table mail_recipients enable row level security;
-- No public policy: only service_role (server-side admin) can read/write.
