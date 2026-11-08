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

## Catalogue devis (catégories / sous-catégories)

- `20260915_article_taxonomy.sql` — tables `article_categories` et `article_subcategories` + `articles.category_id` / `subcategory_id`
- `20260916_article_picker_families.sql` — ordre commercial des 7 familles du picker
- `20260925_clim_indoor_console_basse.sql` — Climatisation : **Unités intérieures** + **Console** renommée **Console basse**
- `20260933_pv_micro_onduleur.sql` — Photovoltaïque : sous-catégorie **Micro-onduleur** (en plus de Panneaux, Onduleurs, Batteries, Main-d’œuvre)
- `20261004_pv_optimiseur.sql` — Photovoltaïque : sous-catégorie **Optimiseur**, juste avant Main-d’œuvre
- `20261004_technotherm_radiateurs.sql` — Radiateur électrique : 13 gammes Technotherm TT-KS et 53 articles. Prix d’achat = net liste, prix de vente = net × 5, TVA 10 %
- Hiérarchie : **Catégorie → Sous-catégorie → Marque → Article**
- Parcours devis / facture « Ajouter un article » : **Chauffage → Climatisation → Ballon d’eau chaude → Photovoltaïque → VMC → Isolation → Autre**
- Admin : onglet **Catégories** (créer / modifier / désactiver / supprimer familles et sous-familles)
- `20260917_article_bundles.sql` — groupes d’articles partagés (`article_bundles`), visibles par toute l’équipe tant qu’ils sont activés

## Études thermiques commerciales

- `20260916_thermal_studies.sql` — module **Études thermiques**, mapping `mkl-thermal-studies`, droits commerciaux
- Formulaire `/etude-thermique` : grille d’isolation, G, volume, ΔT, kW, kWh Alsace (DJU 3184 × 0,018), comparatif PAC / énergies actuelles
- Impression navigateur → PDF, même principe que prévisite et étude PV

## Agenda commercial & Google Calendar

- `20260915_agenda_google_notifications.sql` — historique RDV, notifications CRM, comptes Google
- Réutilise `commercial_appointments` (pas de table doublon)
- Prochaine action obligatoire à la création d’un prospect
- Responsable prospection : date souhaitée obligatoire, commercial optionnel, file **À dispatcher**
- Variables Google : `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- Cron rappels : `CRON_SECRET` + `vercel.json` (`0 7 * * *` quotidien, plan Hobby) → `/api/cron/agenda-reminders`. Les rappels CRM sont aussi calculés à l’ouverture des notifications.

## Responsable prospection

- `20260918_prospect_dispatch.sql` — rôle, zone / spécialités des profils, historique d’attribution, RLS org-wide prospects/agendas
- File d’attente : prospects sans commercial + date souhaitée
- Attribution / réattribution : `POST /api/prospects/[id]/assign` (motif obligatoire en réattribution)
- Recommandations : zone / CP / commune / département + charge + spécialité
- Tableau de suivi : `/api/dashboard/prospecting` (aucun euro, marge, devis)
- Interdit : Clients, Devis, Factures, CA, commissions — menu, API et `canManageDevis`
- Événements Google personnels affichés **Indisponible** (pas de titre ni détail)

À coller aussi si pas encore appliqué : `20260917_article_bundles.sql`

## Justificatifs client (photos → PDF)

- `20260919_client_documents.sql` — table `client_documents` + bucket privé `client-documents`
- Bouton **Photographier un document** en bas de fiche client (caméra téléphone)
- Photos compressées, assemblées en PDF, rouvrables à tout moment depuis la fiche
- Même périmètre que le client (commercial / équipe / org)
- `20260920_prospect_documents.sql` — même module photo sur le **formulaire prospect** (`prospect_documents`)

## Photos de prévisite technique

- `20260921_previsit_photos.sql` — `previsit_photos`, `previsit_photo_marks`, `previsit_reports` + bucket privé `previsit-photos`
- Section **Photos techniques** dans `/previsite` : prise / import, annotation d’équipements, rapport PDF
- Le PDF est enregistré dans le dossier client (`Rapport de prévisite`) et régénérable
- À coller dans le SQL Editor **après** `20260919_client_documents.sql`

## Suppression d’articles (fonction exclusive)

- `20260923_delete_articles_permission.sql` — permission `action:delete_articles`
- Le bouton n’apparaît que si la case **Supprimer des articles** est cochée sur la fiche utilisateur

## Temps passé / journal par utilisateur

- `20260924_usage_sessions.sql` — table `usage_sessions` (heartbeat onglet visible)
- Journal d’activités (Admin VIP) : temps par personne et par jour + actions
- Le compteur s’arrête si l’onglet n’est plus visible (plus de 3 min sans ping = nouvelle session)


## Durcissement CRM (26/09/2026)

- `20260928_crm_hardening.sql` — bucket privé `pv-study-assets` (cartes de flux hors du JSON `crm_state`)
- `/api/org-state` : accès par module, fusion par `id` (plus d’écrasement d’un autre dossier), catégories article en lecture seule
- `/api/users` : e-mails et modules réservés aux gestionnaires ; les autres voient un annuaire
- Admin VIP seul : attribution du rôle VIP et des fonctions exclusives
- Rapports de maintenance : enregistrement partagé (`mkl-maintenance-reports`)
- Une erreur de sauvegarde partagée s’affiche ; le cache local n’écrase plus un serveur vide

## Dossiers en tables (26/09/2026)

- `20260929_record_tables.sql` — `pv_projects`, `thermal_studies`, `maintenance_contracts` (une ligne par dossier)
- Premier chargement : import automatique depuis `crm_state` puis plus d’écriture dans le blob
- Sans cette migration, le CRM continue sur `org-state` (repli 501)

- `20260930_remaining_record_tables.sql` — planning, chantiers, visites, chiffrages, équipes, bons, rapports de maintenance

## Parc automobile

- `20260931_fleet.sql` — véhicules, affectations (une seule active), états des lieux, relevés, incidents, dépenses, documents, échéances, alertes, paramètres
- Bucket privé `fleet-documents` : les fichiers ne passent que par `/api/fleet/documents`
- Droits : Admin VIP (Super Admin), Superadmin (Admin opérationnel), Direction (VIP lecture), salarié affecté (son véhicule)
- Cron quotidien `/api/cron/fleet-alerts` (aussi recalculé à l’ouverture du tableau de bord)
- Import initial : modèle CSV `/api/fleet/import` puis aperçu avant validation

## Contrats d’entretien (modèle additif)

- `20260932_entretien.sql` — **à coller, pas encore exécuté en prod** tant que le fichier n’a pas été relu
- Nouvelles tables `entretien_*` uniquement : ne remplace pas `maintenance_contracts` / `maintenance_reports` / `clients` / `devis` / `google_calendar_accounts`
- Deux validations disjointes sur `entretien_visits` : (a) client + nature du RDV ; (b) réalisation `inconnu` / `confirme` / `non_confirme`
- Factures historiques : `entretien_invoices.origin = historique` interdit `devis_id` (pas de nouveau `FAC-`)
- Pilotage : vue `entretien_client_pilotage` (retard confirmé, dernier entretien inconnu, à vérifier) — jamais « jamais effectué »
- Mapping d’import : YILDIZ (stock ~2 200 noms) + Rebecca (279 contrats depuis oct. 2023, n° + signature). Aperçu `/api/entretien/import` sans écriture, validation admin ensuite.
- Factures historiques : `entretien_invoices.origin = historique` interdit `devis_id` (pas de nouveau `FAC-`). Numéro externe `ENT-XLS-{n°}`.
- Pilotage : vue `entretien_client_pilotage` et écran Maintenance (retard confirmé, dernier entretien inconnu, à vérifier) — jamais « jamais effectué »
- Agendas techniciens : `POST /api/entretien/calendar` lit l’historique Google (8 ans) et crée des `entretien_visits` en **réalisation inconnue**. Aucune écriture CRM → Google.
- Google Sheet `19uwcTBkcTcCTS30D_SChhRrKJBD4fY5zrEoPZ1sDi2A` : comparaison `/api/entretien/sheet` (lien lecteur ou export Excel)
- Script local : `node scripts/entretien-preview.mjs`
- Fiche `/maintenance-form` inchangée

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
