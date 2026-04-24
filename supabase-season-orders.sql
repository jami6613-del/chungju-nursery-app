-- 시즌 작물 주문현황: 공용 데이터 (모든 계정 공유)
-- Supabase SQL Editor에서 실행하세요.

-- 1) 보드(화이트보드)별 작물명
create table if not exists public.season_orders_boards (
  board_index int primary key check (board_index >= 0 and board_index < 5),
  crop_name text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

-- 기본 5개 보드 row 생성 (없으면 insert)
insert into public.season_orders_boards (board_index, crop_name)
values (0, ''), (1, ''), (2, ''), (3, ''), (4, '')
on conflict (board_index) do nothing;

-- 2) 주문 아이템
create table if not exists public.season_orders_items (
  id uuid primary key default gen_random_uuid(),
  board_index int not null check (board_index >= 0 and board_index < 5),
  orderer text not null default '',
  variety text not null default '',
  quantity numeric not null default 0,
  quantity_unit text not null default '판' check (quantity_unit in ('판','포기')),
  contact text not null default '',
  note text not null default '',
  sold boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create index if not exists season_orders_items_board_idx on public.season_orders_items (board_index);
create index if not exists season_orders_items_variety_idx on public.season_orders_items (variety);
create index if not exists season_orders_items_orderer_idx on public.season_orders_items (orderer);

-- 3) RLS: 로그인 사용자 읽기/쓰기 허용 (공용 공유)
alter table public.season_orders_boards enable row level security;
alter table public.season_orders_items enable row level security;

drop policy if exists "season_orders_boards_read" on public.season_orders_boards;
create policy "season_orders_boards_read"
on public.season_orders_boards
for select
to authenticated
using (true);

drop policy if exists "season_orders_boards_write" on public.season_orders_boards;
create policy "season_orders_boards_write"
on public.season_orders_boards
for update
to authenticated
using (true)
with check (true);

drop policy if exists "season_orders_items_read" on public.season_orders_items;
create policy "season_orders_items_read"
on public.season_orders_items
for select
to authenticated
using (true);

drop policy if exists "season_orders_items_write" on public.season_orders_items;
create policy "season_orders_items_write"
on public.season_orders_items
for insert
to authenticated
with check (true);

drop policy if exists "season_orders_items_update" on public.season_orders_items;
create policy "season_orders_items_update"
on public.season_orders_items
for update
to authenticated
using (true)
with check (true);

drop policy if exists "season_orders_items_delete" on public.season_orders_items;
create policy "season_orders_items_delete"
on public.season_orders_items
for delete
to authenticated
using (true);

