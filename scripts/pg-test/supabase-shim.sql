-- ---------------------------------------------------------------------------
-- Environnement minimal imitant Supabase, pour une base PostgreSQL de test.
--
-- Les migrations du CRM supposent un environnement Supabase : des rôles, un
-- schéma `auth` avec sa table d'utilisateurs et sa fonction `auth.uid()`, un
-- schéma `storage`, et les privilèges par défaut que Supabase accorde sur le
-- schéma `public`. Rien de tout cela n'existe dans un PostgreSQL nu.
--
-- Ce fichier recrée le strict nécessaire, et seulement ce que les migrations
-- utilisent réellement : `auth.uid`, `auth.users`, `storage.buckets` et
-- `storage.objects`. Il ne cherche pas à reproduire Supabase, mais à rendre
-- les migrations exécutables telles quelles.
--
-- Deux points sont reproduits volontairement parce qu'ils changent le
-- comportement observé :
--
--   1. `service_role` est `bypassrls`. C'est ce qui rend les politiques RLS
--      inopérantes depuis les routes du CRM, et c'est pourquoi les garanties
--      importantes sont des contraintes et des déclencheurs, pas des
--      politiques.
--   2. Les privilèges par défaut de Supabase accordent tout à `service_role`
--      sur les objets créés dans `public`. Sans eux, les `revoke` de nos
--      migrations n'auraient rien à révoquer et les tests seraient faussés.
--
-- Ce fichier ne doit jamais être appliqué à une base de production : il y
-- recréerait des objets gérés par Supabase.
-- ---------------------------------------------------------------------------

-- Rôles Supabase. `nologin` suffit : les essais se font en changeant de rôle
-- dans la session, pas en se reconnectant.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator noinherit login password 'authenticator';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    create role supabase_admin nologin;
  end if;
end
$$;

grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to postgres;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;

-- Supabase fournit pgcrypto préinstallé dans le schéma `extensions`. Les
-- migrations du CRM écrivent `create extension if not exists pgcrypto` sans
-- préciser de schéma : sur Supabase c'est sans effet, mais sur une base nue
-- l'extension se poserait dans `public` et y déverserait une quarantaine de
-- fonctions qui n'y sont pas en production. L'installer ici au bon endroit
-- reproduit la réalité et évite de fausser l'audit search_path.
create extension if not exists pgcrypto with schema extensions;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema storage to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- auth.users
--
-- Seules les colonnes réellement référencées par les migrations du CRM. La
-- table Supabase en compte beaucoup plus ; les ajouter ne changerait rien aux
-- contraintes testées.
-- ---------------------------------------------------------------------------

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- auth.uid()
--
-- Supabase lit l'identifiant de l'utilisateur dans les revendications du jeton
-- publiées par PostgREST. La variable de session est la même, ce qui permet de
-- jouer une requête « en tant que » tel utilisateur dans les essais.
-- ---------------------------------------------------------------------------

create or replace function auth.uid()
returns uuid
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    'anon'
  )
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;
grant select on auth.users to service_role;

-- ---------------------------------------------------------------------------
-- storage
-- ---------------------------------------------------------------------------

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  -- Colonnes réellement utilisées par les migrations du CRM, qui créent des
  -- compartiments privés en bornant la taille et les types acceptés.
  file_size_limit bigint,
  allowed_mime_types text[],
  owner uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant all on storage.buckets, storage.objects to service_role;

-- ---------------------------------------------------------------------------
-- Privilèges par défaut
--
-- Reproduit le comportement Supabase : tout objet créé ensuite dans `public`
-- est accessible aux trois rôles. C'est ce qui donne du sens aux `revoke` de
-- nos migrations : sans ces privilèges par défaut, elles révoqueraient un
-- droit qui n'a jamais été accordé, et le test ne prouverait rien.
-- ---------------------------------------------------------------------------

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
