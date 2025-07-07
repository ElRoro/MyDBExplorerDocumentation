const { initDatabase } = require('./database/init');

async function main() {
  try {
    console.log('Initialisation de la base de données...');
    await initDatabase();
    console.log('Base de données initialisée avec succès !');
    process.exit(0);
  } catch (error) {
    console.error('Erreur lors de l\'initialisation de la base de données:', error);
    process.exit(1);
  }
}

main(); 