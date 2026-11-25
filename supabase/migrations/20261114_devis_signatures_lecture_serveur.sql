-- Lecture des preuves réservée au serveur.
-- Les identifiants du pilote restent dans les variables du serveur.
-- Cette migration ne modifie aucun devis, client, rendez-vous, opportunité ou preuve.

revoke select on table public.devis_signatures from public, anon, authenticated;
revoke select on table public.devis_signature_journal from public, anon, authenticated;

drop policy if exists devis_signatures_select on public.devis_signatures;
drop policy if exists devis_signature_journal_select on public.devis_signature_journal;
drop policy if exists devis_signatures_storage_select on storage.objects;
