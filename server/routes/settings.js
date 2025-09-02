const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const DtsxSearcher = require('../utils/dtsxSearcher');

// Chemin vers le fichier de configuration
const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'settings.json');

// Fonction pour charger les paramètres
const loadSettings = async () => {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf8');
    const settings = JSON.parse(data);
    
    // Ajouter le chemin DTSX actuel s'il n'est pas défini
    if (!settings.currentDtsxPath) {
      const dtsxSearcher = new DtsxSearcher();
      settings.currentDtsxPath = dtsxSearcher.getCurrentDtsxPath();
    }
    
    return settings;
  } catch (error) {
    // Si le fichier n'existe pas, retourner les paramètres par défaut
    if (error.code === 'ENOENT') {
      const dtsxSearcher = new DtsxSearcher();
      return {
        dtsxPath: '',
        currentDtsxPath: dtsxSearcher.getCurrentDtsxPath(),
        version: '1.0.0'
      };
    }
    throw error;
  }
};

// Fonction pour sauvegarder les paramètres
const saveSettings = async (settings) => {
  try {
    // Créer le dossier data s'il n'existe pas
    const dataDir = path.dirname(SETTINGS_FILE);
    await fs.mkdir(dataDir, { recursive: true });
    
    // Sauvegarder les paramètres
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    logger.info('Paramètres sauvegardés', { settings });
  } catch (error) {
    logger.error('Erreur lors de la sauvegarde des paramètres', { error: error.message });
    throw error;
  }
};

// GET /api/settings - Récupérer les paramètres
router.get('/', async (req, res) => {
  try {
    const settings = await loadSettings();
    res.json(settings);
  } catch (error) {
    logger.error('Erreur lors du chargement des paramètres', { error: error.message });
    res.status(500).json({ error: 'Erreur lors du chargement des paramètres' });
  }
});

// PUT /api/settings - Mettre à jour les paramètres
router.put('/', async (req, res) => {
  try {
    const { dtsxPath } = req.body;
    
    // Validation du chemin DTSX
    if (dtsxPath && dtsxPath.trim()) {
      try {
        const stats = await fs.stat(dtsxPath.trim());
        if (!stats.isDirectory()) {
          return res.status(400).json({ 
            error: 'Le chemin spécifié n\'est pas un dossier valide' 
          });
        }
      } catch (error) {
        return res.status(400).json({ 
          error: 'Le chemin spécifié n\'existe pas ou n\'est pas accessible' 
        });
      }
    }

    // Charger les paramètres existants
    const currentSettings = await loadSettings();
    
    // Mettre à jour avec les nouvelles valeurs
    const updatedSettings = {
      ...currentSettings,
      dtsxPath: dtsxPath ? dtsxPath.trim() : '',
      currentDtsxPath: dtsxPath ? dtsxPath.trim() : currentSettings.currentDtsxPath,
      lastUpdated: new Date().toISOString()
    };

    // Sauvegarder les paramètres
    await saveSettings(updatedSettings);

    res.json(updatedSettings);
  } catch (error) {
    logger.error('Erreur lors de la mise à jour des paramètres', { error: error.message });
    res.status(500).json({ error: 'Erreur lors de la sauvegarde des paramètres' });
  }
});

module.exports = router;
