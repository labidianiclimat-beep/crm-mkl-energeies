 -- Numéro prospect MKL-PR-00001, attribué une fois, jamais réutilisé.
-- Uniquement les prospects qui ne sont pas encore devenus clients.
-- Safe to re-run.

create table if not exists public.prospect_counters (
  organization_id uuid primary key,
  last_value integer not null default 0
);

create or replace function public.next_prospect_number(p_org uuid)
returns integer
language plpgsql
as $$
declare
  v_next integer;
begin
  insert into public.prospect_counters (organization_id, last_value)
  values (p_org, 1)
  on conflict (organization_id)
  do update set last_value = public.prospect_counters.last_value + 1
  returning last_value into v_next;
  return v_next;
end;
$$;

alter table public.commercial_opportunities
  add column if not exists prospect_number integer;

with ranked as (
  select
    c.id,
    coalesce(m.base, 0) + row_number() over (
      partition by c.organization_id
      order by c.created_at asc, c.id asc
    ) as n
  from public.commercial_opportunities c
  left join (
    select organization_id, max(prospect_number) as base
    from public.commercial_opportunities
    group by organization_id
  ) m on m.organization_id = c.organization_id
  where c.prospect_number is null
    and coalesce(nullif(c.extra->>'clientId', ''), nullif(c.extra->>'client_id', '')) is null
)
update public.commercial_opportunities as c
set prospect_number = ranked.n
from ranked
where c.id = ranked.id;

insert into public.prospect_counters (organization_id, last_value)
select organization_id, coalesce(max(prospect_number), 0)
from public.commercial_opportunities
group by organization_id
on conflict (organization_id)
do update set last_value = greatest(public.prospect_counters.last_value, excluded.last_value);

create unique index if not exists opportunities_org_prospect_number_idx
  on public.commercial_opportunities (organization_id, prospect_number)
  where prospect_number is not null;

create or replace function public.assign_prospect_number()
returns trigger
language plpgsql
as $$
begin
  if new.prospect_number is null then
    new.prospect_number := public.next_prospect_number(new.organization_id);
  end if;
  return new;
end;
$$;

drop trigger if exists opportunities_assign_prospect_number on public.commercial_opportunities;
create trigger opportunities_assign_prospect_number
before insert on public.commercial_opportunities
for each row
execute function public.assign_prospect_number();

grant select, insert, update on public.prospect_counters to service_role;
grant execute on function public.next_prospect_number(uuid) to service_role;
