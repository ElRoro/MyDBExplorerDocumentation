const express = require('express');
const cors = require('cors');
const path = require('path');
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
  console.error('Erreur serveur:', err);
  console.error('Stack trace:', err.stack);
  res.status(500).json({ 
    error: 'Erreur serveur interne',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Une erreur est survenue'
  });
});

// Gestion des erreurs non capturées
process.on('uncaughtException', (err) => {
  console.error('Erreur non capturée (uncaughtException):', err);
  console.error('Stack trace:', err.stack);
  // Ne pas arrêter le serveur, juste logger l'erreur
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Promesse rejetée non gérée (unhandledRejection):', reason);
  console.error('Promise:', promise);
  // Ne pas arrêter le serveur, juste logger l'erreur
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
}); 