# Optimisations de Performance - DBExplorer

## Vue d'ensemble

Ce document décrit les optimisations de performance implémentées dans DBExplorer pour améliorer les temps de réponse et la scalabilité de l'application.

## 🚀 Améliorations Implémentées

### 1. Index de Performance SQLite

#### Index Ajoutés

```sql
-- Index sur les connexions
CREATE INDEX idx_connections_enabled ON connections(enabled);
CREATE INDEX idx_connections_type ON connections(type);
CREATE INDEX idx_connections_name ON connections(name);

-- Index sur les recherches récentes
CREATE INDEX idx_recent_searches_created ON recent_searches(created_at);
CREATE INDEX idx_recent_searches_connection ON recent_searches(connection_id);

-- Index sur les commentaires
CREATE INDEX idx_comments_created ON comments(created_at);
CREATE INDEX idx_comments_updated ON comments(updated_at);
```

#### Impact des Index

| Index | Requête Optimisée | Amélioration Attendue |
|-------|------------------|---------------------|
| `idx_connections_enabled` | `SELECT * FROM connections WHERE enabled = 1` | 80-90% |
| `idx_connections_name` | `SELECT * FROM connections ORDER BY name` | 70-80% |
| `idx_recent_searches_created` | `SELECT * FROM recent_searches ORDER BY created_at DESC` | 85-95% |
| `idx_comments_connection` | `SELECT * FROM comments WHERE connection_id = ?` | 75-85% |

### 2. Monitoring des Performances

#### Fonctionnalités

- **Mesure automatique** des temps de réponse
- **Détection des requêtes lentes** (>100ms par défaut)
- **Statistiques en temps réel** (min, max, moyenne)
- **Recommandations automatiques** d'optimisation
- **API REST** pour accéder aux métriques

#### Métriques Collectées

```javascript
{
  queryName: "Connexions activées",
  count: 150,
  avgDuration: 45,
  minDuration: 12,
  maxDuration: 89,
  slowQueries: 3,
  slowQueryPercentage: 2,
  errors: 0,
  errorPercentage: 0,
  avgResults: 5
}
```

### 3. API de Performance

#### Endpoints Disponibles

```bash
# Statistiques générales
GET /api/performance/stats

# Analyse des index
POST /api/performance/analyze-indexes

# Rapport détaillé
GET /api/performance/report

# Mesure d'une requête spécifique
POST /api/performance/measure
{
  "queryName": "Test requête",
  "sql": "SELECT * FROM connections WHERE enabled = 1",
  "params": []
}

# Réinitialisation des statistiques
POST /api/performance/reset
```

## 🛠️ Utilisation

### Migration des Index

```bash
# Appliquer les index de performance
npm run migrate-indexes

# Ou directement
cd server && node migrate-indexes.js
```

### Tests de Performance

```bash
# Lancer les tests de performance
npm run test-performance

# Ou directement
node tests/test-performance.js
```

### Monitoring en Temps Réel

```bash
# Obtenir les statistiques
curl http://localhost:5000/api/performance/stats

# Analyser les index
curl -X POST http://localhost:5000/api/performance/analyze-indexes

# Rapport complet
curl http://localhost:5000/api/performance/report
```

## 📊 Métriques de Performance

### Seuils de Performance

| Métrique | Seuil | Action |
|----------|-------|--------|
| Durée moyenne | < 50ms | ✅ Optimal |
| Durée moyenne | 50-100ms | ⚠️ Acceptable |
| Durée moyenne | > 100ms | ❌ Requiert optimisation |
| Requêtes lentes | > 10% | ⚠️ Attention |
| Erreurs | > 5% | ❌ Critique |

### Recommandations Automatiques

Le système génère automatiquement des recommandations basées sur :

1. **Requêtes lentes** (>10% de requêtes lentes)
2. **Erreurs fréquentes** (>5% d'erreurs)
3. **Fort volume** (>100 exécutions)
4. **Temps de réponse élevés** (>100ms en moyenne)

## 🔧 Configuration

### Seuil de Requête Lente

```javascript
// Dans server/utils/performanceMonitor.js
this.slowQueryThreshold = 100; // ms
```

### Index Personnalisés

```javascript
// Dans server/database/init.js
// Ajouter vos index personnalisés ici
db.run('CREATE INDEX IF NOT EXISTS idx_custom ON table_name(column_name)');
```

## 📈 Résultats Attendus

### Avant Optimisation

```
Connexions activées: 150ms
Recherches récentes: 200ms
Commentaires: 180ms
```

### Après Optimisation

```
Connexions activées: 15ms (90% d'amélioration)
Recherches récentes: 20ms (90% d'amélioration)
Commentaires: 25ms (86% d'amélioration)
```

## 🚨 Dépannage

### Index Non Créés

```bash
# Vérifier les index existants
cd server
node -e "
const { db } = require('./database/init');
db.all('SELECT name FROM sqlite_master WHERE type=\"index\"', (err, rows) => {
  if (err) console.error(err);
  else console.log('Index:', rows.map(r => r.name));
});
"
```

### Performances Dégradées

1. **Vérifier les index** : `npm run migrate-indexes`
2. **Analyser les requêtes** : `npm run test-performance`
3. **Consulter les logs** : Vérifier les erreurs dans la console
4. **Réinitialiser les stats** : `POST /api/performance/reset`

### Erreurs de Migration

```bash
# Nettoyer et recréer la base
rm server/database/dbexplorer.sqlite
cd server && node init-db.js
npm run migrate-indexes
```

## 🔮 Améliorations Futures

### Fonctionnalités Prévues

1. **Cache Redis** pour les requêtes fréquentes
2. **Compression des réponses** JSON
3. **Pagination optimisée** pour les gros volumes
4. **Monitoring en temps réel** avec WebSockets
5. **Alertes automatiques** par email/Slack

### Optimisations Avancées

```javascript
// Cache des requêtes fréquentes
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Compression des réponses
app.use(compression());

// Pagination optimisée
const ITEMS_PER_PAGE = 50;
```

## 📚 Références

- [SQLite Indexing](https://www.sqlite.org/optoverview.html)
- [Node.js Performance](https://nodejs.org/en/docs/guides/performance/)
- [Express.js Best Practices](https://expressjs.com/en/advanced/best-practices-performance.html)

---

**Note** : Ces optimisations sont conçues pour améliorer significativement les performances de DBExplorer tout en maintenant la compatibilité avec les fonctionnalités existantes. 