const { db } = require('./database/init');

async function initNotesTable() {
  return new Promise((resolve, reject) => {
    // Création de la table notes
    db.run(`
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
    `, (err) => {
      if (err) {
        console.error('Erreur lors de la création de la table notes:', err);
        reject(err);
        return;
      }

      // Création des index pour la table notes
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_notes_connection ON notes(connection_id)',
        'CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title)',
        'CREATE INDEX IF NOT EXISTS idx_notes_content ON notes(content)',
        'CREATE INDEX IF NOT EXISTS idx_notes_tags ON notes(tags)',
        'CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at)',
        'CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at)'
      ];

      let completed = 0;
      let hasError = false;

      indexes.forEach(indexSql => {
        db.run(indexSql, (err) => {
          if (err && !hasError) {
            console.error('Erreur lors de la création des index:', err);
            hasError = true;
            reject(err);
            return;
          }

          completed++;
          if (completed === indexes.length && !hasError) {
            console.log('Table notes et index créés avec succès !');
            resolve();
          }
        });
      });
    });
  });
}

initNotesTable()
  .then(() => {
    console.log('Initialisation terminée.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Erreur lors de l\'initialisation:', err);
    process.exit(1);
  });
