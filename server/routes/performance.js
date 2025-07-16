const express = require('express');
const router = express.Router();
const performanceMonitor = require('../utils/performanceMonitor');

// Route pour obtenir les statistiques de performance
router.get('/stats', (req, res) => {
  try {
    const stats = performanceMonitor.getAllStats();
    const report = performanceMonitor.generatePerformanceReport();
    
    res.json({
      success: true,
      data: {
        stats,
        report
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la récupération des statistiques',
      details: error.message 
    });
  }
});

// Route pour analyser les performances des index
router.post('/analyze-indexes', async (req, res) => {
  try {
    const results = await performanceMonitor.analyzeIndexPerformance();
    
    res.json({
      success: true,
      data: results,
      message: 'Analyse des performances des index terminée'
    });
  } catch (error) {
    console.error('Erreur lors de l\'analyse des index:', error);
    res.status(500).json({ 
      error: 'Erreur lors de l\'analyse des index',
      details: error.message 
    });
  }
});

// Route pour réinitialiser les statistiques
router.post('/reset', (req, res) => {
  try {
    performanceMonitor.resetStats();
    
    res.json({
      success: true,
      message: 'Statistiques de performance réinitialisées'
    });
  } catch (error) {
    console.error('Erreur lors de la réinitialisation:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la réinitialisation',
      details: error.message 
    });
  }
});

// Route pour obtenir un rapport détaillé
router.get('/report', (req, res) => {
  try {
    const report = performanceMonitor.generatePerformanceReport();
    
    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Erreur lors de la génération du rapport:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la génération du rapport',
      details: error.message 
    });
  }
});

// Route pour mesurer une requête spécifique
router.post('/measure', async (req, res) => {
  try {
    const { queryName, sql, params = [] } = req.body;
    
    if (!queryName || !sql) {
      return res.status(400).json({ 
        error: 'queryName et sql sont requis' 
      });
    }

    const result = await performanceMonitor.measureQuery(queryName, sql, params);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Erreur lors de la mesure:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la mesure',
      details: error.message 
    });
  }
});

module.exports = router; 