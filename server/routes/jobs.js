const express = require('express');
const router = express.Router();
const { getActiveConnections } = require('../utils/databaseConnector');
const { executeQuery } = require('../utils/databaseConnector');
const sql = require('mssql');
const logger = require('../utils/logger');

// Vérification de la portée de getConnection
// getConnection est bien défini

// Fonction pour obtenir une connexion SQL Server
async function getConnection(connectionId) {
  return new Promise((resolve, reject) => {
    getActiveConnections(async (err, activeConnections) => {
      if (err) return reject(err);
      
      const connection = activeConnections.find(conn => conn.id === connectionId);
      if (!connection) {
        return reject(new Error('Connexion non trouvée'));
      }
      
      try {
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
          requestTimeout: 60000, // 60 secondes
          connectionTimeout: 30000, // 30 secondes
          pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000
          }
        };
        const pool = await sql.connect(config);
        resolve(pool);
      } catch (error) {
        reject(error);
      }
    });
  });
}

// Utilitaire pour exécuter une requête sur une connexion SQL Server
async function getSqlServerJobs(connection) {
  if (connection.type !== 'sqlserver') return [];
  
  // Requête pour obtenir les jobs en cours d'exécution
  const runningJobsQuery = `
    SELECT job_id
    FROM msdb.dbo.sysjobactivity
    WHERE run_requested_date IS NOT NULL
      AND stop_execution_date IS NULL
      AND session_id = (SELECT MAX(session_id) FROM msdb.dbo.sysjobactivity)`;

  // Requête SQL SANS pagination (tous les jobs)
  const sqlQuery = `
    SELECT 
      j.job_id,
      j.name,
      j.description,
      j.enabled,
      j.date_created,
      j.date_modified,
      SUSER_SNAME(j.owner_sid) as owner_name,
      c.name as category_name,
      h.run_status as current_execution_status,
      h.run_duration as last_run_duration,
      h.run_date as last_run_date,
      h.run_time as last_run_time,
      h.message as last_run_message,
      s.next_run_date,
      s.next_run_time,
      CASE 
        WHEN h.run_status = 1 THEN 'Succès'
        WHEN h.run_status = 0 THEN 'Échec'
        WHEN h.run_status = 2 THEN 'Nouvelle tentative'
        WHEN h.run_status = 3 THEN 'Annulé'
        WHEN h.run_status = 4 THEN 'En cours'
        ELSE 'Inconnu'
      END as last_run_status_desc
    FROM msdb.dbo.sysjobs j
    LEFT JOIN msdb.dbo.syscategories c ON j.category_id = c.category_id
    LEFT JOIN (
      SELECT job_id, run_status, run_duration, run_date, run_time, message,
        ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY run_date DESC, run_time DESC) as rn
      FROM msdb.dbo.sysjobhistory
      WHERE step_id = 0
    ) h ON j.job_id = h.job_id AND h.rn = 1
    LEFT JOIN (
      SELECT job_id, next_run_date, next_run_time,
        ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY next_run_date ASC, next_run_time ASC) as schedule_rn
      FROM msdb.dbo.sysjobschedules js
      JOIN msdb.dbo.sysschedules s ON js.schedule_id = s.schedule_id
      WHERE next_run_date >= CONVERT(int, CONVERT(varchar(8), GETDATE(), 112))
    ) s ON j.job_id = s.job_id AND s.schedule_rn = 1
    ORDER BY j.name`;

  try {
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
      requestTimeout: 60000, // 60 secondes
      connectionTimeout: 30000, // 30 secondes
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
      }
    };
    const pool = await sql.connect(config);
    
    // Récupérer les jobs en cours d'exécution
    const runningJobs = await pool.request().query(runningJobsQuery);
    const runningJobIds = new Set(runningJobs.recordset.map(job => job.job_id));
    
    // Récupérer tous les jobs
    const result = await pool.request().query(sqlQuery);
    
    // Récupérer les étapes en cours pour les jobs en cours d'exécution
    const jobsWithCurrentSteps = await Promise.all(
      result.recordset.map(async (job) => {
        let currentStep = null;
        if (runningJobIds.has(job.job_id)) {
          currentStep = await getCurrentJobStep(connection, job.job_id);
        }
        
        return {
          id: job.job_id,
          name: job.name,
          description: job.description,
          category: job.category_name || 'Non catégorisé',
          owner: job.owner_name,
          enabled: job.enabled === 1,
          dateCreated: new Date(job.date_created).toLocaleDateString('fr-FR'),
          dateModified: new Date(job.date_modified).toLocaleDateString('fr-FR'),
          currentExecutionStatus: job.current_execution_status,
          isCurrentlyRunning: runningJobIds.has(job.job_id),
          currentStep: currentStep,
          lastRunStatus: job.last_run_status_desc,
          lastRunDuration: formatDuration(job.last_run_duration),
          lastRunDate: formatSqlDate(job.last_run_date),
          lastRunTime: formatSqlTime(job.last_run_time),
          lastRunMessage: job.last_run_message,
          nextRunDate: job.next_run_date ? formatSqlDate(job.next_run_date) : 'Non planifié',
          nextRunTime: job.next_run_time ? formatSqlTime(job.next_run_time) : '',
        };
      })
    );
    
    await pool.close();
    return jobsWithCurrentSteps;
  } catch (err) {
    console.error('Erreur lors de la récupération des jobs:', err);
    return [{ error: err.message, connection: connection.name }];
  }
}

// Fonction pour récupérer les steps d'un job
async function getJobSteps(connection, jobId) {
  const stepsQuery = `
    SELECT 
      s.step_id,
      s.step_name,
      s.subsystem,
      s.command,
      s.last_run_outcome,
      s.last_run_duration,
      s.last_run_retries,
      h.run_status,
      h.run_duration as history_run_duration,
      h.run_date as history_run_date,
      h.run_time as history_run_time,
      h.message as history_message,
      CASE 
        WHEN h.run_status = 1 THEN 'Succès'
        WHEN h.run_status = 0 THEN 'Échec'
        WHEN h.run_status = 2 THEN 'Nouvelle tentative'
        WHEN h.run_status = 3 THEN 'Annulé'
        WHEN h.run_status = 4 THEN 'En cours'
        ELSE 'Inconnu'
      END as run_status_desc
    FROM msdb.dbo.sysjobsteps s WITH (NOLOCK)
    LEFT JOIN (
      SELECT 
        job_id,
        step_id,
        run_status,
        run_duration,
        run_date,
        run_time,
        message,
        ROW_NUMBER() OVER (PARTITION BY job_id, step_id ORDER BY run_date DESC, run_time DESC) as rn
      FROM msdb.dbo.sysjobhistory WITH (NOLOCK)
      WHERE step_id > 0
        AND job_id = @jobId
    ) h ON s.job_id = h.job_id AND s.step_id = h.step_id AND h.rn = 1
    WHERE s.job_id = @jobId
    ORDER BY s.step_id`;

  try {
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
      requestTimeout: 60000, // 60 secondes
      connectionTimeout: 30000, // 30 secondes
      pool: {
        max: 1,
        min: 0,
        idleTimeoutMillis: 5000
      }
    };

    let pool;
    try {
      pool = await sql.connect(config);
      const result = await pool.request()
        .input('jobId', sql.UniqueIdentifier, jobId)
        .query(stepsQuery);
      return result.recordset.map(step => ({
        id: step.step_id,
        name: step.step_name,
        subsystem: step.subsystem,
        command: step.command,
        lastRunOutcome: step.last_run_outcome,
        lastRunDuration: formatDuration(step.last_run_duration),
        lastRunRetries: step.last_run_retries,
        lastRunStatus: step.run_status_desc,
        lastRunDate: formatSqlDate(step.history_run_date),
        lastRunTime: formatSqlTime(step.history_run_time),
        lastRunMessage: step.history_message
      }));
    } finally {
      if (pool) {
        await pool.close();
      }
    }
  } catch (err) {
    console.error('Erreur lors de la récupération des steps:', err);
    throw err;
  }
}

// Fonction utilitaire pour formater la durée
function formatDuration(duration) {
  if (!duration) return '';
  const hours = Math.floor(duration / 10000);
  const minutes = Math.floor((duration % 10000) / 100);
  const seconds = duration % 100;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Fonction utilitaire pour formater la date SQL
function formatSqlDate(sqlDate) {
  if (!sqlDate) return '';
  const year = Math.floor(sqlDate / 10000);
  const month = Math.floor((sqlDate % 10000) / 100);
  const day = sqlDate % 100;
  return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
}

// Fonction utilitaire pour formater l'heure SQL
function formatSqlTime(sqlTime) {
  if (!sqlTime) return '';
  const hours = Math.floor(sqlTime / 10000);
  const minutes = Math.floor((sqlTime % 10000) / 100);
  const seconds = sqlTime % 100;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Fonction pour récupérer les détails d'une step spécifique
async function getStepDetails(connection, jobId, stepId) {
  // Requête pour les détails de la step
  const stepDetailsQuery = `
    SELECT 
      s.step_id,
      s.step_name,
      s.subsystem,
      s.command,
      s.database_name,
      s.database_user_name,
      s.retry_attempts,
      s.retry_interval,
      s.output_file_name,
      s.on_success_action,
      s.on_success_step_id,
      s.on_fail_action,
      s.on_fail_step_id,
      s.last_run_outcome,
      s.last_run_duration,
      s.last_run_retries,
      s.last_run_date,
      s.last_run_time,
      h.message as last_run_message,
      CASE 
        WHEN s.on_success_action = 1 THEN 'Quitter avec succès'
        WHEN s.on_success_action = 2 THEN 'Aller à l''étape suivante'
        WHEN s.on_success_action = 3 THEN 'Aller à l''étape: ' + CAST(s.on_success_step_id AS VARCHAR)
        ELSE 'Inconnu'
      END as on_success_action_desc,
      CASE 
        WHEN s.on_fail_action = 1 THEN 'Quitter avec échec'
        WHEN s.on_fail_action = 2 THEN 'Aller à l''étape suivante'
        WHEN s.on_fail_action = 3 THEN 'Aller à l''étape: ' + CAST(s.on_fail_step_id AS VARCHAR)
        ELSE 'Inconnu'
      END as on_fail_action_desc
    FROM msdb.dbo.sysjobsteps s
    LEFT JOIN (
      SELECT job_id, step_id, message,
        ROW_NUMBER() OVER (PARTITION BY job_id, step_id ORDER BY run_date DESC, run_time DESC) as rn
      FROM msdb.dbo.sysjobhistory WITH (NOLOCK)
      WHERE step_id > 0
        AND job_id = @jobId
        AND step_id = @stepId
    ) h ON s.job_id = h.job_id AND s.step_id = h.step_id AND h.rn = 1
    WHERE s.job_id = @jobId AND s.step_id = @stepId`;

  // Requête pour l'historique complet de la step
  const stepHistoryQuery = `
    SELECT TOP 5
      h.run_date,
      h.run_time,
      h.run_duration,
      h.run_status,
      h.message,
      h.retries_attempted,
      h.step_id,
      CASE 
        WHEN h.run_status = 1 THEN 'Succès'
        WHEN h.run_status = 0 THEN 'Échec'
        WHEN h.run_status = 2 THEN 'Nouvelle tentative'
        WHEN h.run_status = 3 THEN 'Annulé'
        WHEN h.run_status = 4 THEN 'En cours'
        ELSE 'Inconnu'
      END as run_status_desc
    FROM msdb.dbo.sysjobhistory h WITH (NOLOCK)
    WHERE h.job_id = @jobId AND h.step_id = @stepId
    ORDER BY h.run_date DESC, h.run_time DESC`;

  // Requête pour les informations du job parent
  const jobInfoQuery = `
    SELECT 
      j.name as job_name,
      j.description as job_description,
      c.name as category_name
    FROM msdb.dbo.sysjobs j
    LEFT JOIN msdb.dbo.syscategories c ON j.category_id = c.category_id
    WHERE j.job_id = @jobId`;

  try {
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
      requestTimeout: 60000, // 60 secondes
      connectionTimeout: 30000, // 30 secondes
      pool: {
        max: 1,
        min: 0,
        idleTimeoutMillis: 5000
      }
    };

    let pool;
    try {
      pool = await sql.connect(config);
      
      // Récupérer les détails de la step
      const stepResult = await pool.request()
        .input('jobId', sql.UniqueIdentifier, jobId)
        .input('stepId', sql.Int, stepId)
        .query(stepDetailsQuery);

      if (!stepResult.recordset || stepResult.recordset.length === 0) {
        throw new Error('Step non trouvée');
      }

      const step = stepResult.recordset[0];

      // Récupérer l'historique
      const historyResult = await pool.request()
        .input('jobId', sql.UniqueIdentifier, jobId)
        .input('stepId', sql.Int, stepId)
        .query(stepHistoryQuery);

      // Récupérer les informations du job
      const jobResult = await pool.request()
        .input('jobId', sql.UniqueIdentifier, jobId)
        .query(jobInfoQuery);

      const jobInfo = jobResult.recordset[0];

      return {
        step: {
          id: step.step_id,
          name: step.step_name,
          subsystem: step.subsystem,
          command: step.command,
          databaseName: step.database_name,
          databaseUserName: step.database_user_name,
          retryAttempts: step.retry_attempts,
          retryInterval: step.retry_interval,
          outputFileName: step.output_file_name,
          onSuccessAction: step.on_success_action_desc,
          onFailAction: step.on_fail_action_desc,
          lastRunOutcome: step.last_run_outcome,
          lastRunDuration: formatDuration(step.last_run_duration),
          lastRunRetries: step.last_run_retries,
          lastRunDate: formatSqlDate(step.last_run_date),
          lastRunTime: formatSqlTime(step.last_run_time),
          lastRunMessage: step.last_run_message
        },
        history: historyResult.recordset.map(h => ({
          runDate: formatSqlDate(h.run_date),
          runTime: formatSqlTime(h.run_time),
          runDuration: formatDuration(h.run_duration),
          runStatus: h.run_status_desc,
          message: h.message,
          retriesAttempted: h.retries_attempted
        })),
        jobInfo: {
          name: jobInfo.job_name,
          description: jobInfo.job_description,
          category: jobInfo.category_name
        }
      };
    } finally {
      if (pool) {
        await pool.close();
      }
    }
  } catch (err) {
    console.error('Erreur lors de la récupération des détails de la step:', err);
    throw err;
  }
}

// Fonction pour récupérer l'étape en cours d'un job
async function getCurrentJobStep(connection, jobId) {
  const currentStepQuery = `
    SELECT 
      ja.job_id,
      ja.last_executed_step_id,
      ja.last_executed_step_date,
      js.step_name,
      js.step_id,
      js.subsystem,
      js.command,
      CASE 
        WHEN ja.last_executed_step_id IS NULL THEN 'En attente'
        ELSE 'En cours'
      END as step_status
    FROM msdb.dbo.sysjobactivity ja
    LEFT JOIN msdb.dbo.sysjobsteps js ON ja.job_id = js.job_id AND ja.last_executed_step_id = js.step_id
    WHERE ja.job_id = @jobId
      AND ja.run_requested_date IS NOT NULL
      AND ja.stop_execution_date IS NULL
      AND ja.session_id = (SELECT MAX(session_id) FROM msdb.dbo.sysjobactivity)`;

  try {
    const result = await executeQuery(connection, async (pool) => {
      return await pool.request()
        .input('jobId', sql.UniqueIdentifier, jobId)
        .query(currentStepQuery);
    });

    if (result.recordset && result.recordset.length > 0) {
      const step = result.recordset[0];
      return {
        stepId: step.last_executed_step_id,
        stepName: step.step_name,
        stepStatus: step.step_status,
        subsystem: step.subsystem,
        command: step.command,
        lastExecutedStepDate: step.last_executed_step_date ? new Date(step.last_executed_step_date).toLocaleString('fr-FR') : null
      };
    }
    return null;
  } catch (err) {
    console.error('Erreur lors de la récupération de l\'étape en cours:', err);
    
    // Gestion spécifique des erreurs de connexion
    if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.message.includes('aborted')) {
      console.warn('Erreur de connexion détectée, tentative de reconnexion...');
      // Retourner null au lieu de propager l'erreur pour éviter les crashs
      return null;
    }
    
    return null;
  }
}

// GET /api/jobs
router.get('/', async (req, res) => {
  getActiveConnections(async (err, activeConnections) => {
    if (err) return res.status(500).json({ error: err.message });
    const jobsByConnection = {};
    for (const conn of activeConnections) {
      if (conn.type === 'sqlserver') {
        jobsByConnection[conn.id] = await getSqlServerJobs(conn);
      }
    }
    res.json(jobsByConnection);
  });
});

// GET /api/jobs/:connectionId/:jobId/status
router.get('/:connectionId/:jobId/status', async (req, res) => {
  const { connectionId, jobId } = req.params;
  
  getActiveConnections(async (err, activeConnections) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const connection = activeConnections.find(conn => conn.id === connectionId);
    if (!connection) {
      return res.status(404).json({ error: 'Connexion non trouvée' });
    }

    try {
      const config = {
        server: connection.host,
        port: connection.port,
        user: connection.username,
        password: connection.password,
        database: connection.database || 'msdb',
        options: {
          encrypt: false,
          trustServerCertificate: true
        }
      };

      const pool = await sql.connect(config);
      
      // Requête pour obtenir le statut actuel du job
      const statusQuery = `
        SELECT 
          j.enabled,
          CASE 
            WHEN ja.run_requested_date IS NOT NULL AND ja.stop_execution_date IS NULL 
            AND ja.session_id = (SELECT MAX(session_id) FROM msdb.dbo.sysjobactivity) 
            THEN 1 
            ELSE 0 
          END as is_running,
          h.run_status,
          h.run_duration,
          h.run_date,
          h.run_time,
          h.message,
          CASE 
            WHEN h.run_status = 1 THEN 'Succès'
            WHEN h.run_status = 0 THEN 'Échec'
            WHEN h.run_status = 2 THEN 'Nouvelle tentative'
            WHEN h.run_status = 3 THEN 'Annulé'
            WHEN h.run_status = 4 THEN 'En cours'
            ELSE 'Inconnu'
          END as last_run_status_desc,
          s.next_run_date,
          s.next_run_time
        FROM msdb.dbo.sysjobs j
        LEFT JOIN msdb.dbo.sysjobactivity ja ON j.job_id = ja.job_id
        LEFT JOIN (
          SELECT job_id, run_status, run_duration, run_date, run_time, message,
            ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY run_date DESC, run_time DESC) as rn
          FROM msdb.dbo.sysjobhistory
          WHERE step_id = 0
        ) h ON j.job_id = h.job_id AND h.rn = 1
        LEFT JOIN (
          SELECT job_id, next_run_date, next_run_time,
            ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY next_run_date ASC, next_run_time ASC) as schedule_rn
          FROM msdb.dbo.sysjobschedules js
          JOIN msdb.dbo.sysschedules s ON js.schedule_id = s.schedule_id
          WHERE next_run_date >= CONVERT(int, CONVERT(varchar(8), GETDATE(), 112))
        ) s ON j.job_id = s.job_id AND s.schedule_rn = 1
        WHERE j.job_id = @jobId`;

      const result = await pool.request()
        .input('jobId', sql.UniqueIdentifier, jobId)
        .query(statusQuery);

      await pool.close();

      if (!result.recordset || result.recordset.length === 0) {
        return res.status(404).json({ error: 'Job non trouvé' });
      }

      const job = result.recordset[0];
      
      // Récupérer l'étape en cours si le job est en cours d'exécution
      let currentStep = null;
      if (job.is_running === 1) {
        currentStep = await getCurrentJobStep(connection, jobId);
      }
      
      res.json({
        enabled: job.enabled === 1,
        isCurrentlyRunning: job.is_running === 1,
        currentStep: currentStep,
        lastRunStatus: job.last_run_status_desc,
        lastRunDuration: formatDuration(job.run_duration),
        lastRunDate: formatSqlDate(job.run_date),
        lastRunTime: formatSqlTime(job.run_time),
        lastRunMessage: job.message,
        nextRunDate: job.next_run_date ? formatSqlDate(job.next_run_date) : 'Non planifié',
        nextRunTime: job.next_run_time ? formatSqlTime(job.next_run_time) : ''
      });
    } catch (error) {
      console.error('Erreur lors de la récupération du statut du job:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// GET /api/jobs/:connectionId/:jobId/current-step
router.get('/:connectionId/:jobId/current-step', async (req, res) => {
  const { connectionId, jobId } = req.params;
  
  getActiveConnections(async (err, activeConnections) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const connection = activeConnections.find(conn => conn.id === connectionId);
    if (!connection) {
      return res.status(404).json({ error: 'Connexion non trouvée' });
    }

    try {
      const currentStep = await getCurrentJobStep(connection, jobId);
      // Retourner null si aucune étape en cours, au lieu d'une erreur
      res.json(currentStep);
    } catch (err) {
      // Gestion spécifique des erreurs de connexion
      if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.message.includes('aborted')) {
        console.warn('Erreur de connexion dans current-step endpoint:', err.message);
        // Retourner null au lieu d'une erreur 500 pour éviter les crashs côté client
        res.json(null);
      } else {
        console.error('Erreur dans current-step endpoint:', err);
        res.status(500).json({ error: err.message });
      }
    }
  });
});

// GET /api/jobs/:connectionId/:jobId/steps
router.get('/:connectionId/:jobId/steps', async (req, res) => {
  const { connectionId, jobId } = req.params;
  
  getActiveConnections(async (err, activeConnections) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const connection = activeConnections.find(conn => conn.id === connectionId);
    if (!connection) {
      return res.status(404).json({ error: 'Connexion non trouvée' });
    }

    try {
      const steps = await getJobSteps(connection, jobId);
      res.json(steps);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
});

// GET /api/jobs/:connectionId/:jobId/steps/:stepId/details
router.get('/:connectionId/:jobId/steps/:stepId/details', async (req, res) => {
  const { connectionId, jobId, stepId } = req.params;
  
  getActiveConnections(async (err, activeConnections) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const connection = activeConnections.find(conn => conn.id === connectionId);
    if (!connection) {
      return res.status(404).json({ error: 'Connexion non trouvée' });
    }

    try {
      const stepDetails = await getStepDetails(connection, jobId, parseInt(stepId));
      res.json(stepDetails);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
});

// Route pour démarrer un job
router.post('/:connectionId/:jobId/start', async (req, res) => {
  let connection;
  try {
    const { connectionId, jobId } = req.params;
    const { stepId } = req.body; // Optionnel : étape de départ
    connection = await getConnection(connectionId);
    
    let query;
    if (stepId) {
      // D'abord, récupérer le nom de l'étape
      const stepQuery = `
        SELECT step_name
        FROM msdb.dbo.sysjobsteps
        WHERE job_id = @jobId AND step_id = @stepId
      `;
      
      const stepResult = await connection.request()
        .input('jobId', sql.UniqueIdentifier, jobId)
        .input('stepId', sql.Int, stepId)
        .query(stepQuery);
      
      if (!stepResult.recordset || stepResult.recordset.length === 0) {
        throw new Error('Étape non trouvée');
      }
      
      query = `
        EXEC msdb.dbo.sp_start_job 
        @job_id = @jobId,
        @step_name = @stepName
      `;
      
      await connection.request()
        .input('jobId', sql.UniqueIdentifier, jobId)
        .input('stepName', sql.NVarChar, stepResult.recordset[0].step_name)
        .query(query);
    } else {
      query = `
        EXEC msdb.dbo.sp_start_job 
        @job_id = @jobId
      `;
      
      await connection.request()
        .input('jobId', sql.UniqueIdentifier, jobId)
        .query(query);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur lors du démarrage du job:', error);
    res.status(500).json({ error: error.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Erreur lors de la fermeture de la connexion:', err);
      }
    }
  }
});

// Route pour arrêter un job
router.post('/:connectionId/:jobId/stop', async (req, res) => {
  let connection;
  try {
    const { connectionId, jobId } = req.params;
    connection = await getConnection(connectionId);
    
    const query = `
      EXEC msdb.dbo.sp_stop_job 
      @job_id = @jobId
    `;
    
    await connection.request()
      .input('jobId', sql.UniqueIdentifier, jobId)
      .query(query);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur lors de l\'arrêt du job:', error);
    res.status(500).json({ error: error.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Erreur lors de la fermeture de la connexion:', err);
      }
    }
  }
});

// Route pour activer/désactiver un job
router.post('/:connectionId/:jobId/toggle', async (req, res) => {
  let connection;
  try {
    const { connectionId, jobId } = req.params;
    const { enabled } = req.body;
    connection = await getConnection(connectionId);
    
    const query = `
      EXEC msdb.dbo.sp_update_job 
      @job_id = @jobId,
      @enabled = @enabled
    `;
    
    await connection.request()
      .input('jobId', sql.UniqueIdentifier, jobId)
      .input('enabled', sql.Bit, enabled ? 1 : 0)
      .query(query);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur lors de la modification du job:', error);
    res.status(500).json({ error: error.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Erreur lors de la fermeture de la connexion:', err);
      }
    }
  }
});

// Route pour mettre à jour la commande d'une step
router.put('/:connectionId/:jobId/steps/:stepId/command', async (req, res) => {
  let connection;
  try {
    const { connectionId, jobId, stepId } = req.params;
    const { command } = req.body;
    connection = await getConnection(connectionId);
    
    const query = `
      UPDATE msdb.dbo.sysjobsteps 
      SET command = @command
      WHERE job_id = @jobId AND step_id = @stepId
    `;
    
    const result = await connection.request()
      .input('jobId', sql.UniqueIdentifier, jobId)
      .input('stepId', sql.Int, stepId)
      .input('command', sql.NVarChar, command)
      .query(query);
    
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Step non trouvée' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la commande:', error);
    res.status(500).json({ error: error.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Erreur lors de la fermeture de la connexion:', err);
      }
    }
  }
});

// Route pour récupérer les logs du catalogue d'intégration
router.get('/:connectionId/:jobId/steps/:stepId/catalog-logs', async (req, res) => {
  let connection;
  try {
    const { connectionId, jobId, stepId } = req.params;
    const { executionId, executionTime, loadMore } = req.query;
    
    // Log pour vérifier que la route est appelée
    logger.info('=== ROUTE CATALOG LOGS APPELÉE ===');
    logger.info(`Connection ID: ${connectionId}`);
    logger.info(`Job ID: ${jobId}`);
    logger.info(`Step ID: ${stepId}`);
    logger.info(`Execution ID: ${executionId}`);
    logger.info(`Execution Time: ${executionTime}`);
    logger.info('==================================');
    connection = await getConnection(connectionId);
    
    // D'abord, récupérer le nom du package DTSX depuis la commande de la step
    const stepCommandQuery = `
      SELECT command 
      FROM msdb.dbo.sysjobsteps 
      WHERE job_id = @jobId AND step_id = @stepId`;
    
    const stepResult = await connection.request()
      .input('jobId', sql.UniqueIdentifier, jobId)
      .input('stepId', sql.Int, stepId)
      .query(stepCommandQuery);
    
    logger.info(`Step Result: ${JSON.stringify(stepResult.recordset)}`);
    
    if (!stepResult.recordset || stepResult.recordset.length === 0) {
      logger.info('Aucun résultat trouvé pour la step');
      return res.json([]);
    }
    
    const command = stepResult.recordset[0].command;
    logger.info(`Command: ${command}`);
    
    // Extraire le nom du package DTSX de la commande
    // Support pour /ISSERVER et /SQL /FILE
    let dtsxMatch = command.match(/\/(SQL|FILE)\s+\"([^\"]+\.dtsx)\"/i);
    
    // Si pas de match avec SQL/FILE, essayer avec ISSERVER
    if (!dtsxMatch) {
      dtsxMatch = command.match(/\/ISSERVER\s+\"[^"]*\\\\([^\\]+\.dtsx)\\\"/i);
    }
    
    // Si toujours pas de match, essayer une approche plus simple
    if (!dtsxMatch) {
      dtsxMatch = command.match(/([^\\\/]+\.dtsx)/i);
    }
    
    logger.info(`DTSX Match: ${JSON.stringify(dtsxMatch)}`);
    
    if (!dtsxMatch) {
      logger.info('Aucun match DTSX trouvé dans la commande');
      return res.json([]);
    }
    
    // Extraire le nom du fichier DTSX selon le type de match
    let dtsxFileName, dtsxName;
    
    if (dtsxMatch[2]) {
      // Match avec /SQL ou /FILE
      dtsxFileName = dtsxMatch[2];
      dtsxName = dtsxFileName.split('\\').pop(); // Prendre juste le nom du fichier
    } else {
      // Match simple avec le nom du fichier directement
      dtsxFileName = dtsxMatch[1];
      dtsxName = dtsxFileName; // Le nom est déjà extrait
    }
    
    logger.info(`DTSX File Name: ${dtsxFileName}`);
    logger.info(`DTSX Name: ${dtsxName}`);
    
    // Calculer la fenêtre temporelle (1 heure avant et après l'exécution)
    let timeFilter = '';
    let request = connection.request();
    let startTime, endTime; // Déclarer les variables en dehors du bloc if
    
    if (executionTime) {
      // Convertir l'heure d'exécution en format SQL Server compatible
      // Le format attendu est "YYYY-MM-DDTHH:mm:ss" sans fuseau horaire
      let executionDate;
      
      // Gérer différents formats de date
      if (executionTime.includes('/')) {
        // Format DD/MM/YYYY -> convertir en YYYY-MM-DD
        const parts = executionTime.split('T')[0].split('/');
        const day = parts[0];
        const month = parts[1];
        const year = parts[2];
        executionDate = new Date(`${year}-${month}-${day}T${executionTime.split('T')[1]}`);
      } else {
        executionDate = new Date(executionTime);
      }
      
      logger.info(`Execution Date parsed: ${executionDate.toISOString()}`);
      
      // Ajuster la fenêtre de temps selon le paramètre loadMore
      let timeWindow = 5; // 5 minutes par défaut
      if (loadMore === 'true') {
        timeWindow = 30; // 30 minutes si on charge plus
      }
      
      startTime = new Date(executionDate.getTime() - timeWindow * 60 * 1000);
      endTime = new Date(executionDate.getTime() + timeWindow * 60 * 1000);
      
      logger.info(`Start Time: ${startTime.toISOString()}`);
      logger.info(`End Time: ${endTime.toISOString()}`);
      
      // Utiliser CAST pour convertir les dates en format compatible avec message_time
      // Ajuster pour le fuseau horaire local (+02:00)
      const localStartTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000); // +2h
      const localEndTime = new Date(endTime.getTime() + 2 * 60 * 60 * 1000);     // +2h
      
      logger.info(`Local Start Time: ${localStartTime.toISOString()}`);
      logger.info(`Local End Time: ${localEndTime.toISOString()}`);
      logger.info(`Time Window: ±${timeWindow} minutes, Load More: ${loadMore === 'true' ? 'Yes' : 'No'}`);
      
      timeFilter = `AND CAST(om.message_time AS datetime2) >= @startTime AND CAST(om.message_time AS datetime2) <= @endTime`;
      request = request
        .input('startTime', sql.DateTime2, localStartTime)
        .input('endTime', sql.DateTime2, localEndTime);
    } else {
      // Si pas d'heure d'exécution, prendre les 7 derniers jours
      timeFilter = `AND om.message_time >= DATEADD(day, -7, GETDATE())`;
    }
    
    // Requête pour récupérer les logs du catalogue d'intégration
    const limit = loadMore === 'true' ? 200 : 50;
    const catalogLogsQuery = `
      SELECT TOP ${limit}
        om.operation_id,
        e.execution_id,
        e.package_name,
        om.message_time,
        om.message_type,
        om.message,
        CASE 
          WHEN om.message_type = 120 THEN 'Error'
          WHEN om.message_type = 110 THEN 'Warning'
          WHEN om.message_type = 70 THEN 'Information'
          WHEN om.message_type = 30 THEN 'Pre-execute'
          WHEN om.message_type = 60 THEN 'Progress'
          WHEN om.message_type = 50 THEN 'StatusChange'
          WHEN om.message_type = 100 THEN 'QueryCancel'
          WHEN om.message_type = 130 THEN 'TaskFailed'
          WHEN om.message_type = 90 THEN 'Diagnostic'
          WHEN om.message_type = 200 THEN 'Custom'
          WHEN om.message_type = 140 THEN 'DiagnosticEx'
          WHEN om.message_type = 400 THEN 'NonDiagnostic'
          WHEN om.message_type = 80 THEN 'VariableValueChanged'
          ELSE 'Unknown'
        END as message_type_desc
      FROM catalog.operation_messages AS om
      LEFT JOIN catalog.executions AS e ON om.operation_id = e.execution_id
      WHERE om.message_type IN (120, 110, 70, 30, 60, 50, 100, 130, 90, 200, 140, 400, 80) -- Types de messages importants (sans Pre-validate, Post-validate, Post-execute)
        AND e.package_name = @dtsxName
        ${executionId ? 'AND e.execution_id = @executionId' : ''}
        ${timeFilter}
      ORDER BY om.message_time DESC`;
    
    // Logger la requête avec les paramètres
    logger.info('=== REQUÊTE LOGS CATALOGUE ===');
    logger.info(`DTSX Name: ${dtsxName}`);
    logger.info(`Execution ID: ${executionId}`);
    logger.info(`Execution Time: ${executionTime}`);
    logger.info(`Time Filter: ${timeFilter}`);
    logger.info('Requête SQL complète:', { query: catalogLogsQuery });
    logger.info('==============================');
    
    if (executionId) {
      request = request.input('executionId', sql.BigInt, executionId);
    }
    request = request.input('dtsxName', sql.NVarChar, dtsxName);
    
    // Créer la requête avec les paramètres substitués pour les logs
    let queryWithParams = catalogLogsQuery;
    queryWithParams = queryWithParams.replace('@dtsxName', `'${dtsxName}'`);
    if (executionId) {
      queryWithParams = queryWithParams.replace('@executionId', executionId);
    }
    if (executionTime) {
      queryWithParams = queryWithParams.replace('@startTime', `'${startTime.toISOString()}'`);
      queryWithParams = queryWithParams.replace('@endTime', `'${endTime.toISOString()}'`);
    }
    
    logger.info('=== REQUÊTE SQL AVEC PARAMÈTRES ===');
    logger.info(queryWithParams);
    logger.info('===================================');
    
    const result = await request.query(catalogLogsQuery);

    // Logger les résultats
    logger.info('=== RÉSULTATS LOGS CATALOGUE ===');
    logger.info(`Nombre de logs trouvés: ${result.recordset.length}`);
    logger.info('===============================');

    // Formater les résultats
    const logs = result.recordset.map(log => ({
      operationId: log.operation_id,
      executionId: log.execution_id,
      packageName: log.package_name,
      messageTime: log.message_time,
      messageType: log.message_type,
      messageTypeDesc: log.message_type_desc,
      message: log.message
    }));

    res.json(logs);
  } catch (error) {
    logger.error('Erreur lors de la récupération des logs du catalogue:', error);
    res.status(500).json({ error: error.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        logger.error('Erreur lors de la fermeture de la connexion:', err);
      }
    }
  }
}); 

// Route pour récupérer les logs du job (sysjobhistory)
router.get('/:connectionId/:jobId/steps/:stepId/job-logs', async (req, res) => {
  let connection;
  try {
    const { connectionId, jobId, stepId } = req.params;
    const { executionTime, loadMore } = req.query;
    
    logger.info('=== ROUTE JOB LOGS APPELÉE ===');
    logger.info(`Connection ID: ${connectionId}`);
    logger.info(`Job ID: ${jobId}`);
    logger.info(`Step ID: ${stepId}`);
    logger.info(`Execution Time: ${executionTime}`);
    logger.info('==============================');
    
    connection = await getConnection(connectionId);
    
    // Requête simple pour récupérer les logs du job depuis sysjobhistory
    const limit = loadMore === 'true' ? 200 : 50;
    let jobLogsQuery = `
      SELECT TOP ${limit}
        h.job_id,
        h.step_id,
        h.step_name,
        h.run_date,
        h.run_time,
        h.run_duration,
        h.run_status,
        h.message,
        h.retries_attempted,
        h.server,
        CASE 
          WHEN h.run_status = 1 THEN 'Succès'
          WHEN h.run_status = 0 THEN 'Échec'
          WHEN h.run_status = 2 THEN 'Nouvelle tentative'
          WHEN h.run_status = 3 THEN 'Annulé'
          WHEN h.run_status = 4 THEN 'En cours'
          ELSE 'Inconnu'
        END as run_status_desc
      FROM msdb.dbo.sysjobhistory h WITH (NOLOCK)
      WHERE h.job_id = @jobId 
        AND h.step_id = @stepId`;
    
    let request = connection.request()
      .input('jobId', sql.UniqueIdentifier, jobId)
      .input('stepId', sql.Int, stepId);
    
    // Ajouter un filtre temporel simple si une heure d'exécution est fournie
    if (executionTime) {
      try {
        // Convertir l'heure d'exécution
        let executionDate;
        if (executionTime.includes('/')) {
          const parts = executionTime.split('T')[0].split('/');
          const day = parts[0];
          const month = parts[1];
          const year = parts[2];
          executionDate = new Date(`${year}-${month}-${day}T${executionTime.split('T')[1]}`);
        } else {
          executionDate = new Date(executionTime);
        }
        
        logger.info(`Execution Date parsed: ${executionDate.toISOString()}`);
        
        // Fenêtre de temps simple
        const timeWindow = loadMore === 'true' ? 30 : 5; // minutes
        const startTime = new Date(executionDate.getTime() - timeWindow * 60 * 1000);
        const endTime = new Date(executionDate.getTime() + timeWindow * 60 * 1000);
        
        logger.info(`Start Time: ${startTime.toISOString()}`);
        logger.info(`End Time: ${endTime.toISOString()}`);
        
        // Utiliser une approche plus simple pour le filtrage temporel
        const startDate = startTime.getFullYear() * 10000 + (startTime.getMonth() + 1) * 100 + startTime.getDate();
        const startTimeStr = startTime.getHours() * 10000 + startTime.getMinutes() * 100 + startTime.getSeconds();
        const endDate = endTime.getFullYear() * 10000 + (endTime.getMonth() + 1) * 100 + endTime.getDate();
        const endTimeStr = endTime.getHours() * 10000 + endTime.getMinutes() * 100 + endTime.getSeconds();
        
        jobLogsQuery += ` AND (h.run_date >= @startDate AND h.run_time >= @startTime) AND (h.run_date <= @endDate AND h.run_time <= @endTime)`;
        request = request
          .input('startDate', sql.Int, startDate)
          .input('startTime', sql.Int, startTimeStr)
          .input('endDate', sql.Int, endDate)
          .input('endTime', sql.Int, endTimeStr);
          
      } catch (dateError) {
        logger.error('Erreur lors du parsing de la date:', dateError);
        // En cas d'erreur, continuer sans filtre temporel
      }
    } else {
      // Si pas d'heure d'exécution, limiter aux 7 derniers jours
      jobLogsQuery += ` AND h.run_date >= CONVERT(int, CONVERT(varchar(8), DATEADD(day, -7, GETDATE()), 112))`;
    }
    
    jobLogsQuery += ` ORDER BY h.run_date DESC, h.run_time DESC`;
    
    logger.info('=== REQUÊTE LOGS JOB ===');
    logger.info(`Job ID: ${jobId}`);
    logger.info(`Step ID: ${stepId}`);
    logger.info(`Execution Time: ${executionTime}`);
    logger.info('Requête SQL complète:', { query: jobLogsQuery });
    logger.info('========================');
    
    const result = await request.query(jobLogsQuery);

    // Logger les résultats
    logger.info('=== RÉSULTATS LOGS JOB ===');
    logger.info(`Nombre de logs trouvés: ${result.recordset.length}`);
    logger.info('==========================');

    // Formater les résultats
    const logs = result.recordset.map(log => ({
      jobId: log.job_id,
      stepId: log.step_id,
      stepName: log.step_name,
      runDate: formatSqlDate(log.run_date),
      runTime: formatSqlTime(log.run_time),
      runDuration: formatDuration(log.run_duration),
      runStatus: log.run_status,
      runStatusDesc: log.run_status_desc,
      message: log.message,
      retriesAttempted: log.retries_attempted,
      server: log.server
    }));

    res.json(logs);
  } catch (error) {
    logger.error('Erreur lors de la récupération des logs du job:', error);
    res.status(500).json({ error: error.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        logger.error('Erreur lors de la fermeture de la connexion:', err);
      }
    }
  }
});

module.exports = router; 