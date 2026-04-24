-- 시즌 작물 주문현황 - 재고관리(공용 데이터)
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.season_inventory (
  board_index int not null check (board_index >= 0 and board_index < 5),
  variety text not null,
  stock_pan numeric not null default 0,
  deducted_pan numeric not null default 0,
  stock_pogi numeric not null default 0,
  deducted_pogi numeric not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  primary key (board_index, variety)
);

create index if not exists season_inventory_board_idx on public.season_inventory (board_index);

alter table public.season_inventory enable row level security;

drop policy if exists "season_inventory_read" on public.season_inventory;
create policy "season_inventory_read"
on public.season_inventory
for select
to authenticated
using (true);

drop policy if exists "season_inventory_write" on public.season_inventory;
create policy "season_inventory_write"
on public.season_inventory
for insert
to authenticated
with check (true);

drop policy if exists "season_inventory_update" on public.season_inventory;
create policy "season_inventory_update"
on public.season_inventory
for update
to authenticated
using (true)
with check (true);

