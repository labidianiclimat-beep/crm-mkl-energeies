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
| Attribution Google Ads, Facebook, Site | éprouvée de bout en bout, 19 contrôles sur 20 |
| Clé SSH du VPS | installée sur le compte `ubuntu` |
| Site en ligne | version du 3 novembre, sans l'attribution |
| Arbre du site dans ce dépôt | complet |
| `GOOGLE_SOLAR_API_KEY`, `CRM_ACCESS_PIN` | exposés dans 17 archives, à renouveler |

## 1. Renouveler les deux secrets

Les deux figuraient dans `.env.local`, lui-même embarqué dans les archives des
déploiements antérieurs au 7 novembre 04 h 25.

### Le code d'accès du CRM

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

## 4. Tests finaux

Dans cet ordre, du moins coûteux au plus engageant.

```sh
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
