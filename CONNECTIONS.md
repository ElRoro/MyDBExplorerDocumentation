# Configuration des Connexions

## Vue d'ensemble

Ce projet utilise un fichier `connections.json` externe pour stocker les connexions de base de données. Cela permet de :

- ✅ Garder les informations sensibles hors du code source
- ✅ Personnaliser les connexions selon l'environnement
- ✅ Éviter de commiter des mots de passe sur GitHub
- ✅ Faciliter le déploiement sur différents environnements

## Configuration

### 1. Fichier connections.json

Le fichier `connections.json` doit être placé à la racine du projet et avoir la structure suivante :

```json
{
  "connections": [
    {
      "name": "Nom de la connexion",
      "type": "sqlserver|mysql|mariadb",
      "host": "adresse_du_serveur",
      "port": 1433,
      "username": "nom_utilisateur",
      "password": "mot_de_passe",
      "database": "base_de_donnees",
      "ssh_enabled": false
    }
  ]
}
```

### 2. Types de base de données supportés

- **sqlserver** : Microsoft SQL Server
- **mysql** : MySQL
- **mariadb** : MariaDB

### 3. Exemple de configuration

```json
{
  "connections": [
    {
      "name": "Production SQL Server",
      "type": "sqlserver",
      "host": "srv-prod.company.com",
      "port": 1433,
      "username": "db_user",
      "password": "secure_password",
      "database": "master",
      "ssh_enabled": false
    },
    {
      "name": "Développement MySQL",
      "type": "mysql",
      "host": "localhost",
      "port": 3306,
      "username": "dev_user",
      "password": "dev_password",
      "database": "information_schema",
      "ssh_enabled": false
    }
  ]
}
```

## Installation

### Première utilisation

1. **Cloner le projet** :
   ```bash
   git clone <url_du_repo>
   cd BestDBDocumentation
   ```

2. **Installer les dépendances** :
   ```bash
   npm run install-all
   ```

3. **Créer le fichier connections.json** :
   - Le fichier sera automatiquement créé avec des exemples lors de la première exécution
   - Modifiez-le avec vos vraies connexions

4. **Ajouter les connexions** :
   ```bash
   cd server
   node add-default-connections.js
   ```

### Ajout de nouvelles connexions

1. **Modifier connections.json** avec vos nouvelles connexions
2. **Exécuter le script** :
   ```bash
   cd server
   node add-default-connections.js --force
   ```

## Sécurité

### Fichiers ignorés

Le fichier `connections.json` est automatiquement ajouté au `.gitignore` pour éviter qu'il soit commité sur GitHub.

### Bonnes pratiques

- ✅ Utilisez des mots de passe forts
- ✅ Limitez les permissions des utilisateurs de base de données
- ✅ Utilisez des connexions dédiées pour l'application
- ✅ Changez les mots de passe régulièrement
- ❌ Ne commitez jamais le fichier `connections.json`
- ❌ N'utilisez pas de comptes administrateur

## Dépannage

### Erreur "Fichier connections.json non trouvé"

Le script créera automatiquement un fichier d'exemple. Modifiez-le avec vos connexions.

### Erreur "Format invalide"

Vérifiez que votre fichier JSON a la structure correcte avec un tableau `connections`.

### Connexions non ajoutées

- Vérifiez que les connexions n'existent pas déjà
- Utilisez `--force` pour forcer l'ajout
- Vérifiez les logs pour les erreurs de connexion

## Variables d'environnement (Optionnel)

Pour une sécurité renforcée, vous pouvez utiliser des variables d'environnement :

```bash
# Dans .env (non commité)
DB_HOST=srv-prod.company.com
DB_USER=db_user
DB_PASSWORD=secure_password
```

Puis modifier le script pour lire ces variables si elles existent. 