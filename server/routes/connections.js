const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database/init');
const { DatabaseConnector } = require('../utils/databaseConnector');
const dbConnector = new DatabaseConnector();

// Validation utilitaire
function validateConnectionData({ name, type, host, port, username }) {
  if (!name || !type || !host || !port || !username) {
    return 'Tous les champs obligatoires doivent être remplis';
  }
  const validTypes = ['sqlserver', 'mysql', 'mariadb'];
  if (!validTypes.includes(type)) {
    return `Type de base de données invalide. Types supportés: ${validTypes.join(', ')}`;
  }
  const portNum = parseInt(port);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    return 'Port invalide. Doit être un nombre entre 1 et 65535';
  }
  return null;
}

// Obtenir toutes les connexions
router.get('/', (req, res) => {
  try {
    db.all('SELECT * FROM connections ORDER BY name', (err, rows) => {
      if (err) {
        console.error('Erreur lors de la récupération des connexions:', err);
        return res.status(500).json({ error: err.message });
      }
      // Convertir les valeurs enabled en booléens
      const connections = rows.map(row => ({
        ...row,
        enabled: Boolean(row.enabled),
        ssh_enabled: Boolean(row.ssh_enabled)
      }));
      res.json(connections);
    });
  } catch (error) {
    console.error('Erreur inattendue (GET /):', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Obtenir seulement les connexions activées
router.get('/active', (req, res) => {
  try {
    db.all('SELECT * FROM connections WHERE enabled = 1 ORDER BY name', (err, rows) => {
      if (err) {
        console.error('Erreur lors de la récupération des connexions activées:', err);
        return res.status(500).json({ error: err.message });
      }
      // Convertir les valeurs enabled en booléens
      const connections = rows.map(row => ({
        ...row,
        enabled: Boolean(row.enabled),
        ssh_enabled: Boolean(row.ssh_enabled)
      }));
      res.json(connections);
    });
  } catch (error) {
    console.error('Erreur inattendue (GET /active):', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Obtenir une connexion par ID
router.get('/:id', (req, res) => {
  try {
    db.get('SELECT * FROM connections WHERE id = ?', [req.params.id], (err, row) => {
      if (err) {
        console.error('Erreur lors de la récupération de la connexion:', err);
        return res.status(500).json({ error: err.message });
      }
      if (!row) {
        return res.status(404).json({ error: 'Connexion non trouvée' });
      }
      // Convertir les valeurs enabled en booléens
      const connection = {
        ...row,
        enabled: Boolean(row.enabled),
        ssh_enabled: Boolean(row.ssh_enabled)
      };
      res.json(connection);
    });
  } catch (error) {
    console.error('Erreur inattendue (GET /:id):', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Créer une nouvelle connexion
router.post('/', (req, res) => {
  try {
    const data = req.body;
    const validationError = validateConnectionData(data);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }
    const {
      name, type, host, port, username, password, database,
      enabled, ssh_enabled, ssh_host, ssh_port, ssh_username, ssh_password, ssh_private_key, ssh_key_passphrase
    } = data;
    const id = uuidv4();
    const sql = `
      INSERT INTO connections (
        id, name, type, host, port, username, password, database,
        enabled, ssh_enabled, ssh_host, ssh_port, ssh_username, ssh_password, ssh_private_key, ssh_key_passphrase
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      id, name, type, host, port, username, password, database,
      enabled !== undefined ? (enabled ? 1 : 0) : 1, ssh_enabled ? 1 : 0, ssh_host, ssh_port, ssh_username, ssh_password, ssh_private_key, ssh_key_passphrase
    ];
    db.run(sql, params, function(err) {
      if (err) {
        console.error('Erreur lors de la création de la connexion:', err);
        return res.status(500).json({ error: `Erreur lors de la création: ${err.message}` });
      }
      db.get('SELECT * FROM connections WHERE id = ?', [id], (err, row) => {
        if (err) {
          console.error('Erreur lors de la récupération de la connexion créée:', err);
          return res.status(500).json({ error: `Erreur lors de la récupération: ${err.message}` });
        }
        // Convertir les valeurs enabled en booléens
        const connection = {
          ...row,
          enabled: Boolean(row.enabled),
          ssh_enabled: Boolean(row.ssh_enabled)
        };
        res.status(201).json(connection);
      });
    });
  } catch (error) {
    console.error('Erreur inattendue lors de la création de la connexion:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Mettre à jour une connexion
router.put('/:id', (req, res) => {
  try {
    const data = req.body;
    const validationError = validateConnectionData(data);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }
    const {
      name, type, host, port, username, password, database,
      enabled, ssh_enabled, ssh_host, ssh_port, ssh_username, ssh_password, ssh_private_key, ssh_key_passphrase
    } = data;
    const sql = `
      UPDATE connections SET 
        name = ?, type = ?, host = ?, port = ?, username = ?, password = ?, database = ?,
        enabled = ?, ssh_enabled = ?, ssh_host = ?, ssh_port = ?, ssh_username = ?, ssh_password = ?, ssh_private_key = ?, ssh_key_passphrase = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    const params = [
      name, type, host, port, username, password, database,
      enabled !== undefined ? (enabled ? 1 : 0) : 1, ssh_enabled ? 1 : 0, ssh_host, ssh_port, ssh_username, ssh_password, ssh_private_key, ssh_key_passphrase,
      req.params.id
    ];
    db.run(sql, params, function(err) {
      if (err) {
        console.error('Erreur lors de la mise à jour de la connexion:', err);
        return res.status(500).json({ error: `Erreur lors de la mise à jour: ${err.message}` });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Connexion non trouvée' });
      }
      db.get('SELECT * FROM connections WHERE id = ?', [req.params.id], (err, row) => {
        if (err) {
          console.error('Erreur lors de la récupération de la connexion mise à jour:', err);
          return res.status(500).json({ error: `Erreur lors de la récupération: ${err.message}` });
        }
        // Convertir les valeurs enabled en booléens
        const connection = {
          ...row,
          enabled: Boolean(row.enabled),
          ssh_enabled: Boolean(row.ssh_enabled)
        };
        res.json(connection);
      });
    });
  } catch (error) {
    console.error('Erreur inattendue lors de la mise à jour de la connexion:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Supprimer une connexion
router.delete('/:id', (req, res) => {
  try {
    db.run('DELETE FROM connections WHERE id = ?', [req.params.id], function(err) {
      if (err) {
        console.error('Erreur lors de la suppression de la connexion:', err);
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Connexion non trouvée' });
      }
      res.json({ message: 'Connexion supprimée avec succès' });
    });
  } catch (error) {
    console.error('Erreur inattendue lors de la suppression de la connexion:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Tester une connexion
router.post('/:id/test', async (req, res) => {
  db.get('SELECT * FROM connections WHERE id = ?', [req.params.id], async (err, connection) => {
    if (err) {
      console.error('Erreur lors de la récupération de la connexion pour test:', err);
      return res.status(500).json({ error: err.message });
    }
    if (!connection) {
      return res.status(404).json({ error: 'Connexion non trouvée' });
    }
    try {
      const result = await dbConnector.testConnection(connection);
      res.json(result);
    } catch (error) {
      console.error('Erreur lors du test de connexion:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// Obtenir les bases de données d'une connexion
router.get('/:id/databases', async (req, res) => {
  const connectionId = req.params.id;
      // Récupération des bases de données pour la connexion
  db.get('SELECT * FROM connections WHERE id = ?', [connectionId], async (err, connection) => {
    if (err) {
      console.error('Erreur lors de la récupération de la connexion:', err);
      return res.status(500).json({ error: err.message });
    }
    if (!connection) {
      console.error('Connexion non trouvée pour l\'ID:', connectionId);
      return res.status(404).json({ error: 'Connexion non trouvée' });
    }
    
      // Connexion trouvée
    
    try {
      // Tentative de récupération des bases de données
      const databases = await dbConnector.getDatabases(connection);
      // Bases de données récupérées avec succès
      res.json(databases);
    } catch (error) {
      console.error('Erreur détaillée lors de la récupération des bases de données:', error);
      console.error('Stack trace:', error.stack);
      res.status(500).json({ error: error.message });
    }
  });
});

// Nouvelle route : Obtenir les informations techniques d'une connexion
router.get('/:id/info', async (req, res) => {
  const connectionId = req.params.id;
  const { DatabaseConnector } = require('../utils/databaseConnector');
  const dbConnector = new DatabaseConnector();
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database(require('path').join(__dirname, '../database/dbexplorer.sqlite'));

  db.get('SELECT * FROM connections WHERE id = ?', [connectionId], async (err, connection) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!connection) {
      return res.status(404).json({ error: 'Connexion non trouvée' });
    }
    try {
      // Construction de la config
      const config = {
        type: connection.type,
        host: connection.host,
        port: connection.port,
        username: connection.username,
        password: connection.password,
        database: connection.database,
        ssh_enabled: connection.ssh_enabled,
        ssh_host: connection.ssh_host,
        ssh_port: connection.ssh_port,
        ssh_username: connection.ssh_username,
        ssh_password: connection.ssh_password,
        ssh_private_key: connection.ssh_private_key,
        ssh_key_passphrase: connection.ssh_key_passphrase
      };
      // 1. Version SGBD
      let version = null;
      try {
        version = await dbConnector.getServerVersion(config);
      } catch (e) {
        version = 'Inconnue';
      }
      // 2. Bases de données
      let databases = [];
      try {
        databases = await dbConnector.getDatabases(config);
      } catch (e) {
        databases = [];
      }
      // 3. Pour chaque base, récupérer volume et tables
      let totalVolumeMb = 0;
      let basesDetails = [];
      for (const dbName of databases) {
        let baseVolumeMb = 0;
        let tables = [];
        let avgBackupVariation = null;
        try {
          tables = await dbConnector.getTablesWithStats(config, dbName);
          baseVolumeMb = tables.reduce((sum, t) => sum + (t.size_mb || 0), 0);
        } catch (e) {
          tables = [];
        }
        // Ajout de la stat de variation sauvegarde (SQL Server uniquement)
        try {
          avgBackupVariation = await dbConnector.getBackupVariationAvg(config, dbName);
        } catch (e) {
          avgBackupVariation = null;
        }
        // Base analysée avec succès
        totalVolumeMb += baseVolumeMb;
        basesDetails.push({
          name: dbName,
          volume_mb: baseVolumeMb,
          tables_count: tables.length,
          tables: tables,
          avg_backup_variation_pourcent: avgBackupVariation
        });
      }
      res.json({
        connection: {
          id: connection.id,
          name: connection.name,
          type: connection.type
        },
        version,
        databases_count: databases.length,
        total_volume_mb: totalVolumeMb,
        databases: basesDetails
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
});

// Basculer l'état d'activation d'une connexion
router.patch('/:id/toggle', (req, res) => {
  try {
    db.get('SELECT enabled FROM connections WHERE id = ?', [req.params.id], (err, row) => {
      if (err) {
        console.error('Erreur lors de la récupération de l\'état de la connexion:', err);
        return res.status(500).json({ error: err.message });
      }
      if (!row) {
        return res.status(404).json({ error: 'Connexion non trouvée' });
      }
      
      const newEnabled = row.enabled ? 0 : 1;
      db.run('UPDATE connections SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
        [newEnabled, req.params.id], function(err) {
        if (err) {
          console.error('Erreur lors de la mise à jour de l\'état de la connexion:', err);
          return res.status(500).json({ error: err.message });
        }
        
        db.get('SELECT * FROM connections WHERE id = ?', [req.params.id], (err, updatedRow) => {
          if (err) {
            console.error('Erreur lors de la récupération de la connexion mise à jour:', err);
            return res.status(500).json({ error: err.message });
          }
          // Convertir les valeurs enabled en booléens
          const connection = {
            ...updatedRow,
            enabled: Boolean(updatedRow.enabled),
            ssh_enabled: Boolean(updatedRow.ssh_enabled)
          };
          res.json(connection);
        });
      });
    });
  } catch (error) {
    console.error('Erreur inattendue lors du basculement de l\'état:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

module.exports = router; 