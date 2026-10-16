-- Issuer data stays in the database, never in the public frontend source.
create table statement_private.provider (
  singleton boolean primary key default true check(singleton),
  details jsonb not null check(jsonb_typeof(details)='object')
);
alter table statement_private.provider enable row level security;
revoke all on statement_private.provider from public,anon,authenticated;
grant select on statement_private.provider to authenticated;
create policy statement_provider_read on statement_private.provider for select to authenticated
  using(exists(select 1 from statement_private.staff s join public.users u on u.id=s.user_id where s.user_id=(select auth.uid()) and u.is_approved and u.role_level in (0,1)));

create function public.statement_provider() returns jsonb
language sql stable security invoker set search_path='' as $$
  select details from statement_private.provider where singleton;
$$;
revoke all on function public.statement_provider() from public,anon;
grant execute on function public.statement_provider() to authenticated;

-- Freeze the authorized issuer details when issuing; reject a stale preview.
create function statement_private.verify_provider() returns trigger
language plpgsql security invoker set search_path='' as $$
declare current_provider jsonb;
begin
  select details into current_provider from statement_private.provider where singleton;
  if current_provider is null or new.payload->'provider' is distinct from current_provider then
    raise exception '육묘장 발급정보를 다시 불러온 후 미리보기를 만들어 주세요.';
  end if;
  return new;
end;
$$;
revoke all on function statement_private.verify_provider() from public,anon,authenticated;
create trigger verify_statement_provider before insert on public.transaction_statements
  for each row execute function statement_private.verify_provider();
notify pgrst,'reload schema';

