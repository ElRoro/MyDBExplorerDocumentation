const express = require('express');
const router = express.Router();
const { getActiveConnections } = require('../utils/databaseConnector');
const sql = require('mssql');

// Vérification de la portée de getConnection
console.log('getConnection est bien défini:', typeof getConnection);

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
      }
    };
    const pool = await sql.connect(config);
    
    // Récupérer les jobs en cours d'exécution
    const runningJobs = await pool.request().query(runningJobsQuery);
    const runningJobIds = new Set(runningJobs.recordset.map(job => job.job_id));
    
    // Récupérer tous les jobs
    const result = await pool.request().query(sqlQuery);
    await pool.close();

    return result.recordset.map(job => ({
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
      lastRunStatus: job.last_run_status_desc,
      lastRunDuration: formatDuration(job.last_run_duration),
      lastRunDate: formatSqlDate(job.last_run_date),
      lastRunTime: formatSqlTime(job.last_run_time),
      lastRunMessage: job.last_run_message,
      nextRunDate: job.next_run_date ? formatSqlDate(job.next_run_date) : 'Non planifié',
      nextRunTime: job.next_run_time ? formatSqlTime(job.next_run_time) : '',
    }));
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
      requestTimeout: 10000, // 10 secondes
      connectionTimeout: 10000, // 10 secondes
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

module.exports = router; 