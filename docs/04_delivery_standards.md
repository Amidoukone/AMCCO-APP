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

