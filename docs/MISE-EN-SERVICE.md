# Mise en service de l'attribution marketing

Ce document couvre quatre opérations indépendantes : le renouvellement des deux
secrets exposés, la sécurisation des anciennes archives de déploiement, la mise
en ligne de l'intégration des formulaires, et le retour arrière de chacune.

Chaque opération est réversible, et aucune n'est enchaînée automatiquement à la
suivante. L'ordre proposé va du moins risqué au plus engageant.

## État des lieux

| Élément | État |
|---|---|
| Chaîne OVH → CRM → Supabase RECETTE | éprouvée, 10 contrôles depuis le VPS |
| Attribution Google Ads, Facebook, Site | éprouvée sur un déploiement, 20 contrôles sur 20 |
| Clé Google Solar | renouvelée sur la recette, éprouvée en ligne, 11 sur 11 |
| Archive de déploiement | contrôlée, sans secret ni identifiant de production |
| Clé SSH du VPS | installée sur le compte `ubuntu` |
| Site en ligne | version du 3 novembre, sans l'attribution |
| Arbre du site dans ce dépôt | complet |
| `GOOGLE_SOLAR_API_KEY` | renouvelée sur Production et Preview, déploiement à venir |
| `CRM_ACCESS_PIN` | rien à renouveler : inutilisée en production, voir plus bas |

## 1. Renouveler les deux secrets

Les deux figuraient dans `.env.local`, lui-même embarqué dans les archives des
déploiements antérieurs au 7 novembre 04 h 25.

### Le code d'accès du CRM : rien à renouveler

Vérifié après coup, et le constat renverse le plan prévu : **`CRM_ACCESS_PIN`
n'est déclarée sur aucun environnement Vercel.** Les dix-huit variables de
production ne la contiennent pas.

Ce n'est pas un oubli de configuration qui laisserait le CRM ouvert. La porte
réelle est `CrmAccessGate`, monté par `app/layout.js`, qui authentifie par
Supabase — adresse électronique et PIN d'activation stocké haché en base. Le
composant qui lit `CRM_ACCESS_PIN`, `crm-login-gate.js`, **n'est monté nulle
part** : c'est du code mort, et les trois routes `/api/auth/login`,
`/api/auth/session` et `/api/auth/logout` qui le servent ne sont appelées que
par lui. Sans code configuré, elles répondent 503 et la porte reste fermée :
elles échouent du bon côté.

Conséquence pratique : la valeur de `CRM_ACCESS_PIN` présente dans les archives
exposées **ne donne accès à rien en production**. Le renouvellement en deux
temps décrit ci-dessous reste disponible, mais il n'a aujourd'hui aucun objet.

### Le code d'accès du CRM, si la porte était un jour remise en service

Le code sert à l'ouverture de session des équipes. Le renouveler brutalement
bloquerait tout le monde à la bascule ; le code accepte donc désormais une
valeur précédente, le temps que les équipes soient prévenues.

```sh
sh scripts/mise-en-service/rotation-secrets.sh --etat
sh scripts/mise-en-service/rotation-secrets.sh --pin-ouvrir --production
# déploiement, puis vérification de la connexion avec les deux codes
sh scripts/mise-en-service/rotation-secrets.sh --pin-refermer --production
```

Les sessions en cours ne sont pas touchées : `CRM_SESSION_SECRET` est une
variable distincte, déjà déclarée en production. C'est ce qui rend l'opération
indolore — sans elle, le code d'accès servirait aussi à signer les sessions et
chaque renouvellement déconnecterait les 22 profils actifs.

### La clé Google Solar

Elle ne sert que côté serveur, donc aucune fenêtre n'est nécessaire. Seul
l'ordre compte : créer la nouvelle clé dans la console Google Cloud, la publier,
déployer, vérifier le calcul de production photovoltaïque, **et seulement
ensuite** supprimer l'ancienne.

#### Ce que la clé doit pouvoir faire, et rien de plus

Le CRM l'utilise depuis `app/lib/google-solar-layers.js`, appelé par
`app/api/pv/install-yield/route.js`. Deux points d'entrée, tous deux côté
serveur : `buildingInsights:findClosest` pour les pans de toiture et
`dataLayers:get` pour l'ombrage et la carte de chaleur. La clé ne part jamais
vers le navigateur.

Dans la console Google Cloud, sur le projet qui porte déjà l'API Solar :

1. **APIs et services → Identifiants → Créer des identifiants → Clé API.**
2. Sur la nouvelle clé, **Restrictions relatives aux API → Restreindre la clé →
   Solar API**, et elle seule. C'est la restriction qui compte vraiment ici.
3. **Restrictions relatives aux applications : aucune.** Ce n'est pas un oubli.
   Les restrictions par référent HTTP ne s'appliquent qu'aux appels du
   navigateur, et une restriction par adresse IP supposerait des adresses fixes
   que Vercel n'attribue pas sur ce plan. La clé est donc protégée par sa
   restriction d'API et par son quota, pas par son origine.
4. **APIs et services → Solar API → Quotas** : poser un plafond journalier.
   C'est ce qui limite les dégâts si une clé fuite de nouveau, et c'est la seule
   protection réellement efficace faute de restriction d'application.

#### Publication

```sh
sh scripts/mise-en-service/rotation-secrets.sh --solar --production
```

La clé est saisie en aveugle, puis **éprouvée auprès de Google sur les deux
points d'entrée avant d'être publiée**. Une clé refusée arrête le script sans
rien modifier : un 403 désigne une API non activée ou une restriction trop
étroite, un 400 une clé mal copiée, un 429 un quota déjà épuisé.

Sans clé valide, le CRM ne tombe pas en panne : l'étude photovoltaïque retombe
sur PVGIS et la photo IGN, et le message le dit. Le risque d'une mauvaise clé
est donc une perte de précision, pas une interruption.

#### Deux pièges du client Vercel, rencontrés ici

Le premier a failli faire croire à une opération réussie. `vercel env add`
renvoyait un code de sortie nul pour une variable qui ne s'est jamais trouvée
dans l'environnement visé. Annoncer une pose qui n'a pas eu lieu est pire qu'un
échec, puisque personne ne va vérifier : la présence est désormais **relue sur
place**, et c'est cette relecture qui décide.

Le second est plus grave, et il dormait dans le script. L'aide du client est
explicite : **`vercel env rm` sans `--environment` retire la variable de _tous_
ses environnements.** Les appels visaient l'environnement par la forme
positionnelle, que le client déclare obsolète. Une suppression destinée à la
recette pouvait donc emporter celle de la production le jour où cette forme
cesserait d'être honorée. Tous les appels passent maintenant par
`--environment`, et les suppressions par une fonction unique qui refuse un
environnement vide.

La cause de la pose fantôme était vraisemblablement la même option manquante à
l'ajout : sans elle, le client *pose une question*, et sur une entrée standard
déjà consommée par la valeur de la clé, la réponse à cette question est
imprévisible.

#### Désactiver l'ancienne clé Solar — préparé, en attente d'accord

**L'épreuve en production est faite**, le 7 novembre au soir : quatre pans,
l'ombrage et la carte satellite affichés, avec le message « Google Solar
appliqués ». Ce message est le plus concluant des quatre possibles, car il
n'apparaît que si les **deux** points d'entrée ont répondu —
`buildingInsights:findClosest` pour les pans, `dataLayers:get` pour l'ombrage et
la carte de chaleur. Une clé qui ne porterait que le premier afficherait « Pans
et ombrages appliqués » sans carte de chaleur. Les journaux du déploiement le
confirment en négatif : **zéro enregistrement, donc zéro erreur**, sur la
fenêtre qui contient cet essai.

On désactive, on ne supprime pas — du moins pas tout de suite. Une
restriction se défait d'un clic, une suppression est définitive.

Trois identifiants Google distincts existent dans ce système, et c'est là qu'est
le danger :

| Identifiant | Qui l'utilise | Restreinte à |
|---|---|---|
| `GOOGLE_SOLAR_API_KEY` | le CRM, `app/lib/google-solar-layers.js` | Solar API |
| `GOOGLE_PLACES_API_KEY` | **le site OVH**, `server.mjs`, pour les avis | Places API |
| `GOOGLE_CLIENT_ID` / `_SECRET` | le CRM, Google Calendar | identifiants OAuth, pas une clé |

**La clé des avis du site n'a rien à voir avec celle de l'étude solaire.** Les
supprimer l'une pour l'autre ferait disparaître les avis Google de
mkl-energies.fr sans que le CRM s'en aperçoive. Les identifiants OAuth du
calendrier ne sont pas des clés d'API et ne figurent pas dans cette liste à
supprimer.

Comment reconnaître à coup sûr l'ancienne clé Solar, dans
**APIs et services → Identifiants** :

1. Sa **restriction d'API est « Solar API »** — celle des avis affiche
   « Places API ».
2. Sa colonne **« Dernière utilisation » s'arrête au 7 novembre**, avant
   18 h 27 UTC. C'est l'heure du déploiement qui a mis la nouvelle clé en
   vigueur : depuis, l'ancienne ne reçoit plus rien. Celle des avis, elle,
   continue de servir.
3. **Ne supprimez jamais une clé qui montre encore du trafic.** C'est le seul
   contrôle qui ne trompe pas.

**Le geste de désactivation, et lui seul.** Sur l'ancienne clé Solar, et sur
aucune autre : **Restrictions relatives aux API → Restreindre la clé →**
décocher « Solar API », cocher une API que ce projet n'utilise pas, puis
enregistrer. La clé existe toujours, elle ne peut plus rien appeler. Ne touchez
ni aux restrictions de la clé Places, ni aux écrans OAuth du calendrier :
l'écran des identifiants les présente côte à côte, et c'est là que se commettent
les confusions.

**Le contrôle qui prouve que c'est la bonne clé qui a été désactivée** : rouvrez
une étude d'installation complète et relancez la recherche de toiture. Si le
message « Google Solar appliqués » revient, la nouvelle clé travaille seule et
l'ancienne n'était pas celle en service. Si le message devient « Google Solar
n'a pas répondu », c'est la clé active qui vient d'être restreinte : rétablissez
sa restriction à « Solar API », ce qui remet tout en place.

Vérifiez aussi que les avis Google s'affichent toujours sur la page d'accueil de
mkl-energies.fr — c'est le contrôle de la clé Places, celle qu'il ne fallait pas
toucher.

**La suppression vient après**, pas le même jour. Attendez vingt-quatre heures,
le temps qu'une étude photovoltaïque et une visite du site aient eu lieu
normalement, puis supprimez la clé devenue inerte.

Si l'ancienne clé était supprimée par erreur à la place de la bonne, le CRM ne
tomberait pas : l'étude retombe sur PVGIS et l'écran le dit. Le site, lui,
perdrait ses avis silencieusement — c'est l'erreur la plus coûteuse des deux,
et la moins visible.

### Retour arrière

Pour le code d'accès : reposer l'ancienne valeur et retirer la variable
précédente. Pour la clé Google : l'ancienne clé reste valide tant qu'elle n'a
pas été supprimée dans la console, c'est précisément pourquoi on ne la supprime
qu'en dernier.

## 2. Sécuriser les anciennes archives

```sh
sh scripts/mise-en-service/securiser-deploiements.sh              # rapport
sh scripts/mise-en-service/securiser-deploiements.sh --supprimer  # après lecture
```

Le script refuse de toucher au déploiement visé par un alias, et conserve ceux
créés après la correction de `.vercelignore`. La date de référence est celle de
l'écriture du fichier, pas celle du commit : quatre minutes les séparent, et
s'en remettre au commit classerait à tort les deux déploiements de recette.

**Retour arrière : aucun.** Une suppression de déploiement est définitive. Ce
n'est pas grave en soi — le code est dans Git et un déploiement se refait — mais
l'historique des aperçus est perdu. À faire après la rotation des secrets, pas
avant : si quelque chose devait être relu dans une archive, c'est maintenant.

## 3. Mettre en ligne l'intégration des formulaires

C'est ici que se trouve le blocage réel.

### Ce qui est prêt

Le code est complet dans le dépôt, des deux côtés. Le navigateur capture
l'attribution à l'arrivée du visiteur et l'ajoute juste avant l'envoi ; le
serveur du site la conserve sur la demande ; la file d'attente signe et
transmet au CRM ; le CRM classe sans jamais inventer de provenance.

### Ce qui a été éprouvé

Les trois modules qui manquaient au dépôt ont été récupérés du serveur et
versionnés, et l'arbre est désormais complet :

```sh
node scripts/mise-en-service/verifier-site-complet.mjs   # 3 contrôles passés
```

Le banc d'essai démarre alors le vrai `server.mjs`, sur des données isolées dans
un dossier temporaire, et lui soumet trois formulaires construits avec le vrai
module de capture du navigateur : **19 contrôles sur 20**.

```sh
node scripts/recette/test-formulaires-ovh.mjs --complet
node scripts/recette/test-formulaires-ovh.mjs --nettoyer
```

Trois constats méritent d'être retenus, parce qu'ils ne se devinent pas.

**Un envoi groupé n'arrive pas d'un coup.** Chaque demande déclenche un passage
de la file, mais un verrou interdit deux passages simultanés. Trois envois
rapprochés partent donc en deux fois, le reste au passage périodique suivant,
soixante secondes plus tard. Rien n'est perdu ; seule l'attente d'un test doit
couvrir ce cycle.

**Le CRM refuse de fusionner sur le seul téléphone.** C'est la règle demandée, et
elle est maintenant éprouvée plutôt que supposée : une quatrième demande reprenant
le numéro du prospect Google Ads sous un autre courriel, et se présentant comme
venant de Facebook, part en « Doublon à vérifier ». Aucune fiche n'est créée,
l'origine Google Ads déjà enregistrée reste intacte, et la demande attend une
décision humaine sans disparaître.

**Google Ads s'affiche sans suffixe.** `Prospect GG Ads`, et non
`Prospect GG Ads · Google Ads` : `SUBTYPE_LABELS` n'a pas d'entrée pour ce
sous-type. C'est volontaire.

### Ce qui reste rouge

Un seul contrôle, et il attend un déploiement, pas une correction.

Une visite directe, sans aucun paramètre, était étiquetée `evidence = "utm"` :
une preuve annoncée alors qu'il n'y en a aucune, ce qui aurait faussé tout
décompte des demandes classées grâce aux UTM. Le classement lui-même était juste
(`site_web` / `direct`). `classifyWebLead` renvoie désormais la chaîne vide dans
ce cas — valeur déjà admise par la contrainte en base, donc sans migration.

La Preview déployée exécute encore l'ancien code : le banc d'essai lit `utm` et
signale l'écart. Il redeviendra vert au prochain déploiement de recette.

### Les quatre blocages levés le 7 novembre au soir

**Les cinq essais en échec.** Un seul accusait le code, et c'est le plus
gênant : `profileToUiUser` renvoyait le rôle brut de la base, alors que les
routes comparent `normalizeRoleLabel(profile.role)` à « Superadmin ». Un compte
enregistré « Admin second » obtenait donc ses droits du serveur mais les perdait
à l'écran. Les quatre autres étaient des assertions de texte devenues fausses
après des changements volontaires, vérifiés un par un. Deux détails méritent
d'être retenus : la variable `home` n'était pas définie dans l'essai
d'installation, et deux assertions ne tournaient donc jamais ; et dans l'essai
de recherche client, trois assertions tombaient pour un seul motif, dont deux
restaient cachées derrière la première. **1149 essais sur 1149.**

**Les migrations de production.** La production n'a pas d'historique de
migrations tenu par un outil : son schéma a été posé à la main. Rejouer les
soixante-quinze fichiers y échouerait partout sur des « already exists ».
`scripts/mise-en-service/preparer-migrations-production.mjs` ne devine donc
rien : il classe, et produit une requête d'inventaire en lecture seule.

| Genre | Nombre | Ce que cela veut dire |
|---|---|---|
| automatique | 63 | de vraies migrations, à appliquer |
| conditionnel | 8 | s'arrêtent si une donnée du catalogue manque |
| à écarter | 4 | deux retirées, une à confirmer à la main, **une réservée à la recette** |

Ce dernier point mérite l'attention : `20261106_huawei_sun2000_previsualisation.sql`
nomme le projet de recette comme seule cible autorisée. Lancer le dossier entier
contre la production serait une faute, pas seulement une erreur.

**La tâche de la minute.** Mesurée, pas supposée : quatre-vingt-dix passages en
quatre-vingt-dix minutes, quatre-vingt-dix erreurs, toutes identiques — la
fonction `reserve_web_leads` n'est pas installée en production. Rien n'était
cassé pour autant, puisque sans trousseau aucune demande ne peut y entrer. Mais
mille quatre cent quarante lignes d'erreur par jour ne signalent rien et
noieraient la première vraie panne. Les deux passages planifiés s'arrêtent
désormais sur `inerte`. **Contrôle de mise en service : la réponse doit dire
`ok` sans `inerte` une fois la production configurée** — sinon la file serait
silencieuse au lieu d'alerter.

**La clé Google Solar.** Déclarée sur les deux environnements, en vigueur sur
un seul.

| | Posée le | Déploiement qui la porte |
|---|---|---|
| Preview | 7 nov. 14 h 51 UTC | oui, les deux Preview de 14 h 57 et 16 h 20 |
| Production | 7 nov. 16 h 31 UTC | **aucun** |

Le déploiement qui sert la production date de 14 h 40 UTC, soit une heure
cinquante avant la pose de la clé, et aucun déploiement n'a été créé depuis
16 h 31. La production fonctionne donc encore avec l'ancienne clé — ce qui est
la raison de ne pas l'effacer tout de suite.

### L'inventaire de la production, relevé le 7 novembre en lecture seule

Identité confirmée avant toute lecture : projet `rzkwmwtjnwnmmcexwoov`
« MKL Energies CRM », eu-north-1, empreinte de cluster `7662760187650847164`,
PostgreSQL 17.6. La recette est sur un autre cluster et une autre version, 17.11.

**51 objets manquent sur les 288 que les migrations du dépôt créent**, et ils
s'imputent à cinq fichiers, sans un seul orphelin — rien dans la production ne
vient d'ailleurs que du dépôt.

| Migration | Objets manquants |
|---|---|
| `20261102_lead_attribution.sql` | 21 |
| `20261102_web_lead_ingest.sql` | 15 |
| `20261105_web_lead_idempotence.sql` | 9 |
| `20261102_google_oauth_states.sql` | 5 |
| `20261003_pv_simulations.sql` | 3 |

S'y ajoutent `20261105_search_path_hardening.sql` et
`20261107_search_path_pg_temp.sql`, que l'inventaire ne voit pas : elles ne
créent rien, elles durcissent des fonctions existantes.

Deux constats inattendus. **Les colonnes de tarif forfait du catalogue sont
déjà en production** — `article_bundles.pricing_mode`, `forfait_ht`,
`forfait_tva`, et `devis_lignes.forfait`, `forfait_montant_ht`. Elles
manquaient encore à 15 h 39, d'où le repli écrit ce jour-là ; elles ont donc
été posées à la main depuis. Le repli reste utile, mais il ne se déclenche plus.
Et `profiles.actions` est absente : le code lit déjà `row.actions || row.modules`,
donc rien ne casse, mais les droits fins reposent sur les modules.

À noter aussi, pour un nettoyage ultérieur : la table temporaire
`_aquarea_brochure_part` subsiste en production, alors que les contrôles locaux
exigent son absence.

### La correction des rôles ne peut pas élever un privilège

Deux raisons indépendantes, l'une mesurée, l'autre structurelle.

**Mesurée.** La production compte 23 profils et neuf valeurs de rôle distinctes,
toutes déjà canoniques : Commercial, Admin VIP, Secrétariat, Technicien,
Prospecteur terrain, Responsable commercial, Responsable prospection,
Responsable technique, Superadmin. `normalizeRoleLabel` est l'identité sur
chacune. **Zéro compte sur 23 change de rôle.** Aucun profil ne porte
« Admin second », « Administrateur », « Admin » ni « Lecture ».

**Structurelle.** La correction ne touche que `profileToUiUser`, une projection
côté navigateur. Toute écriture passe par une route qui redérive l'autorisation
du profil de session — `requireApiSession`, puis `canInviteUsers(auth.profile)`,
puis `assertAssignableAccess({ actorRole: auth.profile.role, … })` — et
`isAdminVipRole` y normalise de son côté. L'interface ne peut donc que
s'aligner sur le serveur, jamais le dépasser.

**Un piège préexistant mérite d'être signalé** : dans `ROLE_ALIASES`,
`Lecture` est associé à `Superadmin`. Un rôle dont le nom annonce une
consultation donne les droits du second administrateur. Aucun compte ne le
porte aujourd'hui, le serveur appliquait déjà cette équivalence, et `page.js`
la faisait à la main — cette correction ne l'introduit pas. Mais si quelqu'un
attribuait « Lecture » en croyant restreindre, il accorderait l'inverse.

### La mise en service des prospects — Google Ads, Facebook, Site Internet

Quatre temps, dans cet ordre, et l'ordre n'est pas négociable. Le CRM est déjà
déployé : il porte le code d'attribution, mais inerte, faute de trousseau.

**Étape 1 faite le 7 novembre 2026, entre 19 h 19 et 19 h 26 UTC.** Les cinq
migrations sont appliquées, une par une, avec un relevé entre chacune. Résultat
final : **les 51 objets attendus sont présents** — 6 tables, 22 index,
18 fonctions, 5 colonnes — et la production est passée de 79 à 85 tables et de
31 à 49 fonctions. Les données n'ont pas bougé : 246 prospects, 4 212 clients,
183 devis, 158 groupes, 275 articles, 23 profils, 4 comptes Google Calendar.
**Aucune origine n'a été écrite** sur les 246 prospects existants. Le CRM a été
éprouvé juste après : neuf contrôles sur neuf.

Deux contrôles ont été faits avant d'appliquer, et ils valaient la peine. Le
déclencheur `commercial_opportunities_source_guard` refuse certaines valeurs de
`source` sur une table vivante : les sept valeurs présentes en production ont
été relevées, aucune n'est refusée, et « Prospection » — trente-trois prospects,
dont un créé le jour même — ne passe que grâce à la comparaison exacte. Par
ailleurs, cinq endroits du code écrivent `source: "google"`, ce que ce même
déclencheur interdit : vérification faite, aucun ne vise la colonne `source`
d'un prospect. Quatre visent le champ `extra` d'un rendez-vous ou d'une autre
entité, un la table `commercial_appointments`.

**Étape 2 faite le 7 novembre 2026 à 19 h 35 UTC.** Les trois variables
`WEB_LEAD_KEYRING`, `WEB_LEAD_ORGANIZATION_ID` et `WEB_LEAD_RETENTION_DAYS` sont
posées sur Production, puis le CRM a été redéployé — commit `3cb9424`,
`dpl_6W4d5ckwTmVQ7nEQtgL1GYt2GGtb`, neuf contrôles sur neuf. Le `CRON_SECRET`
n'a pas été touché : il date de trente-neuf jours et **diffère de celui du
coffre local**, qui a été régénéré le 5 novembre. Le reposer aurait cassé les
quatre tâches planifiées.

L'organisation visée est `00000000-0000-0000-0000-000000000001`, celle qui porte
les 246 prospects et les 4 212 clients. Le choix méritait d'être vérifié : la
production contient **deux organisations portant le même nom**, et la seconde,
`07937728-…`, est vide. Une erreur ici aurait rendu les demandes du site
invisibles à l'équipe.

**Le trousseau a été éprouvé, et cette épreuve méritait d'être inventée.** Les
variables Vercel sont de type « Secret » : leur valeur ne peut plus être relue,
`vercel env pull` ne rend qu'un marqueur `[SENSITIVE]`. Impossible, donc, de
vérifier par comparaison qu'on a bien posé ce qu'on croyait — et un caractère
altéré aurait fait refuser toutes les demandes du site, silencieusement, puisque
le site n'émet pas encore. `scripts/mise-en-service/eprouver-trousseau.mjs`
contourne l'obstacle en s'appuyant sur l'ordre des contrôles de la route : le
trousseau, puis la signature, puis le contenu. Un contenu volontairement
invalide mais **correctement signé** n'obtient un 400 qu'après vérification de
la signature, et comme le contenu est refusé, rien n'entre en file. Trois cas,
trois pannes distinguées : 503 le trousseau est absent, 401 sur signature juste
il diffère, 400 il est exact. Résultat : les trois contrôles passent, le
trousseau posé est exactement celui du coffre sous l'identifiant `k1`, et la
file est restée à zéro. Les journaux du serveur n'ont retenu que ces trois
appels, dans l'ordre exact — corroboration indépendante.

**La tâche de la minute s'est tue.** Zéro erreur sur une trentaine de passages,
là où le déploiement précédent en produisait une par minute faute de
`reserve_web_leads`.

Reste l'étape 3, le site OVH, sans laquelle rien n'est encore émis.

### Étape 3 préparée le 7 novembre 2026 — et elle ne pouvait pas se faire telle quelle

**`deploy.sh` ne peut plus servir, et c'est heureux.** Son garde-fou exige
`ovh-site/index.html`, qui n'existe plus depuis que les pages ont été
rassemblées dans `site-public/` (commit `f566781`). Il refuse donc de partir, et
n'a plus été touché depuis `73087e4`. S'il partait — si l'on « corrigeait » le
garde-fou sans regarder plus loin — son `rsync --delete` depuis `ovh-site/`
ferait trois dégâts d'un coup :

1. il enverrait les pages dans un sous-dossier `site-public/` du serveur, alors
   que le serveur Node les sert **à côté** de `server.mjs` : `server.mjs` fait
   `const ROOT = __dirname` et passe ce `ROOT` à `servePublicFile` ;
2. `--delete` effacerait donc `index.html`, `app.js` et toutes les pages à la
   racine, celles que nginx sert réellement par `root /var/www/mkl-energies` ;
3. il effacerait aussi `package.json` et `package-lock.json`, qui vivent sur le
   serveur mais **ne sont pas dans le dépôt** et **ne figurent pas dans ses
   exclusions** — après quoi le `npm install` du script lui-même n'aurait plus
   rien à installer.

Le site serait hors ligne, et pas trivialement récupérable.

**La disposition a été établie sans ouvrir de session SSH**, par le seul HTTPS
que vous avez autorisé. `/site-public/index.html` répond 404 tandis que `/`
répond 200 : la racine distante est donc plate. Et `site-public/` est bien la
copie fidèle du site — `/`, `/rdv.html` et `/photovoltaique.html` sont
**identiques à l'octet** entre le dépôt et le site en ligne. Seul `app.js`
diffère, de 24 lignes ajoutées portant toutes sur l'attribution : c'est
exactement le changement en attente.

**Une exposition en cours, indépendante de l'étape 3.** `/deploy/ovh/deploy.sh`
et `/deploy/ovh/nginx.conf` sont **téléchargeables publiquement aujourd'hui**.
Le serveur Node les refuse correctement — `isDeniedPublicPath` écarte
`/deploy/` — mais nginx les sert en statique avant que Node ne les voie. Ce qui
est ainsi donné en clair : l'utilisateur SSH et l'adresse du VPS
(`ubuntu@148.113.149.139`), le chemin distant, l'emplacement de la clé privée,
et la carte complète du routage. Le `nginx.conf` du dépôt corrige déjà le
défaut, par `location ^~ /deploy/ { return 404; }` ; la configuration vivante
est une version plus ancienne qui porte les autres refus mais pas celui-là. Les
sondes le confirment : `/server.mjs`, `/tests/`, `/.env` et `/data/leads.json`
répondent 404, seul `/deploy/` passe. **nginx n'est pas déployé par `deploy.sh`,
qui ne touche qu'aux fichiers et au service** : cette correction est un geste
manuel, à part.

`/lib/attribution-capture.mjs` répond 404 alors qu'il figure dans la liste
blanche du code. Deux causes possibles, et l'étape 3 doit traiter les deux : le
fichier n'est pas encore sur le serveur, et la location exacte qui l'autorise
manque à la configuration vivante.

#### L'exposition était bien plus large que le script, et elle est refermée

Corrigée en production le 7 novembre 2026 à 19 h 51 UTC, avec votre accord.

**Ce qui était réellement exposé.** Pas deux fichiers, mais **soixante-cinq** :
tout `/var/www/mkl-energies/deploy/`. Les scripts de déploiement, les fichiers
d'unité systemd, une quinzaine de rapports internes — dont
`FICHE-INCIDENT-RGPD.md`, `PROD-SECURITY-DEPLOY-REPORT.md` — les copies de
sauvegarde du site, et surtout **deux fichiers `.env`**,
`env-before-pwd-20261103T165848Z.env` et `env-before-pw-20261104T222527Z.env`,
qui contiennent `SESSION_SECRET` et `ADMIN_PASSWORD_HASH`. Vérifié en ne lisant
que les **noms** des variables, jamais les valeurs. Le dossier `scripts/` l'était
aussi, dont `hash-admin-password.mjs` et `public-tunnel.sh`.

**La cause n'était pas celle que je croyais d'abord.** Ce n'est pas que nginx
servait `/deploy/` en statique : `location /` est bien un proxy vers Node. C'est
que **`lib/public-static.mjs` est absent du serveur**. Tout le durcissement du
code — la liste des refus, les listes blanches de `/lib/` et `/data/` — n'est
pas déployé ; le `server.mjs` en service est une génération antérieure qui sert
les fichiers lui-même. La seule protection vivante venait de nginx, dont la
configuration portait des refus pour `/lib/`, `/data/`, `/server.mjs` et les
fichiers cachés, mais **aucun pour `/deploy/`**. Les deux `.env` échappaient
aussi au refus des fichiers cachés : leur nom *finit* par `.env`, il ne commence
pas par un point.

**Personne ne les a téléchargés.** Les journaux nginx couvrent du 23 octobre au
7 novembre, soit **toute la durée de l'exposition** — `deploy/` a été créé le
31 octobre, les deux `.env` le 1er puis le 4 novembre. Sur cette fenêtre
complète, la seule adresse ayant obtenu un code 200 sur `/deploy/` ou
`/scripts/` est `78.127.111.51`, votre propre réseau, avec nos outils
(`curl`, `Python-urllib`) — mes sondes de ce soir à 19 h 50 y figurent, suivies
des 404 de la vérification à 19 h 51. Six adresses extérieures ont bien cherché,
mais seulement aux emplacements génériques `/deploy/.env` et `/scripts/.env`,
qui n'ont jamais existé : `45.138.12.16`, `35.228.72.191`, `213.209.159.175`,
`80.94.95.211`, `8.231.216.167`, `8.228.85.65`. Toutes ont reçu 404. **Aucune
n'a deviné les noms réels.**

**Le correctif.** Sauvegarde horodatée de la configuration
(`mkl-energies.avant-refus-20261107T195128Z`), insertion des refus avant
`location /`, `nginx -t`, puis rechargement — avec restauration automatique si
le test avait échoué. Les refus sont en préfixe `^~`, qui l'emporte sur les
expressions régulières : aucune règle ultérieure ne peut rouvrir le chemin. Pas
de motif sur `.mjs`, délibérément : deux modules de `/lib/` sont publics par
conception et un tel motif les aurait cassés.

Vérifié ensuite dans les deux sens : les onze chemins sensibles répondent 404,
et **les vingt-et-une ressources du site répondent toujours 200** — pages,
`app.js`, `styles.css`, `catalogue-book.js`, `vendor/page-flip.browser.js`, les
deux modules publics de `/lib/`, les données publiques, `robots.txt`,
`sitemap.xml`, `admin.html`.

**Les fichiers sont sortis de la racine web**, le 7 novembre à 19 h 56 UTC. Les
soixante-cinq de `deploy/` et les huit de `scripts/` sont désormais dans
`/home/ubuntu/archives-deploy/`, en 0700 — archivés, pas supprimés. Rien ne
pointait vers eux : zéro référence dans systemd, zéro dans cron, aucune
minuterie, et aucune page du site ne les citait. Vérifié avant de bouger quoi
que ce soit, précisément parce qu'une unité ou une tâche planifiée qui aurait
lu ces chemins aurait cassé le site. Après le déplacement, **vingt-trois
ressources sur vingt-trois répondent 200**.

À noter pour plus tard : le `.env` en service vit lui aussi dans la racine web,
à `/var/www/mkl-energies/.env`. Il est en 0600 et doublement refusé — par la
règle des fichiers cachés et par le nouveau motif `\.env$` — mais le sortir de
là demanderait de modifier `EnvironmentFile` dans l'unité systemd, ce qui n'a
pas été fait.

**La rotation est préparée, pas appliquée** :
`scripts/mise-en-service/rotation-secrets-site.sh`. Ses contrôles passent déjà,
six sur six. Le mot de passe n'y traverse ni l'historique du shell, ni la liste
des processus, ni un fichier : il est lu à l'aveugle, puis transmis par
l'entrée standard d'une session SSH chiffrée et haché sur place. C'est le point
sur lequel elle corrige son prédécesseur — `hash-admin-password.mjs` prenait le
mot de passe en **argument de ligne de commande**, donc il atterrissait dans les
deux premiers.

Le programme distant ne remplace que les deux lignes concernées et **refuse
d'écrire** s'il n'en trouve pas exactement une de chaque ; l'écriture est
atomique, par `rename`, en 0600. La sauvegarde précédente est horodatée dans
`/home/ubuntu/archives-env/`, et `--retour` la remet. L'épreuve finale est la
seule qui prouve vraiment quelque chose : une connexion réelle avec le nouveau
mot de passe, encore en mémoire, avant qu'il ne soit oublié.

Ce que la rotation casse, et c'est voulu : elle **déconnecte les sessions
d'administration ouvertes** et remplace le mot de passe d'administration du
site. Elle ne touche ni au CRM, ni aux données clients, ni aux formulaires, ni
à Google.

**Le nouveau script, `deploy/ovh/deployer-attribution.sh`.** Il part du constat
inverse de son prédécesseur : le dépôt n'est pas un miroir du serveur. Il ne
synchronise donc que ce qu'il connaît, nommément — les pages de `site-public/`
vers la racine distante, `server.mjs`, `admin.js`, `lib/`, et les deux seules
données publiques — et **n'efface jamais rien**. Son mode `--simuler` liste les
fichiers présents sur le serveur et absents du dépôt pour que vous décidiez
vous-même, au lieu de les supprimer. Quatre modes : `--controles` (dépôt et
HTTPS seuls, aucun accès SSH), `--simuler`, `--deployer` (sauvegarde d'abord,
interrupteur coupé), `--retour`.

Les contrôles passent déjà, sauf celui qui doit échouer : il signale
l'exposition de `/deploy/`. Rien ne sera déployé tant qu'elle dure.

#### La simulation a trouvé pire que la disposition : le dépôt est en retard

**Trois fichiers du dépôt sont d'une génération ANTÉRIEURE à la production.**
Mesuré le 7 novembre : déployer `server.mjs` tel quel **supprimerait 272 lignes
vivantes**, pour 214 ajoutées. Et pas n'importe lesquelles :

- la route `POST /api/admin/forgot-password` et son gestionnaire
  `handleAdminForgotPassword`, soit le courriel de réinitialisation ;
- la route `POST /api/admin/change-password` et `handleAdminChangePassword` ;
- `destroyAllSessions()`, appelée deux fois, qui ferme toutes les sessions
  d'administration lors d'un changement de mot de passe ;
- les utilitaires `writeJsonArray` et `safePath`.

`admin.js` perdrait 159 lignes — l'interface correspondante — et
`lib/admin-auth.mjs` les cinq lignes de `destroyAllSessions`.

**L'explication tient aux noms des deux sauvegardes trouvées plus haut.**
`env-before-pwd-20261103` et `env-before-pw-20261104` : la gestion du mot de
passe a été déployée directement sur le serveur les 3 et 4 novembre, et **n'est
jamais revenue au dépôt**. Le `site-public/` a été reconstitué le 5 novembre par
HTTPS, ce qui a bien rapatrié les pages — identiques à l'octet — mais pas
`server.mjs`, `admin.js` ni `admin-auth.mjs`, qui ne sont pas téléchargeables.

Déployer en l'état aurait donc effacé une fonctionnalité d'administration et
une protection de sécurité, en silence. Le dépôt et la production sont chacun
cohérents — ni l'un ni l'autre n'aurait planté au démarrage — ce qui rendait la
régression d'autant plus difficile à voir.

**Le contrôle est désormais automatique.** `--controles` compare les trois
fichiers à ceux en service et **refuse tout déploiement qui retirerait des
lignes**. Il échoue aujourd'hui, comme il doit :

```
✗ server.mjs n efface rien en production         272 lignes seraient PERDUES
✗ admin.js n efface rien en production           159 lignes seraient PERDUES
✗ lib/admin-auth.mjs n efface rien en production   5 lignes seraient PERDUES
```

**La bonne nouvelle, vérifiée :** le hachage du mot de passe est **identique**
de part et d'autre — `scrypt`, même format en six parties, même `SCRYPT_KEYLEN`
à 64, même appel. La rotation des secrets et le déploiement sont donc
indépendants, et l'ordre entre eux est libre.

Autre point relevé : `site-public/LISEZ-MOI.md` serait déployé dans la racine
web et **servi publiquement** — aucun refus nginx ne le couvre, seul `README.md`
est nommé. C'est une note de travail interne. Il est désormais exclu du
déploiement.

**Ce qu'il faut faire avant de reprendre l'étape 3 :** rapatrier au dépôt les
trois fichiers en service, puis y reporter les 214 lignes d'attribution. Alors
seulement le contrôle passera, et le déploiement n'effacera plus rien.

### Report de l'attribution fait le 7 novembre 2026 — et le garde-fou refait

Le rapatriement, puis le report, sont faits. Les neuf contrôles passent, les
125 essais du site et les 1151 du CRM aussi.

Le report a mis en défaut le garde-fou lui-même, et c'est la partie
intéressante. Il comptait les lignes retirées. Il avait bien arrêté la
régression de la veille, mais le report remplace volontairement un `serveStatic`
écrit à la main par un appel au module durci, et trois écritures non
verrouillées par le stockage à verrou : **66 lignes de moins, aucune capacité
perdue**. Un garde-fou qui condamne tout remaniement finit désarmé pour pouvoir
déployer, c'est-à-dire absent le jour où il sert.

Il compare donc désormais les **capacités** — noms de fonctions et chemins de
routes — et non les lignes. Contre-épreuve faite dans les deux sens : appliqué à
l'état du dépôt d'avant le rapatriement, il retrouve exactement la régression,
`handleAdminForgotPassword`, `handleAdminChangePassword` et leurs deux routes.
Appliqué à l'état actuel, il ne signale plus que `safePath` et
`writeJsonArray` — deux retraits délibérés, qui doivent être **déclarés** par
leur nom et leur raison dans le script. Une route, elle, ne s'exempte jamais :
c'est une capacité visible par l'utilisateur.

Trois défauts trouvés au passage, qui n'avaient rien à voir avec l'attribution :

- `handlePatchLead` et `handlePatchAppointment` lisaient, modifiaient et
  réécrivaient la liste **hors verrou**. Une mise à jour de statut concurrente
  d'une demande entrante réécrivait la liste telle qu'elle l'avait lue, et la
  demande disparaissait sans trace. Les deux passent maintenant par
  `updateJsonRecords`, sous le même verrou que les ajouts. Au passage, le statut
  est validé avant la prise du verrou : inutile de le prendre pour refuser.
- `PRIVATE_FILES` restait dans `server.mjs` après le passage au module durci.
  Le laisser était pire qu'inutile : on aurait cru que la protection venait de
  là, et on aurait ajouté un fichier privé à une liste que plus personne ne
  consulte. La vraie liste est dans `lib/public-static.mjs`.
- `safePath`, `writeJsonArray` et la table `MIME` n'avaient plus d'appelant.

### Étape 3 faite le 7 novembre 2026 à 23 h — et une panne invisible

Le site est déployé, **interrupteur coupé** : aucune variable `CRM_SYNC_*` n'est
déclarée, donc le double interrupteur est fermé à ses deux niveaux et rien ne
part vers le CRM. Service actif, aucune erreur au journal, les 12 demandes et
2 rendez-vous intacts, file locale inexistante. Sauvegarde dans
`/var/www/mkl-energies.avant-attribution`, retour arrière par `--retour`.

Dix fichiers écrits, exactement ceux annoncés par la simulation : sept nouveaux
modules dans `lib/`, et `app.js`, `admin.js`, `server.mjs`.

**Une panne a suivi immédiatement le déploiement, et c'est la plus instructive
de la journée.** L'épreuve a signalé `/lib/attribution-capture.mjs` en 404. La
cause n'était ni le fichier, bien arrivé, ni la liste blanche du module durci,
qui le mentionnait : c'était une règle nginx **antérieure à ce chantier**, qui
refuse `/lib/` par une expression à exclusions ne listant que les deux modules
publics de l'époque.

Or `app.js` importe ce module **statiquement**. Un import statique en échec fait
échouer tout le module : le JavaScript du site était mort — formulaires, bannière
de consentement, bascule de langue — alors que chaque page répondait 200 et que
le service était actif. C'est la forme la plus traître de panne, et aucun
contrôle de code HTTP ne pouvait la voir.

Corrigé en ajoutant le nom à l'exclusion, avec sauvegarde horodatée, test de
configuration et restauration automatique en cas d'échec. Vérifié ensuite : les
cinq imports de `app.js` répondent 200, et les huit modules privés de `/lib/`
répondent toujours 404. **Rien n'a été ouvert par mégarde.**

L'épreuve relève désormais les imports **dans `app.js` lui-même** et vérifie que
chacun se résout. Elle en a trouvé un cinquième que personne n'avait listé,
`/i18n.js`. Vingt contrôles au lieu de quatorze. Un import ajouté demain sera
contrôlé sans qu'on y pense.

Deux remarques consignées sans rien changer : `/data/slots.js` répond 404, ce
qui est correct — aucun script du navigateur ne l'importe, le serveur seul le
lit. Et `/etc/nginx/sites-available/` conserve deux fichiers inactifs,
`mkl-energies.new` et une sauvegarde horodatée, qu'aucun lien n'active.

### Liaison configurée le 7 novembre 2026 à 23 h 15 — interrupteur toujours coupé

Les trois variables sont posées dans `/var/www/mkl-energies/.env` :
`CRM_SYNC_URL`, `CRM_SYNC_KEY_ID` à `k1`, `CRM_SYNC_SECRET` à 43 caractères.
**`CRM_SYNC_ENABLED` n'est pas déclarée**, et c'est délibéré : le serveur le
confirme lui-même, `crmSyncConfigured()` renvoie vrai et `crmSyncEnabled()`
renvoie faux. Rien ne part. Sauvegarde dans
`/home/ubuntu/archives-env/env-avant-liaison-20261107T231449Z`, fichier toujours
en 0600, aucune erreur au journal.

**Le secret est prouvé bon sans avoir ouvert l'interrupteur**, par transitivité
et sans jamais révéler sa valeur :

1. l'empreinte du secret posé sur le serveur est identique à celle du coffre,
   `bdadc8e8a1a18a66` de part et d'autre ;
2. le secret du coffre authentifie auprès du CRM — l'épreuve du trousseau
   renvoie 401 sans signature, 401 avec une fausse, et 400 avec une signature
   juste et un contenu volontairement refusé, donc après vérification de la
   signature et sans rien créer.

L'ouverture ne pourra donc pas échouer sur l'authentification. Il ne reste qu'à
poser `CRM_SYNC_ENABLED=1` et redémarrer.

Une difficulté technique mérite d'être notée pour la prochaine fois : écrire le
secret par SSH a d'abord échoué parce que le script Python et le secret se
disputaient l'entrée standard — le `heredoc` occupait `stdin`, le secret
n'arrivait jamais. Le contrôle de longueur a refusé d'écrire avant toute
modification, donc rien n'a été abîmé. Le script est désormais transmis
séparément de la donnée.

### Épreuve réelle du 7 novembre 2026 à 23 h 08 — une demande fictive, puis effacée

La chaîne est prouvée de bout en bout, sur le site en production, avec **une**
demande manifestement fictive portant des marqueurs Google Ads.

**Ce qui a été capturé**, exactement ce qu'il faut pour comparer les régies :

```
attribution     gclid, utm_source=google, utm_medium=cpc,
                utm_campaign, landingPath=/photovoltaique.html,
                referrerHost=www.google.com, capturedAt
premier contact  utm_source, utm_medium, landingPath, capturedAt
```

Les deux modèles d'attribution sont donc enregistrés côte à côte, comme prévu :
premier contact et dernier contact. Le `referrerHost` a été déduit de l'en-tête
`Referer` et correctement distingué du domaine du site lui-même.

**Et surtout, ce qui ne s'est pas produit.** Une tâche est entrée dans la file
locale au statut « en attente », avec **zéro tentative d'envoi** — rien n'a été
transmis, et rien n'a été perdu : c'est précisément le rôle de la file.
Contrôlé côté CRM dans le même temps : **0 événement web, 246 prospects et
4212 clients inchangés, 0 origine écrite**. Aucune erreur au journal, aucun
verrou laissé derrière.

**Nettoyage vérifié.** La demande et la tâche ont été retirées une par une, par
identifiant, avec une assertion refusant d'écrire si le retrait n'était pas
d'exactement un enregistrement. L'empreinte du fichier des demandes est
redevenue `c251994b6b7fb313`, **identique à celle d'avant l'essai**, et le
fichier de file a disparu comme il était. Aucune trace de l'essai nulle part
dans `data/`. Aucune preuve de consentement n'a été écrite — la conformité est
sur « OFF » — et aucun courriel n'est parti : le site n'en envoie que pour la
réinitialisation du mot de passe administrateur.

La sauvegarde d'avant l'essai contient les coordonnées de douze demandes
réelles. Son dossier `/home/ubuntu/archives-env/` était en 0755 ; il est passé
en 0700 et le fichier en 0600. Il est hors de la racine web, et `/archives-env/`
répond 404.

### Simulation du 7 novembre 2026 — ce que le déploiement écrirait

**Dix fichiers, aucune suppression, aucun orphelin.** Sept nouveaux modules dans
`lib/` — capture de provenance, file d'attente, envoi signé, stockage à verrou,
lecture de provenance, écriture des demandes, service statique durci — et trois
fichiers modifiés : `app.js`, `admin.js`, `server.mjs`.

Toutes les autres pages publiques sont **identiques octet pour octet** à ce que
le serveur sert aujourd'hui. C'est une confirmation indépendante que la
reconstitution de `site-public/` par HTTPS du 5 novembre était fidèle.

Deux défauts de la simulation elle-même ont été corrigés, et le second est le
plus sérieux des deux :

**La liste des orphelins était fausse, et dangereuse.** Elle comparait
`site-public/` à *toute* la racine distante. Comme ce dossier ne contient que
les pages publiques, tout le reste du serveur paraissait orphelin : plus de
mille entrées, dont `server.mjs`, `lib/`, `assets/`, `node_modules/`, `.env` et
`data/leads.json` — les demandes des clients. Le tout présenté sous
« décidez vous-même ». Qui aurait suivi cette liste aurait effacé le site et les
demandes. La comparaison ne porte désormais que sur les surfaces réellement
gérées, les pages publiques et les modules de `lib/` : **zéro orphelin**.

**La comparaison se faisait par horodatage.** Un fichier de même taille mais de
contenu différent était transféré *sans être signalé comme modifié* : on
écrasait en croyant ne rien faire. C'est exactement le piège qui a dissimulé
quatre jours durant que le dépôt était en retard sur la production. Les
comparaisons et le déploiement se font maintenant par empreinte, et la
simulation affiche d'abord un résumé en clair, parce que les codes de rsync ne
se lisent pas sans mode d'emploi.

Un défaut d'affichage trouvé au passage : le panneau « Synchro CRM » portait la
classe `page-head`, que la feuille de style ne définit pas. Les autres panneaux
emploient `main__head`. Corrigé. `admin.html` et `admin.css` sont par ailleurs
identiques entre le dépôt et la production, et le panneau ne réutilise que des
classes existantes — aucune feuille de style à déployer.

**L'ordre retenu**, chaque étape étant réversible :

1. nginx : ajouter les refus manquants, recharger, vérifier que
   `/deploy/ovh/deploy.sh` répond 404. Aucun fichier du site n'est touché.
2. `--simuler`, et lire la liste des fichiers orphelins avant toute écriture.
3. `--deployer` : copie de `/var/www/mkl-energies` vers
   `/var/www/mkl-energies.avant-attribution`, envoi, redémarrage, épreuve —
   **interrupteur coupé**, donc le site ne transmet encore rien.
4. Vérifier qu'une demande réelle reste bien dans la file locale du site et que
   la file du CRM reste à zéro.
5. Seulement alors, poser `CRM_SYNC_URL`, `CRM_SYNC_KEY_ID`, `CRM_SYNC_SECRET`
   — le secret étant celui du coffre, sous `k1`, déjà prouvé conforme au CRM par
   `scripts/mise-en-service/eprouver-trousseau.mjs` — puis `CRM_SYNC_ENABLED=1`.

L'interrupteur est double : `crmSyncConfigured` exige les trois variables, et
`crmSyncEnabled` exige `CRM_SYNC_ENABLED` strictement égal à `1`. Le retirer et
relancer le service suffit à tout arrêter.

**1. Les cinq migrations, sur la production.** Une seule contrainte d'ordre —
`web_lead_ingest` crée les tables que `web_lead_idempotence` étend. L'ordre
chronologique la respecte, et les trois autres sont indépendantes :

| Ordre | Migration | Ce qu'elle apporte |
|---|---|---|
| 1 | `20261003_pv_simulations.sql` | 3 objets, sans lien avec l'attribution |
| 2 | `20261102_google_oauth_states.sql` | 5 objets — **et elle rétablit les nouvelles connexions Google Calendar** (voir ci-dessous) |
| 3 | `20261102_web_lead_ingest.sql` | 15 objets, la file des demandes |
| 4 | `20261102_lead_attribution.sql` | 21 objets, l'attribution et les colonnes d'origine |
| 5 | `20261105_web_lead_idempotence.sql` | 9 objets, étend les précédentes |

**Ce que ces cinq migrations font, et ne font pas.** Vérifié fichier par fichier
avant toute application :

- **Aucune création sans garde.** Zéro table, zéro index, zéro colonne sans
  `if not exists`. Les vingt fonctions sont en `create or replace`, les sept
  déclencheurs sont retirés avant d'être posés, l'unique politique aussi. Les
  cinq sont donc rejouables : les relancer sur une base déjà à jour ne produit
  rien.
- **Aucune écriture dans les données existantes.** Les `update` et `insert` que
  l'on trouve dans ces fichiers sont tous **à l'intérieur de corps de
  fonctions** — contrôlé en suivant les délimiteurs `$$`. Rien ne s'exécute au
  moment de l'application ; ces instructions n'entreront en jeu que lorsque
  l'application appellera ces fonctions, ce qu'elle ne peut pas faire avant que
  le trousseau soit posé.
- **Les quatre colonnes d'origine sont ajoutées sans valeur par défaut**, donc
  nulles sur les 246 opportunités existantes. Aucune origine déjà enregistrée
  n'est modifiée, et la contrainte `commercial_opportunities_origin_chk` est
  satisfaite d'office par sa première branche — « ni canal ni catégorie ». Sa
  validation balaie 360 ko : le verrou se compte en millisecondes.
- **L'ordre interne tient** : les deux fonctions dont dépend la contrainte sont
  définies aux lignes 30 et 47, la contrainte à la ligne 91.

**Une panne latente, découverte en préparant cette étape.** Relier un nouveau
compte Google Calendar est **impossible en production aujourd'hui**.
`app/api/google/calendar/connect/route.js` enregistre d'abord son jeton à usage
unique dans `google_oauth_states`, table que la production n'a pas ; l'écriture
échoue et la route répond 503 « Connexion Google indisponible. » Le refus est
propre et voulu — un parcours dont le retour serait invérifiable ne doit pas
commencer — mais il est total.

Les comptes **déjà** reliés ne sont pas concernés : leurs jetons vivent dans
`google_calendar_accounts`, qui existe. La synchronisation en cours continue.

Cette panne est antérieure au déploiement de ce soir : les trois fichiers
concernés sont identiques à ceux qui tournaient avant. La migration n° 2 la
lève, et c'est la raison de la placer tôt, avant même la file des demandes.

**2. Les trois variables, puis un déploiement.** `WEB_LEAD_KEYRING`,
`WEB_LEAD_ORGANIZATION_ID`, `WEB_LEAD_RETENTION_DAYS` sur Production. Une
variable Vercel n'entre en vigueur qu'au déploiement suivant : les poser ne
suffit pas, il faut redéployer, et c'est encore
`deployer-production.sh --deployer` qui s'en charge.

**Pourquoi les migrations d'abord.** Si le trousseau était posé avant les
tables, la route de réception accepterait les demandes du site et échouerait à
les enregistrer : des prospects entreraient et se perdraient. L'inverse ne
coûte rien — les tables attendent sans rien recevoir.

**Le contrôle qui dit que c'est fait** : la tâche de la minute doit répondre
`ok` **sans** `inerte`. Tant qu'elle dit `inerte`, le trousseau n'est pas vu.

**3. Le site OVH, en dernier.** Copie horodatée du serveur avant toute chose,
`sudo cp -a /var/www/mkl-energies /var/www/mkl-energies.avant-attribution`,
puis le déploiement. L'interrupteur d'arrêt est le retrait de `CRM_SYNC_ENABLED`
suivi d'un redémarrage : le site continue de fonctionner, il cesse seulement
d'envoyer. C'est pour cela qu'il passe en dernier — tant qu'il n'émet pas, rien
n'arrive, et chaque étape précédente est vérifiable à vide.

**4. Google Ads et Meta.** Rien à activer dans le CRM : les paramètres d'URL
sont lus par `app/lib/origin-taxonomy.js` et déposés dans `lead_attribution`.
Les événements de conversion Google Ads déjà en place ne sont pas touchés.

Deux règles qui restent en vigueur pendant toute l'opération : aucune origine
déjà enregistrée n'est modifiée, et `google_ads` ne se confond jamais avec le
marqueur technique `google` de Google Calendar.

### Retour arrière

Le déploiement du site est un `rsync` : le retour arrière consiste à
redéployer la version précédente. **Avant toute mise en ligne**, prendre une
copie horodatée du dossier sur le serveur, qui n'est pas un déploiement et ne
coûte rien :

```sh
ssh ubuntu@148.113.149.139 \
  'sudo cp -a /var/www/mkl-energies /var/www/mkl-energies.avant-attribution'
```

Et pour éteindre la transmission vers le CRM sans rien redéployer, il suffit de
retirer `CRM_SYNC_ENABLED` de l'environnement du service et de le relancer : le
site continue d'enregistrer les demandes, il cesse seulement de les transmettre.
Aucune demande n'est perdue, la file les conserve.

## 3 bis. Sauvegarder la branche sur GitHub

Le travail du catalogue, des devis et du module marketing n'existait dans aucun
commit jusqu'au 7 novembre au soir, alors qu'il était **déjà en production** :
le déploiement de 15 h 40 a été fait depuis l'arbre de travail, avec la mention
`gitDirty`. Un déploiement ultérieur lancé depuis une copie propre du dépôt
aurait donc effacé ces corrections sans que rien ne le signale. Les deux commits
`0f1fc9c` et `a7240df` y ont mis fin.

Reste que la branche ne vit que sur un seul poste. La pousser la met à l'abri,
mais il faut savoir ce que cela déclenche.

**Un push crée un déploiement, par défaut.** Le projet Vercel est relié au dépôt
GitHub, et Vercel compile toute branche poussée en Preview, sans rien demander.
Ce n'est pas la production — la branche de production est `main`, et elle reste
intacte — mais c'est bien un déploiement, avec les variables de recette. D'où
l'entrée ajoutée à `vercel.json`, que le format JSON ne permet pas de
commenter sur place :

```json
"git": { "deploymentEnabled": { "etat-reference-20261105": false } }
```

Les branches non listées gardent le comportement par défaut : `main` continue
donc de déployer la production normalement. Le réglage est lu dans le commit
poussé, et vaut aussi pour les pushes suivants sur cette branche.

```sh
# Sauvegarde sur une branche neuve. « main » n'est pas touché, et aucune
# fusion n'est demandée : c'est une copie de sûreté, pas une intégration.
git push -u origin etat-reference-20261105
```

Avant de pousser, deux contrôles ont été faits sur les 38 commits concernés :
aucun n'ajoute de secret — les seules correspondances sont des exemples fictifs
dans les tests et des fragments de brochure en base64 qui ressemblent à des
jetons sans en être — et `.env.example`, le seul fichier d'environnement de
l'archive, ne contient que des valeurs d'exemple, présentes sur `main` depuis
juillet.

## 4. Tests finaux

Dans cet ordre, du moins coûteux au plus engageant.

```sh
# 0. Avant tout déploiement : ce que l'archive emporterait
node scripts/mise-en-service/verifier-archive-vercel.mjs

# 1. Toute la batterie, sans écriture nulle part
npm run test:cloisonnement

# 2. Écriture réelle dans la recette, par requêtes HTTP signées
node scripts/recette/test-http-ovh.mjs --complet
node scripts/recette/test-http-ovh.mjs --nettoyer

# 3. Intégration réelle des formulaires, serveur du site démarré localement
node scripts/recette/test-formulaires-ovh.mjs --complet
node scripts/recette/test-formulaires-ovh.mjs --nettoyer

# 4. Depuis le VPS, par le vrai réseau
sh scripts/recette/test-depuis-vps.sh "https://<deploiement-recette>/api/web-leads"

# 5. Calcul photovoltaïque sur le déploiement, avec la clé en place
node scripts/recette/test-pv-solar.mjs --complet "https://<deploiement-recette>"
node scripts/recette/test-pv-solar.mjs --nettoyer
```

Le troisième est le seul qui éprouve l'assemblage complet : vrai serveur, vrai
module de capture, vrai formulaire, vraie file d'attente. Les autres éprouvent
les pièces ou le transport.

## Ce qui reste ouvert, sans rapport avec cette mise en service

- Le contournement d'autorisation sur `crm_state` en production : trois
  politiques permissives écrites à la main neutralisent les deux politiques
  nommées. Mesuré, non corrigé, aucune donnée client en jeu.
- Des écarts entre le dépôt et la production sur `crm_files`, `pv_simulations`
  et trois fonctions SQL.
- Une clé SSH inconnue figurait déjà dans `authorized_keys` du compte `ubuntu`
  avant la nôtre : à identifier.
- Cinq tests en échec dans les zones de devis et de catalogue, en cours de
  modification et indépendantes de ce chantier.
