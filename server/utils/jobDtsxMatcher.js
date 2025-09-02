const { DatabaseConnector } = require('./databaseConnector');

class JobDtsxMatcher {
  constructor() {
    this.dbConnector = new DatabaseConnector();
  }

  /**
   * Vérifie si un DTSX est référencé dans les jobs SQL Server
   * @param {Object} connection - Connexion à la base de données
   * @param {string} dtsxName - Nom du fichier DTSX
   * @returns {Promise<Array>} - Jobs qui utilisent ce DTSX
   */
  async findJobsUsingDtsx(connection, dtsxName) {
    if (connection.type !== 'sqlserver') return [];

    try {
      // Récupérer tous les jobs et leurs étapes en une seule requête
      const sqlQuery = `
        SELECT 
          j.job_id,
          j.name as job_name,
          j.description,
          j.enabled,
          s.step_id,
          s.step_name,
          s.subsystem,
          s.command
        FROM msdb.dbo.sysjobs j
        INNER JOIN msdb.dbo.sysjobsteps s ON j.job_id = s.job_id
        WHERE s.subsystem = 'SSIS'
        ORDER BY j.name, s.step_id`;

      const results = await this.dbConnector.executeQuery(connection, sqlQuery, 'msdb');
      const matchingJobs = [];

      // Regrouper les résultats par job
      const jobsMap = new Map();
      for (const row of results) {
        if (this.stepReferencesDtsx({ command: row.command, subsystem: row.subsystem }, dtsxName)) {
          const jobKey = row.job_id;
          if (!jobsMap.has(jobKey)) {
            jobsMap.set(jobKey, {
              job_id: row.job_id,
              name: row.job_name,
              description: row.description,
              enabled: row.enabled,
              step: {
                step_id: row.step_id,
                step_name: row.step_name,
                subsystem: row.subsystem,
                command: row.command
              },
              dtsx_reference: this.extractDtsxReference({
                command: row.command,
                subsystem: row.subsystem
              }, dtsxName)
            });
          }
        }
      }

      // Pas de log ici
      return Array.from(jobsMap.values());
    } catch (error) {
      // Erreur silencieuse
      return [];
    }
  }

  /**
   * Obtient tous les jobs SQL Server
   */
  async getSqlServerJobs(connection) {
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
      const result = await this.dbConnector.executeQuery(connection, sqlQuery, 'msdb');
      return result || [];
    } catch (error) {
      // Erreur silencieuse
      return [];
    }
  }

  /**
   * Obtient les étapes d'un job
   */
  async getJobSteps(connection, jobId) {
    const sqlQuery = `
      SELECT 
        step_id,
        step_name,
        subsystem,
        command,
        database_name,
        server,
        database_user_name,
        retry_attempts,
        retry_interval,
        on_success_action,
        on_success_step_id,
        on_fail_action,
        on_fail_step_id
      FROM msdb.dbo.sysjobsteps
      WHERE job_id = '${jobId}'
      ORDER BY step_id`;

    try {
      const result = await this.dbConnector.executeQuery(connection, sqlQuery, 'msdb');
      return result || [];
    } catch (error) {
      // Erreur silencieuse
      return [];
    }
  }

  /**
   * Vérifie si une étape de job référence un DTSX
   */
  stepReferencesDtsx(step, dtsxName) {
    if (!step.command) return false;

    const command = step.command.toLowerCase();
    const dtsxNameLower = dtsxName.toLowerCase().replace(/\.dtsx$/i, '');

    // Recherche dans la commande
    if (command.includes(dtsxNameLower) || command.includes(dtsxName.toLowerCase())) {
      return true;
    }

    // Recherche dans les paramètres de DTExec et ISSERVER
    if (step.subsystem === 'SSIS' || step.subsystem === 'CmdExec') {
      // Patterns courants pour DTExec et ISSERVER
      const patterns = [
        // DTExec patterns
        new RegExp(`/file.*${dtsxNameLower}`, 'i'),
        new RegExp(`-f.*${dtsxNameLower}`, 'i'),
        new RegExp(`package.*${dtsxNameLower}`, 'i'),
        // ISSERVER patterns
        new RegExp(`/isserver.*${dtsxNameLower}`, 'i'),
        new RegExp(`\\\\${dtsxNameLower}`, 'i'),  // Match le nom dans un chemin SSISDB
        // Autres patterns courants
        new RegExp(`\\b${dtsxNameLower}\\b`, 'i')  // Match le nom comme mot entier
      ];

      return patterns.some(pattern => pattern.test(command));
    }

    return false;
  }

  /**
   * Extrait la référence DTSX d'une étape
   */
  extractDtsxReference(step, dtsxName) {
    if (!step.command) return null;

    const command = step.command;
    const dtsxNameLower = dtsxName.toLowerCase().replace(/\.dtsx$/i, '');

    // Recherche de patterns DTExec
    const dtexecMatch = command.match(/dtexec\s+(.*)/i);
    if (dtexecMatch) {
      return {
        type: 'DTExec',
        command: dtexecMatch[1].trim(),
        full_command: command
      };
    }

    // Recherche de patterns de chemin de fichier
    const fileMatch = command.match(/([A-Za-z]:\\[^"\s]+\.dtsx)/i);
    if (fileMatch) {
      return {
        type: 'File Path',
        path: fileMatch[1],
        full_command: command
      };
    }

    // Recherche de patterns de package
    const packageMatch = command.match(/package\s+["']([^"']+)["']/i);
    if (packageMatch) {
      return {
        type: 'Package',
        package_name: packageMatch[1],
        full_command: command
      };
    }

    return {
      type: 'Text Match',
      matched_text: dtsxNameLower,
      full_command: command
    };
  }

  /**
   * Recherche tous les jobs qui utilisent des DTSX
   */
  async findAllJobsUsingDtsx(connection) {
    if (connection.type !== 'sqlserver') {
      return [];
    }

    try {
      const jobs = await this.getSqlServerJobs(connection);
      const jobsWithDtsx = [];

      for (const job of jobs) {
        const jobSteps = await this.getJobSteps(connection, job.job_id);
        const dtsxReferences = [];

        for (const step of jobSteps) {
          if (step.subsystem === 'SSIS' || step.subsystem === 'CmdExec') {
            const dtsxNames = this.extractDtsxNamesFromStep(step);
            if (dtsxNames.length > 0) {
              dtsxReferences.push({
                step: step,
                dtsx_names: dtsxNames
              });
            }
          }
        }

        if (dtsxReferences.length > 0) {
          jobsWithDtsx.push({
            ...job,
            dtsx_references: dtsxReferences
          });
        }
      }

      return jobsWithDtsx;
    } catch (error) {
      // Erreur silencieuse
      return [];
    }
  }

  /**
   * Extrait les noms de DTSX d'une étape
   */
  extractDtsxNamesFromStep(step) {
    if (!step.command) return [];

    const command = step.command;
    const dtsxNames = [];

    // Recherche de fichiers .dtsx
    const dtsxMatches = command.match(/[A-Za-z0-9_\-]+\.dtsx/gi);
    if (dtsxMatches) {
      dtsxNames.push(...dtsxMatches);
    }

    // Recherche de noms de packages (sans extension)
    const packageMatches = command.match(/package\s+["']([A-Za-z0-9_\-]+)["']/gi);
    if (packageMatches) {
      packageMatches.forEach(match => {
        const packageName = match.match(/["']([A-Za-z0-9_\-]+)["']/i);
        if (packageName) {
          dtsxNames.push(packageName[1] + '.dtsx');
        }
      });
    }

    return [...new Set(dtsxNames)]; // Supprimer les doublons
  }

  /**
   * Obtient les statistiques d'utilisation des DTSX dans les jobs
   */
  async getDtsxUsageStatistics(connection) {
    const jobsWithDtsx = await this.findAllJobsUsingDtsx(connection);
    const statistics = {};

    jobsWithDtsx.forEach(job => {
      job.dtsx_references.forEach(ref => {
        ref.dtsx_names.forEach(dtsxName => {
          if (!statistics[dtsxName]) {
            statistics[dtsxName] = {
              dtsx_name: dtsxName,
              job_count: 0,
              jobs: [],
              step_count: 0
            };
          }

          statistics[dtsxName].job_count++;
          statistics[dtsxName].step_count++;
          
          if (!statistics[dtsxName].jobs.find(j => j.job_id === job.job_id)) {
            statistics[dtsxName].jobs.push({
              job_id: job.job_id,
              job_name: job.name,
              enabled: job.enabled,
              last_run_status: job.last_run_status_desc
            });
          }
        });
      });
    });

    return Object.values(statistics).sort((a, b) => b.job_count - a.job_count);
  }
}

module.exports = JobDtsxMatcher;
