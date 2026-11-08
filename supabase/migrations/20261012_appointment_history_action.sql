-- Historique des rendez-vous : type d’action, lecture réservée à l’admin VIP et au superadmin.
-- À coller dans Supabase → SQL Editor → Run.
-- N'écrase aucune ligne existante.

alter table public.appointment_history
  add column if not exists action text;

drop policy if exists appointment_history_select on public.appointment_history;
create policy appointment_history_select on public.appointment_history
  for select to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and public.is_admin_role(p.role)
    )
  );
