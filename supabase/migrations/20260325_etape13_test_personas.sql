-- ÉTAPE 13 — Personas de test (aide-mémoire, safe to re-run)
-- Ne crée PAS les comptes auth : invitez-les depuis Utilisateurs dans le CRM.
--
-- Comptes recommandés :
--   1. Admin VIP              → accès total
--   2. Responsable commercial → manager = nom/email du responsable
--   3. Commercial 1           → manager = Responsable commercial
--   4. Commercial 2           → manager différent (ou vide) pour rester hors équipe
--
-- Checklist manuelle après activation :
--   [ ] Admin ouvre Clients / Devis / Utilisateurs / Vue d’ensemble
--   [ ] Responsable voit les clients/devis de Commercial 1 (équipe)
--   [ ] Commercial 1 ne voit que ses fiches
--   [ ] Commercial 2 ne voit JAMAIS clients/devis de Commercial 1
--   [ ] Commercial ouvre /admin  → redirigé vers /?denied=admin
--   [ ] Commercial ouvre /users  → redirigé vers /?denied=users
--   [ ] Commercial appelle GET /api/clients/{id-autre} → 404
--   [ ] Commercial appelle GET /api/devis/{id-autre}   → 404
--
-- Vérification SQL (optionnel) après avoir créé les 4 profils :
select email, full_name, role, manager, active
from public.profiles
where email ilike '%test%' or role in ('Admin VIP', 'Responsable commercial', 'Commercial')
order by role, email;

select 1;
