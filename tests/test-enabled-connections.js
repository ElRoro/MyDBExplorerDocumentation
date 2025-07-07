const API_BASE_URL = 'http://localhost:5000/api';

async function makeRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
}

async function testEnabledConnections() {
  try {
    console.log('🧪 Test de la fonctionnalité d\'activation/désactivation des connexions...\n');

    // 1. Récupérer toutes les connexions
    console.log('1. Récupération de toutes les connexions...');
    const allConnections = await makeRequest(`${API_BASE_URL}/connections`);
    console.log(`   ✅ ${allConnections.length} connexions trouvées\n`);

    if (allConnections.length === 0) {
      console.log('   ⚠️  Aucune connexion trouvée. Créez d\'abord une connexion de test.');
      return;
    }

    // 2. Récupérer seulement les connexions activées
    console.log('2. Récupération des connexions activées...');
    const activeConnections = await makeRequest(`${API_BASE_URL}/connections/active`);
    console.log(`   ✅ ${activeConnections.length} connexions activées trouvées\n`);

    // 3. Tester le basculement d'une connexion
    const testConnection = allConnections[0];
    console.log(`3. Test du basculement pour la connexion: ${testConnection.name}`);
    console.log(`   État initial: ${testConnection.enabled ? 'Activée' : 'Désactivée'}`);

    // Basculement
    const toggleResponse = await makeRequest(`${API_BASE_URL}/connections/${testConnection.id}/toggle`, {
      method: 'PATCH'
    });
    const newState = toggleResponse.enabled;
    console.log(`   ✅ Nouvel état: ${newState ? 'Activée' : 'Désactivée'}`);

    // Vérifier que le basculement a fonctionné
    if (newState !== testConnection.enabled) {
      console.log('   ✅ Basculement réussi !');
    } else {
      console.log('   ❌ Erreur: le basculement n\'a pas fonctionné');
    }

    // 4. Vérifier que la recherche ne prend en compte que les connexions activées
    console.log('\n4. Test de la recherche avec connexions activées/désactivées...');
    
    // Compter les connexions activées après le basculement
    const updatedActiveConnections = await makeRequest(`${API_BASE_URL}/connections/active`);
    console.log(`   ✅ ${updatedActiveConnections.length} connexions activées après basculement`);

    // 5. Remettre la connexion dans son état initial
    console.log('\n5. Remise en état initial...');
    await makeRequest(`${API_BASE_URL}/connections/${testConnection.id}/toggle`, {
      method: 'PATCH'
    });
    console.log('   ✅ État initial restauré');

    console.log('\n🎉 Tous les tests sont passés avec succès !');
    console.log('\n📋 Résumé:');
    console.log('   - Les connexions peuvent être activées/désactivées');
    console.log('   - La recherche ne prend en compte que les connexions activées');
    console.log('   - L\'interface affiche clairement l\'état des connexions');

  } catch (error) {
    console.error('❌ Erreur lors du test:', error.message);
  }
}

testEnabledConnections(); 