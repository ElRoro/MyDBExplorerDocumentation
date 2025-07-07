const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database/init');
const databaseConnector = require('../utils/databaseConnector');

// Recherche d'objets
router.post('/', async (req, res) => {
  const { searchTerm, connectionId, databaseName, searchMode = 'fast' } = req.body;

  if (!searchTerm) {
    return res.status(400).json({ error: 'Le terme de recherche est obligatoire' });
  }

  try {
    let results = [];
    let connections = [];

    // Si une connexion spécifique est demandée
    if (connectionId) {
      const connection = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM connections WHERE id = ?', [connectionId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!connection) {
        return res.status(404).json({ error: 'Connexion non trouvée' });
      }

      connections = [connection];
    } else {
      // Toutes les connexions activées
      connections = await new Promise((resolve, reject) => {
        db.all('SELECT * FROM connections WHERE enabled = 1 ORDER BY name', (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }

    // Rechercher dans chaque connexion
    for (const connection of connections) {
      try {
        let databases = [];
        
        if (databaseName) {
          databases = [databaseName];
        } else {
          // Obtenir toutes les bases de données de la connexion
          databases = await databaseConnector.getDatabases(connection);
        }

        // Rechercher dans chaque base de données
        for (const dbName of databases) {
          try {
            const dbResults = await databaseConnector.searchObjects(connection, searchTerm, dbName, searchMode);
            
            // Ajouter les informations de connexion aux résultats
            const enrichedResults = dbResults.map(result => ({
              ...result,
              connection_id: connection.id,
              connection_name: connection.name,
              connection_type: connection.type
            }));

            results = results.concat(enrichedResults);
          } catch (dbError) {
            console.error(`Erreur lors de la recherche dans ${dbName}:`, dbError.message);
            // Continuer avec les autres bases de données
          }
        }
      } catch (connError) {
        console.error(`Erreur lors de la recherche dans ${connection.name}:`, connError.message);
        // Continuer avec les autres connexions
      }
    }

    // Sauvegarder la recherche récente
    const searchId = uuidv4();
    const saveSearchSql = `
      INSERT INTO recent_searches (id, search_term, connection_id, database_name)
      VALUES (?, ?, ?, ?)
    `;
    
    db.run(saveSearchSql, [searchId, searchTerm, connectionId || null, databaseName || null]);

    res.json({
      results,
      total: results.length,
      searchTerm,
      connectionId,
      databaseName,
      searchMode
    });

  } catch (error) {
    console.error('Erreur lors de la recherche:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtenir les recherches récentes
router.get('/recent', (req, res) => {
  const sql = `
    SELECT rs.*, c.name as connection_name
    FROM recent_searches rs
    LEFT JOIN connections c ON rs.connection_id = c.id
    ORDER BY rs.created_at DESC
    LIMIT 20
  `;

  db.all(sql, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Recherche avancée avec filtres
router.post('/advanced', async (req, res) => {
  const {
    searchTerm,
    connectionIds,
    databaseNames,
    objectTypes,
    schemaNames,
    searchMode = 'fast'
  } = req.body;

  if (!searchTerm) {
    return res.status(400).json({ error: 'Le terme de recherche est obligatoire' });
  }

  try {
    let results = [];
    let connections = [];

    // Obtenir les connexions spécifiées ou toutes
    if (connectionIds && connectionIds.length > 0) {
      const placeholders = connectionIds.map(() => '?').join(',');
      connections = await new Promise((resolve, reject) => {
        db.all(`SELECT * FROM connections WHERE id IN (${placeholders})`, connectionIds, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    } else {
      connections = await new Promise((resolve, reject) => {
        db.all('SELECT * FROM connections WHERE enabled = 1 ORDER BY name', (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }

    // Rechercher dans chaque connexion
    for (const connection of connections) {
      try {
        let databases = [];
        
        if (databaseNames && databaseNames.length > 0) {
          databases = databaseNames;
        } else {
          databases = await databaseConnector.getDatabases(connection);
        }

        for (const dbName of databases) {
          try {
            const dbResults = await databaseConnector.searchObjects(connection, searchTerm, dbName, searchMode);
            
            // Appliquer les filtres
            let filteredResults = dbResults;

            if (objectTypes && objectTypes.length > 0) {
              filteredResults = filteredResults.filter(result => 
                objectTypes.includes(result.object_type)
              );
            }

            if (schemaNames && schemaNames.length > 0) {
              filteredResults = filteredResults.filter(result => 
                schemaNames.includes(result.schema_name)
              );
            }

            // Enrichir les résultats
            const enrichedResults = filteredResults.map(result => ({
              ...result,
              connection_id: connection.id,
              connection_name: connection.name,
              connection_type: connection.type
            }));

            results = results.concat(enrichedResults);
          } catch (dbError) {
            console.error(`Erreur lors de la recherche dans ${dbName}:`, dbError.message);
          }
        }
      } catch (connError) {
        console.error(`Erreur lors de la recherche dans ${connection.name}:`, connError.message);
      }
    }

    res.json({
      results,
      total: results.length,
      searchTerm,
      connectionIds,
      databaseNames,
      objectTypes,
      schemaNames,
      searchMode
    });

  } catch (error) {
    console.error('Erreur lors de la recherche avancée:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtenir le code DDL d'un objet
router.get('/ddl/:connectionId/:databaseName/:objectType/:objectName', async (req, res) => {
  const { connectionId, databaseName, objectType, objectName } = req.params;
  const { schema_name } = req.query;

  try {
    // Récupérer la connexion
    const connection = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM connections WHERE id = ?', [connectionId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!connection) {
      return res.status(404).json({ error: 'Connexion non trouvée' });
    }

    // Récupérer le DDL
    const ddl = await databaseConnector.getObjectDDL(
      connection, 
      databaseName, 
      objectType, 
      objectName, 
      schema_name || 'dbo'
    );

    res.json({ ddl, objectName, objectType, databaseName, schemaName: schema_name });

  } catch (error) {
    console.error('Erreur lors de la récupération du DDL:', error);
    res.status(500).json({ error: error.message });
  }
});

// Récupérer les dépendances d'un objet
router.get('/dependencies/:connectionId/:databaseName/:objectType/:objectName', async (req, res) => {
  const { connectionId, databaseName, objectType, objectName } = req.params;
  const { schema_name } = req.query;

  try {
    // Récupérer la connexion
    const connection = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM connections WHERE id = ?', [connectionId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!connection) {
      return res.status(404).json({ error: 'Connexion non trouvée' });
    }

    // Récupérer les dépendances
    const dependencies = await databaseConnector.getObjectDependencies(
      connection,
      databaseName,
      objectType,
      objectName,
      schema_name
    );

    res.json({
      dependencies,
      total: dependencies.length,
      object: {
        name: objectName,
        type: objectType,
        database: databaseName,
        schema: schema_name
      }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des dépendances:', error);
    res.status(500).json({ error: error.message });
  }
});

// Récupérer les données d'une table
router.get('/data/:connectionId/:databaseName/:tableName', async (req, res) => {
  const { connectionId, databaseName, tableName } = req.params;
  const { schema_name, limit = 200 } = req.query;

  try {
    // Récupérer la connexion
    const connection = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM connections WHERE id = ?', [connectionId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!connection) {
      return res.status(404).json({ error: 'Connexion non trouvée' });
    }

    // Récupérer les données de la table
    const tableData = await databaseConnector.getTableData(
      connection,
      databaseName,
      tableName,
      schema_name,
      parseInt(limit)
    );

    console.log('Données de la table récupérées:', {
      tableName,
      databaseName,
      schema_name,
      columnsCount: tableData.columns?.length || 0,
      dataCount: tableData.data?.length || 0
    });

    res.json(tableData);

  } catch (error) {
    console.error('Erreur lors de la récupération des données:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router; 