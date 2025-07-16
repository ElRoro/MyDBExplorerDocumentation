const express = require('express');
const router = express.Router();
const { db } = require('../database/init');
const databaseConnector = require('../utils/databaseConnector');

// Route pour analyser les index manquants/inutilisés
router.get('/index-analysis', async (req, res) => {
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

    let results = {};

    if (connection.type.toUpperCase() === 'SQLSERVER') {
      try {
        // Analyse SQL Server - requêtes simplifiées et plus robustes
        const missingIndexesQuery = `
          SELECT TOP 50
            d.statement as table_name,
            d.equality_columns,
            d.inequality_columns,
            d.included_columns,
            ISNULL(s.user_seeks, 0) + ISNULL(s.user_scans, 0) as total_usage
          FROM sys.dm_db_missing_index_details d
          LEFT JOIN sys.dm_db_missing_index_groups g ON d.index_handle = g.index_handle
          LEFT JOIN sys.dm_db_missing_index_group_stats s ON g.index_group_handle = s.group_handle
          WHERE d.database_id = DB_ID('${databaseName}')
          ORDER BY ISNULL(s.user_seeks, 0) + ISNULL(s.user_scans, 0) DESC
        `;

        const unusedIndexesQuery = `
          SELECT TOP 50
            OBJECT_NAME(i.object_id) as table_name,
            i.name as index_name,
            i.type_desc as index_type,
            ISNULL(s.user_seeks, 0) as user_seeks,
            ISNULL(s.user_scans, 0) as user_scans
          FROM sys.indexes i
          LEFT JOIN sys.dm_db_index_usage_stats s ON i.object_id = s.object_id AND i.index_id = s.index_id
          WHERE i.object_id IN (SELECT object_id FROM sys.objects WHERE type = 'U')
          AND i.is_hypothetical = 0
          AND i.is_disabled = 0
          AND (s.user_seeks = 0 OR s.user_seeks IS NULL)
          AND (s.user_scans = 0 OR s.user_scans IS NULL)
          ORDER BY i.name
        `;

        // Créer un objet de configuration à partir de l'objet connection
        const config = {
          type: connection.type.toLowerCase(),
          host: connection.host,
          port: connection.port,
          username: connection.username,
          password: connection.password,
          database: databaseName,
          ssh_enabled: connection.ssh_enabled,
          ssh_host: connection.ssh_host,
          ssh_port: connection.ssh_port,
          ssh_username: connection.ssh_username,
          ssh_password: connection.ssh_password,
          ssh_private_key: connection.ssh_private_key,
          ssh_key_passphrase: connection.ssh_key_passphrase
        };

        results = {
          missingIndexes: await databaseConnector.executeQuery(config, missingIndexesQuery),
          unusedIndexes: await databaseConnector.executeQuery(config, unusedIndexesQuery)
        };
      } catch (sqlError) {
        console.log('SQL Server index analysis not supported:', sqlError.message);
        results = {
          missingIndexes: [],
          unusedIndexes: [],
          message: 'Analyse des index SQL Server non supportée pour cette base de données'
        };
      }

    } else if (connection.type.toUpperCase() === 'MYSQL' || connection.type.toUpperCase() === 'MARIADB') {
      try {
        // Analyse MySQL/MariaDB - requête simplifiée
        const indexUsageQuery = `
          SELECT 
            TABLE_NAME,
            INDEX_NAME,
            CARDINALITY,
            INDEX_TYPE
          FROM information_schema.STATISTICS 
          WHERE TABLE_SCHEMA = '${databaseName}'
          AND INDEX_NAME != 'PRIMARY'
          ORDER BY TABLE_NAME, INDEX_NAME
          LIMIT 100
        `;

        // Créer un objet de configuration à partir de l'objet connection
        const config = {
          type: connection.type.toLowerCase(),
          host: connection.host,
          port: connection.port,
          username: connection.username,
          password: connection.password,
          database: databaseName,
          ssh_enabled: connection.ssh_enabled,
          ssh_host: connection.ssh_host,
          ssh_port: connection.ssh_port,
          ssh_username: connection.ssh_username,
          ssh_password: connection.ssh_password,
          ssh_private_key: connection.ssh_private_key,
          ssh_key_passphrase: connection.ssh_key_passphrase
        };

        results = {
          indexUsage: await databaseConnector.executeQuery(config, indexUsageQuery)
        };
      } catch (mysqlError) {
        console.log('MySQL index analysis not supported:', mysqlError.message);
        results = {
          indexUsage: [],
          message: 'Analyse des index MySQL/MariaDB non supportée pour cette base de données'
        };
      }
    } else {
      results = {
        message: `Type de base de données ${connection.type} non supporté pour l'analyse des index`
      };
    }

    res.json({
      success: true,
      data: results,
      connection: connection.name,
      database: databaseName
    });

  } catch (error) {
    console.error('Erreur lors de l\'analyse des index:', error);
    console.error('Connection:', connection);
    console.error('Database:', databaseName);
    res.status(500).json({ 
      error: 'Erreur lors de l\'analyse des index',
      details: error.message,
      connection: connection?.name,
      database: databaseName
    });
  }
});

// Route pour détecter les verrous et blocages
router.get('/locks-analysis', async (req, res) => {
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

    let results = {};

    if (connection.type.toUpperCase() === 'SQLSERVER') {
      try {
        // Analyse des blocages SQL Server - requêtes simplifiées
        const blockingQuery = `
          SELECT TOP 20
            r.session_id,
            r.blocking_session_id,
            r.command,
            r.wait_type,
            r.wait_time,
            s.login_name
          FROM sys.dm_exec_requests r
          INNER JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
          WHERE r.blocking_session_id > 0
          ORDER BY r.wait_time DESC
        `;

        // Créer un objet de configuration à partir de l'objet connection
        const config = {
          type: connection.type.toLowerCase(),
          host: connection.host,
          port: connection.port,
          username: connection.username,
          password: connection.password,
          database: databaseName,
          ssh_enabled: connection.ssh_enabled,
          ssh_host: connection.ssh_host,
          ssh_port: connection.ssh_port,
          ssh_username: connection.ssh_username,
          ssh_password: connection.ssh_password,
          ssh_private_key: connection.ssh_private_key,
          ssh_key_passphrase: connection.ssh_key_passphrase
        };

        results = {
          blocking: await databaseConnector.executeQuery(config, blockingQuery)
        };
      } catch (sqlError) {
        console.log('SQL Server locks analysis not supported:', sqlError.message);
        results = {
          blocking: [],
          message: 'Analyse des verrous SQL Server non supportée pour cette base de données'
        };
      }

    } else if (connection.type.toUpperCase() === 'MYSQL' || connection.type.toUpperCase() === 'MARIADB') {
      try {
        // Analyse des verrous MySQL - requête simplifiée
        const processListQuery = `
          SHOW PROCESSLIST
        `;

        // Créer un objet de configuration à partir de l'objet connection
        const config = {
          type: connection.type.toLowerCase(),
          host: connection.host,
          port: connection.port,
          username: connection.username,
          password: connection.password,
          database: databaseName,
          ssh_enabled: connection.ssh_enabled,
          ssh_host: connection.ssh_host,
          ssh_port: connection.ssh_port,
          ssh_username: connection.ssh_username,
          ssh_password: connection.ssh_password,
          ssh_private_key: connection.ssh_private_key,
          ssh_key_passphrase: connection.ssh_key_passphrase
        };

        results = {
          processList: await databaseConnector.executeQuery(config, processListQuery)
        };
      } catch (mysqlError) {
        console.log('MySQL locks analysis not supported:', mysqlError.message);
        results = {
          processList: [],
          message: 'Analyse des verrous MySQL/MariaDB non supportée pour cette base de données'
        };
      }
    } else {
      results = {
        message: `Type de base de données ${connection.type} non supporté pour l'analyse des verrous`
      };
    }

    res.json({
      success: true,
      data: results,
      connection: connection.name,
      database: databaseName
    });

  } catch (error) {
    console.error('Erreur lors de l\'analyse des verrous:', error);
    console.error('Connection:', connection);
    console.error('Database:', databaseName);
    res.status(500).json({ 
      error: 'Erreur lors de l\'analyse des verrous',
      details: error.message,
      connection: connection?.name,
      database: databaseName
    });
  }
});

// Route pour vérifier les sauvegardes
router.get('/backup-analysis', async (req, res) => {
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

    let results = {};

    if (connection.type.toUpperCase() === 'SQLSERVER') {
      try {
        // Vérification des sauvegardes SQL Server - requête simplifiée
        const backupQuery = `
          SELECT TOP 10
            database_name,
            MAX(backup_finish_date) as last_backup_date,
            COUNT(*) as total_backups
          FROM msdb.dbo.backupset 
          WHERE database_name = '${databaseName}'
          GROUP BY database_name
        `;

        // Créer un objet de configuration à partir de l'objet connection
        const config = {
          type: connection.type.toLowerCase(),
          host: connection.host,
          port: connection.port,
          username: connection.username,
          password: connection.password,
          database: databaseName,
          ssh_enabled: connection.ssh_enabled,
          ssh_host: connection.ssh_host,
          ssh_port: connection.ssh_port,
          ssh_username: connection.ssh_username,
          ssh_password: connection.ssh_password,
          ssh_private_key: connection.ssh_private_key,
          ssh_key_passphrase: connection.ssh_key_passphrase
        };

        results = {
          backups: await databaseConnector.executeQuery(config, backupQuery)
        };
      } catch (sqlError) {
        console.log('SQL Server backup analysis not supported:', sqlError.message);
        results = {
          backups: [],
          message: 'Analyse des sauvegardes SQL Server non supportée pour cette base de données'
        };
      }

    } else if (connection.type.toUpperCase() === 'MYSQL' || connection.type.toUpperCase() === 'MARIADB') {
      try {
        // Vérification des sauvegardes MySQL - requête simplifiée
        const binaryLogsQuery = `
          SHOW BINARY LOGS
        `;

        // Créer un objet de configuration à partir de l'objet connection
        const config = {
          type: connection.type.toLowerCase(),
          host: connection.host,
          port: connection.port,
          username: connection.username,
          password: connection.password,
          database: databaseName,
          ssh_enabled: connection.ssh_enabled,
          ssh_host: connection.ssh_host,
          ssh_port: connection.ssh_port,
          ssh_username: connection.ssh_username,
          ssh_password: connection.ssh_password,
          ssh_private_key: connection.ssh_private_key,
          ssh_key_passphrase: connection.ssh_key_passphrase
        };

        results = {
          binaryLogs: await databaseConnector.executeQuery(config, binaryLogsQuery)
        };
      } catch (mysqlError) {
        console.log('MySQL backup analysis not supported:', mysqlError.message);
        results = {
          binaryLogs: [],
          message: 'Analyse des sauvegardes MySQL/MariaDB non supportée pour cette base de données'
        };
      }
    } else {
      results = {
        message: `Type de base de données ${connection.type} non supporté pour l'analyse des sauvegardes`
      };
    }

    res.json({
      success: true,
      data: results,
      connection: connection.name,
      database: databaseName
    });

  } catch (error) {
    console.error('Erreur lors de l\'analyse des sauvegardes:', error);
    console.error('Connection:', connection);
    console.error('Database:', databaseName);
    res.status(500).json({ 
      error: 'Erreur lors de l\'analyse des sauvegardes',
      details: error.message,
      connection: connection?.name,
      database: databaseName
    });
  }
});

module.exports = router; 