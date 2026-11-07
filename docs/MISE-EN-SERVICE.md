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
| Attribution Google Ads, Facebook, Site | éprouvée pièce par pièce, 9 tests de contrat |
| Clé SSH du VPS | installée sur le compte `ubuntu` |
| Site en ligne | version du 3 novembre, sans l'attribution |
| Arbre du site dans ce dépôt | incomplet, voir plus bas |
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

```sh
sh scripts/mise-en-service/rotation-secrets.sh --solar --production
```

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

### Ce qui bloque

L'arbre `ovh-site/` de ce dépôt est une **copie de travail, pas la source de
déploiement**. Deux modules importés par le code en sont absents :

- `ovh-site/lib/callback-deadline.mjs`, importé par `compliance-proof.mjs`
- `ovh-site/lib/conversion-datalayer.mjs`, servi au navigateur par `app.js`

Les deux existent sur le serveur. Conséquences :

1. `server.mjs` ne démarre pas depuis ce dépôt, ce qui empêche d'éprouver
   l'intégration autrement que pièce par pièce.
2. La disposition diffère : le serveur attend `index.html` et `app.js` à la
   racine, le dépôt les place sous `site-public/`.

`deploy.sh` refuse déjà de partir d'un arbre qui ne satisfait pas son critère,
donc **aucun risque immédiat pour le site en ligne**. Mais tant que la source de
déploiement n'est pas identifiée, l'intégration ne peut pas être mise en ligne.

```sh
node scripts/mise-en-service/verifier-site-complet.mjs
```

Ce contrôle nomme les manques et vérifie que les fichiers appartenant au serveur
sont exclus du `rsync --delete`. Il est joué par la batterie automatique, en
étape non bloquante.

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
#    (indisponible tant que les deux modules manquants ne sont pas versionnés)
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
