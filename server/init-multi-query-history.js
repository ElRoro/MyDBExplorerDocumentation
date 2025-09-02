const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database/dbexplorer.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('Initialisation de la table multi_query_history...');

db.serialize(() => {
  // Créer la table multi_query_history si elle n'existe pas
  db.run(`
    CREATE TABLE IF NOT EXISTS multi_query_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      connection_id TEXT NOT NULL,
      query TEXT NOT NULL,
      databases_count INTEGER NOT NULL,
      successful_count INTEGER NOT NULL,
      failed_count INTEGER NOT NULL,
      total_execution_time INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (connection_id) REFERENCES connections(id)
    )
  `, (err) => {
    if (err) {
      console.error('Erreur lors de la création de la table multi_query_history:', err);
    } else {
      console.log('Table multi_query_history créée avec succès');
    }
  });

  // Créer un index sur connection_id pour améliorer les performances
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_multi_query_history_connection_id 
    ON multi_query_history(connection_id)
  `, (err) => {
    if (err) {
      console.error('Erreur lors de la création de l\'index:', err);
    } else {
      console.log('Index créé avec succès');
    }
  });

  // Créer un index sur created_at pour le tri chronologique
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_multi_query_history_created_at 
    ON multi_query_history(created_at DESC)
  `, (err) => {
    if (err) {
      console.error('Erreur lors de la création de l\'index created_at:', err);
    } else {
      console.log('Index created_at créé avec succès');
    }
  });
});

db.close((err) => {
  if (err) {
    console.error('Erreur lors de la fermeture de la base de données:', err);
  } else {
    console.log('Base de données fermée avec succès');
  }
});
