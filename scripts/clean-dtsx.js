const fs = require('fs').promises;
const path = require('path');

class DtsxCleaner {
  constructor(rootPath) {
    this.rootPath = rootPath;
    this.stats = {
      processed: 0,
      renamed: 0,
      deleted: 0,
      errors: 0
    };
  }

  async clean() {
    try {
      // Lire tous les serveurs
      const servers = await fs.readdir(this.rootPath);
      
      for (const server of servers) {
        const serverPath = path.join(this.rootPath, server);
        const stat = await fs.stat(serverPath);
        
        if (!stat.isDirectory()) continue;

        console.log(`\nTraitement du serveur: ${server}`);
        await this.cleanServer(serverPath);
      }

      this.printStats();
    } catch (error) {
      console.error('Erreur lors du nettoyage:', error);
    }
  }

  async cleanServer(serverPath) {
    try {
      // Lire tous les fichiers DTSX du serveur
      console.log(`\nLecture des fichiers dans ${serverPath}`);
      const files = await fs.readdir(serverPath);
      console.log(`Fichiers trouvés: ${files.length}`);
      const dtsxFiles = files.filter(f => f.toLowerCase().endsWith('.dtsx'));
      console.log(`Fichiers DTSX trouvés: ${dtsxFiles.length}`);

      // Regrouper uniquement les fichiers qui ont un numéro de version
      const groups = new Map();
      console.log('\nFichiers avec numéro de version :');
      for (const file of dtsxFiles) {
        // Ne traiter que les fichiers qui ont un numéro de version
        if (this.hasVersionNumber(file)) {
          console.log(`  ${file} -> ${this.getBaseName(file)}`);
        }
        
        const baseName = this.getBaseName(file);
        if (!groups.has(baseName)) {
          groups.set(baseName, []);
        }
        groups.get(baseName).push(file);
      }

      // Traiter chaque groupe
      for (const [baseName, versions] of groups) {
        this.stats.processed++;

        if (versions.length === 1) {
          // S'il n'y a qu'une version mais qu'elle a un numéro, la renommer
          const file = versions[0];
          if (this.hasVersionNumber(file)) {
            const newName = baseName + '.dtsx';
            await this.renameFile(serverPath, file, newName);
          }
          continue;
        }

        // Récupérer les dates de modification pour chaque fichier
        const fileStats = await Promise.all(
          versions.map(async (file) => {
            const stats = await fs.stat(path.join(serverPath, file));
            return {
              file,
              mtime: stats.mtime
            };
          })
        );

        // Trier par date de modification (la plus récente en premier)
        const sorted = fileStats
          .sort((a, b) => b.mtime - a.mtime)
          .map(stat => stat.file);

        // Afficher les dates des fichiers
        console.log(`\nGroupe: ${baseName}`);
        for (const file of versions) {
          const stats = await fs.stat(path.join(serverPath, file));
          console.log(`  ${file} - Modifié le: ${stats.mtime.toLocaleString()}`);
        }

        // Garder la plus récente et la renommer si nécessaire
        const latest = sorted[0];
        const newName = baseName + '.dtsx';
        
        console.log(`  ✅ Gardé: ${latest} (le plus récent)`);
        
        // Vérifier si le fichier sans numéro de version existe déjà
        try {
          await fs.access(path.join(serverPath, newName));
          // Si le fichier existe, on garde celui-là et on supprime toutes les versions numérotées
          console.log(`  ⚠️  Le fichier ${newName} existe déjà, on le garde et on supprime toutes les versions numérotées`);
          for (const file of sorted) {
            await this.deleteFile(serverPath, file);
          }
        } catch {
          // Si le fichier n'existe pas, on renomme la dernière version
          if (latest !== newName) {
            await this.renameFile(serverPath, latest, newName);
          }
          // Supprimer les autres versions
          for (let i = 1; i < sorted.length; i++) {
            await this.deleteFile(serverPath, sorted[i]);
          }
        }
      }
    } catch (error) {
      console.error(`Erreur lors du nettoyage du serveur ${serverPath}:`, error);
      this.stats.errors++;
    }
  }

  getBaseName(filename) {
    // Extraire la partie avant le numéro de version entre parenthèses
    const match = filename.match(/^(.+?)(?:\s*\(\d+\))?\.(dtsx|DTSX)$/i);
    if (!match) return filename;
    
    return match[1]; // Retourne la partie avant le (XX) et l'extension
  }

  hasVersionNumber(filename) {
    return /\(\d+\)\.(dtsx|DTSX)$/i.test(filename);
  }

  extractVersionNumber(filename) {
    const match = filename.match(/\((\d+)\)\.(dtsx|DTSX)$/i);
    return match ? parseInt(match[1], 10) : null;
  }

  async renameFile(serverPath, oldName, newName) {
    try {
      const oldPath = path.join(serverPath, oldName);
      const newPath = path.join(serverPath, newName);
      
      // Vérifier si le nouveau nom existe déjà
      try {
        await fs.access(newPath);
        // Si on arrive ici, le fichier existe déjà
        console.log(`⚠️  Le fichier ${newName} existe déjà dans ${serverPath}, suppression de ${oldName}`);
        await fs.unlink(oldPath);
        this.stats.deleted++;
      } catch {
        // Le fichier n'existe pas, on peut renommer
        await fs.rename(oldPath, newPath);
        console.log(`✅ Renommé: ${oldName} -> ${newName}`);
        this.stats.renamed++;
      }
    } catch (error) {
      console.error(`❌ Erreur lors du renommage de ${oldName}:`, error);
      this.stats.errors++;
    }
  }

  async deleteFile(serverPath, filename) {
    try {
      await fs.unlink(path.join(serverPath, filename));
      console.log(`🗑️  Supprimé: ${filename}`);
      this.stats.deleted++;
    } catch (error) {
      console.error(`❌ Erreur lors de la suppression de ${filename}:`, error);
      this.stats.errors++;
    }
  }

  printStats() {
    console.log('\n📊 Statistiques du nettoyage:');
    console.log(`📁 Groupes de fichiers traités: ${this.stats.processed}`);
    console.log(`✨ Fichiers renommés: ${this.stats.renamed}`);
    console.log(`🗑️  Fichiers supprimés: ${this.stats.deleted}`);
    console.log(`❌ Erreurs rencontrées: ${this.stats.errors}`);
  }
}

// Chemin vers le dossier SSIS_DTSX
const DTSX_ROOT = path.join(__dirname, '../../SSIS_DTSX');

// Exécuter le nettoyage
console.log('🚀 Démarrage du nettoyage des fichiers DTSX...');
console.log('📁 Dossier racine:', DTSX_ROOT);

const cleaner = new DtsxCleaner(DTSX_ROOT);
cleaner.clean().then(() => {
  console.log('\n✅ Nettoyage terminé !');
});
