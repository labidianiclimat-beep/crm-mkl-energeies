# Migration vers Vercel

## État vérifié le 26 juillet 2026

- Application Next.js 15 / React 19 avec routes API Node.js.
- Dépôt Git propre avant les changements de préparation.
- Authentification et état partagé connectés à Supabase.
- Une partie des données reste mise en cache dans le `localStorage` de chaque
  navigateur. Un changement de domaine ne transfère pas ce stockage.
- Aucun script de migration de base de données n'est requis pour Vercel et
  aucun changement Supabase ne doit être exécuté pendant le déploiement.

## Données clients publiques

`public/clients-export.json` ne contient plus que **5 fiches clients fictives**
(identifiables par le suffixe « exemple » et le domaine `@mkl-demo.fr`). Elles
servent uniquement à alimenter la démonstration lors du premier chargement.

Les 194 fiches réelles ont été retirées du dépôt. Pour un import massif en
production, charger les clients via Supabase ou une route API authentifiée, pas
via un fichier statique dans `public/`.

L'audit npm de production signale également trois vulnérabilités de sévérité
haute dans les dépendances transitives `postcss` et `sharp` de Next.js. La
correction automatique proposée rétrograde Next.js vers une version majeure
ancienne et ne doit pas être appliquée. Réévaluer l'avis de sécurité et mettre
à jour Next.js dès qu'une version corrective compatible est disponible.

## Configuration Vercel

Importer le dépôt dans Vercel comme projet Next.js, sans modifier la commande
de build (`npm run build`) ni le dossier de sortie détecté automatiquement.

### Où ajouter les variables dans Vercel

1. Ouvrir [vercel.com/dashboard](https://vercel.com/dashboard)
2. Cliquer sur le projet **crm-mkl-energeies** (équipe **mkl-crm**)
3. Onglet **Settings** en haut (⚙️ Paramètres — pas Overview)
4. Menu gauche : **Environment Variables**
5. Lien direct : `https://vercel.com/mkl-crm/crm-mkl-energeies/settings/environment-variables`

Pour chaque variable : saisir le **Key**, la **Value**, cocher **Production** (et **Preview** si besoin), puis **Save**. Un **redéploiement** est nécessaire après toute modification.

Configurer les variables suivantes dans Vercel :

| Variable | Preview | Production |
| --- | --- | --- |
| `CRM_ACCESS_PIN` | recommandée | **requise** (4–6 chiffres, accès équipe) |
| `NEXT_PUBLIC_SUPABASE_URL` | requise | requise |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | requise | requise |
| `MAIL_SMTP_HOST` | optionnelle | `ssl0.ovh.net` |
| `MAIL_SMTP_PORT` | optionnelle | `587` |
| `MAIL_SMTP_USER` | requise pour OVH | `contact@mkl-energies.fr` |
| `MAIL_SMTP_PASSWORD` | requise pour OVH | mot de passe de la boîte mail OVH |
| `MAIL_FROM` | requise pour les emails | `MKL Énergies <contact@mkl-energies.fr>` |
| `APP_PUBLIC_URL` | laisser vide pour l'URL Preview | `https://crm-mkl-energeies.vercel.app` |
| `MAIL_API_TOKEN` | alternative Resend | uniquement si vous n'utilisez pas OVH SMTP |

Sans `MAIL_SMTP_PASSWORD` (ou `MAIL_API_TOKEN`), la création d'utilisateur fonctionne mais **aucun email n'est envoyé** depuis `contact@mkl-energies.fr`.

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
2. Tester l’écran PIN : ouvrir le CRM, saisir `CRM_ACCESS_PIN`, vérifier l’accès aux modules.
3. Tester la déconnexion puis reconnexion.
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
