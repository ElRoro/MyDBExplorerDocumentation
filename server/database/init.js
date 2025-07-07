const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'dbexplorer.sqlite');
const db = new sqlite3.Database(dbPath);

// Initialisation de la base de données
function initDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Table des connexions
      db.run(`
        CREATE TABLE IF NOT EXISTS connections (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('sqlserver', 'mysql', 'mariadb')),
          host TEXT NOT NULL,
          port INTEGER NOT NULL,
          username TEXT NOT NULL,
          password TEXT,
          database TEXT,
          enabled BOOLEAN DEFAULT 1,
          ssh_enabled BOOLEAN DEFAULT 0,
          ssh_host TEXT,
          ssh_port INTEGER DEFAULT 22,
          ssh_username TEXT,
          ssh_password TEXT,
          ssh_private_key TEXT,
          ssh_key_passphrase TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Table des commentaires
      db.run(`
        CREATE TABLE IF NOT EXISTS comments (
          id TEXT PRIMARY KEY,
          connection_id TEXT NOT NULL,
          database_name TEXT NOT NULL,
          object_type TEXT NOT NULL,
          object_name TEXT NOT NULL,
          schema_name TEXT,
          comment TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
        )
      `);

      // Table des recherches récentes
      db.run(`
        CREATE TABLE IF NOT EXISTS recent_searches (
          id TEXT PRIMARY KEY,
          search_term TEXT NOT NULL,
          connection_id TEXT,
          database_name TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE SET NULL
        )
      `);

      // Index pour améliorer les performances
      db.run('CREATE INDEX IF NOT EXISTS idx_comments_connection ON comments(connection_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_comments_object ON comments(database_name, object_type, object_name)');
      db.run('CREATE INDEX IF NOT EXISTS idx_searches_term ON recent_searches(search_term)');

      // Migration : ajouter la colonne ssh_key_passphrase si elle n'existe pas
      db.run(`
        ALTER TABLE connections 
        ADD COLUMN ssh_key_passphrase TEXT
      `, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.error('Erreur lors de l\'ajout de la colonne ssh_key_passphrase:', err);
        }
      });

      // Migration : ajouter la colonne enabled si elle n'existe pas
      db.run(`
        ALTER TABLE connections 
        ADD COLUMN enabled BOOLEAN DEFAULT 1
      `, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.error('Erreur lors de l\'ajout de la colonne enabled:', err);
        }
      });

      console.log('Base de données initialisée avec succès');
      resolve();
    });
  });
}

module.exports = { db, initDatabase }; 