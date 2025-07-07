#!/bin/bash

echo "🚀 Déploiement de DBExplorer Documentation..."

# Arrêter l'application si elle tourne
pm2 stop dbexplorer-server 2>/dev/null || true
pm2 delete dbexplorer-server 2>/dev/null || true

# Installer les dépendances
echo "📦 Installation des dépendances..."
npm run install-all

# Build du frontend
echo "🔨 Build du frontend..."
npm run build

# Copier le build dans le dossier public du serveur
echo "📁 Copie des fichiers build..."
mkdir -p server/public
cp -r client/build/* server/public/

# Démarrer l'application avec PM2
echo "▶️ Démarrage de l'application..."
pm2 start ecosystem.config.js --env production

# Sauvegarder la configuration PM2
pm2 save

# Afficher le statut
echo "✅ Déploiement terminé !"
pm2 status
echo ""
echo "📊 Logs disponibles avec: pm2 logs dbexplorer-server"
echo "🔄 Redémarrage avec: pm2 restart dbexplorer-server" 