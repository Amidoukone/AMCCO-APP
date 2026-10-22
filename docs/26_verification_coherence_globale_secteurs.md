# Passe de cohérence globale des 14 secteurs

Date : 21 octobre 2026. État : corrections locales et recettes automatisées ; aucun déploiement.

## Corrections de cette passe

### Conservation des anciennes métadonnées

Un cas supplémentaire a reproduit la perte d'une référence d'archive lors de la modification du libellé d'une transaction Quincaillerie. Le formulaire reconstruisait les métadonnées depuis les seuls champs du profil actuel. La conservation ajoutée aux lots précédents ne couvrait pas encore tous les secteurs et toutes les tâches.

La synchronisation conserve maintenant les métadonnées reçues de l'API, puis complète et formate les champs du profil actuel, pour l'ensemble des transactions et tâches. Les nouvelles saisies repartent toujours d'un objet vide ; les règles existantes de nettoyage des champs métier selon l'opération restent inchangées. Aucun historique n'a été réécrit.

### Changement d'entreprise et de secteur

- Les indicateurs du tableau de bord sont rattachés à l'entreprise et au secteur de leur chargement. Ils sont masqués immédiatement si le contexte sélectionné change, avant l'arrivée de la nouvelle réponse.
- L'aperçu des rapports est rattaché à son entreprise. Une réponse d'une autre entreprise ne peut pas être affichée dans le nouveau contexte.
- Le contexte sectoriel masque les anciens secteurs et profils pendant le chargement de la nouvelle entreprise.
- Le changement d'entreprise restaure son secteur mémorisé, au lieu de réutiliser en priorité celui de l'entreprise quittée. Les restrictions des opérateurs continuent de s'appliquer.
- Les paramètres de l'ancien dossier (`transactionId`, `editTaskId`), de la vue et du secteur sont retirés de l'URL lors du changement d'entreprise. Une fiche détaillée de tâche revient à la liste.
- Annuler le changement conserve le brouillon et l'entreprise. Confirmer l'abandon permet la navigation sans seconde confirmation ; cela ne modifie pas l'enregistrement historique.

### Export PDF et raccourcis

- Un export terminé après un changement d'entreprise, de secteur ou de période appliquée n'est plus téléchargé par la page restée ouverte. Un échec de cet ancien export ne remplace pas les messages du nouveau contexte.
- Le bouton PDF est indisponible pendant l'actualisation du rapport.
- Le raccourci « Voir les blocages » du tableau de bord applique effectivement le statut Bloquée dans les tâches du secteur et enlève une ancienne recherche textuelle qui pourrait masquer les résultats. Les autres filtres restent utilisables normalement.
- Les liens Rapports du propriétaire indiquent explicitement le secteur dans l'URL. Le libellé du tableau de bord annonce l'export PDF disponible.

## Vérifications locales

### Parcours intégrés

Le nouveau script `scripts/verify-sector-coherence.mjs` couvre chacun des 14 secteurs sur ordinateur et téléphone :

1. Ouvrir la vue d'ensemble du secteur.
2. Naviguer vers les transactions, puis les tâches avec le même secteur.
3. Ouvrir une fiche de tâche, puis son lien de modification.
4. Modifier la même fiche en conservant son identifiant, son échéance et ses anciennes métadonnées.
5. Ouvrir le rapport du même secteur et demander son PDF.

Les 28 parcours sont réussis. Chaque parcours n'autorise que la modification simulée de la tâche demandée ; aucune création ni écriture implicite n'est admise.

Un scénario supplémentaire utilise deux entreprises, des secteurs mémorisés différents et des réponses volontairement retenues. Il vérifie le masquage des anciennes données, la restauration des préférences, l'absence de téléchargement d'un ancien PDF, le raccourci des blocages et l'annulation/confirmation d'un changement d'entreprise avec brouillon.

### Non-régression

- `verify-sector-ux.mjs` : pilote Quincaillerie, brouillons, recherche, identité des transactions et conservation de la référence d'archive ajoutée au cas de test.
- `verify-sector-directories.mjs` : boutiques, locataires, chantiers, droits et anciennes ancres.
- `verify-sector-cashflows.mjs`, avec et sans `--field-sectors` : dix secteurs, saisies, calculs, erreurs et conservation des métadonnées.
- `verify-sector-field-tasks.mjs` : cinq secteurs de terrain, accords et catégories.
- `verify-sector-reports.mjs` : 14 rapports sur ordinateur et téléphone, période appliquée, téléchargement et erreurs.
- Vérification des 14 exemples PDF : marges, pagination et absence de pages vides. Le rendu PDF n'est pas modifié par cette passe.
- Compilations frontend/backend et suite backend : 21 fichiers, 188 tests.

## Reproduction

Les recettes utilisent un frontend local sur `127.0.0.1:5175`, les profils backend compilés et Playwright. Définir `AMCCO_PLAYWRIGHT_PATH` si l'installation existante de `playwright-core/index.mjs` doit être utilisée.

La recette intégrée lit les exemples de rapports générés lors du lot précédent ; voir `25_harmonisation_rapports_14_secteurs.md` pour leur génération. Lancer ensuite `node scripts/verify-sector-coherence.mjs`. L'option `--context-only` exécute uniquement le scénario entre entreprises et secteurs. Une capture du résultat est disponible dans `artifacts/sector-coherence/blocked-tasks.png`.

Les API sont interceptées dans le navigateur et les dépôts sont simulés dans les tests backend. Les changements d'entreprise et les modifications de tâches des recettes ne concernent aucune entreprise réelle. Les accès réseau externes des recettes sont bloqués.

## Portée et livraison

Cette passe corrige le frontend et ses recettes. Elle ne modifie ni le schéma de données, ni les formules comptables, ni les autorisations backend. Aucune donnée de production n'a été lue, modifiée ou supprimée et aucun déploiement n'a été effectué.

Les tests locaux ne certifient pas tous les dossiers et volumes réels. La recette métier avec les utilisateurs reste nécessaire avant livraison, notamment sur les historiques, les comptes, les changements d'entreprise et les périodes des rapports.

Respecter l'ordre backend puis frontend documenté pour les lots précédents. Cette passe n'ajoute aucune migration.
