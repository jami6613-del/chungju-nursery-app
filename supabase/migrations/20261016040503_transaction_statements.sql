-- Feature-only access list: do not change privileges on existing application tables.
create schema statement_private;
revoke all on schema statement_private from public,anon;
grant usage on schema statement_private to authenticated;
create table statement_private.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role_level smallint not null check(role_level in (0,1))
);
alter table statement_private.staff enable row level security;
revoke all on statement_private.staff from public,anon,authenticated;
grant select on statement_private.staff to authenticated;
create policy own_statement_access on statement_private.staff for select to authenticated using(user_id=(select auth.uid()));
insert into statement_private.staff(user_id,role_level)
  select id,role_level from public.users where is_approved and role_level in (0,1);

-- Issued statements are immutable snapshots. Retrying an issue uses the same UUID.
create table public.transaction_statements (
  id uuid primary key,
  document_number text not null unique,
  customer_name text not null,
  trade_date date not null,
  period_from date,
  period_to date,
  total_amount numeric(15,0) not null check (total_amount between 0 and 999999999999),
  deposit_amount numeric(15,0) not null check (deposit_amount >= 0 and deposit_amount <= total_amount),
  crop_search text not null,
  payload jsonb not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index transaction_statements_created_idx on public.transaction_statements(created_at desc,id desc);
create index transaction_statements_trade_date_idx on public.transaction_statements(trade_date);
create index transaction_statements_creator_idx on public.transaction_statements(created_by);
alter table public.transaction_statements enable row level security;
revoke all on public.transaction_statements from public,anon,authenticated;
grant select on public.transaction_statements to authenticated;
grant insert(id,payload) on public.transaction_statements to authenticated;
create policy statement_staff_read on public.transaction_statements for select to authenticated
  using (exists (select 1 from statement_private.staff s join public.users u on u.id=s.user_id where s.user_id=(select auth.uid()) and u.is_approved and u.role_level in (0,1)));
create policy statement_staff_issue on public.transaction_statements for insert to authenticated
  with check (created_by=(select auth.uid()) and exists (select 1 from statement_private.staff s join public.users u on u.id=s.user_id where s.user_id=(select auth.uid()) and u.is_approved and u.role_level in (0,1)));

-- Only an already authorized statement administrator may enroll another staff
-- member after the normal member approval screen has approved that person.
create function statement_private.sync_staff(target_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare target_level smallint; target_approved boolean;
begin
  if auth.uid() is null or not exists(select 1 from statement_private.staff s where s.user_id=auth.uid() and s.role_level=0)
     or not exists(select 1 from public.users u where u.id=auth.uid() and u.is_approved and (u.role_level=0 or target_user_id=auth.uid())) then
    raise exception '거래명세서 접근권한을 관리할 권한이 없습니다.' using errcode='42501';
  end if;
  select role_level,is_approved into target_level,target_approved from public.users where id=target_user_id;
  if target_approved and target_level in (0,1) then
    insert into statement_private.staff(user_id,role_level) values(target_user_id,target_level)
      on conflict(user_id) do update set role_level=excluded.role_level;
  else
    delete from statement_private.staff where user_id=target_user_id;
  end if;
end;
$$;
revoke all on function statement_private.sync_staff(uuid) from public,anon;
grant execute on function statement_private.sync_staff(uuid) to authenticated;
create function public.sync_statement_staff(target_user_id uuid) returns void
language sql security invoker set search_path='' as $$select statement_private.sync_staff(target_user_id);$$;
revoke all on function public.sync_statement_staff(uuid) from public,anon;
grant execute on function public.sync_statement_staff(uuid) to authenticated;

create function public.validate_transaction_statement() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
  item jsonb;
  k text;
  q_text text;
  p_text text;
  amount_text text;
  amount numeric;
  q numeric;
  p numeric;
  total numeric := 0;
  crops text := '';
begin
  if jsonb_typeof(new.payload) is distinct from 'object' or new.payload->'version' is distinct from '1'::jsonb
     or jsonb_typeof(new.payload->'provider') is distinct from 'object'
     or jsonb_typeof(new.payload->'lines') is distinct from 'array' then
    raise exception '명세서 형식이 올바르지 않습니다.';
  end if;
  if jsonb_array_length(new.payload->'lines') not between 1 and 120 then raise exception '거래내역은 1~120줄이어야 합니다.'; end if;
  foreach k in array array['customerName','address','contact','tradeDate','dateFrom','dateTo','deposit','note'] loop
    if jsonb_typeof(new.payload->k) is distinct from 'string' then raise exception '명세서 필드 형식이 올바르지 않습니다.'; end if;
  end loop;
  new.customer_name := btrim(new.payload->>'customerName');
  if length(new.customer_name) not between 1 and 80 or length(new.payload->>'address')>120
     or length(new.payload->>'contact')>40 or length(new.payload->>'note')>80 then raise exception '주문자 정보 또는 비고를 확인해 주세요.'; end if;
  if (new.payload->>'tradeDate') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception '거래일을 확인해 주세요.'; end if;
  new.trade_date := (new.payload->>'tradeDate')::date;
  foreach k in array array['dateFrom','dateTo'] loop
    if (new.payload->>k) <> '' and (new.payload->>k) !~ '^\d{4}-\d{2}-\d{2}$' then raise exception '거래기간을 확인해 주세요.'; end if;
  end loop;
  new.period_from := nullif(new.payload->>'dateFrom','')::date;
  new.period_to := nullif(new.payload->>'dateTo','')::date;
  if new.period_from>new.period_to then raise exception '거래기간을 확인해 주세요.'; end if;
  for item in select value from jsonb_array_elements(new.payload->'lines') loop
    foreach k in array array['crop','quantity','tray','unitPrice','amountOverride','shippingDate','note'] loop
      if jsonb_typeof(item->k) is distinct from 'string' then raise exception '거래 항목의 형식이 올바르지 않습니다.'; end if;
    end loop;
    if btrim(item->>'crop')='' and btrim(item->>'note')='' then raise exception '작물명 또는 비고가 필요합니다.'; end if;
    if length(item->>'crop')>80 or length(item->>'note')>80 or length(item->>'quantity')>40 or length(item->>'tray')>40 or length(item->>'unitPrice')>40 or length(item->>'amountOverride')>40 then raise exception '거래 항목의 내용이 너무 깁니다.'; end if;
    if (item->>'shippingDate')<>'' then
      if (item->>'shippingDate') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception '출하일을 확인해 주세요.'; end if;
      perform (item->>'shippingDate')::date;
    end if;
    amount_text := replace(btrim(item->>'amountOverride'),',','');
    if amount_text<>'' then
      if amount_text !~ '^(\d+(\.\d*)?|\.\d+)$' then raise exception '금액을 확인해 주세요.'; end if;
      amount := amount_text::numeric;
      if amount<>trunc(amount) then raise exception '금액은 원 단위로 입력하세요.'; end if;
    else
      q_text := replace(btrim(item->>'quantity'),',','');
      p_text := replace(btrim(item->>'unitPrice'),',','');
      if q_text !~ '^(\d+(\.\d*)?|\.\d+)$' or p_text !~ '^(\d+(\.\d*)?|\.\d+)$' then raise exception '수량·단가 또는 직접 입력 금액이 필요합니다.'; end if;
      q:=q_text::numeric; p:=p_text::numeric;
      if q>999999999999 or p>999999999999 or p<>trunc(p) then raise exception '수량·단가를 확인해 주세요.'; end if;
      amount:=round(q*p);
    end if;
    if amount<0 or amount>999999999999 then raise exception '금액을 확인해 주세요.'; end if;
    total := total + amount;
    crops := crops || ' ' || (item->>'crop');
  end loop;
  amount_text := replace(btrim(new.payload->>'deposit'),',','');
  if amount_text !~ '^(\d+(\.\d*)?|\.\d+)$' then raise exception '계약금을 확인해 주세요.'; end if;
  new.deposit_amount := amount_text::numeric;
  if amount_text::numeric<>trunc(amount_text::numeric) or amount_text::numeric<0 or amount_text::numeric>total then raise exception '계약금은 총 금액 이하의 원 단위 금액이어야 합니다.'; end if;
  new.total_amount := total;
  new.crop_search := btrim(crops);
  new.created_by := auth.uid();
  new.created_at := clock_timestamp();
  new.document_number := 'TM-' || to_char(new.trade_date,'YYYYMMDD') || '-' || upper(left(new.id::text,8));
  new.payload := jsonb_set(new.payload,'{documentNumber}',to_jsonb(new.document_number));
  return new;
end;
$$;
revoke all on function public.validate_transaction_statement() from public,anon,authenticated;
create trigger validate_transaction_statement_before_insert before insert on public.transaction_statements
  for each row execute function public.validate_transaction_statement();

create function public.statement_customer_names() returns table(name text)
language sql stable security invoker set search_path='' as $$
  select distinct names.name from (
    select customer_name as name from public.orders
    union select orderer as name from public.season_orders_items
    union select customer_name as name from public.transaction_statements
  ) names
  where nullif(btrim(names.name),'') is not null
    and exists(select 1 from statement_private.staff s join public.users u on u.id=s.user_id where s.user_id=(select auth.uid()) and u.is_approved and u.role_level in (0,1))
  order by names.name;
$$;
revoke all on function public.statement_customer_names() from public,anon;
grant execute on function public.statement_customer_names() to authenticated;
notify pgrst,'reload schema';
