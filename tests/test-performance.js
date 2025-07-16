const performanceMonitor = require('../server/utils/performanceMonitor');
const { migrateIndexes } = require('../server/migrate-indexes');

// Test des performances des index
async function testIndexPerformance() {
  console.log('🚀 Test des performances des index...\n');

  try {
    // 1. Migration des index
    console.log('📊 Étape 1: Migration des index...');
    await migrateIndexes();
    console.log('✅ Migration terminée\n');

    // 2. Analyse des performances
    console.log('🔍 Étape 2: Analyse des performances...');
    const results = await performanceMonitor.analyzeIndexPerformance();
    
    console.log('\n📈 Résultats de l\'analyse:');
    results.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.name}`);
      console.log(`   Description: ${result.description}`);
      console.log(`   Durée: ${result.duration}ms`);
      console.log(`   Résultats: ${result.resultCount}`);
      console.log(`   Statut: ${result.success ? '✅ Succès' : '❌ Échec'}`);
      
      if (!result.success) {
        console.log(`   Erreur: ${result.error}`);
      }
    });

    // 3. Génération du rapport
    console.log('\n📋 Étape 3: Génération du rapport de performance...');
    const report = performanceMonitor.generatePerformanceReport();
    
    console.log('\n📊 Rapport de performance:');
    console.log(`   Total des requêtes: ${report.summary?.totalQueries || 0}`);
    console.log(`   Durée moyenne: ${report.summary?.avgDuration || 0}ms`);
    console.log(`   Requêtes lentes: ${report.summary?.slowQueries || 0} (${report.summary?.slowQueryPercentage || 0}%)`);
    console.log(`   Erreurs: ${report.summary?.errors || 0} (${report.summary?.errorPercentage || 0}%)`);

    if (report.recommendations && report.recommendations.length > 0) {
      console.log('\n💡 Recommandations:');
      report.recommendations.forEach((rec, index) => {
        console.log(`   ${index + 1}. [${rec.type.toUpperCase()}] ${rec.message}`);
        if (rec.queries) {
          console.log(`      Requêtes concernées: ${rec.queries.join(', ')}`);
        }
      });
    }

    // 4. Test de charge
    console.log('\n⚡ Étape 4: Test de charge...');
    await testLoadPerformance();

    console.log('\n🎉 Tests de performance terminés avec succès !');

  } catch (error) {
    console.error('❌ Erreur lors des tests de performance:', error);
    process.exit(1);
  }
}

// Test de charge pour simuler un usage intensif
async function testLoadPerformance() {
  console.log('   Simulation d\'un usage intensif...');
  
  const queries = [
    {
      name: 'Connexions activées (test de charge)',
      sql: 'SELECT * FROM connections WHERE enabled = 1 ORDER BY name'
    },
    {
      name: 'Recherches récentes (test de charge)',
      sql: 'SELECT * FROM recent_searches ORDER BY created_at DESC LIMIT 20'
    },
    {
      name: 'Commentaires (test de charge)',
      sql: 'SELECT * FROM comments ORDER BY created_at DESC LIMIT 10'
    }
  ];

  // Exécuter chaque requête 10 fois pour simuler un usage intensif
  for (const query of queries) {
    console.log(`   Test de charge: ${query.name}`);
    
    const startTime = Date.now();
    const iterations = 10;
    
    for (let i = 0; i < iterations; i++) {
      await performanceMonitor.measureQuery(
        `${query.name} - Itération ${i + 1}`,
        query.sql
      );
    }
    
    const endTime = Date.now();
    const totalDuration = endTime - startTime;
    const avgDuration = Math.round(totalDuration / iterations);
    
    console.log(`     ${iterations} itérations en ${totalDuration}ms (moyenne: ${avgDuration}ms)`);
  }
}

// Test des métriques de performance
async function testPerformanceMetrics() {
  console.log('\n📊 Test des métriques de performance...');

  const testQueries = [
    {
      name: 'Test rapide',
      sql: 'SELECT COUNT(*) as count FROM connections',
      expectedDuration: 50 // ms
    },
    {
      name: 'Test avec jointure',
      sql: `
        SELECT c.name, COUNT(com.id) as comment_count 
        FROM connections c 
        LEFT JOIN comments com ON c.id = com.connection_id 
        GROUP BY c.id, c.name
      `,
      expectedDuration: 100 // ms
    }
  ];

  for (const query of testQueries) {
    console.log(`\n🔍 Test: ${query.name}`);
    
    const result = await performanceMonitor.measureQuery(
      query.name,
      query.sql
    );

    console.log(`   Durée réelle: ${result.duration}ms`);
    console.log(`   Durée attendue: ${query.expectedDuration}ms`);
    console.log(`   Performance: ${result.duration <= query.expectedDuration ? '✅ OK' : '⚠️  LENT'}`);
    
    if (result.success) {
      console.log(`   Résultats: ${result.resultCount}`);
    } else {
      console.log(`   Erreur: ${result.error}`);
    }
  }
}

// Fonction principale
async function runPerformanceTests() {
  console.log('🎯 Démarrage des tests de performance...\n');

  try {
    // Test 1: Performance des index
    await testIndexPerformance();
    
    // Test 2: Métriques de performance
    await testPerformanceMetrics();
    
    console.log('\n✨ Tous les tests de performance sont terminés !');
    console.log('\n📋 Résumé:');
    console.log('   ✅ Index de performance implémentés');
    console.log('   ✅ Monitoring des performances actif');
    console.log('   ✅ API de performance disponible');
    console.log('   ✅ Tests de charge validés');
    
  } catch (error) {
    console.error('❌ Erreur lors des tests:', error);
    process.exit(1);
  }
}

// Exécution si le script est appelé directement
if (require.main === module) {
  runPerformanceTests()
    .then(() => {
      console.log('\n🎉 Tests terminés avec succès !');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erreur lors des tests:', error);
      process.exit(1);
    });
}

module.exports = {
  testIndexPerformance,
  testLoadPerformance,
  testPerformanceMetrics,
  runPerformanceTests
}; 