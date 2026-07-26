# Modèles d’emails Supabase — MKL Énergies

Dans Supabase, ouvrir **Authentication > Email Templates**, puis copier le
contenu du fichier correspondant :

| Supabase | Fichier | Objet conseillé |
| --- | --- | --- |
| Invite user | `invite.html` | Votre accès au CRM MKL Énergies |
| Confirm signup | `confirmation.html` | Confirmez votre adresse email |
| Reset password | `recovery.html` | Réinitialisez votre mot de passe |
| Magic Link | `magic-link.html` | Votre lien de connexion MKL Énergies |

Avant la mise en service :

1. vérifier que `https://crm.mkl-energies.fr/mkl-energies.png` affiche bien le
   logo ; remplacer cette URL dans les quatre fichiers si le domaine change ;
2. configurer **Authentication > SMTP Settings** avec Resend, Brevo, OVH ou un
   autre fournisseur SMTP ;
3. utiliser `MKL Énergies` comme nom d’expéditeur ;
4. tester chaque modèle avec une adresse interne ;
5. désactiver le suivi automatique des liens chez le fournisseur d’email, car
   il peut consommer les liens Supabase à usage unique.

Ne jamais remplacer `{{ .ConfirmationURL }}` par une URL fixe : Supabase crée
un lien sécurisé différent pour chaque demande.
