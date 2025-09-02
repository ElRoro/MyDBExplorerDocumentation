const express = require('express');
const router = express.Router();

// Endpoint pour vérifier si la recherche DTSX est disponible
router.get('/dtsx-available', (req, res) => {
  res.json({ available: DtsxSearcher.isDtsxAvailable() });
});
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database/init');
const { DatabaseConnector } = require('../utils/databaseConnector');
const DtsxSearcher = require('../utils/dtsxSearcher');
const JobDtsxMatcher = require('../utils/jobDtsxMatcher');

const dbConnector = new DatabaseConnector();
const dtsxSearcher = new DtsxSearcher();
const jobDtsxMatcher = new JobDtsxMatcher();

// Recherche d'objets
router.post('/', async (req, res) => {
  const { searchTerm, connectionId, databaseName, searchMode = 'fast', includeDtsx = true, objectTypes } = req.body;

  if (!searchTerm) {
    return res.status(400).json({ error: 'Le terme de recherche est obligatoire' });
  }

  try {
    let results = [];
    let connections = [];
    let dtsxResults = [];

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
          databases = await dbConnector.getDatabases(connection);
        }

        // Rechercher dans chaque base de données
        for (const dbName of databases) {
          try {
            const dbResults = await dbConnector.searchObjects(connection, searchTerm, dbName, searchMode);
            
            // Ajouter les informations de connexion aux résultats
            const enrichedResults = dbResults.map(result => ({
              ...result,
              connection_id: connection.id,
              connection_name: connection.name,
              connection_type: connection.type
            }));

            results = results.concat(enrichedResults);
          } catch (dbError) {
            // Erreur silencieuse - continuer avec les autres bases de données
          }
        }
      } catch (connError) {
        // Erreur silencieuse - continuer avec les autres connexions
      }
    }

    // Recherche dans les fichiers DTSX si activée
    if (includeDtsx) {
      try {
        // Pour les DTSX, on ne prend que le serveur de la connexion sélectionnée
        let serverNames = [];
        
        if (connectionId) {
          const selectedConnection = connections.find(c => c.id === connectionId);
          if (selectedConnection && selectedConnection.host) {
            serverNames = [selectedConnection.host];
          }
        }
        
        // Pour la recherche normale, si includeDtsx est true, on recherche dans tous les DTSX
        // Pour la recherche avancée, on respecte les objectTypes
        const dtsxObjectTypes = objectTypes ? ['DTSX_PACKAGE'] : null;
        dtsxResults = await dtsxSearcher.searchInDtsxFiles(searchTerm, serverNames, searchMode, dtsxObjectTypes);
        
        // Enrichir les résultats DTSX avec les informations des jobs
        for (const dtsxResult of dtsxResults) {
          try {
            // En mode avancé, on utilise connectionIds[0] s'il existe
            const selectedConnectionId = connectionIds && connectionIds.length === 1 ? connectionIds[0] : connectionId;
            
            if (selectedConnectionId) {
              const selectedConnection = connections.find(c => c.id === selectedConnectionId);
              if (selectedConnection) {
                const jobs = await jobDtsxMatcher.findJobsUsingDtsx(selectedConnection, dtsxResult.name);
                dtsxResult.jobs = jobs;
                dtsxResult.job_count = jobs.length;
              }
            }
          } catch (error) {
            dtsxResult.jobs = [];
            dtsxResult.job_count = 0;
          }
        }
      } catch (error) {
        // Erreur silencieuse
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
      dtsx_results: dtsxResults,
      total: results.length + dtsxResults.length,
      searchTerm,
      connectionId,
      databaseName,
      searchMode,
      includeDtsx
    });

  } catch (error) {
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
    searchMode = 'fast',
    includeDtsx = true
  } = req.body;

  if (!searchTerm) {
    return res.status(400).json({ error: 'Le terme de recherche est obligatoire' });
  }

  try {
    let results = [];
    let connections = [];
    let dtsxResults = [];

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
          databases = await dbConnector.getDatabases(connection);
        }

        for (const dbName of databases) {
          try {
            const dbResults = await dbConnector.searchObjects(connection, searchTerm, dbName, searchMode);
            
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
            // Erreur silencieuse - continuer avec les autres bases de données
          }
        }
      } catch (connError) {
        // Erreur silencieuse - continuer avec les autres connexions
      }
    }

    // Recherche dans les fichiers DTSX si activée
    if (includeDtsx) {
      try {
        // Pour les DTSX, on ne prend que le serveur de la connexion sélectionnée
        let serverNames = [];
        
        if (connectionIds && connectionIds.length === 1) {
          const selectedConnection = connections.find(c => c.id === connectionIds[0]);
          if (selectedConnection && selectedConnection.host) {
            serverNames = [selectedConnection.host];
          }
        }
        
        dtsxResults = await dtsxSearcher.searchInDtsxFiles(searchTerm, serverNames);
        
        // Enrichir les résultats DTSX avec les informations des jobs
        for (const dtsxResult of dtsxResults) {
          try {
            // En mode avancé, on utilise connectionIds[0] s'il existe
            const selectedConnectionId = connectionIds && connectionIds.length === 1 ? connectionIds[0] : connectionId;
            
            if (selectedConnectionId) {
              const selectedConnection = connections.find(c => c.id === selectedConnectionId);
              if (selectedConnection) {
                const jobs = await jobDtsxMatcher.findJobsUsingDtsx(selectedConnection, dtsxResult.name);
                dtsxResult.jobs = jobs;
                dtsxResult.job_count = jobs.length;
              }
            }
          } catch (error) {
            dtsxResult.jobs = [];
            dtsxResult.job_count = 0;
          }
        }
      } catch (error) {
        // Erreur silencieuse
      }
    }

    res.json({
      results,
      dtsx_results: dtsxResults,
      total: results.length + dtsxResults.length,
      searchTerm,
      connectionIds,
      databaseNames,
      objectTypes,
      schemaNames,
      searchMode,
      includeDtsx
    });

  } catch (error) {
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
    const ddl = await dbConnector.getObjectDDL(
      connection, 
      databaseName, 
      objectType, 
      objectName, 
      schema_name || 'dbo'
    );

    res.json({ ddl, objectName, objectType, databaseName, schemaName: schema_name });

  } catch (error) {
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
    const dependencies = await dbConnector.getObjectDependencies(
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
    const tableData = await dbConnector.getTableData(
      connection,
      databaseName,
      tableName,
      schema_name,
      parseInt(limit)
    );

    // Données de la table récupérées avec succès

    res.json(tableData);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtenir les détails d'un fichier DTSX 
router.get('/dtsx/:server/:filename', async (req, res) => {
  const { server, filename } = req.params;

  try {
    const filePath = path.join(dtsxSearcher.dtsxRootPath, server, filename);
    const dtsxDetails = await dtsxSearcher.getDtsxDetails(filePath);

    if (!dtsxDetails) {
      return res.status(404).json({ error: 'Fichier DTSX non trouvé' });
    }

    // Chercher les jobs qui utilisent ce DTSX
    const connections = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM connections WHERE enabled = 1 AND type = "sqlserver" ORDER BY name', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const dtsxJobs = [];
    for (const connection of connections) {
      try {
        const jobs = await jobDtsxMatcher.findJobsUsingDtsx(connection, filename);
        dtsxJobs.push(...jobs.map(job => ({
          ...job,
          connection_id: connection.id,
          connection_name: connection.name
        })));
      } catch (jobError) {
        // Erreur silencieuse
      }
    }

    res.json({
      dtsx: dtsxDetails,
      jobs: dtsxJobs,
      job_count: dtsxJobs.length,
      server: server,
      filename: filename
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtenir les statistiques d'utilisation des DTSX
router.get('/dtsx/statistics/:connectionId', async (req, res) => {
  const { connectionId } = req.params;

  try {
    const connection = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM connections WHERE id = ?', [connectionId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!connection) {
      return res.status(404).json({ error: 'Connexion non trouvée' });
    }

    if (connection.type !== 'sqlserver') {
      return res.status(400).json({ error: 'Cette fonctionnalité n\'est disponible que pour SQL Server' });
    }

    const statistics = await jobDtsxMatcher.getDtsxUsageStatistics(connection);

    res.json({
      statistics,
      total_dtsx: statistics.length,
      connection: connection.name
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtenir les détails d'un fichier DTSX par chemin complet
router.post('/dtsx-file', async (req, res) => {
  const { filePath } = req.body;

  if (!filePath) {
    return res.status(400).json({ error: 'Le chemin du fichier est obligatoire' });
  }

  try {
    const dtsxDetails = await dtsxSearcher.getDtsxDetails(filePath);

    if (!dtsxDetails) {
      return res.status(404).json({ error: 'Fichier DTSX non trouvé' });
    }

    // Extraire le nom du fichier et le serveur du chemin
    const filename = path.basename(filePath);
    const server = path.basename(path.dirname(filePath));

    // Chercher les jobs qui utilisent ce DTSX
    const connections = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM connections WHERE enabled = 1 AND type = "sqlserver" ORDER BY name', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const dtsxJobs = [];
    for (const connection of connections) {
      try {
        const jobs = await jobDtsxMatcher.findJobsUsingDtsx(connection, filename);
        dtsxJobs.push(...jobs.map(job => ({
          ...job,
          connection_id: connection.id,
          connection_name: connection.name
        })));
      } catch (jobError) {
        // Erreur silencieuse
      }
    }

    res.json({
      dtsx: dtsxDetails,
      jobs: dtsxJobs,
      job_count: dtsxJobs.length,
      server: server,
      filename: filename,
      file_path: filePath
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router; 