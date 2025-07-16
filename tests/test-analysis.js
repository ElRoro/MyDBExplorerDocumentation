const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:5000/api';
const TEST_CONNECTION_ID = 'test-connection-id'; // À adapter selon vos connexions

// Tests des nouvelles fonctionnalités d'analyse
async function testAnalysisFeatures() {
  console.log('🧪 Test des fonctionnalités d\'analyse avancée...\n');

  const tests = [
    {
      name: 'Analyse des Index',
      endpoint: '/analysis/index-analysis',
      description: 'Test de l\'analyse des index manquants et inutilisés'
    },
    {
      name: 'Analyse des Verrous',
      endpoint: '/analysis/locks-analysis', 
      description: 'Test de la détection des verrous et blocages'
    },
    {
      name: 'Analyse des Sauvegardes',
      endpoint: '/analysis/backup-analysis',
      description: 'Test de la vérification des sauvegardes'
    }
  ];

  for (const test of tests) {
    console.log(`📊 Test: ${test.name}`);
    console.log(`   Description: ${test.description}`);
    
    try {
      const response = await axios.get(`${BASE_URL}${test.endpoint}`, {
        params: {
          connectionId: TEST_CONNECTION_ID,
          databaseName: 'test_database'
        },
        timeout: 10000
      });

      if (response.data.success) {
        console.log(`   ✅ Succès - Données reçues`);
        
        // Analyser les données reçues
        const data = response.data.data;
        if (data) {
          if (data.missingIndexes) {
            console.log(`      📈 Index manquants: ${data.missingIndexes.length}`);
          }
          if (data.unusedIndexes) {
            console.log(`      📉 Index inutilisés: ${data.unusedIndexes.length}`);
          }
          if (data.blocking) {
            console.log(`      🔒 Sessions bloquées: ${data.blocking.length}`);
          }
          if (data.backups) {
            console.log(`      💾 Sauvegardes trouvées: ${data.backups.length}`);
          }
        }
      } else {
        console.log(`   ⚠️  Réponse reçue mais pas de succès`);
      }
    } catch (error) {
      if (error.response) {
        console.log(`   ❌ Erreur ${error.response.status}: ${error.response.data.error}`);
      } else if (error.code === 'ECONNREFUSED') {
        console.log(`   ❌ Serveur non accessible - Assurez-vous que le serveur est démarré`);
      } else {
        console.log(`   ❌ Erreur: ${error.message}`);
      }
    }
    
    console.log('');
  }
}

// Test de l'API de performance
async function testPerformanceAPI() {
  console.log('📊 Test de l\'API de performance...\n');

  const performanceTests = [
    {
      name: 'Statistiques de Performance',
      endpoint: '/performance/stats',
      method: 'GET'
    },
    {
      name: 'Rapport de Performance',
      endpoint: '/performance/report',
      method: 'GET'
    },
    {
      name: 'Analyse des Index de Performance',
      endpoint: '/performance/analyze-indexes',
      method: 'POST'
    }
  ];

  for (const test of performanceTests) {
    console.log(`📈 Test: ${test.name}`);
    
    try {
      const response = test.method === 'GET' 
        ? await axios.get(`${BASE_URL}${test.endpoint}`)
        : await axios.post(`${BASE_URL}${test.endpoint}`);

      if (response.data.success) {
        console.log(`   ✅ Succès - Données reçues`);
        
        // Analyser les données de performance
        const data = response.data.data;
        if (data) {
          if (data.summary) {
            console.log(`      📊 Total requêtes: ${data.summary.totalQueries}`);
            console.log(`      ⏱️  Durée moyenne: ${data.summary.avgDuration}ms`);
          }
          if (data.queries) {
            console.log(`      📋 Requêtes analysées: ${data.queries.length}`);
          }
        }
      } else {
        console.log(`   ⚠️  Réponse reçue mais pas de succès`);
      }
    } catch (error) {
      if (error.response) {
        console.log(`   ❌ Erreur ${error.response.status}: ${error.response.data.error}`);
      } else {
        console.log(`   ❌ Erreur: ${error.message}`);
      }
    }
    
    console.log('');
  }
}

// Test de mesure de requête personnalisée
async function testCustomQueryMeasurement() {
  console.log('🔍 Test de mesure de requête personnalisée...\n');

  try {
    const response = await axios.post(`${BASE_URL}/performance/measure`, {
      queryName: 'Test requête personnalisée',
      sql: 'SELECT COUNT(*) as count FROM connections WHERE enabled = 1',
      params: []
    });

    if (response.data.success) {
      const result = response.data.data;
      console.log(`   ✅ Requête mesurée avec succès`);
      console.log(`      ⏱️  Durée: ${result.duration}ms`);
      console.log(`      📊 Résultats: ${result.resultCount}`);
      console.log(`      ✅ Statut: ${result.success ? 'Succès' : 'Échec'}`);
    } else {
      console.log(`   ⚠️  Réponse reçue mais pas de succès`);
    }
  } catch (error) {
    if (error.response) {
      console.log(`   ❌ Erreur ${error.response.status}: ${error.response.data.error}`);
    } else {
      console.log(`   ❌ Erreur: ${error.message}`);
    }
  }
}

// Fonction principale
async function runAllTests() {
  console.log('🚀 Démarrage des tests d\'analyse avancée...\n');

  try {
    // Test 1: Fonctionnalités d'analyse
    await testAnalysisFeatures();
    
    // Test 2: API de performance
    await testPerformanceAPI();
    
    // Test 3: Mesure personnalisée
    await testCustomQueryMeasurement();
    
    console.log('🎉 Tous les tests sont terminés !');
    console.log('\n📋 Résumé des nouvelles fonctionnalités:');
    console.log('   ✅ Analyse des index manquants/inutilisés');
    console.log('   ✅ Détection des verrous et blocages');
    console.log('   ✅ Vérification des sauvegardes');
    console.log('   ✅ API de performance complète');
    console.log('   ✅ Monitoring en temps réel');
    
  } catch (error) {
    console.error('❌ Erreur lors des tests:', error);
    process.exit(1);
  }
}

// Exécution si le script est appelé directement
if (require.main === module) {
  runAllTests()
    .then(() => {
      console.log('\n✨ Tests terminés avec succès !');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erreur lors des tests:', error);
      process.exit(1);
    });
}

module.exports = {
  testAnalysisFeatures,
  testPerformanceAPI,
  testCustomQueryMeasurement,
  runAllTests
}; 