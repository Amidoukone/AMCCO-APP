# Standards de livraison

## Branching

- `main`: stable, deployable
- `develop`: integration continue
- branches de travail: `feature/<scope>`

## Pull Request

- petite taille (idealement < 400 lignes nettes)
- description: contexte, approche, risques, tests
- checklists obligatoires: securite, migrations, retro-compatibilite

## Qualite

- lint vert
- typecheck vert
- tests des cas critiques
- pas de secret en dur

## Definition of done globale

- besoin metier couvert
- securite et droits verifies
- logs/audit adaptes
- documentation mise a jour
- tests executes

## Checklist de regression UX

Cette checklist s'applique a chaque lot UX avant commit final ou livraison.

- connexion: se connecter avec un compte valide
- session: verifier qu'une page protegee reste accessible apres chargement initial
- navigation: ouvrir au minimum `pilotage`, `centre d'alertes`, `flux financiers`, `operations`, `rapports`
- contexte: verifier le changement d'entreprise si le compte en dispose
- contexte: verifier le changement de perimetre actif si le module en depend
- retours UI: verifier qu'un message de succes, d'erreur ou de chargement reste lisible et coherent
- confirmations: verifier qu'une action destructive ouvre bien la modale de confirmation
- responsive simple: verifier qu'aucun bloc majeur n'est casse visuellement sur une largeur reduite
- securite: verifier qu'aucune valeur sensible ou technique n'apparait dans les messages visibles

### Parcours metier minimum

- alertes: filtrer puis ouvrir une alerte ou la marquer comme lue
- finances: creer ou modifier une transaction si le role le permet, sinon verifier la consultation
- salaires: ouvrir la liste et verifier le detail d'un element si le module est accessible
- operations: creer, modifier ou consulter une tache selon le role
- detail tache: ouvrir la fiche et verifier timeline/commentaires
- rapports: ouvrir la page et lancer au moins un export autorise si disponible
- audit/securite: ouvrir la page si le role le permet et verifier le filtrage

### Validation technique minimum

- `frontend`: `npm.cmd run typecheck`
- `frontend`: `npm.cmd run build`
- si le lot touche aussi le backend: executer au minimum le typecheck ou les tests cibles associes
