-- Correctif de sécurité du module signature.
-- Complète 20261113_devis_signatures.sql sans la réécrire.
-- Ne change aucun statut de devis, d’opportunité, de client ou de rendez-vous.
-- Ne supprime aucune preuve.

revoke all on table public.devis_signatures from public, anon, authenticated;
revoke all on table public.devis_signature_journal from public, anon, authenticated;
grant select on table public.devis_signatures to authenticated;
grant select on table public.devis_signature_journal to authenticated;

drop policy if exists devis_signatures_insert on public.devis_signatures;

alter table public.devis_signatures
  drop constraint if exists devis_signatures_storage_path_check;
alter table public.devis_signatures
  add constraint devis_signatures_storage_path_check
  check (
    storage_path is null
    or storage_path ~ (
      '^devis-signatures/' || organization_id::text || '/' || devis_id::text || '/[^/]+\.pdf$'
    )
  );

drop policy if exists devis_signatures_select on public.devis_signatures;
create policy devis_signatures_select on public.devis_signatures
  for select to authenticated
  using (
    exists (
      select 1
      from public.sale_actor() as acteur
      where acteur.active = true
        and acteur.ready = true
        and acteur.organization_id = devis_signatures.organization_id
        and (
          public.sale_can_confirm(acteur.role_name)
          or (
            public.sale_can_request(acteur.role_name)
            and (
              devis_signatures.commercial_id = auth.uid()
              or devis_signatures.requested_by = auth.uid()
            )
          )
        )
    )
  );

drop policy if exists devis_signature_journal_select on public.devis_signature_journal;
create policy devis_signature_journal_select on public.devis_signature_journal
  for select to authenticated
  using (
    exists (
      select 1
      from public.devis_signatures as preuve
      join public.sale_actor() as acteur on true
      where preuve.devis_id = devis_signature_journal.devis_id
        and preuve.organization_id = acteur.organization_id
        and acteur.active = true
        and acteur.ready = true
        and (
          public.sale_can_confirm(acteur.role_name)
          or (
            public.sale_can_request(acteur.role_name)
            and (
              preuve.commercial_id = auth.uid()
              or preuve.requested_by = auth.uid()
            )
          )
        )
    )
  );

drop policy if exists devis_signatures_storage_select on storage.objects;
create policy devis_signatures_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'devis-signatures'
    and (storage.foldername(storage.objects.name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(storage.objects.name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1
      from public.devis_signatures as preuve
      where preuve.storage_path = ('devis-signatures/' || storage.objects.name)
        and preuve.organization_id::text = (storage.foldername(storage.objects.name))[1]
        and preuve.devis_id::text = (storage.foldername(storage.objects.name))[2]
    )
  );

update storage.buckets
set public = false,
    file_size_limit = 4000000,
    allowed_mime_types = array['application/pdf']
where id = 'devis-signatures';
