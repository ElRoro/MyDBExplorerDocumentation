# Utiliser l'image Node.js officielle
FROM node:18-alpine

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers de configuration des dépendances
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Installer les dépendances
RUN npm run install-all

# Copier le code source
COPY . .

# Build du frontend
RUN npm run build

# Copier le build dans le dossier public du serveur
RUN mkdir -p server/public && cp -r client/build/* server/public/

# Exposer le port
EXPOSE 5000

# Définir les variables d'environnement
ENV NODE_ENV=production
ENV PORT=5000

# Démarrer l'application
CMD ["npm", "start"] 