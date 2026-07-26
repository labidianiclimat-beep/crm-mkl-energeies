# Migration vers Vercel

## État vérifié le 26 juillet 2026

- Application Next.js 15 / React 19 avec routes API Node.js.
- Dépôt Git propre avant les changements de préparation.
- Authentification et état partagé connectés à Supabase.
- Une partie des données reste mise en cache dans le `localStorage` de chaque
  navigateur. Un changement de domaine ne transfère pas ce stockage.
- Aucun script de migration de base de données n'est requis pour Vercel et
  aucun changement Supabase ne doit être exécuté pendant le déploiement.

## Point de sécurité bloquant avant une production publique

`public/clients-export.json` contient 194 fiches clients (noms, emails,
téléphones et adresses). Tout fichier placé sous `public/` est accessible sans
authentification sur Next.js, même si l'interface affiche un écran de connexion.

Ne pas ouvrir le déploiement au public tant que ces données n'ont pas été
déplacées derrière une route serveur authentifiée ou importées dans Supabase.
Le fichier n'a été ni modifié ni supprimé pendant cette préparation.

L'audit npm de production signale également trois vulnérabilités de sévérité
haute dans les dépendances transitives `postcss` et `sharp` de Next.js. La
correction automatique proposée rétrograde Next.js vers une version majeure
ancienne et ne doit pas être appliquée. Réévaluer l'avis de sécurité et mettre
à jour Next.js dès qu'une version corrective compatible est disponible.

## Configuration Vercel

Importer le dépôt dans Vercel comme projet Next.js, sans modifier la commande
de build (`npm run build`) ni le dossier de sortie détecté automatiquement.

Configurer les variables suivantes dans Vercel :

| Variable | Preview | Production |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | requise | requise |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | requise | requise |
| `MAIL_API_URL` | optionnelle si Resend | optionnelle si Resend |
| `MAIL_API_TOKEN` | requise pour les emails | requise pour les emails |
| `MAIL_FROM` | requise pour les emails | requise pour les emails |
| `APP_PUBLIC_URL` | laisser vide pour l'URL Preview | domaine canonique |

Les secrets doivent être saisis dans le tableau de bord Vercel, jamais ajoutés
au dépôt. Toute modification de variable nécessite un nouveau déploiement.

## Supabase

Dans Authentication > URL Configuration :

1. conserver l'ancienne URL pendant la phase de transition ;
2. ajouter l'URL Preview Vercel aux Redirect URLs pour la recette ;
3. ajouter le futur domaine de production aux Redirect URLs ;
4. basculer la Site URL seulement après validation de la recette.

## Recette sans perte de données

1. Créer un déploiement Preview protégé.
2. Tester la connexion avec un compte non administrateur.
3. Vérifier la lecture puis l'écriture d'une donnée de test dans Supabase.
4. Vérifier clients, prospects, devis, contrats, planning et signatures depuis
   un navigateur qui possède déjà les données locales.
5. Exporter les données locales via la fonction existante du CRM avant tout
   changement de domaine.
6. Tester les trois routes d'email avec des destinataires de recette.
7. Vérifier l'invitation et la récupération de mot de passe.
8. Corriger le point de sécurité des fiches clients avant accès public.
9. Affecter le domaine, puis refaire la recette en production.

## Retour arrière

Conserver l'ancien hébergement et ses Redirect URLs Supabase jusqu'à validation
complète. En cas d'incident, remettre le DNS sur l'ancien hébergement ; aucune
donnée Supabase n'est déplacée par ce déploiement.
