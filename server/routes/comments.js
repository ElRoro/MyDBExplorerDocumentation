const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database/init');

// Obtenir tous les commentaires
router.get('/', (req, res) => {
  const sql = `
    SELECT c.*, conn.name as connection_name, conn.type as connection_type
    FROM comments c
    LEFT JOIN connections conn ON c.connection_id = conn.id
    ORDER BY c.updated_at DESC
  `;

  db.all(sql, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Obtenir les commentaires pour un objet spécifique
router.get('/object/:connectionId/:databaseName/:objectType/:objectName', (req, res) => {
  const { connectionId, databaseName, objectType, objectName } = req.params;
  const schemaName = req.query.schema_name || null;

  let sql = `
    SELECT c.*, conn.name as connection_name, conn.type as connection_type
    FROM comments c
    LEFT JOIN connections conn ON c.connection_id = conn.id
    WHERE c.connection_id = ? AND c.database_name = ? AND c.object_type = ? AND c.object_name = ?
  `;
  let params = [connectionId, databaseName, objectType, objectName];

  if (schemaName) {
    sql += ' AND c.schema_name = ?';
    params.push(schemaName);
  }

  sql += ' ORDER BY c.updated_at DESC';

  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Obtenir les commentaires pour une connexion
router.get('/connection/:connectionId', (req, res) => {
  const sql = `
    SELECT c.*, conn.name as connection_name, conn.type as connection_type
    FROM comments c
    LEFT JOIN connections conn ON c.connection_id = conn.id
    WHERE c.connection_id = ?
    ORDER BY c.updated_at DESC
  `;

  db.all(sql, [req.params.connectionId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Créer un nouveau commentaire
router.post('/', (req, res) => {
  const {
    connection_id,
    database_name,
    object_type,
    object_name,
    schema_name,
    comment
  } = req.body;

  if (!connection_id || !database_name || !object_type || !object_name || !comment) {
    return res.status(400).json({ error: 'Tous les champs obligatoires doivent être remplis' });
  }

  const id = uuidv4();
  const sql = `
    INSERT INTO comments (
      id, connection_id, database_name, object_type, object_name, schema_name, comment
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [id, connection_id, database_name, object_type, object_name, schema_name, comment];

  db.run(sql, params, function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Récupérer le commentaire créé avec les informations de connexion
    const selectSql = `
      SELECT c.*, conn.name as connection_name, conn.type as connection_type
      FROM comments c
      LEFT JOIN connections conn ON c.connection_id = conn.id
      WHERE c.id = ?
    `;
    
    db.get(selectSql, [id], (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json(row);
    });
  });
});

// Mettre à jour un commentaire
router.put('/:id', (req, res) => {
  const { comment } = req.body;

  if (!comment) {
    return res.status(400).json({ error: 'Le commentaire est obligatoire' });
  }

  const sql = `
    UPDATE comments SET 
      comment = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  db.run(sql, [comment, req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Commentaire non trouvé' });
    }
    
    // Récupérer le commentaire mis à jour
    const selectSql = `
      SELECT c.*, conn.name as connection_name, conn.type as connection_type
      FROM comments c
      LEFT JOIN connections conn ON c.connection_id = conn.id
      WHERE c.id = ?
    `;
    
    db.get(selectSql, [req.params.id], (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(row);
    });
  });
});

// Supprimer un commentaire
router.delete('/:id', (req, res) => {
  db.run('DELETE FROM comments WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Commentaire non trouvé' });
    }
    res.json({ message: 'Commentaire supprimé avec succès' });
  });
});

// Rechercher dans les commentaires
router.get('/search/:term', (req, res) => {
  const searchTerm = `%${req.params.term}%`;
  const sql = `
    SELECT c.*, conn.name as connection_name, conn.type as connection_type
    FROM comments c
    LEFT JOIN connections conn ON c.connection_id = conn.id
    WHERE c.comment LIKE ? OR c.object_name LIKE ?
    ORDER BY c.updated_at DESC
  `;

  db.all(sql, [searchTerm, searchTerm], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Obtenir les statistiques des commentaires
router.get('/stats/overview', (req, res) => {
  const sql = `
    SELECT 
      COUNT(*) as total_comments,
      COUNT(DISTINCT connection_id) as total_connections,
      COUNT(DISTINCT database_name) as total_databases,
      COUNT(DISTINCT object_type) as total_object_types,
      object_type,
      COUNT(*) as count_by_type
    FROM comments
    GROUP BY object_type
    ORDER BY count_by_type DESC
  `;

  db.all(sql, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    const stats = {
      total_comments: rows.length > 0 ? rows[0].total_comments : 0,
      total_connections: rows.length > 0 ? rows[0].total_connections : 0,
      total_databases: rows.length > 0 ? rows[0].total_databases : 0,
      total_object_types: rows.length > 0 ? rows[0].total_object_types : 0,
      by_type: rows.map(row => ({
        object_type: row.object_type,
        count: row.count_by_type
      }))
    };
    
    res.json(stats);
  });
});

module.exports = router; 