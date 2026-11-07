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

#### Supprimer l'ancienne clé — préparé, en attente d'accord

À ne faire qu'après l'épreuve en production. Trois clés Google distinctes
existent dans ce système, et c'est là qu'est le danger :

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

Et plutôt que de supprimer d'emblée, **restreignez-la d'abord à une API qu'elle
n'utilise pas** : la clé devient inerte, et le geste est réversible d'un clic.
Attendez vingt-quatre heures, vérifiez qu'aucune étude photovoltaïque ni le
site ne se plaignent, puis supprimez. Une suppression est définitive ; une
restriction ne l'est pas.

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

**1. Les cinq migrations, sur la production.** Une seule contrainte d'ordre —
`web_lead_ingest` crée les tables que `web_lead_idempotence` étend. L'ordre
chronologique la respecte, et les trois autres sont indépendantes :

| Ordre | Migration | Ce qu'elle apporte |
|---|---|---|
| 1 | `20261003_pv_simulations.sql` | 3 objets, sans lien avec l'attribution |
| 2 | `20261102_google_oauth_states.sql` | 5 objets — **et elle répare au passage la connexion Google Calendar**, dont le code réclame déjà cette table absente |
| 3 | `20261102_web_lead_ingest.sql` | 15 objets, la file des demandes |
| 4 | `20261102_lead_attribution.sql` | 21 objets, l'attribution et les colonnes d'origine |
| 5 | `20261105_web_lead_idempotence.sql` | 9 objets, étend les précédentes |

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
