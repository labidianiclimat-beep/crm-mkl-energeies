# MKL Énergies CRM — MVP

Première version exploitable du CRM MKL Énergies.

## Périmètre fonctionnel

- Tableau de bord : CA signé, pipeline, chantiers et contrats d'entretien
- Prospects : recherche, pipeline par étape et ajout rapide
- Clients : socle de navigation prévu
- Chantiers : avancement, prochaine échéance et équipe affectée
- Clients : création, recherche et export Excel `.xls`
- Maintenance : création des contrats, périodicité, montant et prochaine visite
- Planning : relances commerciales et interventions terrain
- Utilisateurs : création de comptes et attribution des rôles
- Devis : création commerciale, articles, TVA, statuts et téléchargement A4
- Factures : espace séparé réservé par défaut aux administrateurs, format A4
- Articles : catalogue, prix d’achat/vente, TVA, unités et import CSV
- Catégories d’articles : catégories principales, sous-catégories et import CSV
- Demandes de chiffrage : génération automatique à la validation d’un devis,
  uniquement pour les articles de la catégorie Grand matériel

Les clients, contrats et utilisateurs créés sont conservés dans le stockage local
du navigateur pour permettre une démonstration complète sans serveur.

## Rôles disponibles

- Admin VIP : accès total, sécurité, finances et utilisateurs
- Admin second : administration courante
- Responsable technique : chantiers, techniciens, planning et maintenance
- Technicien : interventions assignées et comptes rendus
- Responsable commercial : équipe, prospects, clients, devis et reporting
- Commercial : ses prospects, clients, rendez-vous et devis

Chaque commercial doit être rattaché à un Responsable commercial ou à un
Admin VIP lors de la création de son compte.

## Invitation et activation

- L’adresse email est utilisée comme identifiant
- Un lien temporaire individuel est créé avec le compte
- L’email d’invitation peut être préparé depuis le CRM local
- L’utilisateur choisit son mot de passe sur l’écran d’activation
- Aucun mot de passe en clair n’est stocké dans le prototype

L’envoi automatique et le stockage sécurisé du mot de passe seront connectés
au serveur d’authentification lors de la mise en production.

### Envoi OVH préparé

Le serveur d’invitation utilise l’adresse `contact@mkl-energies.fr` avec le SMTP
OVH en STARTTLS. La configuration privée attendue dans `.env.local` reprend les
variables documentées dans `.env.example`.

Le mot de passe OVH ne doit jamais être ajouté au code, envoyé par messagerie
ou inclus dans une archive. L’envoi est volontairement bloqué tant que
`APP_PUBLIC_URL` ne contient pas l’adresse publique du CRM.

## Architecture cible

- Interface : Next.js / React, responsive
- API métier à connecter : prospects, clients, opportunités, sites, chantiers, contrats, interventions, tâches
- Données : PostgreSQL avec séparation par entreprise
- Authentification : rôles administrateur, commercial, conducteur de travaux, technicien
- Intégrations ultérieures : email, calendrier, cartographie, signature électronique, facturation

## Lancer localement

```bash
npm install
npm run dev
```

Les données actuelles sont des données de démonstration conservées dans l'interface.

## Fournisseurs et demandes de chiffrage

- Le module **Fournisseurs** enregistre la raison sociale, le contact, l’email,
  le téléphone et la spécialité.
- Dans chaque demande de chiffrage, l’opérateur coche un ou plusieurs
  fournisseurs puis clique sur **Envoyer**.
- Chaque fournisseur reçoit un email séparé envoyé par
  `contact@mkl-energies.fr`, avec la demande A4 en pièce jointe.
- L’envoi nécessite les identifiants OVH privés dans `.env.local`, puis un
  redémarrage du CRM.

## Évolutions version 26

- Listes clients et prospects protégées contre la sélection et l’export,
  avec import/export clients réservé à l’Admin VIP.
- Alertes automatiques des devis transmis depuis 15 jours, puis seconde
  alerte à partir de 21 jours.
- Contrat d’entretien et demande de chiffrage générés à la validation d’un
  devis contenant du Grand matériel.
- Module Visites techniques avec comparaison des prix fournisseurs et
  génération d’un bon de commande pour le fournisseur le moins cher.
- Factures pro forma générées après clôture d’un entretien et envoi par OVH.
- Pavé financement, financeur et mention PROJET sur les devis sans date
  prévisionnelle de livraison.
- Bibliothèque de groupes composés de plusieurs articles et tarifs distincts.

## Formulaire de prévisite

Le module Visites techniques ouvre désormais un rapport de prévisite en ligne
à l’adresse `/previsite`. Il réunit les deux anciens formulaires papier :

- informations client, PAC, ECS et nature du chantier ;
- liste détaillée du matériel et quantités ;
- commentaires et validations Oui/Non ;
- signatures du technicien et du client au doigt ou au stylet ;
- brouillon conservé sur la tablette ;
- impression A4 ou enregistrement PDF aux couleurs MKL Énergies.
