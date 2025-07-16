const { db } = require('../database/init');

class PerformanceMonitor {
  constructor() {
    this.queryStats = new Map();
    this.slowQueryThreshold = 100; // ms
  }

  // Mesurer le temps d'exécution d'une requête
  async measureQuery(queryName, queryFunction, params = []) {
    const startTime = Date.now();
    
    try {
      const result = await new Promise((resolve, reject) => {
        if (params.length > 0) {
          db.all(queryFunction, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        } else {
          db.all(queryFunction, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        }
      });

      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Enregistrer les statistiques
      this.recordQueryStats(queryName, duration, result.length);
      
      return {
        success: true,
        duration,
        resultCount: result.length,
        data: result
      };
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      this.recordQueryStats(queryName, duration, 0, error);
      
      return {
        success: false,
        duration,
        error: error.message
      };
    }
  }

  // Enregistrer les statistiques d'une requête
  recordQueryStats(queryName, duration, resultCount, error = null) {
    if (!this.queryStats.has(queryName)) {
      this.queryStats.set(queryName, {
        count: 0,
        totalDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        slowQueries: 0,
        errors: 0,
        totalResults: 0
      });
    }

    const stats = this.queryStats.get(queryName);
    stats.count++;
    stats.totalDuration += duration;
    stats.minDuration = Math.min(stats.minDuration, duration);
    stats.maxDuration = Math.max(stats.maxDuration, duration);
    stats.totalResults += resultCount;

    if (duration > this.slowQueryThreshold) {
      stats.slowQueries++;
    }

    if (error) {
      stats.errors++;
    }

    this.queryStats.set(queryName, stats);
  }

  // Obtenir les statistiques d'une requête
  getQueryStats(queryName) {
    const stats = this.queryStats.get(queryName);
    if (!stats) return null;

    return {
      queryName,
      count: stats.count,
      avgDuration: stats.count > 0 ? Math.round(stats.totalDuration / stats.count) : 0,
      minDuration: stats.minDuration === Infinity ? 0 : stats.minDuration,
      maxDuration: stats.maxDuration,
      slowQueries: stats.slowQueries,
      slowQueryPercentage: stats.count > 0 ? Math.round((stats.slowQueries / stats.count) * 100) : 0,
      errors: stats.errors,
      errorPercentage: stats.count > 0 ? Math.round((stats.errors / stats.count) * 100) : 0,
      avgResults: stats.count > 0 ? Math.round(stats.totalResults / stats.count) : 0
    };
  }

  // Obtenir toutes les statistiques
  getAllStats() {
    const allStats = [];
    for (const [queryName, stats] of this.queryStats) {
      allStats.push(this.getQueryStats(queryName));
    }
    return allStats.sort((a, b) => b.count - a.count);
  }

  // Analyser les performances des index
  async analyzeIndexPerformance() {
    console.log('🔍 Analyse des performances des index...');

    const queries = [
      {
        name: 'Connexions activées (avec index)',
        sql: 'SELECT * FROM connections WHERE enabled = 1 ORDER BY name',
        description: 'Utilise idx_connections_enabled et idx_connections_name'
      },
      {
        name: 'Recherches récentes (avec index)',
        sql: 'SELECT * FROM recent_searches ORDER BY created_at DESC LIMIT 20',
        description: 'Utilise idx_recent_searches_created'
      },
      {
        name: 'Commentaires par connexion (avec index)',
        sql: 'SELECT * FROM comments WHERE connection_id = ? ORDER BY created_at DESC',
        description: 'Utilise idx_comments_connection et idx_comments_created'
      }
    ];

    const results = [];

    for (const query of queries) {
      console.log(`\n📊 Test: ${query.name}`);
      console.log(`   Description: ${query.description}`);
      
      const result = await this.measureQuery(
        query.name,
        query.sql,
        query.sql.includes('?') ? ['test-connection-id'] : []
      );

      results.push({
        ...query,
        ...result
      });

      if (result.success) {
        console.log(`   ✅ Durée: ${result.duration}ms, Résultats: ${result.resultCount}`);
        if (result.duration > this.slowQueryThreshold) {
          console.log(`   ⚠️  Requête lente détectée (${result.duration}ms > ${this.slowQueryThreshold}ms)`);
        }
      } else {
        console.log(`   ❌ Erreur: ${result.error}`);
      }
    }

    return results;
  }

  // Générer un rapport de performance
  generatePerformanceReport() {
    const stats = this.getAllStats();
    
    if (stats.length === 0) {
      return {
        message: 'Aucune donnée de performance disponible',
        timestamp: new Date().toISOString()
      };
    }

    const totalQueries = stats.reduce((sum, stat) => sum + stat.count, 0);
    const totalDuration = stats.reduce((sum, stat) => sum + (stat.avgDuration * stat.count), 0);
    const avgDuration = totalQueries > 0 ? Math.round(totalDuration / totalQueries) : 0;
    const slowQueries = stats.reduce((sum, stat) => sum + stat.slowQueries, 0);
    const errors = stats.reduce((sum, stat) => sum + stat.errors, 0);

    return {
      timestamp: new Date().toISOString(),
      summary: {
        totalQueries,
        avgDuration,
        slowQueries,
        slowQueryPercentage: totalQueries > 0 ? Math.round((slowQueries / totalQueries) * 100) : 0,
        errors,
        errorPercentage: totalQueries > 0 ? Math.round((errors / totalQueries) * 100) : 0
      },
      queries: stats,
      recommendations: this.generateRecommendations(stats)
    };
  }

  // Générer des recommandations basées sur les statistiques
  generateRecommendations(stats) {
    const recommendations = [];

    // Analyser les requêtes lentes
    const slowQueries = stats.filter(stat => stat.slowQueryPercentage > 10);
    if (slowQueries.length > 0) {
      recommendations.push({
        type: 'warning',
        message: `${slowQueries.length} requête(s) avec plus de 10% de requêtes lentes`,
        queries: slowQueries.map(q => q.queryName)
      });
    }

    // Analyser les erreurs
    const errorQueries = stats.filter(stat => stat.errorPercentage > 5);
    if (errorQueries.length > 0) {
      recommendations.push({
        type: 'error',
        message: `${errorQueries.length} requête(s) avec plus de 5% d'erreurs`,
        queries: errorQueries.map(q => q.queryName)
      });
    }

    // Recommandations d'optimisation
    const highVolumeQueries = stats.filter(stat => stat.count > 100);
    if (highVolumeQueries.length > 0) {
      recommendations.push({
        type: 'info',
        message: `${highVolumeQueries.length} requête(s) à fort volume - considérer la mise en cache`,
        queries: highVolumeQueries.map(q => q.queryName)
      });
    }

    return recommendations;
  }

  // Réinitialiser les statistiques
  resetStats() {
    this.queryStats.clear();
    console.log('📊 Statistiques de performance réinitialisées');
  }
}

module.exports = new PerformanceMonitor(); 