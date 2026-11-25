-- Destinataires multiples d’un ticket interne.
-- À coller dans Supabase → SQL Editor → Run si la table existe déjà.
-- Safe to re-run.

alter table public.internal_requests
  add column if not exists assignee_ids uuid[] not null default '{}';

update public.internal_requests
set assignee_ids = array[assignee_id]
where assignee_id is not null
  and (assignee_ids is null or cardinality(assignee_ids) = 0);
