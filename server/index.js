const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('./utils/logger');
const { closeAllPools } = require('./utils/databaseConnector');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes API
app.use('/api/connections', require('./routes/connections'));
app.use('/api/search', require('./routes/search'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/databases', require('./routes/databases'));
app.use('/api/maintenance', require('./routes/maintenance'));
app.use('/api/performance', require('./routes/performance'));
app.use('/api/analysis', require('./routes/analysis'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/multi-query', require('./routes/multiQuery'));
app.use('/api/settings', require('./routes/settings'));

// Servir les fichiers statiques du frontend en production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'public')));
  
  // Route pour servir l'application React
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
} else {
  // Route de base pour le développement
  app.get('/', (req, res) => {
    res.json({ message: 'API DBExplorer Documentation' });
  });
}

// Gestion des erreurs globales
app.use((err, req, res, next) => {
  logger.error('Erreur serveur', err);
  res.status(500).json({ 
    error: 'Erreur serveur interne',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Une erreur est survenue'
  });
});

// Gestion des erreurs non capturées
process.on('uncaughtException', (err) => {
  logger.error('Erreur non capturée (uncaughtException)', err);
  // Ne pas arrêter le serveur, juste logger l'erreur
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promesse rejetée non gérée (unhandledRejection)', reason);
  // Ne pas arrêter le serveur, juste logger l'erreur
});

// Gestion de l'arrêt propre du serveur
process.on('SIGINT', async () => {
  logger.info('Arrêt du serveur...');
  try {
    await closeAllPools();
    logger.info('Pools de connexion fermés');
  } catch (error) {
    logger.error('Erreur lors de la fermeture des pools:', error);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Arrêt du serveur (SIGTERM)...');
  try {
    await closeAllPools();
    logger.info('Pools de connexion fermés');
  } catch (error) {
    logger.error('Erreur lors de la fermeture des pools:', error);
  }
  process.exit(0);
});

const server = app.listen(PORT, () => {
  logger.info(`Serveur démarré sur le port ${PORT}`);
});

// Gestion de l'arrêt du serveur HTTP
server.on('close', async () => {
  logger.info('Serveur HTTP fermé');
  try {
    await closeAllPools();
    logger.info('Pools de connexion fermés');
  } catch (error) {
    logger.error('Erreur lors de la fermeture des pools:', error);
  }
}); 