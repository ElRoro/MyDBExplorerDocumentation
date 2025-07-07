# DBExplorer Documentation

Application de gestion et documentation de bases de données avec support pour SQL Server, MySQL et MariaDB.

## 🚀 Fonctionnalités

- **Recherche d'objets** : Tables, vues, procédures stockées, fonctions
- **Gestion des connexions** : Support SSH, activation/désactivation
- **Documentation** : Commentaires sur les objets de base de données
- **Interface moderne** : React + Material-UI

## 📋 Prérequis

- Node.js 16+
- npm ou yarn

## 🛠️ Installation

```bash
# Installation de toutes les dépendances
npm run install-all

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
1. Accédez à l'interface web
2. Allez dans "Connexions"
3. Ajoutez vos connexions de base de données

## 🧪 Tests

```bash
# Test des connexions activées
node tests/test-enabled-connections.js
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

## 🛡️ Sécurité

- Les mots de passe sont stockés en clair (à améliorer en production)
- Support SSH pour les connexions sécurisées
- Validation des entrées côté serveur

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