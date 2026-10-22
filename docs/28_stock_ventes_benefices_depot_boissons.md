# Dépôt de boissons : stock, ventes et bénéfices

Date : 22 octobre 2026. Modifications locales, non déployées.

## Fonctionnement

- Chaque produit appartient à une entreprise et possède un nom, une unité et un stock de départ issu d'un comptage physique. Une même désignation et unité ne peuvent pas être créées deux fois.
- Les achats et ventes utilisent l'identifiant du produit, et non un nom libre. Les achats augmentent les quantités ; les ventes les diminuent.
- L'opérateur choisit le produit et saisit la quantité et le prix de vente. Le serveur calcule le coût des produits vendus à partir du coût moyen pondéré du stock disponible à l'enregistrement. Le nom, l'unité et le coût ne sont pas acceptés sur la seule déclaration du navigateur.
- Une vente au-delà du disponible est bloquée côté serveur, y compris lorsque deux opérateurs utilisent des comptes financiers différents. La réservation de stock et l'écriture financière utilisent la même transaction SQL et un verrou par entreprise.
- Les quantités et valeurs sont calculées en entiers à précision fixe. La dernière sortie reprend toute la valeur résiduelle pour éviter un reliquat d'arrondi.
- Le stock est commun aux utilisateurs de l'entreprise ; la liste des transactions de l'opérateur conserve son périmètre habituel.
- L'opérateur peut ajouter un produit avec son comptage de départ, consulter le disponible, vendre et approvisionner. Les corrections d'un stock existant après comptage sont réservées au comptable et à l'administrateur.
- Sur mobile, les produits sont présentés sous forme de fiches avec leurs boutons d'action.

## Contrôles et corrections

- Une vente supprimée ou rejetée restitue les quantités et le coût qu'elle avait consommés. Une modification est vérifiée contre le stock disponible, après neutralisation de son ancien mouvement.
- Un achat ayant déjà servi à des ventes ne peut plus être supprimé, rejeté ou modifier ses quantités et coûts. Ses références et observations restent modifiables.
- Les mouvements antérieurs à une correction par comptage sont conservés ; leur effet de stock ne peut plus être modifié rétroactivement. Le comptable peut traiter l'écart physique actuel par un nouveau comptage motivé.
- Le comptage vérifie que le stock n'a pas changé depuis l'ouverture de la saisie. Une quantité physique obsolète est refusée, sans écrasement des ventes intervenues entre-temps.
- La création du stock de départ et les corrections sont auditées dans la même transaction SQL que l'enregistrement du stock. Les corrections ne créent pas d'entrée ou de sortie de caisse.
- Une erreur de stock conserve le formulaire de transaction ; le stock est actualisé pour permettre de revoir la saisie.

## Unités et dates

Utiliser une unité commune aux achats et ventes d'un produit. Pour un suivi en bouteilles, convertir les casiers reçus en nombre de bouteilles. Ne pas initialiser le même stock physique une fois en casiers et une seconde fois en bouteilles. Aucune conversion automatique entre conditionnements n'est introduite.

Le disponible correspond aux mouvements enregistrés depuis le comptage de départ, dans l'ordre de leur enregistrement. Les coûts sont constatés à l'enregistrement ; une saisie antidatée ne recalcule pas les coûts des ventes précédentes. Une nouvelle opération liée au stock ne peut pas être datée d'un jour antérieur à l'initialisation du produit.

## Rapports et PDF

- Marge brute des nouvelles ventes : montant vendu moins coût du stock vendu enregistré par le serveur.
- Résultat d'exploitation : marge brute + autres recettes − dépenses + écarts de stock valorisés. Les achats ne sont pas déduits une seconde fois après le coût des produits vendus.
- Les écarts après comptage sont détaillés avec leur motif et leur valorisation.
- Le stock disponible actuel est daté et séparé des inventaires historiques de la période du rapport. La période du rapport filtre les flux et corrections ; elle ne transforme pas la situation actuelle en stock historique.
- Les anciennes ventes conservent leur coût déclaré. Les ventes historiques sans coût exploitable ne permettent toujours pas une marge complète : le résultat doit être lu avec cette limite.

## Historique et mise en service

La migration [028_beverage_stock.sql](../backend/sql/028_beverage_stock.sql) ajoute deux tables. Elle ne modifie ni ne rejoue les transactions et inventaires existants. Les produits et quantités anciens ne sont pas rapprochés automatiquement par leur nom.

Complément : la [correction de disponibilité du stock](29_correction_disponibilite_stock_boissons.md) intègre aussi ces deux tables à la préparation habituelle du backend au démarrage et clarifie les états de l'écran.

Pour la mise en service, préparer une sauvegarde vérifiée, tester la migration sur une copie isolée, puis coordonner migration, backend et frontend. Les anciennes versions du formulaire ne peuvent pas enregistrer les nouveaux achats et ventes sans identifiant de produit. L'ancien backend doit être arrêté avant d'ouvrir le nouveau suivi, afin qu'aucun processus ne contourne les contrôles de stock.

Initialiser chaque produit une seule fois avec sa quantité physique et son coût d'achat vérifiés au démarrage. Les anciennes opérations restent consultables ; leurs produits, quantités et prix sont conservés lors des modifications de références ou de précisions. Elles ne sont pas déduites du nouveau stock de départ.

Aucune migration, aucune connexion à la base de production et aucun déploiement n'ont été effectués pendant cette intervention.

## Vérification

- Compilation backend et frontend.
- Suite backend complète : 23 fichiers et 212 tests réussis.
- Tests métier du stock : absence de stock, isolation des entreprises, coûts déclarés falsifiés, achats successifs et coût moyen, ventes concurrentes, annulation, corrections de saisie, historique, arrondis, comptages et audit.
- Tests des droits : opérateur, autres secteurs, propriétaire, comptable et secteur désactivé.
- Tests des rapports et PDF : coût serveur utilisé pour la marge, stock courant et écarts de stock inclus.
- Recette navigateur : ordinateur et mobile avec comptes comptable et opérateur, sélection des produits, opérations sans Précision, épuisement, conflit serveur et nouvelle tentative, création de produit et comptage par le comptable.
- PDF de contrôle avec stock et écarts de comptage, et PDF long de neuf pages : marges, numérotation et notes complètes vérifiées.

Les tests de concurrence utilisent un adaptateur transactionnel simulé qui vérifie le verrou SQL et les écritures dans la même connexion. Le moteur MySQL réel et la migration restent à valider sur une base isolée avant livraison : aucun serveur MySQL local disponible pendant cette passe.
