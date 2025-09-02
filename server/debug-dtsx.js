const DtsxSearcher = require('./utils/dtsxSearcher');
const path = require('path');

async function debugDtsx() {
  try {
    console.log('=== DÉBUT DU DÉBOGAGE DTSX ===');
    
    const searcher = new DtsxSearcher();
    
    // Test 1: Vérifier si DTSX est disponible
    console.log('\n1. Test disponibilité DTSX:');
    const isAvailable = DtsxSearcher.isDtsxAvailable();
    console.log('DTSX disponible:', isAvailable);
    
    // Test 2: Vérifier le chemin racine
    console.log('\n2. Chemin racine DTSX:');
    console.log('Chemin:', searcher.dtsxRootPath);
    console.log('Chemin existe:', require('fs').existsSync(searcher.dtsxRootPath));
    
    // Test 3: Lister les serveurs
    console.log('\n3. Liste des serveurs:');
    try {
      const servers = await searcher.getServers();
      console.log('Serveurs trouvés:', servers);
    } catch (error) {
      console.log('Erreur getServers:', error.message);
    }
    
    // Test 4: Test avec le fichier exemple
    console.log('\n4. Test avec fichier exemple:');
    const filePath = path.join(__dirname, '../Example/EXTRACTION_ALL_ARTICLE_PROPHARMA Balexert NS Data.dtsx');
    console.log('Fichier test:', filePath);
    console.log('Fichier existe:', require('fs').existsSync(filePath));
    
    if (require('fs').existsSync(filePath)) {
      try {
        const result = await searcher.getDtsxDetails(filePath);
        console.log('Résultat extraction:', result ? 'SUCCÈS' : 'ÉCHEC');
        
        if (result) {
          console.log('Nombre d\'exécutables:', result.executables ? result.executables.length : 'NULL');
          
          if (result.executables && result.executables.length > 0) {
            console.log('Premier exécutable:');
            console.log('  Nom:', result.executables[0].name);
            console.log('  Type:', result.executables[0].type);
            console.log('  Description:', result.executables[0].description);
          }
        }
      } catch (error) {
        console.log('Erreur extraction:', error.message);
        console.log('Stack:', error.stack);
      }
    }
    
    console.log('\n=== FIN DU DÉBOGAGE ===');
    
  } catch (error) {
    console.error('Erreur générale:', error);
    console.error('Stack:', error.stack);
  }
}

debugDtsx();

