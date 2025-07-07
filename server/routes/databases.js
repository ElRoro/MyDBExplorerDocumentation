const express = require('express');
const router = express.Router();
const { db } = require('../database/init');
const databaseConnector = require('../utils/databaseConnector');

// Obtenir toutes les bases de données pour toutes les connexions
router.get('/', async (req, res) => {
  try {
    const connections = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM connections ORDER BY name', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const result = [];

    for (const connection of connections) {
      try {
        const databases = await databaseConnector.getDatabases(connection);
        result.push({
          connection_id: connection.id,
          connection_name: connection.name,
          connection_type: connection.type,
          databases: databases
        });
      } catch (error) {
        console.error(`Erreur lors de la récupération des bases de données pour ${connection.name}:`, error.message);
        result.push({
          connection_id: connection.id,
          connection_name: connection.name,
          connection_type: connection.type,
          databases: [],
          error: error.message
        });
      }
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtenir les bases de données pour une connexion spécifique
router.get('/connection/:connectionId', async (req, res) => {
  try {
    const connection = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM connections WHERE id = ?', [req.params.connectionId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!connection) {
      return res.status(404).json({ error: 'Connexion non trouvée' });
    }

    const databases = await databaseConnector.getDatabases(connection);
    
    res.json({
      connection_id: connection.id,
      connection_name: connection.name,
      connection_type: connection.type,
      databases: databases
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtenir les statistiques des bases de données
router.get('/stats', async (req, res) => {
  try {
    const connections = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM connections ORDER BY name', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const stats = {
      total_connections: connections.length,
      total_databases: 0,
      databases_by_connection: [],
      databases_by_type: {
        sqlserver: 0,
        mysql: 0,
        mariadb: 0
      }
    };

    for (const connection of connections) {
      try {
        const databases = await databaseConnector.getDatabases(connection);
        stats.total_databases += databases.length;
        stats.databases_by_connection.push({
          connection_id: connection.id,
          connection_name: connection.name,
          connection_type: connection.type,
          database_count: databases.length
        });
        stats.databases_by_type[connection.type] += databases.length;
      } catch (error) {
        console.error(`Erreur lors de la récupération des statistiques pour ${connection.name}:`, error.message);
      }
    }

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router; 