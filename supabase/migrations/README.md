# Migrations Supabase — RBAC & activation

Appliquer **dans l’ordre** dans Supabase → SQL Editor :

1. `20260314_rbac_activation.sql`
2. `20260315_organizations_seed.sql` (organisation MKL Énergies)
3. `20260316_service_role_grants.sql`
4. `20260317_clients.sql` (**module Clients** — table + RLS)
5. `20260318_articles.sql` (**module Articles** — table + RLS)
6. `20260319_devis.sql` (**module Devis** — `devis` + `devis_lignes` + compteur)
7. `20260320_devis_numbering.sql` (**numérotation** `DEV-YYYY-000001`)
8. `20260321_devis_statuts_historique.sql` (**statuts + historique** `devis_historique`)
9. `20260322_rbac_roles_permissions.sql` (**ÉTAPE 8** — `roles` / `permissions` / `role_permissions` / `user_roles`)
10. `20260323_rls_commercial_scoping.sql` (**ÉTAPE 9** — RLS org / équipe / soi + pipeline commercial)

## Auth / PIN (ÉTAPE 10)

- Invitation : PIN **temporaire** (24 h) + page `/activation`
- Activation : PIN temporaire + mot de passe + **PIN personnel** (hash scrypt, jamais en clair)
- Connexion quotidienne : email + PIN personnel
- Un lien email seul **n’ouvre jamais** le CRM
- Tentatives limitées + blocage temporaire
- Admin : « Renvoyer le PIN » = réinitialisation du PIN personnel

## Tableau de bord commercial (ÉTAPE 11)

- API `/api/dashboard/commercial` (périmètre self / équipe / org)
- Vue d’ensemble : prospects, RDV, devis en cours / à relancer / acceptés, CA signé, taux de transformation, prochaines actions
- Filtres direction : commercial, période, activité, agence

## Traçabilité (ÉTAPE 12)

- Table `activity_logs` (`20260324_activity_logs.sql`)
- Journalise : clients (CRUD), devis (création, prix, remise, validation, suppression), utilisateurs (invitation, rôle, permissions)
- API `GET /api/activity-logs` (admin / direction)
- Journal visible dans **Utilisateurs & accès**

## Tests obligatoires (ÉTAPE 13)

- Suite `tests/etape13-access-matrix.test.js` : Admin / Responsable / Commercial 1 / Commercial 2
- Middleware refuse `/admin` et `/users` (redirect `/?denied=…`)
- Accès fiches : `canAccessScopedRow` + API clients/devis → 404 hors périmètre
- Aide personas : `20260325_etape13_test_personas.sql` (checklist, pas de création auth)

## Critères de validation (ÉTAPE 14)

- Attribution commercial : admin (org) + responsable (équipe)
- Devis Accepté/Payée/Annulé verrouillés (PATCH contenu refusé ; statut seul OK)
- Calcul multi-TVA : remise globale proportionnelle HT/TTC
- PDF devis : impression navigateur (« Enregistrer au format PDF »)
- Suite `tests/etape14-validation.test.js`
- RLS : défense en profondeur côté SQL ; contrôle effectif API (service role) + scoping

## Marques catalogue

- `20260326_article_brands.sql` — table `article_brands` (nom + logo) + `articles.brand_id`
- UI : onglet **Marques** dans Gestion des articles
- Création d’article : marque en **menu déroulant** (marques préenregistrées)
- Parcours devis : logos affichés sur les cartes marque

Variables Vercel requises après migration :

- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `ACTIVATION_PIN_PEPPER` (recommandé)
- Variables email OVH existantes

Redirect URL Supabase à ajouter :

- `https://crm-mkl-energeies.vercel.app/activation`
- `https://crm-mkl-energeies.vercel.app/reset-password`
- `https://crm-mkl-energeies.vercel.app/**`
