# Récupérer l'accès SSH au VPS OVH

Serveur : `148.113.149.139`, Ubuntu, OpenSSH 10.2. Le site vit dans
`/var/www/mkl-energies` et son service tourne sous le compte `mkl`.

## Pourquoi la console OVH ne suffit pas

La console KVM affiche l'écran de connexion local du serveur. Elle donne un
clavier, pas une session : il faut toujours un mot de passe valide. Sans
redémarrage, il n'existe aucune voie d'accès — c'est exactement ce que SSH est
censé garantir.

Le seul usage de la console qui contournerait le mot de passe consiste à
interrompre le chargeur de démarrage pour obtenir un shell. C'est un
redémarrage, et c'est plus risqué que le mode secours : une ligne mal tapée
dans GRUB peut laisser la machine non démarrable.

## Avant le mode secours

Prendre un instantané depuis l'espace client, onglet *Snapshot* : un
emplacement est inclus, et l'opération ne demande pas de redémarrage. Vérifier
aussi si l'option de sauvegarde automatique est souscrite.

Les documents de sauvegarde du dépôt ne couvrent que la base de données, pas
le VPS : ils ne servent à rien ici.

## Ce que le mode secours écrit, et ce qu'il n'écrit pas

Le système de secours démarre en mémoire. Votre disque n'est pas monté, aucun
service du site ne démarre. La seule écriture de la procédure est une ligne
ajoutée à `authorized_keys`. Rien d'autre n'est modifié, et le site reste en
l'état.

## Retour à la normale

Dans l'ordre, du plus simple au dernier recours.

1. Remettre le démarrage sur le disque dur dans l'espace client, puis
   redémarrer. Le mot de passe temporaire du secours devient inutilisable.
2. Vérifier depuis le poste de travail :
   `ssh -i ~/.ssh/mkl_ovh <compte>@148.113.149.139 "hostname"`.
3. Si le site ne répond pas : `systemctl status nginx mkl-crm-queue` pour voir
   ce qui n'est pas remonté. Aucun de ces services n'a été touché, un
   redémarrage suffit normalement.
4. Annuler l'ajout de la clé : retirer la ligne terminée par `mkl-ovh-<date>`
   de `~/.ssh/authorized_keys` du compte concerné.
5. Dernier recours : restaurer l'instantané pris avant l'opération. Il ramène
   le disque à son état exact, y compris l'ancien mot de passe oublié.

## Après la récupération

Une fois la connexion par clé établie, envisager de désactiver
l'authentification par mot de passe (`PasswordAuthentication no`). À décider
séparément : c'est une modification du serveur, et elle rendrait un futur
oubli de clé aussi gênant que l'oubli de mot de passe actuel.
