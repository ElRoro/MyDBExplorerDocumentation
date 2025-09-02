const sql = require('mssql');
const mysql = require('mysql2');
const { Client } = require('ssh2');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const logger = require('./logger');
const dbPath = path.join(__dirname, '../database/dbexplorer.sqlite');
const db = new sqlite3.Database(dbPath);

// Cache des pools de connexion par configuration
const connectionPools = new Map();

/**
 * Crée ou récupère un pool de connexion pour une configuration donnée
 * @param {Object} connection - Configuration de connexion
 * @returns {Promise<Object>} Pool de connexion
 */
async function getConnectionPool(connection) {
  const poolKey = `${connection.host}:${connection.port}:${connection.username}:${connection.database || 'msdb'}`;
  
  // Vérifier si un pool existe déjà
  if (connectionPools.has(poolKey)) {
    const existingPool = connectionPools.get(poolKey);
    if (existingPool && existingPool.connected !== false) {
      return existingPool;
    } else {
      // Nettoyer le pool invalide
      connectionPools.delete(poolKey);
    }
  }

  // Créer un nouveau pool
  const config = {
    server: connection.host,
    port: connection.port,
    user: connection.username,
    password: connection.password,
    database: connection.database || 'msdb',
    options: {
      encrypt: false,
      trustServerCertificate: true
    },
    requestTimeout: 30000,
    connectionTimeout: 15000,
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 10000,
      acquireTimeoutMillis: 10000,
      createTimeoutMillis: 10000,
      destroyTimeoutMillis: 5000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200
    }
  };

  try {
    const pool = await sql.connect(config);
    
    // Vérifier que la connexion est valide
    if (!pool || pool.connected === false) {
      throw new Error('Impossible d\'établir la connexion à la base de données');
    }

    // Stocker le pool dans le cache
    connectionPools.set(poolKey, pool);
    
    // Ajouter un listener pour nettoyer le cache quand le pool se ferme
    pool.on('error', (err) => {
      console.warn('Erreur de pool de connexion:', err);
      connectionPools.delete(poolKey);
    });

    return pool;
  } catch (error) {
    console.error('Erreur lors de la création du pool de connexion:', error);
    throw error;
  }
}

/**
 * Exécute une requête avec gestion automatique du pool
 * @param {Object} connection - Configuration de connexion
 * @param {Function} queryFunction - Fonction qui reçoit le pool et exécute la requête
 * @returns {Promise<Object>} Résultat de la requête
 */
async function executeQuery(connection, queryFunction) {
  let pool = null;
  try {
    pool = await getConnectionPool(connection);
    return await queryFunction(pool);
  } catch (error) {
    console.error('Erreur lors de l\'exécution de la requête:', error);
    
    // Gestion spécifique des erreurs de connexion
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.message.includes('aborted')) {
      console.warn('Erreur de connexion détectée, nettoyage du pool...');
      
      // Nettoyer le pool problématique
      const poolKey = `${connection.host}:${connection.port}:${connection.username}:${connection.database || 'msdb'}`;
      connectionPools.delete(poolKey);
      
      // Retry une fois
      try {
        pool = await getConnectionPool(connection);
        return await queryFunction(pool);
      } catch (retryError) {
        console.error('Erreur lors du retry:', retryError);
        throw retryError;
      }
    }
    
    throw error;
  }
}

/**
 * Ferme tous les pools de connexion
 */
async function closeAllPools() {
  const closePromises = Array.from(connectionPools.values()).map(async (pool) => {
    try {
      await pool.close();
    } catch (error) {
      console.warn('Erreur lors de la fermeture d\'un pool:', error);
    }
  });
  
  await Promise.all(closePromises);
  connectionPools.clear();
}

// Fonction pour détecter et nettoyer le format de clé SSH
function normalizeSSHKey(privateKey) {
  if (!privateKey) return null;
  
  // Supprimer les espaces en début/fin
  let key = privateKey.trim();
  
  // Détecter le format de la clé
  if (key.includes('-----BEGIN RSA PRIVATE KEY-----')) {
    // Format OpenSSH RSA - OK
    return key;
  } else if (key.includes('-----BEGIN OPENSSH PRIVATE KEY-----')) {
    // Format OpenSSH moderne - OK
    return key;
  } else if (key.includes('PuTTY-User-Key-File-2')) {
    // Format PPK - Non supporté par ssh2
    throw new Error('Format de clé PPK non supporté. Pour convertir votre clé :\n1. Ouvrez PuTTYgen\n2. Chargez votre fichier .ppk\n3. Allez dans Conversions > Export OpenSSH key\n4. Sauvegardez au format .pem\n5. Importez le fichier .pem dans l\'application');
  } else if (key.includes('-----BEGIN DSA PRIVATE KEY-----')) {
    // Format DSA - Peut être supporté
    return key;
  } else if (key.includes('-----BEGIN EC PRIVATE KEY-----')) {
    // Format EC - Peut être supporté
    return key;
  } else {
    // Format non reconnu
    throw new Error('Format de clé SSH non reconnu. Formats supportés : OpenSSH (.pem), DSA, EC');
  }
}

function getActiveConnectionsSync() {
  // Cette fonction retourne un tableau synchronisé des connexions activées (pour usage interne rapide)
  // Pour la route, il vaut mieux utiliser une version async, mais ici on fait simple
  let rows = [];
  db.all('SELECT * FROM connections WHERE enabled = 1', (err, result) => {
    if (!err && result) rows = result.map(row => ({
      ...row,
      enabled: Boolean(row.enabled),
      ssh_enabled: Boolean(row.ssh_enabled)
    }));
  });
  return rows;
}

function getActiveConnections(callback) {
  db.all('SELECT * FROM connections WHERE enabled = 1', (err, rows) => {
    if (err) return callback(err);
    const connections = rows.map(row => ({
      ...row,
      enabled: Boolean(row.enabled),
      ssh_enabled: Boolean(row.ssh_enabled)
    }));
    callback(null, connections);
  });
}

// Pool de connexions SSH/MySQL
class ConnectionPool {
  constructor() {
    this.pools = new Map(); // Map pour stocker les pools par configuration
    this.cleanupInterval = setInterval(() => this.cleanup(), 300000); // Nettoyage toutes les 5 minutes
  }

  // Générer une clé unique pour une configuration
  getConfigKey(config) {
    return `${config.type}_${config.host}_${config.port}_${config.username}_${config.database || 'default'}_${config.ssh_enabled ? 'ssh' : 'direct'}`;
  }

  // Obtenir ou créer une connexion
  async getConnection(config) {
    const configKey = this.getConfigKey(config);
    
    if (!this.pools.has(configKey)) {
      this.pools.set(configKey, {
        connections: [],
        lastUsed: Date.now(),
        config: config
      });
    }

    const pool = this.pools.get(configKey);
    pool.lastUsed = Date.now();

    // Chercher une connexion disponible
    const availableConnection = pool.connections.find(conn => 
      conn.available && conn.connection && conn.connection.state !== 'disconnected'
    );

    if (availableConnection) {
      availableConnection.available = false;
      availableConnection.lastUsed = Date.now();
      return availableConnection.connection;
    }

    // Créer une nouvelle connexion
    const newConnection = await this.createConnection(config);
    pool.connections.push({
      connection: newConnection,
      available: false,
      lastUsed: Date.now()
    });

    return newConnection;
  }

  // Créer une nouvelle connexion
  async createConnection(config) {
    if (config.ssh_enabled) {
      return this.createSSHConnection(config);
    } else {
      return this.createDirectConnection(config);
    }
  }

  // Créer une connexion SSH
  async createSSHConnection(config) {
    const sshClient = new Client();
    
    return new Promise((resolve, reject) => {
      sshClient.on('ready', async () => {
        try {
          sshClient.forwardOut(
            '127.0.0.1',
            0,
            config.host,
            config.port,
            async (err, stream) => {
              if (err) {
                sshClient.end();
                reject(new Error(`Erreur de tunnel SSH: ${err.message}`));
                return;
              }
              
              try {
                const connection = mysql.createConnection({
                  stream: stream,
                  user: config.username,
                  password: config.password,
                  database: config.database
                });
                
                // Attacher le client SSH à la connexion pour pouvoir le fermer plus tard
                connection.sshClient = sshClient;
                resolve(connection);
              } catch (mysqlError) {
                sshClient.end();
                reject(new Error(`Erreur de connexion MySQL: ${mysqlError.message}`));
              }
            }
          );
        } catch (error) {
          sshClient.end();
          reject(error);
        }
      });

      sshClient.on('error', (err) => {
        reject(new Error(`Erreur SSH: ${err.message}`));
      });

      const sshConfig = {
        host: config.ssh_host,
        port: config.ssh_port,
        username: config.ssh_username,
        password: config.ssh_password
      };

      if (config.ssh_private_key) {
        try {
          sshConfig.privateKey = normalizeSSHKey(config.ssh_private_key);
          if (config.ssh_key_passphrase) {
            sshConfig.passphrase = config.ssh_key_passphrase;
          }
          logger.debug('Clé privée SSH chargée');
        } catch (keyError) {
          console.error('[ERREUR] Erreur de clé SSH:', keyError);
          reject(new Error(`Erreur de clé SSH: ${keyError.message}`));
          return;
        }
      }

              logger.debug('Connexion SSH en cours', sshConfig);
      sshClient.connect(sshConfig);
    });
  }

  // Créer une connexion directe
  async createDirectConnection(config) {
    return new Promise((resolve, reject) => {
      try {
        const connection = mysql.createConnection({
          host: config.host,
          port: config.port,
          user: config.username,
          password: config.password,
          database: config.database
        });
        resolve(connection);
      } catch (error) {
        reject(new Error(`Erreur de connexion MySQL: ${error.message}`));
      }
    });
  }

  // Libérer une connexion (la remettre dans le pool)
  releaseConnection(config, connection) {
    const configKey = this.getConfigKey(config);
    const pool = this.pools.get(configKey);
    
    if (pool) {
      const poolConnection = pool.connections.find(conn => conn.connection === connection);
      if (poolConnection) {
        poolConnection.available = true;
        poolConnection.lastUsed = Date.now();
      }
    }
  }

  // Fermer une connexion définitivement
  async closeConnection(config, connection) {
    const configKey = this.getConfigKey(config);
    const pool = this.pools.get(configKey);
    
    if (pool) {
      const index = pool.connections.findIndex(conn => conn.connection === connection);
      if (index !== -1) {
        const poolConnection = pool.connections[index];
        
        // Fermer la connexion MySQL
        if (poolConnection.connection && poolConnection.connection.state !== 'disconnected') {
          try {
            poolConnection.connection.end();
          } catch (e) {
            // Ignore les erreurs de fermeture
          }
        }
        
        // Fermer le client SSH si présent
        if (poolConnection.connection.sshClient) {
          try {
            poolConnection.connection.sshClient.end();
          } catch (e) {
            // Ignore les erreurs de fermeture
          }
        }
        
        pool.connections.splice(index, 1);
      }
    }
  }

  // Nettoyer les connexions inactives
  cleanup() {
    const now = Date.now();
    const maxIdleTime = 10 * 60 * 1000; // 10 minutes
    
    for (const [configKey, pool] of this.pools.entries()) {
      // Supprimer les connexions inactives
      pool.connections = pool.connections.filter(conn => {
        if (now - conn.lastUsed > maxIdleTime) {
          this.closeConnection(pool.config, conn.connection);
          return false;
        }
        return true;
      });
      
      // Supprimer le pool s'il est vide et inactif
      if (pool.connections.length === 0 && now - pool.lastUsed > maxIdleTime) {
        this.pools.delete(configKey);
      }
    }
  }

  // Fermer toutes les connexions
  async closeAll() {
    for (const [configKey, pool] of this.pools.entries()) {
      for (const conn of pool.connections) {
        await this.closeConnection(pool.config, conn.connection);
      }
    }
    this.pools.clear();
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Instance globale du pool
const connectionPool = new ConnectionPool();

// Classe principale DatabaseConnector
class DatabaseConnector {
  constructor() {
    this.connections = new Map();
    
    // Gestion de la fermeture propre à la sortie
    process.on('SIGINT', async () => {
      await connectionPool.closeAll();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      await connectionPool.closeAll();
      process.exit(0);
    });
  }

  // Connexion SQL Server
  async connectSQLServer(config) {
    const connectionString = {
      server: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database,
      options: {
        encrypt: false,
        trustServerCertificate: true
      },
      requestTimeout: 60000, // 60 secondes au lieu de 15 secondes par défaut
      connectionTimeout: 30000, // 30 secondes pour la connexion
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
      }
    };

    try {
      const pool = await new sql.ConnectionPool(connectionString).connect();
      return pool;
    } catch (error) {
      throw new Error(`Erreur de connexion SQL Server: ${error.message}`);
    }
  }

  // Connexion MySQL/MariaDB avec support SSH
  async connectMySQL(config) {
    return await connectionPool.getConnection(config);
  }

  // Test de connexion
  async testConnection(config) {
    let connection;
    try {
      switch (config.type) {
        case 'sqlserver':
          connection = await this.connectSQLServer(config);
          await connection.request().query('SELECT 1');
          break;
        case 'mysql':
        case 'mariadb':
          connection = await this.connectMySQL(config);
          await new Promise((resolve, reject) => {
            connection.query('SELECT 1', (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          });
          break;
        default:
          throw new Error('Type de base de données non supporté');
      }

      return { success: true, message: 'Connexion réussie' };
    } catch (error) {
      return { success: false, message: error.message };
    } finally {
      if (connection) {
        try {
          if (config.type === 'sqlserver') {
            await connection.close();
          } else {
            // Libérer la connexion dans le pool au lieu de la fermer
            connectionPool.releaseConnection(config, connection);
          }
        } catch (e) {
          // Ignore l'erreur si la connexion est déjà fermée
        }
      }
    }
  }

  // Obtenir les bases de données
  async getDatabases(config) {
    let connection;
    try {
      logger.db('Récupération des bases de données', {
        type: config.type,
        host: config.host,
        port: config.port,
        username: config.username,
        database: config.database,
        ssh_enabled: config.ssh_enabled
      });
      
      let databases = [];
      
      switch (config.type) {
        case 'sqlserver':
          logger.db('Connexion SQL Server');
          connection = await this.connectSQLServer(config);
          logger.db('Connexion SQL Server établie');
          const result = await connection.request().query(`
            SELECT name FROM sys.databases 
            WHERE database_id > 4 
            ORDER BY name
          `);
          databases = result.recordset.map(db => db.name);
          break;
        case 'mysql':
        case 'mariadb':
          logger.db('Connexion MySQL/MariaDB');
          connection = await this.connectMySQL(config);
          logger.db('Connexion MySQL/MariaDB établie');
          const [rows] = await new Promise((resolve, reject) => {
            connection.query('SHOW DATABASES', (err, results) => {
              if (err) {
                logger.error('Erreur MySQL/MariaDB', err);
                reject(err);
              } else {
                resolve([results]);
              }
            });
          });
          databases = rows.map(row => row.Database || row['Database']).filter(db => 
            !['information_schema', 'performance_schema', 'mysql', 'sys'].includes(db)
          );
          break;
      }

      logger.db('Bases trouvées', databases);
      return databases;
    } catch (error) {
      logger.error('Erreur lors de la récupération des bases de données', error);
      throw new Error(`Erreur lors de la récupération des bases de données: ${error.message}`);
    } finally {
      if (connection) {
        try {
          if (config.type === 'sqlserver') {
            await connection.close();
          } else {
            // Libérer la connexion dans le pool au lieu de la fermer
            connectionPool.releaseConnection(config, connection);
          }
        } catch (e) {
          logger.error('Erreur lors de la fermeture de la connexion', e);
        }
      }
    }
  }

  // Recherche d'objets
  async searchObjects(config, searchTerm, databaseName = null, searchMode = 'fast') {
    let connection;
    try {
      let results = [];
      
      switch (config.type) {
        case 'sqlserver':
          connection = await this.connectSQLServer(config);
          
          if (searchMode === 'fast') {
            // Recherche rapide - noms seulement
            const fastQuery = `
              SELECT DISTINCT
                'TABLE' as object_type,
                t.name as object_name,
                s.name as schema_name,
                '${databaseName || 'master'}' as database_name,
                'Table' as description
              FROM ${databaseName || 'master'}.sys.tables t
              INNER JOIN ${databaseName || 'master'}.sys.schemas s ON t.schema_id = s.schema_id
              WHERE t.name LIKE '%${searchTerm}%'
              
              UNION ALL
              
              SELECT DISTINCT
                'VIEW' as object_type,
                v.name as object_name,
                s.name as schema_name,
                '${databaseName || 'master'}' as database_name,
                'Vue' as description
              FROM ${databaseName || 'master'}.sys.views v
              INNER JOIN ${databaseName || 'master'}.sys.schemas s ON v.schema_id = s.schema_id
              WHERE v.name LIKE '%${searchTerm}%'
              
              UNION ALL
              
              SELECT DISTINCT
                'PROCEDURE' as object_type,
                p.name as object_name,
                s.name as schema_name,
                '${databaseName || 'master'}' as database_name,
                'Procédure stockée' as description
              FROM ${databaseName || 'master'}.sys.procedures p
              INNER JOIN ${databaseName || 'master'}.sys.schemas s ON p.schema_id = s.schema_id
              WHERE p.name LIKE '%${searchTerm}%'
              
              UNION ALL
              
              SELECT DISTINCT
                'FUNCTION' as object_type,
                f.name as object_name,
                s.name as schema_name,
                '${databaseName || 'master'}' as database_name,
                'Fonction' as description
              FROM ${databaseName || 'master'}.sys.objects f
              INNER JOIN ${databaseName || 'master'}.sys.schemas s ON f.schema_id = s.schema_id
              WHERE f.type IN ('FN', 'IF', 'TF') AND f.name LIKE '%${searchTerm}%'
            `;
            
            const fastResult = await connection.request().query(fastQuery);
            results = fastResult.recordset;
          } else {
            // Recherche complète - avec code DDL
            const completeQuery = `
              -- Recherche optimisée dans les tables et leurs colonnes
              SELECT DISTINCT
                'TABLE' as object_type,
                t.name as object_name,
                s.name as schema_name,
                '${databaseName || 'master'}' as database_name,
                CASE 
                  WHEN t.name LIKE '%${searchTerm}%' THEN 'Table'
                  ELSE 'Table (contient colonne: ' + c.name + ')'
                END as description
              FROM ${databaseName || 'master'}.sys.tables t
              INNER JOIN ${databaseName || 'master'}.sys.schemas s ON t.schema_id = s.schema_id
              LEFT JOIN ${databaseName || 'master'}.sys.columns c ON t.object_id = c.object_id AND c.name LIKE '%${searchTerm}%'
              WHERE t.name LIKE '%${searchTerm}%' OR c.name LIKE '%${searchTerm}%'
              
              UNION ALL
              
              -- Recherche optimisée dans les vues et leur définition
              SELECT DISTINCT
                'VIEW' as object_type,
                v.name as object_name,
                s.name as schema_name,
                '${databaseName || 'master'}' as database_name,
                CASE 
                  WHEN v.name LIKE '%${searchTerm}%' THEN 'Vue'
                  ELSE 'Vue (définition contient le terme)'
                END as description
              FROM ${databaseName || 'master'}.sys.views v
              INNER JOIN ${databaseName || 'master'}.sys.schemas s ON v.schema_id = s.schema_id
              INNER JOIN ${databaseName || 'master'}.sys.sql_modules m ON v.object_id = m.object_id
              WHERE v.name LIKE '%${searchTerm}%' OR m.definition LIKE '%${searchTerm}%'
              
              UNION ALL
              
              -- Recherche optimisée dans les procédures stockées et leur code
              SELECT DISTINCT
                'PROCEDURE' as object_type,
                p.name as object_name,
                s.name as schema_name,
                '${databaseName || 'master'}' as database_name,
                CASE 
                  WHEN p.name LIKE '%${searchTerm}%' THEN 'Procédure stockée'
                  ELSE 'Procédure stockée (code contient le terme)'
                END as description
              FROM ${databaseName || 'master'}.sys.procedures p
              INNER JOIN ${databaseName || 'master'}.sys.schemas s ON p.schema_id = s.schema_id
              INNER JOIN ${databaseName || 'master'}.sys.sql_modules m ON p.object_id = m.object_id
              WHERE p.name LIKE '%${searchTerm}%' OR m.definition LIKE '%${searchTerm}%'
              
              UNION ALL
              
              -- Recherche optimisée dans les fonctions et leur code
              SELECT DISTINCT
                'FUNCTION' as object_type,
                f.name as object_name,
                s.name as schema_name,
                '${databaseName || 'master'}' as database_name,
                CASE 
                  WHEN f.name LIKE '%${searchTerm}%' THEN 'Fonction'
                  ELSE 'Fonction (code contient le terme)'
                END as description
              FROM ${databaseName || 'master'}.sys.objects f
              INNER JOIN ${databaseName || 'master'}.sys.schemas s ON f.schema_id = s.schema_id
              INNER JOIN ${databaseName || 'master'}.sys.sql_modules m ON f.object_id = m.object_id
              WHERE f.type IN ('FN', 'IF', 'TF') AND (f.name LIKE '%${searchTerm}%' OR m.definition LIKE '%${searchTerm}%')
            `;
            
            const completeResult = await connection.request().query(completeQuery);
            results = completeResult.recordset;
          }
          break;
          
        case 'mysql':
        case 'mariadb':
          connection = await this.connectMySQL(config);
          const dbName = databaseName || 'information_schema';
          
          if (searchMode === 'fast') {
            // Recherche rapide - noms seulement
            const fastQuery = `
              SELECT DISTINCT
                'TABLE' as object_type,
                t.TABLE_NAME as object_name,
                t.TABLE_SCHEMA as schema_name,
                '${dbName}' as database_name,
                'Table' as description
              FROM information_schema.TABLES t
              WHERE t.TABLE_SCHEMA = '${dbName}' AND t.TABLE_NAME LIKE '%${searchTerm}%'
              
              UNION ALL
              
              SELECT DISTINCT
                'VIEW' as object_type,
                v.TABLE_NAME as object_name,
                v.TABLE_SCHEMA as schema_name,
                '${dbName}' as database_name,
                'Vue' as description
              FROM information_schema.VIEWS v
              WHERE v.TABLE_SCHEMA = '${dbName}' AND v.TABLE_NAME LIKE '%${searchTerm}%'
              
              UNION ALL
              
              SELECT DISTINCT
                'PROCEDURE' as object_type,
                r.ROUTINE_NAME as object_name,
                r.ROUTINE_SCHEMA as schema_name,
                '${dbName}' as database_name,
                'Procédure stockée' as description
              FROM information_schema.ROUTINES r
              WHERE r.ROUTINE_SCHEMA = '${dbName}' AND r.ROUTINE_TYPE = 'PROCEDURE' 
              AND r.ROUTINE_NAME LIKE '%${searchTerm}%'
              
              UNION ALL
              
              SELECT DISTINCT
                'FUNCTION' as object_type,
                r.ROUTINE_NAME as object_name,
                r.ROUTINE_SCHEMA as schema_name,
                '${dbName}' as database_name,
                'Fonction' as description
              FROM information_schema.ROUTINES r
              WHERE r.ROUTINE_SCHEMA = '${dbName}' AND r.ROUTINE_TYPE = 'FUNCTION' 
              AND r.ROUTINE_NAME LIKE '%${searchTerm}%'
            `;
            
            const [fastRows] = await new Promise((resolve, reject) => {
              connection.query(fastQuery, (err, results) => {
                if (err) {
                  reject(err);
                } else {
                  resolve([results]);
                }
              });
            });
            results = fastRows;
          } else {
            // Recherche complète - avec code DDL
            const completeQuery = `
              -- Recherche optimisée dans les tables et leurs colonnes
              SELECT DISTINCT
                'TABLE' as object_type,
                t.TABLE_NAME as object_name,
                t.TABLE_SCHEMA as schema_name,
                '${dbName}' as database_name,
                CASE 
                  WHEN t.TABLE_NAME LIKE '%${searchTerm}%' THEN 'Table'
                  ELSE CONCAT('Table (contient colonne: ', c.COLUMN_NAME, ')')
                END as description
              FROM information_schema.TABLES t
              LEFT JOIN information_schema.COLUMNS c ON t.TABLE_NAME = c.TABLE_NAME AND t.TABLE_SCHEMA = c.TABLE_SCHEMA AND c.COLUMN_NAME LIKE '%${searchTerm}%'
              WHERE t.TABLE_SCHEMA = '${dbName}' AND (t.TABLE_NAME LIKE '%${searchTerm}%' OR c.COLUMN_NAME LIKE '%${searchTerm}%')
              
              UNION ALL
              
              -- Recherche optimisée dans les vues et leur définition
              SELECT DISTINCT
                'VIEW' as object_type,
                v.TABLE_NAME as object_name,
                v.TABLE_SCHEMA as schema_name,
                '${dbName}' as database_name,
                CASE 
                  WHEN v.TABLE_NAME LIKE '%${searchTerm}%' THEN 'Vue'
                  ELSE 'Vue (définition contient le terme)'
                END as description
              FROM information_schema.VIEWS v
              WHERE v.TABLE_SCHEMA = '${dbName}' AND (v.TABLE_NAME LIKE '%${searchTerm}%' OR v.VIEW_DEFINITION LIKE '%${searchTerm}%')
              
              UNION ALL
              
              -- Recherche optimisée dans les procédures stockées et leur code
              SELECT DISTINCT
                'PROCEDURE' as object_type,
                r.ROUTINE_NAME as object_name,
                r.ROUTINE_SCHEMA as schema_name,
                '${dbName}' as database_name,
                CASE 
                  WHEN r.ROUTINE_NAME LIKE '%${searchTerm}%' THEN 'Procédure stockée'
                  ELSE 'Procédure stockée (code contient le terme)'
                END as description
              FROM information_schema.ROUTINES r
              WHERE r.ROUTINE_SCHEMA = '${dbName}' AND r.ROUTINE_TYPE = 'PROCEDURE' 
              AND (r.ROUTINE_NAME LIKE '%${searchTerm}%' OR r.ROUTINE_DEFINITION LIKE '%${searchTerm}%')
              
              UNION ALL
              
              -- Recherche optimisée dans les fonctions et leur code
              SELECT DISTINCT
                'FUNCTION' as object_type,
                r.ROUTINE_NAME as object_name,
                r.ROUTINE_SCHEMA as schema_name,
                '${dbName}' as database_name,
                CASE 
                  WHEN r.ROUTINE_NAME LIKE '%${searchTerm}%' THEN 'Fonction'
                  ELSE 'Fonction (code contient le terme)'
                END as description
              FROM information_schema.ROUTINES r
              WHERE r.ROUTINE_SCHEMA = '${dbName}' AND r.ROUTINE_TYPE = 'FUNCTION' 
              AND (r.ROUTINE_NAME LIKE '%${searchTerm}%' OR r.ROUTINE_DEFINITION LIKE '%${searchTerm}%')
            `;
            
            const [completeRows] = await new Promise((resolve, reject) => {
              connection.query(completeQuery, (err, results) => {
                if (err) {
                  reject(err);
                } else {
                  resolve([results]);
                }
              });
            });
            results = completeRows;
          }
          break;
      }

      return results;
    } catch (error) {
      throw new Error(`Erreur lors de la recherche: ${error.message}`);
    } finally {
      if (connection) {
        try {
          if (config.type === 'sqlserver') {
            await connection.close();
          } else {
            // Libérer la connexion dans le pool au lieu de la fermer
            connectionPool.releaseConnection(config, connection);
          }
        } catch (e) {
          // Ignore l'erreur si la connexion est déjà fermée
        }
      }
    }
  }

  // Obtenir le code DDL d'un objet
  async getObjectDDL(config, databaseName, objectType, objectName, schemaName) {
    let connection;
    try {
      logger.db(`Récupération DDL pour ${objectType} ${schemaName}.${objectName} dans ${databaseName}`);
      let ddl = '';
      
      switch (config.type) {
        case 'sqlserver':
          // Se connecter à la base de données où se trouve l'objet
          const connectionString = {
            server: config.host,
            port: config.port,
            user: config.username,
            password: config.password,
            database: databaseName, // Utiliser la base de données cible, pas config.database
            options: {
              encrypt: false,
              trustServerCertificate: true
            },
            requestTimeout: 60000, // 60 secondes
            connectionTimeout: 30000, // 30 secondes
            pool: {
              max: 10,
              min: 0,
              idleTimeoutMillis: 30000
            }
          };
          
          connection = await new sql.ConnectionPool(connectionString).connect();
          
          switch (objectType) {
            case 'TABLE':
              const tableQuery = `
                SELECT 
                  'CREATE TABLE ' + QUOTENAME(s.name) + '.' + QUOTENAME(t.name) + ' (' + CHAR(13) + CHAR(10) +
                  STUFF((
                    SELECT CHAR(13) + CHAR(10) + '    , ' + QUOTENAME(c.name) + ' ' + 
                           CASE 
                             WHEN c.is_computed = 1 THEN 'AS ' + OBJECT_DEFINITION(c.object_id, c.column_id)
                             ELSE tp.name + 
                                  CASE 
                                    WHEN tp.name IN ('varchar', 'char', 'nvarchar', 'nchar') THEN '(' + CASE WHEN c.max_length = -1 THEN 'MAX' ELSE CAST(c.max_length AS VARCHAR(10)) END + ')'
                                    WHEN tp.name IN ('decimal', 'numeric') THEN '(' + CAST(c.precision AS VARCHAR(10)) + ',' + CAST(c.scale AS VARCHAR(10)) + ')'
                                    ELSE ''
                                  END +
                                  CASE WHEN c.is_nullable = 1 THEN ' NULL' ELSE ' NOT NULL' END +
                                  CASE WHEN dc.definition IS NOT NULL THEN ' DEFAULT ' + dc.definition ELSE '' END
                           END
                    FROM sys.columns c
                    INNER JOIN sys.types tp ON c.user_type_id = tp.user_type_id
                    LEFT JOIN sys.default_constraints dc ON c.default_object_id = dc.object_id
                    WHERE c.object_id = t.object_id
                    ORDER BY c.column_id
                    FOR XML PATH(''), TYPE
                  ).value('.', 'NVARCHAR(MAX)'), 1, 6, '') + CHAR(13) + CHAR(10) + ')' as ddl
                FROM sys.tables t
                INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
                WHERE t.name = @objectName AND s.name = @schemaName
              `;
              logger.db('Requête TABLE', tableQuery);
              const tableResult = await connection.request()
                .input('objectName', sql.NVarChar, objectName)
                .input('schemaName', sql.NVarChar, schemaName)
                .query(tableQuery);
              logger.db('Résultat TABLE', tableResult.recordset);
              ddl = tableResult.recordset[0]?.ddl || 'DDL non disponible';
              break;
              
            case 'VIEW':
            case 'PROCEDURE':
            case 'FUNCTION':
              let objectQuery;
              if (objectType === 'VIEW') {
                objectQuery = `
                  SELECT OBJECT_DEFINITION(v.object_id) as ddl
                  FROM sys.views v
                  INNER JOIN sys.schemas s ON v.schema_id = s.schema_id
                  WHERE v.name = @objectName AND s.name = @schemaName
                `;
              } else if (objectType === 'PROCEDURE') {
                objectQuery = `
                  SELECT OBJECT_DEFINITION(p.object_id) as ddl
                  FROM sys.procedures p
                  INNER JOIN sys.schemas s ON p.schema_id = s.schema_id
                  WHERE p.name = @objectName AND s.name = @schemaName
                `;
              } else if (objectType === 'FUNCTION') {
                objectQuery = `
                  SELECT OBJECT_DEFINITION(f.object_id) as ddl
                  FROM sys.objects f
                  INNER JOIN sys.schemas s ON f.schema_id = s.schema_id
                  WHERE f.name = @objectName AND s.name = @schemaName AND f.type IN ('FN', 'IF', 'TF')
                `;
              }
              
              logger.db(`Requête ${objectType}`, objectQuery);
              const objectResult = await connection.request()
                .input('objectName', sql.NVarChar, objectName)
                .input('schemaName', sql.NVarChar, schemaName)
                .query(objectQuery);
              logger.db(`Résultat ${objectType}`, objectResult.recordset);
              ddl = objectResult.recordset[0]?.ddl || 'DDL non disponible';
              break;
          }
          break;
          
        case 'mysql':
        case 'mariadb':
          // Se connecter à la base de données où se trouve l'objet
          const mysqlConfig = {
            ...config,
            database: databaseName || 'information_schema'
          };
          
          connection = await this.connectMySQL(mysqlConfig);
          
          switch (objectType) {
            case 'TABLE':
              const [tableRows] = await new Promise((resolve, reject) => {
                connection.query(`SHOW CREATE TABLE \`${objectName}\``, (err, results) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve([results]);
                  }
                });
              });
              ddl = tableRows[0]?.['Create Table'] || 'DDL non disponible';
              break;
              
            case 'VIEW':
              const [viewRows] = await new Promise((resolve, reject) => {
                connection.query(`
                  SELECT VIEW_DEFINITION 
                  FROM information_schema.VIEWS 
                  WHERE TABLE_SCHEMA = '${databaseName}' AND TABLE_NAME = '${objectName}'
                `, (err, results) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve([results]);
                  }
                });
              });
              ddl = viewRows[0]?.VIEW_DEFINITION || 'DDL non disponible';
              break;
              
            case 'PROCEDURE':
            case 'FUNCTION':
              const [routineRows] = await new Promise((resolve, reject) => {
                connection.query(`
                  SELECT ROUTINE_DEFINITION 
                  FROM information_schema.ROUTINES 
                  WHERE ROUTINE_SCHEMA = '${databaseName}' AND ROUTINE_NAME = '${objectName}' AND ROUTINE_TYPE = '${objectType === 'PROCEDURE' ? 'PROCEDURE' : 'FUNCTION'}'
                `, (err, results) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve([results]);
                  }
                });
              });
              ddl = routineRows[0]?.ROUTINE_DEFINITION || 'DDL non disponible';
              break;
          }
          break;
      }

              logger.db('DDL final', ddl ? 'DDL trouvé' : 'DDL non trouvé');
      return ddl;
    } catch (error) {
      console.error('Erreur dans getObjectDDL:', error);
      throw new Error(`Erreur lors de la récupération du DDL: ${error.message}`);
    } finally {
      if (connection) {
        try {
          if (config.type === 'sqlserver') {
            await connection.close();
          } else {
            // Libérer la connexion dans le pool au lieu de la fermer
            connectionPool.releaseConnection(config, connection);
          }
        } catch (e) {
          // Ignore l'erreur si la connexion est déjà fermée
        }
      }
    }
  }

  // Récupérer les dépendances d'un objet
  async getObjectDependencies(config, databaseName, objectType, objectName, schemaName = null) {
    let connection;
    try {
      let dependencies = [];
      
      switch (config.type) {
        case 'sqlserver':
          connection = await this.connectSQLServer(config);
          
          if (objectType === 'TABLE') {
            // Rechercher les clés étrangères qui référencent cette table
            const fkQuery = `
              SELECT DISTINCT
                'FOREIGN_KEY' as dependency_type,
                fk.name as dependency_name,
                OBJECT_SCHEMA_NAME(fk.parent_object_id) as parent_schema,
                OBJECT_NAME(fk.parent_object_id) as parent_table,
                'Clé étrangère référençant cette table' as description
              FROM ${databaseName}.sys.foreign_keys fk
              WHERE OBJECT_SCHEMA_NAME(fk.referenced_object_id) = '${schemaName || 'dbo'}'
                AND OBJECT_NAME(fk.referenced_object_id) = '${objectName}'
              
              UNION ALL
              
              -- Rechercher les vues qui utilisent cette table
              SELECT DISTINCT
                'VIEW' as dependency_type,
                v.name as dependency_name,
                s.name as parent_schema,
                v.name as parent_table,
                'Vue utilisant cette table' as description
              FROM ${databaseName}.sys.views v
              INNER JOIN ${databaseName}.sys.schemas s ON v.schema_id = s.schema_id
              INNER JOIN ${databaseName}.sys.sql_modules m ON v.object_id = m.object_id
              WHERE m.definition LIKE '%${objectName}%'
                AND v.name != '${objectName}'
              
              UNION ALL
              
              -- Rechercher les procédures stockées qui utilisent cette table
              SELECT DISTINCT
                'PROCEDURE' as dependency_type,
                p.name as dependency_name,
                s.name as parent_schema,
                p.name as parent_table,
                'Procédure utilisant cette table' as description
              FROM ${databaseName}.sys.procedures p
              INNER JOIN ${databaseName}.sys.schemas s ON p.schema_id = s.schema_id
              INNER JOIN ${databaseName}.sys.sql_modules m ON p.object_id = m.object_id
              WHERE m.definition LIKE '%${objectName}%'
              
              UNION ALL
              
              -- Rechercher les fonctions qui utilisent cette table
              SELECT DISTINCT
                'FUNCTION' as dependency_type,
                f.name as dependency_name,
                s.name as parent_schema,
                f.name as parent_table,
                'Fonction utilisant cette table' as description
              FROM ${databaseName}.sys.objects f
              INNER JOIN ${databaseName}.sys.schemas s ON f.schema_id = s.schema_id
              INNER JOIN ${databaseName}.sys.sql_modules m ON f.object_id = m.object_id
              WHERE f.type IN ('FN', 'IF', 'TF') 
                AND m.definition LIKE '%${objectName}%'
            `;
            
            const fkResult = await connection.request().query(fkQuery);
            dependencies = fkResult.recordset;
          } else if (objectType === 'VIEW') {
            // Rechercher les objets qui utilisent cette vue
            const viewQuery = `
              SELECT DISTINCT
                'VIEW' as dependency_type,
                v.name as dependency_name,
                s.name as parent_schema,
                v.name as parent_table,
                'Vue utilisant cette vue' as description
              FROM ${databaseName}.sys.views v
              INNER JOIN ${databaseName}.sys.schemas s ON v.schema_id = s.schema_id
              INNER JOIN ${databaseName}.sys.sql_modules m ON v.object_id = m.object_id
              WHERE m.definition LIKE '%${objectName}%'
                AND v.name != '${objectName}'
              
              UNION ALL
              
              SELECT DISTINCT
                'PROCEDURE' as dependency_type,
                p.name as dependency_name,
                s.name as parent_schema,
                p.name as parent_table,
                'Procédure utilisant cette vue' as description
              FROM ${databaseName}.sys.procedures p
              INNER JOIN ${databaseName}.sys.schemas s ON p.schema_id = s.schema_id
              INNER JOIN ${databaseName}.sys.sql_modules m ON p.object_id = m.object_id
              WHERE m.definition LIKE '%${objectName}%'
              
              UNION ALL
              
              SELECT DISTINCT
                'FUNCTION' as dependency_type,
                f.name as dependency_name,
                s.name as parent_schema,
                f.name as parent_table,
                'Fonction utilisant cette vue' as description
              FROM ${databaseName}.sys.objects f
              INNER JOIN ${databaseName}.sys.schemas s ON f.schema_id = s.schema_id
              INNER JOIN ${databaseName}.sys.sql_modules m ON f.object_id = m.object_id
              WHERE f.type IN ('FN', 'IF', 'TF') 
                AND m.definition LIKE '%${objectName}%'
            `;
            
            const viewResult = await connection.request().query(viewQuery);
            dependencies = viewResult.recordset;
          } else if (objectType === 'PROCEDURE' || objectType === 'FUNCTION') {
            // Rechercher les objets qui utilisent cette procédure/fonction
            const procQuery = `
              SELECT DISTINCT
                'PROCEDURE' as dependency_type,
                p.name as dependency_name,
                s.name as parent_schema,
                p.name as parent_table,
                'Procédure utilisant cette ${objectType.toLowerCase()}' as description
              FROM ${databaseName}.sys.procedures p
              INNER JOIN ${databaseName}.sys.schemas s ON p.schema_id = s.schema_id
              INNER JOIN ${databaseName}.sys.sql_modules m ON p.object_id = m.object_id
              WHERE m.definition LIKE '%${objectName}%'
                AND p.name != '${objectName}'
              
              UNION ALL
              
              SELECT DISTINCT
                'FUNCTION' as dependency_type,
                f.name as dependency_name,
                s.name as parent_schema,
                f.name as parent_table,
                'Fonction utilisant cette ${objectType.toLowerCase()}' as description
              FROM ${databaseName}.sys.objects f
              INNER JOIN ${databaseName}.sys.schemas s ON f.schema_id = s.schema_id
              INNER JOIN ${databaseName}.sys.sql_modules m ON f.object_id = m.object_id
              WHERE f.type IN ('FN', 'IF', 'TF') 
                AND m.definition LIKE '%${objectName}%'
                AND f.name != '${objectName}'
            `;
            
            const procResult = await connection.request().query(procQuery);
            dependencies = procResult.recordset;
          }
          break;
          
        case 'mysql':
        case 'mariadb':
          const mysqlConfig = {
            ...config,
            database: databaseName || 'information_schema'
          };
          connection = await this.connectMySQL(mysqlConfig);
          const dbName = databaseName || 'information_schema';
          
          if (objectType === 'TABLE') {
            // Rechercher les clés étrangères qui référencent cette table
            const fkQuery = `
              SELECT DISTINCT
                'FOREIGN_KEY' as dependency_type,
                CONSTRAINT_NAME as dependency_name,
                TABLE_SCHEMA as parent_schema,
                TABLE_NAME as parent_table,
                'Clé étrangère référençant cette table' as description
              FROM information_schema.KEY_COLUMN_USAGE
              WHERE REFERENCED_TABLE_SCHEMA = '${dbName}'
                AND REFERENCED_TABLE_NAME = '${objectName}'
                AND REFERENCED_TABLE_NAME IS NOT NULL
              
              UNION ALL
              
              -- Rechercher les vues qui utilisent cette table
              SELECT DISTINCT
                'VIEW' as dependency_type,
                TABLE_NAME as dependency_name,
                TABLE_SCHEMA as parent_schema,
                TABLE_NAME as parent_table,
                'Vue utilisant cette table' as description
              FROM information_schema.VIEWS
              WHERE TABLE_SCHEMA = '${dbName}'
                AND VIEW_DEFINITION LIKE '%${objectName}%'
                AND TABLE_NAME != '${objectName}'
              
              UNION ALL
              
              -- Rechercher les procédures stockées qui utilisent cette table
              SELECT DISTINCT
                'PROCEDURE' as dependency_type,
                ROUTINE_NAME as dependency_name,
                ROUTINE_SCHEMA as parent_schema,
                ROUTINE_NAME as parent_table,
                'Procédure utilisant cette table' as description
              FROM information_schema.ROUTINES
              WHERE ROUTINE_SCHEMA = '${dbName}'
                AND ROUTINE_TYPE = 'PROCEDURE'
                AND ROUTINE_DEFINITION LIKE '%${objectName}%'
              
              UNION ALL
              
              -- Rechercher les fonctions qui utilisent cette table
              SELECT DISTINCT
                'FUNCTION' as dependency_type,
                ROUTINE_NAME as dependency_name,
                ROUTINE_SCHEMA as parent_schema,
                ROUTINE_NAME as parent_table,
                'Fonction utilisant cette table' as description
              FROM information_schema.ROUTINES
              WHERE ROUTINE_SCHEMA = '${dbName}'
                AND ROUTINE_TYPE = 'FUNCTION'
                AND ROUTINE_DEFINITION LIKE '%${objectName}%'
            `;
            
            const [fkRows] = await new Promise((resolve, reject) => {
              connection.query(fkQuery, (err, results) => {
                if (err) {
                  reject(err);
                } else {
                  resolve([results]);
                }
              });
            });
            dependencies = fkRows;
          } else if (objectType === 'VIEW') {
            // Rechercher les objets qui utilisent cette vue
            const viewQuery = `
              SELECT DISTINCT
                'VIEW' as dependency_type,
                TABLE_NAME as dependency_name,
                TABLE_SCHEMA as parent_schema,
                TABLE_NAME as parent_table,
                'Vue utilisant cette vue' as description
              FROM information_schema.VIEWS
              WHERE TABLE_SCHEMA = '${dbName}'
                AND VIEW_DEFINITION LIKE '%${objectName}%'
                AND TABLE_NAME != '${objectName}'
              
              UNION ALL
              
              SELECT DISTINCT
                'PROCEDURE' as dependency_type,
                ROUTINE_NAME as dependency_name,
                ROUTINE_SCHEMA as parent_schema,
                ROUTINE_NAME as parent_table,
                'Procédure utilisant cette vue' as description
              FROM information_schema.ROUTINES
              WHERE ROUTINE_SCHEMA = '${dbName}'
                AND ROUTINE_TYPE = 'PROCEDURE'
                AND ROUTINE_DEFINITION LIKE '%${objectName}%'
              
              UNION ALL
              
              SELECT DISTINCT
                'FUNCTION' as dependency_type,
                ROUTINE_NAME as dependency_name,
                ROUTINE_SCHEMA as parent_schema,
                ROUTINE_NAME as parent_table,
                'Fonction utilisant cette vue' as description
              FROM information_schema.ROUTINES
              WHERE ROUTINE_SCHEMA = '${dbName}'
                AND ROUTINE_TYPE = 'FUNCTION'
                AND ROUTINE_DEFINITION LIKE '%${objectName}%'
            `;
            
            const [viewRows] = await new Promise((resolve, reject) => {
              connection.query(viewQuery, (err, results) => {
                if (err) {
                  reject(err);
                } else {
                  resolve([results]);
                }
              });
            });
            dependencies = viewRows;
          } else if (objectType === 'PROCEDURE' || objectType === 'FUNCTION') {
            // Rechercher les objets qui utilisent cette procédure/fonction
            const procQuery = `
              SELECT DISTINCT
                'PROCEDURE' as dependency_type,
                ROUTINE_NAME as dependency_name,
                ROUTINE_SCHEMA as parent_schema,
                ROUTINE_NAME as parent_table,
                'Procédure utilisant cette ${objectType.toLowerCase()}' as description
              FROM information_schema.ROUTINES
              WHERE ROUTINE_SCHEMA = '${dbName}'
                AND ROUTINE_TYPE = 'PROCEDURE'
                AND ROUTINE_DEFINITION LIKE '%${objectName}%'
                AND ROUTINE_NAME != '${objectName}'
              
              UNION ALL
              
              SELECT DISTINCT
                'FUNCTION' as dependency_type,
                ROUTINE_NAME as dependency_name,
                ROUTINE_SCHEMA as parent_schema,
                ROUTINE_NAME as parent_table,
                'Fonction utilisant cette ${objectType.toLowerCase()}' as description
              FROM information_schema.ROUTINES
              WHERE ROUTINE_SCHEMA = '${dbName}'
                AND ROUTINE_TYPE = 'FUNCTION'
                AND ROUTINE_DEFINITION LIKE '%${objectName}%'
                AND ROUTINE_NAME != '${objectName}'
            `;
            
            const [procRows] = await new Promise((resolve, reject) => {
              connection.query(procQuery, (err, results) => {
                if (err) {
                  reject(err);
                } else {
                  resolve([results]);
                }
              });
            });
            dependencies = procRows;
          }
          break;
      }

      return dependencies;
    } catch (error) {
      throw new Error(`Erreur lors de la récupération des dépendances: ${error.message}`);
    } finally {
      if (connection) {
        try {
          if (config.type === 'sqlserver') {
            await connection.close();
          } else {
            // Libérer la connexion dans le pool au lieu de la fermer
            connectionPool.releaseConnection(config, connection);
          }
        } catch (e) {
          // Ignore l'erreur si la connexion est déjà fermée
        }
      }
    }
  }

  // Récupérer les données d'une table
  async getTableData(config, databaseName, tableName, schemaName = null, limit = 200) {
    let connection;
    try {
      let data = [];
      let columns = [];
      
      switch (config.type) {
        case 'sqlserver':
          connection = await this.connectSQLServer(config);
          
          // Récupérer les données d'abord
          const dataQuery = `
            SELECT TOP ${limit} *
            FROM ${databaseName}.${schemaName || 'dbo'}.${tableName}
            ORDER BY (SELECT NULL)
          `;
          
          const dataResult = await connection.request().query(dataQuery);
          data = dataResult.recordset;
          
                    // Générer les colonnes à partir des données
          if (data.length > 0) {
            columns = Object.keys(data[0]).map(columnName => ({
              column_name: columnName,
              data_type: 'varchar',
              is_primary_key: 0
            }));
            
            // Essayer de récupérer les métadonnées des colonnes en arrière-plan
            try {
              const columnsQuery = `
                SELECT 
                  c.name as column_name,
                  t.name as data_type,
                  c.max_length,
                  c.precision,
                  c.scale,
                  c.is_nullable,
                  CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END as is_primary_key
                FROM ${databaseName}.sys.columns c
                INNER JOIN ${databaseName}.sys.types t ON c.user_type_id = t.user_type_id
                LEFT JOIN ${databaseName}.sys.index_columns pk ON c.object_id = pk.object_id AND c.column_id = pk.column_id
                LEFT JOIN ${databaseName}.sys.indexes i ON pk.object_id = i.object_id AND pk.index_id = i.index_id AND i.is_primary_key = 1
                WHERE c.object_id = OBJECT_ID('${schemaName || 'dbo'}.${tableName}')
                ORDER BY c.column_id
              `;
              
              const columnsResult = await connection.request().query(columnsQuery);
              if (columnsResult.recordset && columnsResult.recordset.length > 0) {
                columns = columnsResult.recordset;
              }
            } catch (error) {
              logger.warn('Impossible de récupérer les métadonnées des colonnes, utilisation des types par défaut');
            }
          }
          break;
          
        case 'mysql':
        case 'mariadb':
          connection = await this.connectMySQL(config);
          const dbName = databaseName || 'information_schema';
          
          // Récupérer les données d'abord
          const [dataRows] = await new Promise((resolve, reject) => {
            connection.query(`
              SELECT * FROM ${dbName}.${tableName}
              LIMIT ${limit}
            `, (err, results) => {
              if (err) {
                reject(err);
              } else {
                resolve([results]);
              }
            });
          });
          
          data = dataRows;
          
          // Générer les colonnes à partir des données
          if (data.length > 0) {
            columns = Object.keys(data[0]).map(columnName => ({
              column_name: columnName,
              data_type: 'varchar',
              is_primary_key: 0
            }));
            
            // Essayer de récupérer les métadonnées des colonnes en arrière-plan
            try {
              const [columnsRows] = await new Promise((resolve, reject) => {
                connection.query(`
                  SELECT 
                    COLUMN_NAME as column_name,
                    DATA_TYPE as data_type,
                    CHARACTER_MAXIMUM_LENGTH as max_length,
                    NUMERIC_PRECISION as precision,
                    NUMERIC_SCALE as scale,
                    IS_NULLABLE as is_nullable,
                    CASE WHEN COLUMN_KEY = 'PRI' THEN 1 ELSE 0 END as is_primary_key
                  FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA = '${dbName}' AND TABLE_NAME = '${tableName}'
                  ORDER BY ORDINAL_POSITION
                `, (err, results) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve([results]);
                  }
                });
              });
              
              if (columnsRows && columnsRows.length > 0) {
                columns = columnsRows;
              }
            } catch (error) {
              logger.warn('Impossible de récupérer les métadonnées des colonnes, utilisation des types par défaut');
            }
          }
          break;
      }

      return {
        columns,
        data,
        total: data.length,
        table: {
          name: tableName,
          schema: schemaName,
          database: databaseName
        }
      };
    } catch (error) {
      throw new Error(`Erreur lors de la récupération des données: ${error.message}`);
    } finally {
      if (connection) {
        try {
          if (config.type === 'sqlserver') {
            await connection.close();
          } else {
            // Libérer la connexion dans le pool au lieu de la fermer
            connectionPool.releaseConnection(config, connection);
          }
        } catch (e) {
          // Ignore l'erreur si la connexion est déjà fermée
        }
      }
    }
  }

  // Exécuter une requête générique
  async executeQuery(config, query, params = []) {
    let connection;
    try {
      switch (config.type) {
        case 'sqlserver':
          connection = await this.connectSQLServer(config);
          const request = connection.request();
          
          // Ajouter les paramètres à la requête
          if (params && typeof params === 'object') {
            // Si params est un objet, ajouter chaque paramètre nommé
            Object.entries(params).forEach(([key, value]) => {
              request.input(key, value);
            });
          } else if (Array.isArray(params)) {
            // Si params est un tableau, ajouter les paramètres positionnels
            params.forEach((value, index) => {
              request.input(`param${index}`, value);
            });
          }
          
          const result = await request.query(query);
          return result.recordset;
          
        case 'mysql':
        case 'mariadb':
          connection = await this.connectMySQL(config);
          const [rows] = await new Promise((resolve, reject) => {
            connection.query(query, params, (err, results) => {
              if (err) {
                reject(err);
              } else {
                resolve([results]);
              }
            });
          });
          return rows;
          
        default:
          throw new Error(`Type de base de données ${config.type} non supporté`);
      }
    } catch (error) {
      throw new Error(`Erreur lors de l'exécution de la requête: ${error.message}`);
    } finally {
      if (connection) {
        try {
          if (config.type === 'sqlserver') {
            await connection.close();
          } else {
            // Libérer la connexion dans le pool au lieu de la fermer
            connectionPool.releaseConnection(config, connection);
          }
        } catch (e) {
          // Ignore l'erreur si la connexion est déjà fermée
        }
      }
    }
  }

  // Obtenir la version du serveur SGBD
  async getServerVersion(config) {
    let connection;
    try {
      switch (config.type) {
        case 'sqlserver':
          connection = await this.connectSQLServer(config);
          const result = await connection.request().query("SELECT SERVERPROPERTY('ProductVersion') as version, SERVERPROPERTY('ProductLevel') as level, SERVERPROPERTY('Edition') as edition");
          const v = result.recordset[0];
          return v ? `${v.version} (${v.level}, ${v.edition})` : 'Inconnue';
        case 'mysql':
        case 'mariadb':
          connection = await this.connectMySQL(config);
          const [rows] = await new Promise((resolve, reject) => {
            connection.query('SELECT VERSION() as version', (err, results) => {
              if (err) reject(err);
              else resolve([results]);
            });
          });
          return rows[0]?.version || 'Inconnue';
        default:
          return 'Non supporté';
      }
    } finally {
      if (connection) {
        try {
          if (config.type === 'sqlserver') {
            await connection.close();
          } else {
            connectionPool.releaseConnection(config, connection);
          }
        } catch (e) {}
      }
    }
  }

  // Obtenir la liste des tables avec stats (nombre de lignes, taille Mo) pour une base
  async getTablesWithStats(config, databaseName) {
    let connection;
    try {
      switch (config.type) {
        case 'sqlserver':
          // Connexion à la base cible
          const connectionString = {
            server: config.host,
            port: config.port,
            user: config.username,
            password: config.password,
            database: databaseName,
            options: { encrypt: false, trustServerCertificate: true },
            requestTimeout: 60000, // 60 secondes
            connectionTimeout: 30000, // 30 secondes
            pool: {
              max: 10,
              min: 0,
              idleTimeoutMillis: 30000
            }
          };
          connection = await new sql.ConnectionPool(connectionString).connect();
          const result = await connection.request().query(`
            SELECT
              t.name as table_name,
              s.name as schema_name,
              SUM(p.rows) as row_count,
              CAST(ROUND((SUM(a.total_pages) * 8) / 1024.00, 2) AS DECIMAL(36, 2)) as size_mb
            FROM sys.tables t
            INNER JOIN sys.indexes i ON t.object_id = i.object_id
            INNER JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
            INNER JOIN sys.allocation_units a ON p.partition_id = a.container_id
            INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
            WHERE i.index_id <= 1 AND t.is_ms_shipped = 0
            GROUP BY t.name, s.name
            ORDER BY size_mb DESC, table_name
          `);
          return result.recordset.map(r => ({
            name: r.table_name,
            schema: r.schema_name,
            row_count: r.row_count,
            size_mb: parseFloat(r.size_mb)
          }));
        case 'mysql':
        case 'mariadb':
          connection = await this.connectMySQL({ ...config, database: databaseName });
          const [rows] = await new Promise((resolve, reject) => {
            connection.query(`
              SELECT 
                t.table_name,
                t.table_schema as schema_name,
                t.table_rows as row_count,
                ROUND(((data_length + index_length) / 1024 / 1024), 2) as size_mb
              FROM information_schema.tables t
              WHERE t.table_schema = ? AND t.table_type = 'BASE TABLE'
              ORDER BY size_mb DESC, table_name
            `, [databaseName], (err, results) => {
              if (err) reject(err);
              else resolve([results]);
            });
          });
          return rows.map(r => ({
            name: r.table_name,
            schema: r.schema_name,
            row_count: r.row_count,
            size_mb: parseFloat(r.size_mb)
          }));
        default:
          return [];
      }
    } finally {
      if (connection) {
        try {
          if (config.type === 'sqlserver') {
            await connection.close();
          } else {
            connectionPool.releaseConnection(config, connection);
          }
        } catch (e) {}
      }
    }
  }

  // Moyenne du pourcentage de variation quotidienne de la taille des sauvegardes (SQL Server uniquement)
  async getBackupVariationAvg(config, databaseName) {
    if (config.type !== 'sqlserver') return null;
    let connection;
    try {
      connection = await this.connectSQLServer(config);
      const query = `
        WITH backups AS (
          SELECT TOP 20
            backup_finish_date,
            backup_size / 1024.0 / 1024.0 AS taille_mo,
            LAG(backup_size / 1024.0 / 1024.0) OVER (ORDER BY backup_finish_date) AS taille_mo_precedente,
            (backup_size / 1024.0 / 1024.0) - LAG(backup_size / 1024.0 / 1024.0) OVER (ORDER BY backup_finish_date) AS variation_taille_mo
          FROM msdb.dbo.backupset
          WHERE database_name = @dbName
            AND type = 'D'
          ORDER BY backup_finish_date DESC
        )
        SELECT AVG(CASE WHEN taille_mo_precedente > 0 THEN (variation_taille_mo * 100.0 / taille_mo_precedente) END) AS avg_variation_pourcent
        FROM backups
        WHERE taille_mo_precedente IS NOT NULL;
      `;
      const result = await connection.request()
        .input('dbName', sql.NVarChar, databaseName)
        .query(query);
      return result.recordset[0]?.avg_variation_pourcent || null;
    } catch (e) {
      return null;
    } finally {
      if (connection) {
        try { await connection.close(); } catch (e) {}
      }
    }
  }
}

// Exporter un objet avec toutes les fonctions nécessaires
module.exports = {
  getActiveConnections,
  getActiveConnectionsSync,
  DatabaseConnector: DatabaseConnector,
  getConnectionPool,
  executeQuery,
  closeAllPools
}; 