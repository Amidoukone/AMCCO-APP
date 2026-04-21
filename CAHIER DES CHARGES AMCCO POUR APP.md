CAHIER DES CHARGES AMCCO/SND
SYSTÈME DE GESTION CENTRALISÉE MULTI-ACTIVITÉS
1. VISION GÉNÉRALE DU PROJET
1.1 Contexte
Le présent projet vise la mise en place d’un système numérique centralisé destiné à un entrepreneur malien opérant dans plusieurs secteurs d’activité :
•	Quincaillerie
•	Magasins (commerce général)
•	Alimentation
•	Location immobilière
•	Activités agricoles
•	Services divers
•	Exploitation minière
•	Production d’eau potable
•	Agence immobilière
Actuellement, la gestion repose sur des méthodes manuelles et peu structurées, entraînant :
•	Manque de visibilité globale
•	Difficultés de contrôle financier
•	Faible traçabilité des opérations
•	Risques d’erreurs, de pertes et de dépendance humaine
1.2 Ambition du projet
Ce projet ne vise pas la création d’une simple application de gestion, mais la conception d’un système complet, structurant et évolutif, capable de :
•	Centraliser toutes les informations clés,
•	Sécuriser les données,
•	Renforcer le contrôle sans alourdir le travail terrain,
•	Fournir au propriétaire une vision claire, fiable et en temps réel de l’ensemble de ses activités.
Le système est conçu pour être :
•	Robuste
•	Sécurisé
•	Adapté au contexte local
•	Evolutif dans le temps
2. OBJECTIFS DU SYSTÈME
•	Centralisation complète des données financières et opérationnelles
•	Traçabilité totale (qui / quoi / quand / preuve)
•	Vision 360° pour le propriétaire sans saisie directe
•	Interface ultra-simple pour les employés terrain
•	Structuration progressive sans rupture avec les habitudes
•	Gestion fine des rôles et permissions
•	Pérennisation et sécurisation des données de l’entreprise
3. PÉRIMÈTRE DU PROJET
3.1 Fonctionnalités incluses
•	Application web responsive de type PWA
•	Backend API sécurisé
•	Base de données centralisée (MySQL cloud)
•	Gestion multi-entreprises
•	Authentification et permissions par rôles
•	Suivi financier avec preuve obligatoire
•	Tableaux de bord par rôle
•	Gestion et stockage de documents
•	Rapports et exports (PDF, Excel, CSV)
•	Mode hors-ligne basique avec synchronisation
3.2 Fonctionnalités exclues
•	Application mobile native
•	Connexion API bancaire / Mobile Money
•	Intelligence artificielle avancée
•	Reconnaissance vocale ou OCR
•	Géolocalisation temps réel
•	Messagerie interne
•	Gestion complète de la paie
4. ACTEURS ET RÔLES
4.1 Propriétaire
•	Accès lecture seule à toutes les données
•	Vue globale des entreprises
•	Réception de toutes les alertes
•	Génération de tous les rapports
•	Consultation des journaux d’activité
4.2 Administrateur Système
•	Gestion des utilisateurs
•	Gestion des rôles et permissions
•	Configuration des entreprises
•	Paramétrage des alertes
•	Sauvegardes et maintenance
•	Supervision de la sécurité
4.3 Comptable
•	Validation des transactions
•	Gestion des comptes financiers
•	Suivi trésorerie
•	Calcul et suivi des salaires
•	Rapports financiers et exports
4.4 Superviseur
•	Suivi des activités et tâches
•	Assignation et validation du travail
•	Lecture financière de son périmètre
•	Rapports d’équipe
•	Alertes ciblées
4.5 Employé
•	Saisie des entrées et sorties d’argent
•	Upload des preuves
•	Suivi des tâches
•	Historique personnel
•	Notifications internes
5. DESCRIPTION GÉNÉRALE DU SYSTÈME
Le système permet :
•	Une gestion centralisée et sécurisée,
•	Un contrôle financier progressif,
•	Un suivi opérationnel structuré,
•	Une meilleure visibilité pour la prise de décision,
•	Une réduction forte des pertes et erreurs.

6. ARCHITECTURE ET MATURITÉ TECHNIQUE
6.1 Principes de développement
•	Utilisation de Git et GitHub
•	Architecture moderne frontend / backend séparée
•	Bonnes pratiques de sécurité
•	Code maintenable et évolutif
•	Documentation technique
6.2 Déploiement et CI/CD
•	Déploiement continu (CI/CD)
•	Environnements séparés (test / production)
•	Mises à jour sécurisées
•	Réduction des risques lors des évolutions
6.3 Technologies utilisées
•	Frontend : React + TypeScript
•	Backend : Node.js + Express
•	Laragon : pour mysql local
•	Base de données : PlanetScale (MySQL cloud)
•	Stockage images : ImageKit
•	Hébergement frontend : Netlify
•	Hébergement backend : Render
•	Sécurité : JWT, HTTPS
