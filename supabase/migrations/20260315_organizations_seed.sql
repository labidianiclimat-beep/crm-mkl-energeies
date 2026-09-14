-- Seed default MKL Énergies organization (required by profiles.organization_id FK)
-- Safe to re-run. Works even if public.organizations already exists with extra columns.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'organizations'
  ) then
    create table public.organizations (
      id uuid primary key,
      name text not null,
      created_at timestamptz not null default now()
    );
  end if;
end $$;

insert into public.organizations (id, name)
values ('00000000-0000-0000-0000-000000000001'::uuid, 'MKL Énergies')
on conflict (id) do update set name = excluded.name;
