const express = require('express');
const router = express.Router();
const { DatabaseConnector } = require('../utils/databaseConnector');
const dbConnector = new DatabaseConnector();

// Exécuter une requête sur plusieurs bases de données d'un serveur
router.post('/execute', async (req, res) => {
  try {
    const { connectionId, databases, query, timeout = 30000 } = req.body;

    if (!connectionId || !databases || !query) {
      return res.status(400).json({ 
        error: 'Les paramètres connectionId, databases et query sont requis' 
      });
    }

    if (!Array.isArray(databases) || databases.length === 0) {
      return res.status(400).json({ 
        error: 'La liste des bases de données doit être un tableau non vide' 
      });
    }

    // Validation basique de la requête SQL (optionnel)
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return res.status(400).json({ 
        error: 'La requête SQL ne peut pas être vide' 
      });
    }

    // Récupérer les informations de connexion
    const { db } = require('../database/init');
    
    db.get('SELECT * FROM connections WHERE id = ?', [connectionId], async (err, connection) => {
      if (err) {
        console.error('Erreur lors de la récupération de la connexion:', err);
        return res.status(500).json({ error: err.message });
      }

      if (!connection) {
        return res.status(404).json({ error: 'Connexion non trouvée' });
      }

      if (!connection.enabled) {
        return res.status(400).json({ error: 'La connexion n\'est pas activée' });
      }

      // Configuration de la connexion
      const config = {
        type: connection.type,
        host: connection.host,
        port: connection.port,
        username: connection.username,
        password: connection.password,
        ssh_enabled: Boolean(connection.ssh_enabled),
        ssh_host: connection.ssh_host,
        ssh_port: connection.ssh_port,
        ssh_username: connection.ssh_username,
        ssh_password: connection.ssh_password,
        ssh_private_key: connection.ssh_private_key,
        ssh_key_passphrase: connection.ssh_key_passphrase
      };

      // Exécuter la requête sur chaque base de données
      const results = [];
      const startTime = Date.now();

      // Exécution parallèle avec limitation de concurrence
      const concurrencyLimit = 5; // Limiter à 5 connexions simultanées
      const chunks = [];
      
      for (let i = 0; i < databases.length; i += concurrencyLimit) {
        chunks.push(databases.slice(i, i + concurrencyLimit));
      }

      for (const chunk of chunks) {
        const chunkPromises = chunk.map(async (databaseName) => {
          const queryStartTime = Date.now();
          
          try {
            const databaseConfig = { ...config, database: databaseName };
            
            console.log(`Exécution de la requête sur ${databaseName}...`);
            
            // Exécuter la requête avec timeout
            const queryPromise = dbConnector.executeQuery(databaseConfig, query);
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Timeout de la requête')), timeout);
            });

            const result = await Promise.race([queryPromise, timeoutPromise]);
            
            console.log(`Succès pour ${databaseName}: ${result ? result.length : 0} lignes`);
            
            return {
              database: databaseName,
              success: true,
              data: result,
              executionTime: Date.now() - queryStartTime,
              timestamp: new Date().toISOString()
            };
          } catch (error) {
            console.error(`Erreur pour ${databaseName}:`, error.message);
            
            return {
              database: databaseName,
              success: false,
              error: error.message,
              executionTime: Date.now() - queryStartTime,
              timestamp: new Date().toISOString()
            };
          }
        });

        const chunkResults = await Promise.all(chunkPromises);
        results.push(...chunkResults);
      }

      // Séparer les succès et les erreurs
      const successfulResults = results.filter(r => r.success);
      const failedResults = results.filter(r => !r.success);

      const response = {
        connection: {
          id: connection.id,
          name: connection.name,
          type: connection.type
        },
        query: query,
        totalDatabases: databases.length,
        successfulExecutions: successfulResults.length,
        failedExecutions: failedResults.length,
        totalExecutionTime: Date.now() - startTime,
        results: results,
        summary: {
          successRate: (successfulResults.length / databases.length * 100).toFixed(2) + '%',
          averageExecutionTime: successfulResults.length > 0 
            ? (successfulResults.reduce((sum, r) => sum + r.executionTime, 0) / successfulResults.length).toFixed(2)
            : 0
        }
      };

      res.json(response);
    });

  } catch (error) {
    console.error('Erreur lors de l\'exécution multi-bases:', error);
    res.status(500).json({ error: error.message });
  }
});

// Valider une requête SQL (optionnel)
router.post('/validate', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'La requête SQL est requise' });
    }

    // Validation basique de la requête SQL
    const trimmedQuery = query.trim();
    
    if (!trimmedQuery) {
      return res.status(400).json({ 
        error: 'La requête SQL ne peut pas être vide' 
      });
    }

    res.json({ 
      valid: true, 
      message: 'Requête SQL valide' 
    });

  } catch (error) {
    console.error('Erreur lors de la validation de la requête:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtenir l'historique des requêtes multi-bases (optionnel)
router.get('/history', (req, res) => {
  try {
    const { db } = require('../database/init');
    
    db.all(`
      SELECT 
        id, connection_id, query, databases_count, successful_count, 
        failed_count, total_execution_time, created_at
      FROM multi_query_history 
      ORDER BY created_at DESC 
      LIMIT 50
    `, (err, rows) => {
      if (err) {
        console.error('Erreur lors de la récupération de l\'historique:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    });
  } catch (error) {
    console.error('Erreur inattendue lors de la récupération de l\'historique:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

module.exports = router;
