# Analyse Avancée - DBExplorer

## Vue d'ensemble

Ce document décrit les nouvelles fonctionnalités d'analyse avancée implémentées dans DBExplorer pour la surveillance et l'optimisation des bases de données.

## 🚀 Nouvelles Fonctionnalités

### 1. Analyse des Index

#### Fonctionnalités
- **Index manquants** : Détection des index recommandés par SQL Server
- **Index inutilisés** : Identification des index non utilisés depuis le redémarrage
- **Usage des index** : Statistiques d'utilisation pour MySQL/MariaDB

#### Requêtes SQL Server
```sql
-- Index manquants
SELECT * FROM sys.dm_db_missing_index_details;

-- Index inutilisés
SELECT * FROM sys.dm_db_index_usage_stats 
WHERE user_seeks = 0 AND user_scans = 0;
```

#### Requêtes MySQL/MariaDB
```sql
-- Usage des index
SELECT * FROM information_schema.STATISTICS 
WHERE TABLE_SCHEMA = 'database_name';
```

### 2. Détection des Verrous et Blocages

#### Fonctionnalités
- **Sessions bloquées** : Identification des requêtes en attente
- **Processus actifs** : Liste des connexions et requêtes en cours
- **Temps d'attente** : Monitoring des blocages longs

#### Requêtes SQL Server
```sql
-- Sessions bloquées
SELECT * FROM sys.dm_exec_requests 
WHERE blocking_session_id > 0;

-- Verrous actifs
SELECT * FROM sys.dm_tran_locks 
WHERE request_status = 'WAIT';
```

#### Requêtes MySQL/MariaDB
```sql
-- Processus actifs
SHOW PROCESSLIST;

-- Statut InnoDB
SHOW ENGINE INNODB STATUS;
```

### 3. Vérification des Sauvegardes

#### Fonctionnalités
- **Historique des sauvegardes** : Dernières sauvegardes par type
- **Logs binaires** : Vérification des logs MySQL
- **Modèle de récupération** : Configuration SQL Server

#### Requêtes SQL Server
```sql
-- Historique des sauvegardes
SELECT database_name, MAX(backup_finish_date) as last_backup
FROM msdb.dbo.backupset 
GROUP BY database_name;
```

#### Requêtes MySQL/MariaDB
```sql
-- Logs binaires
SHOW BINARY LOGS;

-- Statut maître
SHOW MASTER STATUS;
```

## 🛠️ Utilisation

### Interface Web

1. **Accéder à l'analyse** : Menu "Analyse" dans l'interface
2. **Sélectionner une connexion** : Choisir le serveur à analyser
3. **Sélectionner une base** : Choisir la base de données cible
4. **Lancer l'analyse** : Cliquer sur le bouton d'analyse souhaité

### API REST

#### Endpoints Disponibles

```bash
# Analyse des index
GET /api/analysis/index-analysis?connectionId=xxx&databaseName=xxx

# Analyse des verrous
GET /api/analysis/locks-analysis?connectionId=xxx&databaseName=xxx

# Analyse des sauvegardes
GET /api/analysis/backup-analysis?connectionId=xxx&databaseName=xxx
```

#### Exemple de Réponse

```json
{
  "success": true,
  "data": {
    "missingIndexes": [
      {
        "table_name": "Users",
        "equality_columns": "email",
        "inequality_columns": null,
        "included_columns": "id, name",
        "total_usage": 150
      }
    ],
    "unusedIndexes": [
      {
        "table_name": "Products",
        "index_name": "IX_Products_Category",
        "index_type": "NONCLUSTERED",
        "last_user_seek": null
      }
    ]
  },
  "connection": "Production SQL Server",
  "database": "MyDatabase"
}
```

## 📊 Interprétation des Résultats

### Index Manquants (SQL Server)

| Colonne | Description | Action Recommandée |
|---------|-------------|-------------------|
| `equality_columns` | Colonnes pour égalité | Créer index sur ces colonnes |
| `inequality_columns` | Colonnes pour inégalité | Ajouter aux index existants |
| `included_columns` | Colonnes à inclure | Optimiser les requêtes SELECT |
| `total_usage` | Fréquence d'utilisation | Priorité selon l'usage |

### Index Inutilisés

- **Dernière utilisation** : Date de la dernière utilisation
- **Type d'index** : CLUSTERED, NONCLUSTERED, etc.
- **Action** : Considérer la suppression si non critique

### Sessions Bloquées

| Métrique | Seuil | Action |
|----------|-------|--------|
| Temps d'attente | > 30s | ⚠️ Investigation requise |
| Temps d'attente | > 5min | ❌ Intervention immédiate |
| Nombre de sessions | > 10 | ⚠️ Problème de performance |

### Sauvegardes

| Type | Fréquence Recommandée | Alerte |
|------|---------------------|--------|
| Complète | Quotidienne | > 24h |
| Différentielle | 4-6h | > 6h |
| Log | 15-30min | > 1h |

## 🔧 Configuration

### Permissions Requises

#### SQL Server
```sql
-- Permissions minimales
GRANT VIEW SERVER STATE TO [db_user];
GRANT VIEW ANY DEFINITION TO [db_user];
GRANT SELECT ON msdb.dbo.backupset TO [db_user];
```

#### MySQL/MariaDB
```sql
-- Permissions pour l'analyse
GRANT PROCESS ON *.* TO 'db_user'@'%';
GRANT SELECT ON information_schema.* TO 'db_user'@'%';
GRANT REPLICATION CLIENT ON *.* TO 'db_user'@'%';
```

### Variables d'Environnement

```bash
# Seuils d'alerte (optionnel)
ANALYSIS_SLOW_QUERY_THRESHOLD=1000  # ms
ANALYSIS_BLOCKING_THRESHOLD=30000   # ms
ANALYSIS_BACKUP_WARNING_HOURS=24    # heures
```

## 🧪 Tests

### Tests Automatisés

```bash
# Test des fonctionnalités d'analyse
npm run test-analysis

# Test de performance
npm run test-performance
```

### Tests Manuels

```bash
# Test d'une analyse spécifique
curl "http://localhost:5000/api/analysis/index-analysis?connectionId=xxx&databaseName=xxx"

# Test de l'API de performance
curl "http://localhost:5000/api/performance/stats"
```

## 📈 Métriques de Performance

### Temps de Réponse Attendus

| Analyse | SQL Server | MySQL/MariaDB |
|---------|------------|---------------|
| Index manquants | < 2s | < 1s |
| Verrous/blocages | < 1s | < 500ms |
| Sauvegardes | < 3s | < 1s |

### Optimisations

1. **Index sur les vues système** : Améliorer les requêtes d'analyse
2. **Cache des résultats** : Réduire les appels répétés
3. **Pagination** : Gérer les gros volumes de données

## 🚨 Dépannage

### Erreurs Communes

#### "Permission denied"
```bash
# Vérifier les permissions de l'utilisateur
# SQL Server
SELECT IS_SRVROLEMEMBER('sysadmin');

# MySQL
SHOW GRANTS FOR CURRENT_USER();
```

#### "Timeout"
```bash
# Augmenter le timeout dans la configuration
# server/utils/databaseConnector.js
const timeout = 30000; // 30 secondes
```

#### "No data returned"
```bash
# Vérifier que la base de données existe
# Vérifier les permissions sur les vues système
# Vérifier que les données sont disponibles
```

### Logs de Débogage

```javascript
// Activer les logs détaillés
console.log('Analyse des index:', results);
console.log('Temps d\'exécution:', duration);
console.log('Erreurs:', errors);
```

## 🔮 Améliorations Futures

### Fonctionnalités Prévues

1. **Alertes automatiques** : Email/Slack pour les problèmes critiques
2. **Historique des analyses** : Stockage des résultats pour tendances
3. **Recommandations automatiques** : Suggestions d'optimisation
4. **Export des rapports** : PDF, Excel, CSV
5. **Monitoring en temps réel** : WebSockets pour les mises à jour

### Optimisations Techniques

```javascript
// Cache intelligent
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Pagination pour gros volumes
const PAGE_SIZE = 1000;
const MAX_RESULTS = 10000;

// Compression des réponses
app.use(compression());
```

---

**Note** : Ces fonctionnalités d'analyse sont conçues pour aider les DBA à maintenir et optimiser leurs bases de données de manière proactive. 