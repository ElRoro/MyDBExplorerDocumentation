const express = require('express');
const router = express.Router();
const { db } = require('../database/init');
const { DatabaseConnector } = require('../utils/databaseConnector');
const dbConnector = new DatabaseConnector();

// Route pour analyser les tables vides
router.get('/empty-tables', async (req, res) => {
  try {
    const { connectionId, databaseName } = req.query;
    
    if (!connectionId || !databaseName) {
      return res.status(400).json({ error: 'ConnectionId et databaseName sont requis' });
    }

    const connection = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM connections WHERE id = ?', [connectionId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!connection) {
      return res.status(404).json({ error: 'Connexion non trouvée' });
    }

    let query;
    let params = [databaseName];

    if (connection.type.toUpperCase() === 'SQLSERVER') {
      query = `
        SELECT 
          t.name as table_name,
          s.name as schema_name,
          p.rows as row_count,
          CAST(ROUND((SUM(a.total_pages) * 8) / 1024.00, 2) AS DECIMAL(36, 2)) as size_mb
        FROM sys.tables t
        INNER JOIN sys.indexes i ON t.object_id = i.object_id
        INNER JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
        INNER JOIN sys.allocation_units a ON p.partition_id = a.container_id
        INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
        WHERE i.index_id <= 1
        AND p.rows = 0
        AND t.is_ms_shipped = 0
        GROUP BY t.name, s.name, p.rows
        ORDER BY size_mb DESC, table_name
      `;
    } else if (connection.type.toUpperCase() === 'MYSQL' || connection.type.toUpperCase() === 'MARIADB') {
      query = `
        SELECT 
          t.table_name,
          t.table_schema as schema_name,
          t.table_rows as row_count,
          ROUND(((data_length + index_length) / 1024 / 1024), 2) as size_mb
        FROM information_schema.tables t
        WHERE t.table_schema = ?
        AND t.table_rows = 0
        AND t.table_type = 'BASE TABLE'
        ORDER BY size_mb DESC, table_name
      `;
    } else {
      return res.status(400).json({ error: 'Type de base de données non supporté' });
    }

    // Utiliser la méthode appropriée du databaseConnector
    const results = await dbConnector.searchObjects(connection, '', databaseName, 'fast');
    
    // Filtrer pour ne garder que les tables vides
    const emptyTables = results.filter(result => 
      result.object_type === 'TABLE' && result.row_count === 0
    );

    res.json({
      success: true,
      data: emptyTables,
      count: emptyTables.length
    });

  } catch (error) {
    console.error('Erreur lors de l\'analyse des tables vides:', error);
    res.status(500).json({ 
      error: 'Erreur lors de l\'analyse des tables vides',
      details: error.message 
    });
  }
});

// Route pour analyser les heap tables
router.get('/heap-tables', async (req, res) => {
  try {
    const { connectionId, databaseName } = req.query;
    
    if (!connectionId || !databaseName) {
      return res.status(400).json({ error: 'ConnectionId et databaseName sont requis' });
    }

    const connection = await dbConnector.getConnection(connectionId);
    if (!connection) {
      return res.status(404).json({ error: 'Connexion non trouvée' });
    }

    let query;
    let params = [databaseName];

    if (connection.type.toUpperCase() === 'SQLSERVER') {
      query = `
        SELECT 
          t.name as table_name,
          s.name as schema_name,
          p.rows as row_count,
          CAST(ROUND((SUM(a.total_pages) * 8) / 1024.00, 2) AS DECIMAL(36, 2)) as size_mb,
          CASE WHEN i.type = 0 THEN 0 ELSE 1 END as has_clustered_index
        FROM sys.tables t
        INNER JOIN sys.indexes i ON t.object_id = i.object_id
        INNER JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
        INNER JOIN sys.allocation_units a ON p.partition_id = a.container_id
        INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
        WHERE i.index_id <= 1
        AND i.type = 0
        AND t.is_ms_shipped = 0
        GROUP BY t.name, s.name, p.rows, i.type
        ORDER BY size_mb DESC, table_name
      `;
    } else if (connection.type.toUpperCase() === 'MYSQL' || connection.type.toUpperCase() === 'MARIADB') {
      // Pour MySQL/MariaDB, on considère qu'une table est un heap si elle n'a pas d'index PRIMARY
      query = `
        SELECT 
          t.table_name,
          t.table_schema as schema_name,
          t.table_rows as row_count,
          ROUND(((data_length + index_length) / 1024 / 1024), 2) as size_mb,
          CASE WHEN k.constraint_name IS NOT NULL THEN 1 ELSE 0 END as has_clustered_index
        FROM information_schema.tables t
        LEFT JOIN information_schema.key_column_usage k 
          ON t.table_name = k.table_name 
          AND t.table_schema = k.table_schema 
          AND k.constraint_name = 'PRIMARY'
        WHERE t.table_schema = ?
        AND t.table_type = 'BASE TABLE'
        AND k.constraint_name IS NULL
        ORDER BY size_mb DESC, table_name
      `;
    } else {
      return res.status(400).json({ error: 'Type de base de données non supporté' });
    }

    const results = await dbConnector.executeQuery(connectionId, query, params);
    
    res.json({
      success: true,
      data: results,
      count: results.length
    });

  } catch (error) {
    console.error('Erreur lors de l\'analyse des heap tables:', error);
    res.status(500).json({ 
      error: 'Erreur lors de l\'analyse des heap tables',
      details: error.message 
    });
  }
});

// Route pour analyser automatiquement toutes les connexions (comme la recherche)
router.get('/analyze', async (req, res) => {
  try {
    const { connectionId, databaseName } = req.query;
    
    let results = {
      emptyTables: [],
      heapTables: []
    };
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

    // Analyser chaque connexion
    for (const connection of connections) {
      try {
        console.log(`➡️ Analyse de la connexion ${connection.name} (${connection.id})`);
        
        let databases = [];
        
        if (databaseName) {
          databases = [databaseName];
        } else {
          // Obtenir toutes les bases de données de la connexion
          databases = await dbConnector.getDatabases(connection);
        }

        console.log(`  Bases trouvées pour ${connection.name}:`, databases);

        // Analyser chaque base de données
        for (const dbName of databases) {
          try {
            console.log(`    🔎 Analyse de la base ${dbName} sur ${connection.name}`);
            
            // Obtenir les tables vides et heap tables avec des requêtes spécifiques
            let emptyTables = [];
            let heapTables = [];

            if (connection.type.toUpperCase() === 'SQLSERVER') {
              // Requête SQL Server pour les tables vides
              const emptyTablesQuery = `
                SELECT 
                  t.name as table_name,
                  s.name as schema_name,
                  p.rows as row_count,
                  CAST(ROUND((SUM(a.total_pages) * 8) / 1024.00, 2) AS DECIMAL(36, 2)) as size_mb
                FROM ${dbName}.sys.tables t
                INNER JOIN ${dbName}.sys.indexes i ON t.object_id = i.object_id
                INNER JOIN ${dbName}.sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
                INNER JOIN ${dbName}.sys.allocation_units a ON p.partition_id = a.container_id
                INNER JOIN ${dbName}.sys.schemas s ON t.schema_id = s.schema_id
                WHERE i.index_id <= 1
                AND p.rows = 0
                AND t.is_ms_shipped = 0
                GROUP BY t.name, s.name, p.rows
                ORDER BY size_mb DESC, table_name
              `;

              // Requête SQL Server pour les heap tables
              const heapTablesQuery = `
                SELECT 
                  t.name as table_name,
                  s.name as schema_name,
                  p.rows as row_count,
                  CAST(ROUND((SUM(a.total_pages) * 8) / 1024.00, 2) AS DECIMAL(36, 2)) as size_mb,
                  CASE WHEN i.type = 0 THEN 0 ELSE 1 END as has_clustered_index
                FROM ${dbName}.sys.tables t
                INNER JOIN ${dbName}.sys.indexes i ON t.object_id = i.object_id
                INNER JOIN ${dbName}.sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
                INNER JOIN ${dbName}.sys.allocation_units a ON p.partition_id = a.container_id
                INNER JOIN ${dbName}.sys.schemas s ON t.schema_id = s.schema_id
                WHERE i.index_id <= 1
                AND i.type = 0
                AND t.is_ms_shipped = 0
                GROUP BY t.name, s.name, p.rows, i.type
                ORDER BY size_mb DESC, table_name
              `;

              try {
                const dbConnection = await dbConnector.connectSQLServer(connection);
                const emptyResult = await dbConnection.request().query(emptyTablesQuery);
                const heapResult = await dbConnection.request().query(heapTablesQuery);

                emptyTables = emptyResult.recordset.map(table => ({
                  ...table,
                  connection_id: connection.id,
                  connection_name: connection.name,
                  connection_type: connection.type,
                  database_name: dbName
                }));

                heapTables = heapResult.recordset.map(table => ({
                  ...table,
                  connection_id: connection.id,
                  connection_name: connection.name,
                  connection_type: connection.type,
                  database_name: dbName
                }));

                await dbConnection.close();
              } catch (queryError) {
                console.error(`    ❌ Erreur requête SQL Server sur ${dbName}:`, queryError.message);
              }

            } else if (connection.type.toUpperCase() === 'MYSQL' || connection.type.toUpperCase() === 'MARIADB') {
              // Requête MySQL/MariaDB pour les tables vides
              const emptyTablesQuery = `
                SELECT 
                  t.table_name,
                  t.table_schema as schema_name,
                  t.table_rows as row_count,
                  ROUND(((data_length + index_length) / 1024 / 1024), 2) as size_mb
                FROM information_schema.tables t
                WHERE t.table_schema = ?
                AND t.table_rows = 0
                AND t.table_type = 'BASE TABLE'
                ORDER BY size_mb DESC, table_name
              `;

              // Requête MySQL/MariaDB pour les heap tables (tables sans clé primaire)
              const heapTablesQuery = `
                SELECT 
                  t.table_name,
                  t.table_schema as schema_name,
                  t.table_rows as row_count,
                  ROUND(((data_length + index_length) / 1024 / 1024), 2) as size_mb,
                  CASE WHEN k.constraint_name IS NOT NULL THEN 1 ELSE 0 END as has_clustered_index
                FROM information_schema.tables t
                LEFT JOIN information_schema.key_column_usage k 
                  ON t.table_name = k.table_name 
                  AND t.table_schema = k.table_schema 
                  AND k.constraint_name = 'PRIMARY'
                WHERE t.table_schema = ?
                AND t.table_type = 'BASE TABLE'
                AND k.constraint_name IS NULL
                ORDER BY size_mb DESC, table_name
              `;

              try {
                const dbConnection = await dbConnector.connectMySQL(connection);
                
                const [emptyRows] = await new Promise((resolve, reject) => {
                  dbConnection.query(emptyTablesQuery, [dbName], (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                  });
                });

                const [heapRows] = await new Promise((resolve, reject) => {
                  dbConnection.query(heapTablesQuery, [dbName], (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                  });
                });

                emptyTables = emptyRows.map(table => ({
                  ...table,
                  connection_id: connection.id,
                  connection_name: connection.name,
                  connection_type: connection.type,
                  database_name: dbName
                }));

                heapTables = heapRows.map(table => ({
                  ...table,
                  connection_id: connection.id,
                  connection_name: connection.name,
                  connection_type: connection.type,
                  database_name: dbName
                }));

                // connectionPool.releaseConnection(connection, dbConnection); // This line was removed as per the edit hint
              } catch (queryError) {
                console.error(`    ❌ Erreur requête MySQL sur ${dbName}:`, queryError.message);
              }
            }

            results.emptyTables = results.emptyTables.concat(emptyTables);
            results.heapTables = results.heapTables.concat(heapTables);

          } catch (dbError) {
            console.error(`    ❌ Erreur sur la base ${dbName} de ${connection.name}:`, dbError.message);
            // Continuer avec les autres bases de données
          }
        }
      } catch (connError) {
        console.error(`❌ Erreur lors de l'analyse de ${connection.name}:`, connError.message);
        // Continuer avec les autres connexions
      }
    }

    console.log('🟢 Analyse terminée. Résumé:', {
      emptyTables: results.emptyTables.length,
      heapTables: results.heapTables.length
    });

    res.json({
      success: true,
      data: results,
      summary: {
        emptyTablesCount: results.emptyTables.length,
        heapTablesCount: results.heapTables.length
      }
    });

  } catch (error) {
    console.error('Erreur lors de l\'analyse de maintenance:', error);
    res.status(500).json({ 
      error: 'Erreur lors de l\'analyse de maintenance',
      details: error.message 
    });
  }
});

// Fonctions helper pour les requêtes
function getEmptyTablesQuery(dbType) {
  if (dbType.toUpperCase() === 'SQLSERVER') {
    return `
      SELECT 
        t.name as table_name,
        s.name as schema_name,
        p.rows as row_count,
        CAST(ROUND((SUM(a.total_pages) * 8) / 1024.00, 2) AS DECIMAL(36, 2)) as size_mb
      FROM sys.tables t
      INNER JOIN sys.indexes i ON t.object_id = i.object_id
      INNER JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
      INNER JOIN sys.allocation_units a ON p.partition_id = a.container_id
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      WHERE i.index_id <= 1
      AND p.rows = 0
      AND t.is_ms_shipped = 0
      GROUP BY t.name, s.name, p.rows
      ORDER BY size_mb DESC, table_name
    `;
  } else {
    return `
      SELECT 
        t.table_name,
        t.table_schema as schema_name,
        t.table_rows as row_count,
        ROUND(((data_length + index_length) / 1024 / 1024), 2) as size_mb
      FROM information_schema.tables t
      WHERE t.table_schema = ?
      AND t.table_rows = 0
      AND t.table_type = 'BASE TABLE'
      ORDER BY size_mb DESC, table_name
    `;
  }
}

function getHeapTablesQuery(dbType) {
  if (dbType.toUpperCase() === 'SQLSERVER') {
    return `
      SELECT 
        t.name as table_name,
        s.name as schema_name,
        p.rows as row_count,
        CAST(ROUND((SUM(a.total_pages) * 8) / 1024.00, 2) AS DECIMAL(36, 2)) as size_mb,
        CASE WHEN i.type = 0 THEN 0 ELSE 1 END as has_clustered_index
      FROM sys.tables t
      INNER JOIN sys.indexes i ON t.object_id = i.object_id
      INNER JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
      INNER JOIN sys.allocation_units a ON p.partition_id = a.container_id
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      WHERE i.index_id <= 1
      AND i.type = 0
      AND t.is_ms_shipped = 0
      GROUP BY t.name, s.name, p.rows, i.type
      ORDER BY size_mb DESC, table_name
    `;
  } else {
    return `
      SELECT 
        t.table_name,
        t.table_schema as schema_name,
        t.table_rows as row_count,
        ROUND(((data_length + index_length) / 1024 / 1024), 2) as size_mb,
        CASE WHEN k.constraint_name IS NOT NULL THEN 1 ELSE 0 END as has_clustered_index
      FROM information_schema.tables t
      LEFT JOIN information_schema.key_column_usage k 
        ON t.table_name = k.table_name 
        AND t.table_schema = k.table_schema 
        AND k.constraint_name = 'PRIMARY'
      WHERE t.table_schema = ?
      AND t.table_type = 'BASE TABLE'
      AND k.constraint_name IS NULL
      ORDER BY size_mb DESC, table_name
    `;
  }
}

module.exports = router; 