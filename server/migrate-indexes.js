const { db } = require('./database/init');

// Script de migration pour ajouter les index de performance
async function migrateIndexes() {
  console.log('🚀 Début de la migration des index de performance...');

  const indexes = [
    // Index sur les connexions
    'CREATE INDEX IF NOT EXISTS idx_connections_enabled ON connections(enabled)',
    'CREATE INDEX IF NOT EXISTS idx_connections_type ON connections(type)',
    'CREATE INDEX IF NOT EXISTS idx_connections_name ON connections(name)',
    
    // Index sur les recherches récentes
    'CREATE INDEX IF NOT EXISTS idx_recent_searches_created ON recent_searches(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_recent_searches_connection ON recent_searches(connection_id)',
    
    // Index sur les commentaires
    'CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_comments_updated ON comments(updated_at)'
  ];

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      console.log('📊 Ajout des index de performance...');
      
      let completed = 0;
      const total = indexes.length;

      indexes.forEach((indexSql, index) => {
        db.run(indexSql, (err) => {
          completed++;
          
          if (err) {
            console.error(`❌ Erreur lors de la création de l'index ${index + 1}:`, err.message);
          } else {
            console.log(`✅ Index ${index + 1}/${total} créé avec succès`);
          }

          if (completed === total) {
            console.log('🎉 Migration des index terminée !');
            
            // Afficher les statistiques de la base de données
            db.all("SELECT name FROM sqlite_master WHERE type='index'", (err, rows) => {
              if (err) {
                console.error('Erreur lors de la récupération des index:', err.message);
              } else {
                console.log(`📈 Total des index dans la base de données: ${rows.length}`);
                console.log('📋 Liste des index:');
                rows.forEach(row => {
                  console.log(`  - ${row.name}`);
                });
              }
              resolve();
            });
          }
        });
      });
    });
  });
}

// Fonction pour analyser les performances des requêtes
async function analyzeQueryPerformance() {
  console.log('\n🔍 Analyse des performances des requêtes...');
  
  const queries = [
    {
      name: 'Connexions activées',
      sql: 'SELECT * FROM connections WHERE enabled = 1',
      description: 'Requête optimisée par idx_connections_enabled'
    },
    {
      name: 'Recherches récentes',
      sql: 'SELECT * FROM recent_searches ORDER BY created_at DESC LIMIT 20',
      description: 'Requête optimisée par idx_recent_searches_created'
    },
    {
      name: 'Commentaires par connexion',
      sql: 'SELECT * FROM comments WHERE connection_id = ?',
      description: 'Requête optimisée par idx_comments_connection'
    }
  ];

  return new Promise((resolve) => {
    queries.forEach((query, index) => {
      console.log(`\n📊 Test ${index + 1}: ${query.name}`);
      console.log(`   Description: ${query.description}`);
      
      const startTime = Date.now();
      
      db.all(query.sql, (err, rows) => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        if (err) {
          console.error(`   ❌ Erreur: ${err.message}`);
        } else {
          console.log(`   ✅ Durée: ${duration}ms, Résultats: ${rows.length}`);
        }
        
        if (index === queries.length - 1) {
          console.log('\n🎯 Analyse terminée !');
          resolve();
        }
      });
    });
  });
}

// Exécution de la migration
if (require.main === module) {
  migrateIndexes()
    .then(() => analyzeQueryPerformance())
    .then(() => {
      console.log('\n✨ Migration et analyse terminées avec succès !');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erreur lors de la migration:', error);
      process.exit(1);
    });
}

module.exports = { migrateIndexes, analyzeQueryPerformance }; 