# Administration et sécurité : cohérence des actions — 18 novembre 2026

Cette passe porte sur les pages Utilisateurs, Administration des secteurs et
Sécurité personnelle. Elle complète les protections introduites dans la passe
36. Aucun endpoint, droit serveur, schéma SQL ou calcul financier n'a été modifié.
Aucune migration, écriture dans une base d'entreprise ni intervention en
production n'a été effectuée.

## Enregistrement d'un profil et de son rôle

L'écran Utilisateurs enregistre le nom/état, puis le rôle dans une seconde
requête. Un test navigateur a reproduit l'envoi de cette seconde requête avec
la session de l'entreprise B, après une première requête lancée dans A.

Le traitement vérifie maintenant le contexte après chaque réponse. Il vérifie
aussi la révision de la session avant de continuer : le changement de session
peut précéder le rendu React de la nouvelle entreprise. Dès qu'un changement
d'entreprise est engagé, la seconde étape de l'ancienne action est abandonnée.
Les protections du hook `useAuthorizedRequest` restent également actives.

Si la première étape réussit et que le changement de rôle échoue, le message
indique que le profil est enregistré et que le rôle reste à modifier. La ligne
reflète la réponse de la première étape ; le rôle demandé reste dans le brouillon
et peut être réessayé. Les deux endpoints restent distincts : cette correction
ne rend pas leur exécution atomique et ne réalise aucun rollback.

## Actions concurrentes et réponses tardives

Les indicateurs d'attente sont suivis par utilisateur et par secteur, au lieu
d'un seul identifiant pour toute la liste. Une action sur une autre ligne reste
possible, et sa fin ne libère pas une ligne encore occupée.

Les créations, modifications, suppressions d'adhésion et réinitialisations de
mot de passe utilisent le garde commun `useActionScope`. Après un changement
d'entreprise, leurs réponses ne modifient plus la liste, le brouillon, les
messages ou les boutons du nouveau contexte. Les commandes d'écriture gardent
les restrictions `SYS_ADMIN` déjà appliquées par le serveur.

L'administration des secteurs utilise également ce garde. Revenir de A vers B,
puis vers A, ne réactive pas une ancienne action encore en attente dans A.
La liste des utilisateurs est rattachée à son contexte de chargement et n'est
pas affichée sous une nouvelle entreprise avant la réponse correspondante.

Une écriture déjà envoyée peut toujours aboutir dans son contexte d'origine.
Ces gardes protègent la suite du traitement et l'interface ; ils ne révoquent
pas une écriture serveur et n'ajoutent aucun rejeu automatique.

## Brouillons et sécurité personnelle

Les formulaires de création, les modifications des membres et les saisies de
mot de passe participent au garde commun de navigation. Annuler un changement
de page ou d'entreprise conserve la saisie. Un enregistrement réussi efface
seulement les modifications concernées ; un mot de passe de réinitialisation
encore saisi reste considéré comme un brouillon.

Lorsqu'une création ou un changement de mot de passe est en cours, ses champs
sont désactivés pour éviter d'effacer une nouvelle saisie à l'arrivée de la
réponse. Les champs et messages sensibles sont réinitialisés après un changement
de contexte accepté. Aucune persistance des brouillons de mot de passe n'est
ajoutée au stockage du navigateur.

Le bouton de déconnexion de l'écran Sécurité applique la même confirmation de
perte de brouillon que le menu général. Le parcours mobile conserve le bouton
de déconnexion du menu. Les tests vérifient l'annulation et la confirmation,
sans double demande.

Les noms et mots de passe relèvent toujours de l'utilisateur global dans le
backend ; le rôle relève de son adhésion à l'entreprise. Cette passe ne change
pas ce modèle ni les effets existants de révocation des sessions.

## Chargement, liste vide et erreur d'écriture

Une erreur de lecture affiche « Liste indisponible » avec une action Actualiser.
Elle est distincte d'une liste réellement vide. Pour les utilisateurs, l'état
d'erreur de lecture est séparé du message d'erreur d'écriture : une création
refusée ne transforme pas une liste vide correctement chargée en lecture échouée.

La création attend le succès de la lecture initiale. Cela évite qu'une ancienne
réponse de liste remplace un membre venant d'être ajouté. La saisie peut être
préparée pendant l'attente et reste disponible après le chargement ou une erreur
de création. Un échec de lecture demande une reprise explicite avant création.

## Vérifications

`scripts/verify-admin-coherence.mjs` utilise les vrais écrans de l'application
avec toutes les API interceptées. Ses membres, mots de passe, entreprises et
réponses serveur sont fictifs. Il ne contacte aucune API réelle.

Les 34 cas couvrent :

- les deux étapes profil/rôle après un changement d'entreprise et pendant
  l'attente de ce changement, en bureau et mobile ;
- les enregistrements parallèles sur deux utilisateurs ;
- les anciennes créations, suppressions et réinitialisations, en succès et
  en erreur, pendant une action de l'entreprise suivante ;
- l'échec partiel profil/rôle et la reprise du rôle conservé ;
- les actions sectorielles parallèles et le retour A → B → A ;
- les changements de mot de passe tardifs, en succès et en erreur ;
- la conservation des brouillons lorsque l'utilisateur annule la navigation ;
- la déconnexion annulée puis confirmée, en bureau et mobile ;
- la reprise des lectures échouées, la création refusée sur une liste vide et
  la création différée pendant une première lecture.

Les 12 scénarios d'authentification, les contrôles du cycle de vie des vues et
la recette de changements de contexte des transactions, tâches, rapports et
secteurs ont aussi été vérifiés. La compilation complète frontend/backend
inclut les contrôles TypeScript. `git diff --check` ne signale pas d'erreur.

Ces recettes vérifient les appels et l'état de l'interface ; elles ne remplacent
pas un essai des services réels de mots de passe, des révocations de session
ou des écritures SQL. Aucun changement backend n'exige ici une nouvelle
migration. Les limites concernant les six secteurs sans fixture PDF dans la
passe 36 restent inchangées.

## Reproduire

Après compilation et avec Vite servi sur `http://127.0.0.1:5175` selon
`scripts/README.md` :

```powershell
npm run build
node scripts/verify-admin-coherence.mjs
node scripts/verify-auth-coherence.mjs
node scripts/verify-view-coherence.mjs
node scripts/verify-sector-coherence.mjs --context-only
```

La dernière commande réutilise les fixtures PDF locales préparées pour les
recettes précédentes. Les trois premières recettes navigateur n'en ont pas besoin.
