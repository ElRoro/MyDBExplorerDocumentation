const { v4: uuidv4 } = require('uuid');
const { db, initDatabase } = require('./database/init');
const fs = require('fs');
const path = require('path');

function loadConnectionsFromFile() {
  try {
    const connectionsPath = path.join(__dirname, '..', 'connections.json');
    
    if (!fs.existsSync(connectionsPath)) {
      console.log('⚠️ Fichier connections.json non trouvé. Création d\'un fichier d\'exemple...');
      const exampleConnections = {
        connections: [
  {
            name: "exemple-sqlserver",
    type: "sqlserver",
            host: "localhost",
    port: 1433,
            username: "sa",
            password: "votre_mot_de_passe",
            database: "master",
    ssh_enabled: false
  },
  {
            name: "exemple-mysql",
            type: "mysql",
            host: "localhost",
            port: 3306,
            username: "root",
            password: "votre_mot_de_passe",
            database: "information_schema",
    ssh_enabled: false
  }
        ]
      };
      
      fs.writeFileSync(connectionsPath, JSON.stringify(exampleConnections, null, 2));
      console.log('✅ Fichier connections.json créé avec des exemples. Veuillez le modifier avec vos connexions.');
      return [];
    }
    
    const data = fs.readFileSync(connectionsPath, 'utf8');
    const config = JSON.parse(data);
    
    if (!config.connections || !Array.isArray(config.connections)) {
      console.error('❌ Format invalide dans connections.json. Le fichier doit contenir un tableau "connections".');
      return [];
    }
    
    console.log(`📁 Chargement de ${config.connections.length} connexion(s) depuis connections.json`);
    return config.connections;
  } catch (error) {
    console.error('❌ Erreur lors du chargement du fichier connections.json:', error.message);
    return [];
  }
}

function addDefaultConnections() {
  const defaultConnections = loadConnectionsFromFile();
  
  if (defaultConnections.length === 0) {
    console.log('ℹ️ Aucune connexion à ajouter. Vérifiez le fichier connections.json');
    return;
  }
  
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
                console.log('✅ Connexion ajoutée :', conn.name);
              }
            }
          );
        } else {
          console.log('ℹ️ Connexion déjà existante :', conn.name);
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
    console.log('🔧 Initialisation de la base de données...');
    await initDatabase();
    
    const existingCount = await checkExistingConnections();
    
    if (existingCount > 0) {
      console.log(`⚠️ ${existingCount} connexion(s) existante(s) détectée(s)`);
      const response = process.argv.includes('--force');
      if (!response) {
        console.log('💡 Utilisez --force pour forcer l\'ajout des connexions depuis connections.json');
        process.exit(0);
      }
    }
    
    addDefaultConnections();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { addDefaultConnections }; 