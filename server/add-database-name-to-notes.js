const { db } = require('./database/init');

async function addDatabaseNameToNotes() {
  return new Promise((resolve, reject) => {
    db.run(`
      ALTER TABLE notes 
      ADD COLUMN database_name TEXT
    `, (err) => {
      if (err) {
        if (err.message.includes('duplicate column name')) {
          console.log('La colonne database_name existe déjà.');
          resolve();
        } else {
          console.error('Erreur lors de l\'ajout de la colonne database_name:', err);
          reject(err);
        }
      } else {
        console.log('Colonne database_name ajoutée avec succès !');
        resolve();
      }
    });
  });
}

addDatabaseNameToNotes()
  .then(() => {
    console.log('Migration terminée.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Erreur lors de la migration:', err);
    process.exit(1);
  });
