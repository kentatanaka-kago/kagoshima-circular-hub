-- AI規制チェックの結果保存（共有URL用）。
-- 挿入は service role のみ（anon の insert ポリシーは付けない）。
-- 共有URLを知っていれば誰でも閲覧できる想定で select は public。
create table if not exists regulation_checks (
  id uuid primary key default gen_random_uuid(),
  product text not null,
  -- 企業検索機能（gBizINFO 連携）で選択した企業。手入力チェックでは null。
  company_name text,
  corporate_number text,
  answer text not null,
  sources jsonb not null default '[]',
  model text,
  created_at timestamptz not null default now()
);

alter table regulation_checks enable row level security;

create policy "regulation_checks readable by anyone"
  on regulation_checks for select using (true);

create index if not exists regulation_checks_created_idx on regulation_checks (created_at desc);
