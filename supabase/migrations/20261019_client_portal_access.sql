-- Identifiants EDF et MPR sur la fiche client.
-- À coller dans l’éditeur SQL Supabase.

alter table public.clients
  add column if not exists portal_access jsonb not null default '{}'::jsonb;
