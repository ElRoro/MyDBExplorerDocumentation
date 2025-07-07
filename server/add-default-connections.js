const { v4: uuidv4 } = require('uuid');
const { db, initDatabase } = require('./database/init');

const defaultConnections = [
  {
    name: "srv04",
    type: "sqlserver",
    host: "srv04",
    port: 1433,
    username: "admin2",
    password: "#3apollo",
    database: "SSISDB",
    ssh_enabled: false
  },
  {
    name: "srv16",
    type: "sqlserver",
    host: "srv16",
    port: null,
    username: "admin2",
    password: "#3apollo",
    database: "SSISDB",
    ssh_enabled: false
  },
  {
    name: "srv12",
    type: "sqlserver",
    host: "srv12",
    port: null,
    username: "admin2",
    password: "#3apollo",
    database: "SSISDB",
    ssh_enabled: false
  },
  {
    name: "srv-ems-sql",
    type: "sqlserver",
    host: "srv-ems-sql",
    port: null,
    username: "EMS_DB_REPLICATION",
    password: "EMS_repl_DB_2016$",
    database: "SSISDB",
    ssh_enabled: false
  }
];

function addDefaultConnections() {
  db.serialize(() => {
    defaultConnections.forEach((conn) => {
      db.get('SELECT * FROM connections WHERE name = ?', [conn.name], (err, row) => {
        if (err) {
          console.error('Erreur lors de la vérification de la connexion', conn.name, err);
          return;
        }
        if (!row) {
          const id = uuidv4();
          db.run(
            `INSERT INTO connections (id, name, type, host, port, username, password) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, conn.name, conn.type, conn.host, conn.port, conn.username, conn.password],
            (err) => {
              if (err) {
                console.error('Erreur lors de l\'insertion de la connexion', conn.name, err);
              } else {
                console.log('Connexion par défaut ajoutée :', conn.name);
              }
            }
          );
        } else {
          console.log('Connexion déjà existante :', conn.name);
        }
      });
    });
  });
}

// Vérifier si des connexions existent déjà
async function checkExistingConnections() {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM connections', (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row.count);
      }
    });
  });
}

async function main() {
  try {
    // Initialiser la base de données si elle n'existe pas
    console.log('Initialisation de la base de données...');
    await initDatabase();
    
    const existingCount = await checkExistingConnections();
    
    if (existingCount > 0) {
      console.log(`⚠️ ${existingCount} connexion(s) existante(s) détectée(s)`);
      const response = process.argv.includes('--force');
      if (!response) {
        console.log('Utilisez --force pour forcer l\'ajout des connexions par défaut');
        process.exit(0);
      }
    }
    
    addDefaultConnections();
    process.exit(0);
  } catch (error) {
    console.error('Erreur:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { addDefaultConnections }; 