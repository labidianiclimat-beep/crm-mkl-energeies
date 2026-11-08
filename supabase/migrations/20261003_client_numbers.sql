-- Numéro client MKL-CL-00001, attribué une fois, jamais réutilisé.
-- Safe to re-run.

create table if not exists public.client_counters (
  organization_id uuid primary key,
  last_value integer not null default 0
);

create or replace function public.next_client_number(p_org uuid)
returns integer
language plpgsql
as $$
declare
  v_next integer;
begin
  insert into public.client_counters (organization_id, last_value)
  values (p_org, 1)
  on conflict (organization_id)
  do update set last_value = public.client_counters.last_value + 1
  returning last_value into v_next;
  return v_next;
end;
$$;

alter table public.clients
  add column if not exists client_number integer;

with ranked as (
  select
    c.id,
    coalesce(m.base, 0) + row_number() over (
      partition by c.organization_id
      order by c.created_at asc, c.id asc
    ) as n
  from public.clients c
  left join (
    select organization_id, max(client_number) as base
    from public.clients
    group by organization_id
  ) m on m.organization_id = c.organization_id
  where c.client_number is null
)
update public.clients as c
set client_number = ranked.n
from ranked
where c.id = ranked.id;

insert into public.client_counters (organization_id, last_value)
select organization_id, coalesce(max(client_number), 0)
from public.clients
group by organization_id
on conflict (organization_id)
do update set last_value = greatest(public.client_counters.last_value, excluded.last_value);

create unique index if not exists clients_org_number_idx
  on public.clients (organization_id, client_number);

create or replace function public.assign_client_number()
returns trigger
language plpgsql
as $$
begin
  if new.client_number is null then
    new.client_number := public.next_client_number(new.organization_id);
  end if;
  return new;
end;
$$;

drop trigger if exists clients_assign_number on public.clients;
create trigger clients_assign_number
before insert on public.clients
for each row
execute function public.assign_client_number();

grant select, insert, update on public.client_counters to service_role;
grant execute on function public.next_client_number(uuid) to service_role;
