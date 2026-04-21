# Modele metier de reference

## Entites coeur

- `Company`: entreprise geree dans la plateforme
- `User`: utilisateur global
- `Membership`: rattachement user <-> company + role
- `Role`: proprietaire, admin_systeme, comptable, superviseur, employe
- `Permission`: granularite d'acces
- `Transaction`: entree/sortie d'argent
- `TransactionProof`: preuve associee (image, pdf)
- `Task`: activite operationnelle
- `Document`: document metier
- `Alert`: notification metier
- `AuditLog`: traçabilite des actions

## Principes

- toute action sensible cree un `AuditLog`
- toute transaction configurable exige une `TransactionProof`
- la vue proprietaire est lecture seule
- les superviseurs n'accedent qu'a leur perimetre

## Flux critique: transaction financiere

1. Employe cree transaction (`draft`)
2. Employe ajoute preuve
3. Comptable valide (`approved`) ou rejette (`rejected`)
4. Systeme journalise chaque transition
5. Dashboard et rapports se mettent a jour

