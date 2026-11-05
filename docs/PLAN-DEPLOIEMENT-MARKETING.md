# Mise en service du suivi des provenances — plan de déploiement

État au 5 novembre 2026. Rien de ce document n'a été appliqué : aucune
migration Supabase, aucun déploiement Vercel, aucune modification du VPS OVH.

Le plan avance par paliers, et chaque palier se vérifie avant le suivant. La
synchronisation réelle reste coupée jusqu'au palier 6.

---

## Palier 0 — Sauvegardes et point de retour

À faire avant tout, et à conserver le temps de la mise en service.

| Quoi | Comment | Vérification |
|---|---|---|
| Base Supabase | Sauvegarde complète depuis le tableau de bord Supabase, téléchargée en local | Le fichier existe et sa taille est cohérente |
| Déploiement Vercel actuel | Noter l'identifiant du déploiement en production | `Deployments` → le déploiement marqué `Production` |
| Site OVH | `tar czf /root/sauvegardes/site-$(date +%F).tar.gz /chemin/du/site` | L'archive se relit avec `tar tzf` |
| Configuration Nginx | `cp -a /etc/nginx /root/sauvegardes/nginx-$(date +%F)` | `nginx -t` passe sur la copie |

Le retour arrière de Vercel ne consiste pas à redéployer : il suffit de
promouvoir à nouveau le déploiement précédent, ce qui est instantané et sans
reconstruction.

---

## Palier 1 — Contrôle préalable en base, sans rien modifier

Les index d'unicité ne peuvent pas se créer si des doublons existent déjà.
Vérifié sur une base réelle : la création échoue avec le code `23505` et la
migration s'arrête au milieu. Cette requête se lance donc en premier, en
lecture seule.

Le regroupement porte sur l'organisation **et** la soumission, comme la clé
des index. Une version antérieure de ce document regroupait sur la seule
soumission : vérifié sur une base réelle, elle signalait des doublons là où
les index en voyaient aucun, parce que deux organisations peuvent légitimement
porter le même identifiant de soumission.

```sql
select organization_id,
       extra #>> '{webLead,submissionId}' as soumission,
       count(*) as fiches
  from public.commercial_opportunities
 where nullif(extra #>> '{webLead,submissionId}', '') is not null
 group by 1, 2
having count(*) > 1;

select organization_id,
       extra #>> '{webLead,submissionId}' as soumission,
       count(*) as rdv
  from public.commercial_appointments
 where nullif(extra #>> '{webLead,submissionId}', '') is not null
 group by 1, 2
having count(*) > 1;
```

Les deux doivent ne rien renvoyer. Si une ligne apparaît, les doublons se
résolvent à la main avant de continuer : aucune suppression automatique n'est
prévue, une fiche prospect est une donnée commerciale.

---

## Palier 2 — Migrations Supabase

Dans cet ordre, une par une, en vérifiant chacune avant la suivante.

L'ordre ne suit pas les noms de fichiers, mais les dépendances et le risque.
Les quatre premières n'ajoutent que des objets neufs, sauf la quatrième, seule
à toucher des tables en service : elle passe donc en dernier des quatre, quand
tout le reste est déjà vérifié.

| Ordre | Fichier | Ce qu'elle fait | Retour arrière |
|---|---|---|---|
| 1 | `20261102_google_oauth_states.sql` | Jetons OAuth à usage unique. Ne dépend que de `auth.users` | `drop table ... cascade` |
| 2 | `20261102_web_lead_ingest.sql` | File des demandes, fonctions de réception et de traitement | `drop table` et `drop function` |
| 3 | `20261105_web_lead_idempotence.sql` | Index anti-doublons, reprise, conservation. Exige la deuxième | `drop index` et `drop function` |
| 4 | `20261102_lead_attribution.sql` | Contacts, historique des origines, garde-fous sur `commercial_opportunities` | `drop table` des deux tables ajoutées, `drop trigger` des garde-fous |
| 5 | `20261105_search_path_hardening.sql` | `search_path` fixé sur 22 fonctions existantes | `alter function ... reset search_path` |

Trois points vérifiés sur PostgreSQL 17.11 et à revérifier après application :

```sql
-- Les quatre index d'unicité existent et sont bien uniques.
select indexname, indexdef from pg_indexes
 where schemaname = 'public'
   and indexname in ('commercial_opportunities_web_lead_idx',
                     'commercial_appointments_web_lead_idx',
                     'lead_attribution_submission_idx',
                     'web_lead_submissions_submission_idx');

-- Plus aucune fonction du schéma public sans search_path, extensions exclues.
select count(*) from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind = 'f'
   and not exists (select 1 from pg_depend d
                    where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e')
   and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) as c(opt)
                    where c.opt like 'search_path=%');

-- Une seule version de la purge, sinon son appel devient ambigu.
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'purge_web_lead_payloads';
```

Les trois migrations créant des index le font sans `concurrently`, donc elles
sont annulables : une migration interrompue ne laisse rien derrière elle. En
contrepartie la table est verrouillée en écriture pendant la création, de
l'ordre de quelques secondes sur les volumes actuels.

---

## Palier 3 — Déploiement du CRM, synchronisation coupée

Le CRM part avant le site : il doit savoir recevoir avant que le site
n'envoie. Toutes les routes nouvelles refusent déjà un appel non signé, donc
les déployer ne les ouvre pas.

Variables à poser sur Vercel avant le déploiement :

| Variable | Rôle | Si elle manque |
|---|---|---|
| `WEB_LEAD_KEYRING` | Trousseau `identifiant:secret` des clés acceptées | `/api/web-leads` refuse tout |
| `CRON_SECRET` | Secret des traitements planifiés | Les crons renvoient 401 |

Aucune variable n'est à ajouter pour le chiffrement des jetons Google : la
clé dérive de `CRM_SESSION_SECRET`, ou à défaut de `ACTIVATION_PIN_PEPPER`,
déjà en place. Une version antérieure de ce document réclamait un
`GOOGLE_TOKEN_KEY` qui n'existe pas dans le code. Changer ce secret ne casse
pas les connexions existantes : le déchiffrement essaie successivement chaque
secret connu.

Vérifications après déploiement, sans aucune donnée réelle :

```bash
# Doit répondre 401 : la route est en place et refuse un appel non signé.
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://CRM/api/web-leads

# Doit répondre 401 : le secret du cron est exigé.
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://CRM/api/cron/web-leads

# Doit répondre 200 et des compteurs à zéro : la file est joignable et vide.
curl -s -H "Authorization: Bearer $CRON_SECRET" -X POST https://CRM/api/cron/web-leads
```

À ce stade l'écran d'administration des demandes doit s'afficher pour le
responsable prospection, vide, sous la liste des prospects.

---

## Palier 4 — Mise à disposition du module public, avant son import

C'est l'ordre qui compte. Si une page importe `attribution-capture.mjs` avant
que le fichier ne soit servi, le navigateur échoue sur un module manquant et
le formulaire concerné cesse de fonctionner. Le fichier part donc **seul**, et
les pages ne sont modifiées qu'au palier suivant.

Deux obstacles mesurés sur la production actuelle :

1. Nginx refuse `/lib/` par un `location ^~ /lib/ { return 404; }`. Établi de
   l'extérieur en comparant les signatures de réponse : le refus renvoie une
   page HTML de 162 octets, alors qu'un fichier simplement absent passe par
   Node et renvoie `text/plain` en découpé avec le corps « Not found ». Un 404
   seul n'aurait pas permis de conclure.
2. La liste blanche applicative `PUBLIC_LIB` dans `ovh-site/lib/public-static.mjs`
   contient déjà les trois modules nécessaires, dont `attribution-capture.mjs`.

L'ajout Nginx est une autorisation exacte, et non un assouplissement du
préfixe : un `location =` est évalué avant un `location ^~`, donc les trois
fichiers passent et tout le reste de `/lib/` reste refusé.

```nginx
# Trois autorisations exactes, rien de plus. Le refus du préfixe /lib/ reste
# en place et continue de couvrir tout le reste du dossier.
location = /lib/attribution-capture.mjs { proxy_pass http://127.0.0.1:PORT; }
location = /lib/conversion-datalayer.mjs { proxy_pass http://127.0.0.1:PORT; }
location = /lib/form-legal-copy.mjs { proxy_pass http://127.0.0.1:PORT; }

location ^~ /lib/ { return 404; }
```

Déroulé :

```bash
nginx -t                      # la configuration est valide avant rechargement
systemctl reload nginx        # rechargement sans coupure, pas de restart
```

Vérifications :

```bash
# Doit répondre 200 avec un type JavaScript.
curl -sI https://mkl-energies.fr/lib/attribution-capture.mjs | head -3

# Doit toujours répondre 404 : le reste de /lib/ demeure fermé.
curl -s -o /dev/null -w '%{http_code}\n' https://mkl-energies.fr/lib/crm-sync.mjs
curl -s -o /dev/null -w '%{http_code}\n' https://mkl-energies.fr/lib/admin-auth.mjs
curl -s -o /dev/null -w '%{http_code}\n' https://mkl-energies.fr/.env
```

Retour arrière : retirer les trois lignes et recharger. Aucune page ne dépend
encore du fichier à ce stade, donc l'opération est sans effet visible.

---

## Palier 5 — Raccordement des formulaires

Le fichier `app.js` est modifié en trois endroits seulement, et aucun ne
touche aux conversions Google Ads.

| Endroit | Modification |
|---|---|
| En-tête | `import { install as installAttribution } from "./lib/attribution-capture.mjs";` |
| Avant `POST /api/leads` | `Object.assign(payload, attribution.fields());` |
| Avant `POST /api/appointments` | `Object.assign(payload, attribution.fields());` |

Les deux ajouts sont **en amont** de l'envoi. Les événements de conversion
sont poussés plus bas, après la réponse 201 du serveur : ils ne sont ni
déplacés, ni dupliqués, ni reconfigurés. Dix-huit vérifications automatiques
portent sur le vrai `app.js` et échouent si un second point d'envoi apparaît,
si un `Object.assign` cesse de précéder immédiatement son envoi, ou si le
nombre d'appels de conversion change.

Vérifications à faire à la main, en conditions réelles :

1. Formulaire de devis, sans aucun paramètre dans l'URL → la demande arrive, et
   son origine reste un accès direct. C'est le cas qui prouve qu'un prospect
   naturel ne devient jamais un prospect publicitaire.
2. Formulaire de devis avec `?gclid=essai-manuel` → la demande arrive avec son
   origine publicitaire, une seule fiche, et le `gclid` conservé.
3. Formulaire de rendez-vous, même paire d'essais.
4. Dans l'onglet Réseau du navigateur : une seule requête vers `/api/leads`,
   et le corps envoyé ne contient rien d'autre que les champs du formulaire
   plus `attribution` et `attributionFirst`.
5. Dans Google Ads, le compteur de conversions avance comme avant, au même
   moment et dans les mêmes quantités.
6. Bandeau de consentement refusé → la demande passe toujours, et aucun signal
   publicitaire n'est enregistré.

Retour arrière : remettre le `app.js` sauvegardé au palier 0 et vider le cache
de version (`?v=`). La modification étant de trois lignes, le retour est
immédiat et ne dépend d'aucune autre étape.

---

## Palier 6 — Activation de la synchronisation et de la fréquence

À faire seulement quand les paliers 1 à 5 sont vérifiés.

### Fréquence de traitement

Le cas normal n'attend pas le cron : le VPS appelle le CRM dès la réception de
la demande, et le prospect apparaît tout de suite. Le passage planifié ne sert
qu'aux reprises : demande arrivée pendant une panne, intégration interrompue,
verrou laissé par une exécution coupée.

**Décision retenue : passage au plan Pro.** `vercel.json` déclare en
conséquence les cinq tâches, dont le traitement de la file à la minute.

Ce choix n'est pas un confort : il est contraint. Le plan Hobby est limité à
**deux** tâches planifiées, et en déclarer davantage ne dégrade pas le
service, cela **fait échouer le déploiement**. Hobby impose par ailleurs une
granularité à la journée, avec une imprécision documentée de ±59 minutes.

| Tâche | Fréquence | Pourquoi |
|---|---|---|
| `/api/cron/web-leads` | `* * * * *` | Reprise des demandes qu'un appel direct n'a pas pu intégrer |
| `/api/cron/agenda-reminders` | `0 7 * * *` | Rappels du jour |
| `/api/cron/fleet-alerts` | `15 7 * * *` | Décalé, pour ne pas concentrer les appels |
| `/api/cron/web-lead-retention` | `45 3 * * *` | Heure creuse : la purge écrit en base |

Quatre tâches et non cinq : `/api/cron/entretien-calendar` existe mais reste
délibérément non planifiée. L'agenda entretien n'interroge plus Google, et
`tests/entretien-schema.test.js` interdit explicitement de la déclarer ici.
L'y avoir ajoutée a fait échouer ce test, ce pour quoi il est écrit.

Deux points sur le passage à la minute.

**Deux exécutions qui se chevaucheraient ne se gêneraient pas.** La
réservation se fait par `for update skip locked`, donc une seconde exécution
prend d'autres lignes au lieu d'attendre. Vérifié sur PostgreSQL réel, avec
deux connexions simultanées et des ensembles disjoints.

**Une exécution coupée ne perd rien.** La route est bornée à 60 secondes par
`maxDuration`. Une coupure laisse la demande réservée, et la récupération des
réservations de plus de dix minutes la remet dans la file au passage suivant.

`web-lead-retention` entre dans ce tableau pour la première fois. C'est la
conservation des trente jours que vous avez validée : la route existait, mais
sans déclencheur elle ne s'appliquait pas.

#### Repli : le minuteur sur le VPS

Devenu inutile par le passage à Pro, mais conservé. Il sert si les tâches
Vercel se révèlent trop imprécises ou si vous repassez à Hobby. Le VPS tourne
déjà en permanence :

```bash
sudo install -m 0755 ovh-site/deploy/mkl-crm-queue.sh /usr/local/bin/mkl-crm-queue
sudo mkdir -p /etc/mkl
sudo install -m 0600 ovh-site/deploy/mkl-crm-queue.env.example /etc/mkl/crm-queue.env
sudo nano /etc/mkl/crm-queue.env          # y poser CRM_URL et CRON_SECRET
sudo install -m 0644 ovh-site/deploy/mkl-crm-queue.service \
                     ovh-site/deploy/mkl-crm-queue.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mkl-crm-queue.timer
systemctl list-timers mkl-crm-queue.timer  # la prochaine exécution est dans la minute
```

Le secret voyage dans l'en-tête `Authorization`, jamais dans l'URL : une URL
se retrouve dans les journaux d'accès des deux côtés. Le service est de type
`oneshot` avec un délai borné à 50 secondes, donc deux exécutions ne peuvent
pas se chevaucher.

N'activez pas ce minuteur **en même temps** que la tâche Vercel à la minute :
ce ne serait pas dangereux, la file étant protégée par `skip locked`, mais ce
serait deux fois le même travail.

Dans les deux cas la file reste la même : persistante en base, reprise par
`reserve_web_leads` avec récupération des demandes bloquées depuis plus de dix
minutes. Arrêter le déclencheur pendant des heures ne perd aucune demande, il
les retrouve toutes au redémarrage.

### Conservation

La politique validée est appliquée par `/api/cron/web-lead-retention`, en deux
temps indissociables. Le signalement marque les demandes dont la conservation
arrive à terme ; l'effacement ne concerne ensuite que les contenus signalés
depuis plus de 30 jours.

| Cas | Conservation du contenu technique |
|---|---|
| Demande traitée ou écartée | 30 jours |
| Demande en échec ou en revue | 30 jours, puis signalement, puis 30 jours de grâce |

Une demande non résolue n'est jamais effacée sans avoir été signalée. Et la
purge ne touche que le contenu brut reçu du site : la ligne de la demande, son
historique et sa date d'effacement subsistent, et aucune fiche prospect,
client, devis ou rendez-vous n'est concernée. C'est vérifié deux fois, par
lecture du code de la purge et sur une base réelle.

---

## Ce qui reste à décider de votre côté

1. Le plan Vercel réellement souscrit, pour choisir entre le cron à la minute
   et le déclencheur sur le VPS.
2. L'accord d'appliquer les cinq migrations, après le contrôle du palier 1.
3. Le moment du rechargement Nginx, qui se fait sans coupure mais touche la
   production.
