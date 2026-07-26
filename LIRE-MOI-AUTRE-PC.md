# MKL Énergies CRM — transfert vers un autre ordinateur

Ce dossier contient le CRM complet. Aucun mot de passe personnel ou mot de
passe de base de données n'est inclus.

## 1. Installer les outils

Installez sur le nouvel ordinateur :

- Node.js LTS : https://nodejs.org/
- Git pour Windows : https://git-scm.com/install/windows
- Codex, connecté avec le même compte que sur l'ordinateur du bureau.

## 2. Préparer la connexion Supabase

Dans le dossier du CRM, créez un fichier nommé `.env.local` contenant :

```text
NEXT_PUBLIC_SUPABASE_URL=https://rzkwmwtjnwnmmcexwoov.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_egPsJQ5koBZHRPhT4dPhFw_Ffiz67B3
```

La clé ci-dessus est la clé publique prévue pour l'application. Ne copiez
jamais dans ce dossier le mot de passe PostgreSQL, une clé `service_role` ou
une clé secrète Supabase.

## 3. Démarrer le CRM

Ouvrez PowerShell dans le dossier, puis exécutez :

```powershell
npm.cmd install
npm.cmd run dev
```

Ouvrez ensuite :

```text
http://localhost:3000
```

Connectez-vous avec votre adresse Admin VIP et votre propre mot de passe.

## 4. Continuer avec Codex

Dans Codex, ouvrez ce dossier comme projet et écrivez :

```text
Reprends le CRM MKL Énergies depuis ce dossier et retente la publication
Sites en utilisant le project_id déjà présent dans .openai/hosting.json.
```

Le fichier `.openai/hosting.json` rattache le dossier au projet d'hébergement
MKL Énergies CRM déjà créé. Ne créez pas un deuxième site.

