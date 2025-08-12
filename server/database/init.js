const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'dbexplorer.sqlite');
const db = new sqlite3.Database(dbPath);

// Initialisation de la base de données
function initDatabase() {
  return new Promise((resolve, reject) => {
    // Fonction utilitaire pour exécuter une requête SQL avec gestion d'erreur
    const runQuery = (query, params = []) => {
      return new Promise((resolveQuery, rejectQuery) => {
        db.run(query, params, (err) => {
          if (err) {
            console.error('Erreur SQL:', err);
            rejectQuery(err);
          } else {
            resolveQuery();
          }
        });
      });
    };

    // Création des tables et des index de manière séquentielle
    db.serialize(async () => {
      try {
        // Table des connexions
        await runQuery(`
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
        await runQuery(`
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
        await runQuery(`
          CREATE TABLE IF NOT EXISTS recent_searches (
            id TEXT PRIMARY KEY,
            search_term TEXT NOT NULL,
            connection_id TEXT,
            database_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE SET NULL
          )
        `);

        // Table des notes intelligentes
        await runQuery(`
          CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            connection_id TEXT,
            tags TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE SET NULL
          )
        `);

        // Index pour les commentaires
        await runQuery('CREATE INDEX IF NOT EXISTS idx_comments_connection ON comments(connection_id)');
        await runQuery('CREATE INDEX IF NOT EXISTS idx_comments_object ON comments(database_name, object_type, object_name)');
        await runQuery('CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at)');
        await runQuery('CREATE INDEX IF NOT EXISTS idx_comments_updated ON comments(updated_at)');

        // Index pour les recherches
        await runQuery('CREATE INDEX IF NOT EXISTS idx_searches_term ON recent_searches(search_term)');
        await runQuery('CREATE INDEX IF NOT EXISTS idx_recent_searches_created ON recent_searches(created_at)');
        await runQuery('CREATE INDEX IF NOT EXISTS idx_recent_searches_connection ON recent_searches(connection_id)');

        // Index pour les connexions
        await runQuery('CREATE INDEX IF NOT EXISTS idx_connections_enabled ON connections(enabled)');
        await runQuery('CREATE INDEX IF NOT EXISTS idx_connections_type ON connections(type)');
        await runQuery('CREATE INDEX IF NOT EXISTS idx_connections_name ON connections(name)');

        // Index pour les notes
        await runQuery('CREATE INDEX IF NOT EXISTS idx_notes_connection ON notes(connection_id)');
        await runQuery('CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title)');
        await runQuery('CREATE INDEX IF NOT EXISTS idx_notes_content ON notes(content)');
        await runQuery('CREATE INDEX IF NOT EXISTS idx_notes_tags ON notes(tags)');
        await runQuery('CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at)');
        await runQuery('CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at)');

        // Migrations
        try {
          await runQuery('ALTER TABLE connections ADD COLUMN ssh_key_passphrase TEXT');
        } catch (err) {
          if (!err.message.includes('duplicate column name')) {
            throw err;
          }
        }

        try {
          await runQuery('ALTER TABLE connections ADD COLUMN enabled BOOLEAN DEFAULT 1');
        } catch (err) {
          if (!err.message.includes('duplicate column name')) {
            throw err;
          }
        }

        console.log('Base de données initialisée avec succès');
        resolve();
      } catch (error) {
        console.error('Erreur lors de l\'initialisation de la base de données:', error);
        reject(error);
      }
    });
  });
}

module.exports = { db, initDatabase };