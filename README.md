# DBExplorer Documentation

> ⚠️ **Ce projet est en cours de développement. Certaines fonctionnalités n'ont pas encore été entièrement testées et peuvent comporter des bugs ou des comportements inattendus.**

Application de gestion et documentation de bases de données avec support pour SQL Server, MySQL et MariaDB.

## 🚀 Fonctionnalités

- **Recherche** : Tables, vues, procédures stockées, fonctions
- **Gestion des connexions** : Support SSH, activation/désactivation
- **Documentation** : Commentaires sur les objets de base de données
- **Interface moderne** : React + Material-UI
- **Optimisations de performance** : Index SQLite, monitoring en temps réel
- **Monitoring avancé** : Métriques de performance, détection des requêtes lentes

## 📋 Prérequis

- Node.js 16+
- npm ou yarn

## 🛠️ Installation

```bash
# Installation de toutes les dépendances
npm run install-all

# Configuration des connexions (optionnel)
cd server
node add-default-connections.js

# Démarrage en mode développement
npm run dev
```

L'application sera accessible sur :
- **Frontend** : http://localhost:3000
- **Backend** : http://localhost:5000

## 🚀 Démarrage Rapide

### Option 1 : Démarrage manuel
```bash
npm run dev
```

### Option 2 : Démarrage en arrière-plan (Windows)
```powershell
.\start-background.ps1
```

## 📁 Structure du Projet

```
├── client/                 # Frontend React
│   ├── src/
│   │   ├── components/     # Composants React
│   │   └── services/       # Services API
├── server/                 # Backend Express
│   ├── routes/            # Routes API
│   ├── database/          # Base SQLite
│   └── utils/             # Utilitaires
├── tests/                 # Tests
├── connections.json        # Configuration des connexions (optionnel)
├── CONNECTIONS.md         # Documentation des connexions
└── start-background.ps1   # Script de démarrage
```

## 🔧 Configuration

### Variables d'environnement
Créez un fichier `.env` dans le dossier `server/` :

```env
PORT=5000
NODE_ENV=development
```

### Connexions de base de données

#### Option 1 : Interface web (recommandé)
1. Accédez à l'interface web
2. Allez dans "Connexions"
3. Ajoutez vos connexions de base de données

#### Option 2 : Fichier de configuration
1. Créez un fichier `connections.json` à la racine du projet
2. Configurez vos connexions (voir `CONNECTIONS.md`)
3. Exécutez : `cd server && node add-default-connections.js`

**Note** : Le fichier `connections.json` est ignoré par Git pour la sécurité.

## 🧪 Tests

```bash
# Test des connexions activées
node tests/test-enabled-connections.js

# Test des performances et index
npm run test-performance

# Migration des index de performance
npm run migrate-indexes
```

## 📚 API

### Connexions
- `GET /api/connections` - Liste des connexions
- `POST /api/connections` - Créer une connexion
- `PUT /api/connections/:id` - Modifier une connexion
- `DELETE /api/connections/:id` - Supprimer une connexion
- `PATCH /api/connections/:id/toggle` - Activer/désactiver

### Recherche
- `GET /api/search?q=terme` - Rechercher des objets

### Commentaires
- `GET /api/comments` - Liste des commentaires
- `POST /api/comments` - Ajouter un commentaire
- `PUT /api/comments/:id` - Modifier un commentaire
- `DELETE /api/comments/:id` - Supprimer un commentaire

### Performance
- `GET /api/performance/stats` - Statistiques de performance
- `POST /api/performance/analyze-indexes` - Analyser les index
- `GET /api/performance/report` - Rapport détaillé
- `POST /api/performance/measure` - Mesurer une requête
- `POST /api/performance/reset` - Réinitialiser les stats

## 🛡️ Sécurité

- Les mots de passe sont stockés en clair (à améliorer en production)
- Support SSH pour les connexions sécurisées
- Validation des entrées côté serveur
- Fichier `connections.json` ignoré par Git

## 🔒 Sécurité et Confidentialité

- **Ne jamais commiter de mots de passe, clés API ou fichiers de configuration sensibles.**
- Ajoutez vos variables d'environnement dans un fichier `.env` (voir `.env.example`).
- Ajoutez vos connexions dans un fichier `connections.json` (voir `connections.example.json`).
- Ces fichiers sont ignorés par Git et ne doivent pas être publiés.

## 📝 Exemple de configuration

Créez un fichier `.env` à la racine du dossier `server/` :

```env
PORT=5000
NODE_ENV=production
```

Créez un fichier `connections.json` à la racine du projet :

```json
{
  "connections": [
    {
      "name": "exemple-sqlserver",
      "type": "sqlserver",
      "host": "localhost",
      "port": 1433,
      "username": "sa",
      "password": "votre_mot_de_passe",
      "database": "master",
      "ssh_enabled": false
    }
  ]
}
```

## 🚀 Déploiement

### Heroku
```bash
heroku create dbexplorer-documentation
git push heroku main
```

### Docker (à implémenter)
```dockerfile
# Dockerfile à créer
```

## 🤝 Contribution

1. Fork le projet
2. Créez une branche feature
3. Committez vos changements
4. Poussez vers la branche
5. Ouvrez une Pull Request

## 📄 Licence

MIT License - voir le fichier LICENSE pour plus de détails.

## 🆘 Support

Pour toute question ou problème :
1. Vérifiez la documentation
2. Consultez les issues GitHub
3. Créez une nouvelle issue si nécessaire 