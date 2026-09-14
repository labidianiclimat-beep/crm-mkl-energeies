-- Étape 7 — statuts devis + historique des changements
-- Safe to re-run

create table if not exists public.devis_historique (
  id uuid primary key default gen_random_uuid(),
  devis_id uuid not null references public.devis (id) on delete cascade,
  ancien_statut text,
  nouveau_statut text not null,
  utilisateur_id uuid references auth.users (id) on delete set null,
  date timestamptz not null default now(),
  commentaire text
);

create index if not exists devis_historique_devis_idx
  on public.devis_historique (devis_id, date desc);

create index if not exists devis_historique_user_idx
  on public.devis_historique (utilisateur_id);

alter table public.devis_historique enable row level security;

drop policy if exists devis_historique_select on public.devis_historique;
create policy devis_historique_select on public.devis_historique
  for select to authenticated
  using (
    exists (
      select 1 from public.devis d
      where d.id = devis_historique.devis_id
        and public.can_access_devis_row(d)
    )
  );

drop policy if exists devis_historique_insert on public.devis_historique;
create policy devis_historique_insert on public.devis_historique
  for insert to authenticated
  with check (
    exists (
      select 1 from public.devis d
      where d.id = devis_historique.devis_id
        and public.can_access_devis_row(d)
    )
  );

grant all on table public.devis_historique to service_role;
grant select, insert on table public.devis_historique to authenticated;
