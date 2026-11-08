# Ressources publiques de mkl-energies.fr

Copie des ressources **publiques** du site, récupérée en HTTPS le 5 novembre 2026,
puis modifiée localement pour y raccorder l'attribution publicitaire.

## Pourquoi ce dossier existe

Le dossier `ovh-site/` ne contenait que le serveur et ses modules : ni `index.html`,
ni `app.js`, ni `rdv.html`. Impossible, dans ces conditions, de vérifier comment les
formulaires envoient réellement leurs demandes, ni de raccorder l'attribution au bon
endroit. Ces fichiers manquaient aussi au dépôt : `git ls-files ovh-site` ne renvoie
rien, et aucune copie n'existait sur la machine de développement.

## Comment ils ont été récupérés

Par requêtes HTTPS sur les URL du plan de site, exactement comme le fait le navigateur
d'un visiteur. Aucun accès SSH, aucune lecture de configuration privée, aucune écriture
sur le serveur.

Liste blanche volontaire : uniquement `.html`, `.js`, `.css` et `.xml`. Une liste
d'exclusion aurait été moins sûre, parce qu'elle échoue en laissant passer — il suffit
d'un fichier au nom inattendu. Ont été vérifiés absents : mots de passe, clés privées,
données clients.

Au passage, les protections du serveur ont été contrôlées de l'extérieur. Les chemins
`/.env`, `/data/leads.json`, `/lib/crm-sync.mjs` et `/lib/admin-auth.mjs` répondent
tous 404.

## Ce dossier n'est pas déployable

Il n'est pas la racine attendue par `deploy/ovh/deploy.sh`, et c'est délibéré : ce
script exige `index.html` et `app.js` à la racine de `ovh-site/`. Les placer ici le
laisse refuser de partir, ce qui évite un déploiement involontaire.

Avant toute mise en service, ces fichiers doivent être **rapprochés de ceux du serveur**.
Le site a pu évoluer depuis la récupération, et cette copie n'est une référence que
pour la version servie le 5 novembre 2026 (paramètre de cache `v=20261103i18n2`).

## Modifications apportées

Dans `app.js`, et nulle part ailleurs :

1. un import de `./lib/attribution-capture.mjs` et un appel à `installAttribution()` ;
2. `Object.assign(payload, attribution.fields())` avant l'envoi vers `/api/leads` ;
3. la même ligne avant l'envoi vers `/api/appointments`.

Aucun formulaire créé, aucun formulaire modifié, aucun événement de conversion Google
Ads touché. Les deux `pushConversionEvent` restent après la réponse du serveur, en aval
des lignes ajoutées.

`ovh-site/tests/site-integration.test.js` vérifie ces trois points sur le fichier réel,
ainsi que le comportement du bandeau de consentement. Ces tests échoueront si le site
est remanié en amont : il faudra alors reprendre la récupération avant de déployer.

## Prérequis au déploiement

`/lib/attribution-capture.mjs` répond actuellement 404 en production. Vérifié de
l'extérieur : la page d'erreur est celle de Nginx (`Content-Type: text/html`,
162 octets), alors qu'une requête qui atteint Node renvoie `text/plain` et le texte
« Not found ». C'est donc bien Nginx qui refuse, et non le fichier qui manque.

La modification exacte à appliquer est décrite en tête de `deploy/ovh/nginx.conf`. Sans
elle, l'import échoue et `app.js` s'arrête entièrement : les formulaires cesseraient de
fonctionner. L'ordre de mise en service est donc contraint — Nginx d'abord, le site
ensuite.
