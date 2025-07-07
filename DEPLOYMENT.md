# 🚀 Guide de Déploiement - DBExplorer Documentation

## 📋 Prérequis

- Serveur Linux (Ubuntu 20.04+ recommandé)
- Node.js 18+
- npm ou yarn
- Git
- Nginx (optionnel)
- PM2 (pour la gestion des processus)

## 🎯 Options de Déploiement

### Option 1 : Déploiement Manuel avec PM2

#### 1. Préparation du serveur

```bash
# Mettre à jour le système
sudo apt update && sudo apt upgrade -y

# Installer Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Installer PM2
sudo npm install -g pm2

# Installer Nginx (optionnel)
sudo apt install nginx -y
```

#### 2. Cloner et configurer l'application

```bash
# Cloner le projet
git clone <votre-repo> dbexplorer
cd dbexplorer

# Rendre le script de déploiement exécutable
chmod +x deploy.sh

# Créer le fichier .env pour la production
cp server/.env.example server/.env
# Éditer server/.env avec vos configurations
```

#### 3. Déployer l'application

```bash
# Exécuter le script de déploiement
./deploy.sh
```

#### 4. Configurer Nginx (optionnel)

```bash
# Copier la configuration Nginx
sudo cp nginx.conf /etc/nginx/sites-available/dbexplorer

# Activer le site
sudo ln -s /etc/nginx/sites-available/dbexplorer /etc/nginx/sites-enabled/

# Tester la configuration
sudo nginx -t

# Redémarrer Nginx
sudo systemctl restart nginx
```

### Option 2 : Déploiement avec Docker

#### 1. Installer Docker et Docker Compose

```bash
# Installer Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Installer Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

#### 2. Déployer avec Docker Compose

```bash
# Construire et démarrer les conteneurs
docker-compose up -d

# Vérifier le statut
docker-compose ps

# Voir les logs
docker-compose logs -f
```

### Option 3 : Déploiement sur des plateformes cloud

#### Heroku

```bash
# Installer Heroku CLI
curl https://cli-assets.heroku.com/install.sh | sh

# Se connecter à Heroku
heroku login

# Créer l'application
heroku create dbexplorer-documentation

# Configurer les variables d'environnement
heroku config:set NODE_ENV=production

# Déployer
git push heroku main
```

#### Railway

```bash
# Installer Railway CLI
npm install -g @railway/cli

# Se connecter
railway login

# Initialiser le projet
railway init

# Déployer
railway up
```

#### DigitalOcean App Platform

1. Connectez-vous à votre compte DigitalOcean
2. Créez une nouvelle app
3. Connectez votre repository Git
4. Configurez les variables d'environnement
5. Déployez

## 🔧 Configuration de Production

### Variables d'environnement importantes

```env
# server/.env
NODE_ENV=production
PORT=5000
SESSION_SECRET=votre_secret_tres_securise
CORS_ORIGIN=https://votre-domaine.com
```

### Sécurité

1. **Changer les mots de passe par défaut**
2. **Configurer HTTPS** avec Let's Encrypt
3. **Configurer un firewall**
4. **Sauvegarder régulièrement la base de données**

```bash
# Installer Certbot pour HTTPS
sudo apt install certbot python3-certbot-nginx -y

# Obtenir un certificat SSL
sudo certbot --nginx -d votre-domaine.com
```

## 📊 Monitoring et Maintenance

### Commandes PM2 utiles

```bash
# Voir le statut
pm2 status

# Voir les logs
pm2 logs dbexplorer-server

# Redémarrer l'application
pm2 restart dbexplorer-server

# Mettre à jour l'application
./deploy.sh

# Monitorer les ressources
pm2 monit
```

### Sauvegarde de la base de données

```bash
# Créer un script de sauvegarde
cat > backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
cp server/database/dbexplorer.sqlite "backup/dbexplorer_$DATE.sqlite"
echo "Sauvegarde créée: dbexplorer_$DATE.sqlite"
EOF

chmod +x backup.sh

# Ajouter au cron pour une sauvegarde automatique
echo "0 2 * * * /chemin/vers/backup.sh" | crontab -
```

## 🚨 Dépannage

### Problèmes courants

1. **Port déjà utilisé**
   ```bash
   sudo lsof -i :5000
   sudo kill -9 <PID>
   ```

2. **Permissions sur les fichiers**
   ```bash
   sudo chown -R $USER:$USER /chemin/vers/app
   ```

3. **Logs d'erreur**
   ```bash
   pm2 logs dbexplorer-server --lines 100
   ```

4. **Redémarrer complètement**
   ```bash
   pm2 delete all
   pm2 start ecosystem.config.js
   ```

## 📈 Optimisations

1. **Activer la compression gzip** (déjà configuré dans nginx.conf)
2. **Configurer un CDN** pour les assets statiques
3. **Optimiser les images** Docker
4. **Mettre en place un cache Redis** si nécessaire

## 🔄 Mise à jour

```bash
# Mettre à jour le code
git pull origin main

# Redéployer
./deploy.sh

# Ou avec Docker
docker-compose down
docker-compose up -d --build
```

## 📞 Support

En cas de problème :
1. Vérifiez les logs : `pm2 logs dbexplorer-server`
2. Vérifiez le statut : `pm2 status`
3. Redémarrez l'application : `pm2 restart dbexplorer-server`
4. Consultez la documentation ou créez une issue 