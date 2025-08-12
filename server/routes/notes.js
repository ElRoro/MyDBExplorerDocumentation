const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database/init');

// Validation utilitaire
function validateNoteData({ title, content }) {
  if (!title || !title.trim()) {
    return 'Le titre est obligatoire';
  }
  if (!content || !content.trim()) {
    return 'Le contenu est obligatoire';
  }
  if (title.length > 200) {
    return 'Le titre ne peut pas dépasser 200 caractères';
  }
  return null;
}

// Obtenir toutes les notes avec filtres optionnels
router.get('/', (req, res) => {
  try {
    const { search, connection_id, tags } = req.query;
    let query = `
      SELECT n.*, c.name as connection_name 
      FROM notes n 
      LEFT JOIN connections c ON n.connection_id = c.id
    `;
    const params = [];
    const conditions = [];

    if (search) {
      conditions.push('(n.title LIKE ? OR n.content LIKE ? OR n.tags LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (connection_id) {
      conditions.push('n.connection_id = ?');
      params.push(connection_id);
    }

    if (tags) {
      conditions.push('n.tags LIKE ?');
      params.push(`%${tags}%`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY n.updated_at DESC';

    db.all(query, params, (err, rows) => {
      if (err) {
        console.error('Erreur lors de la récupération des notes:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    });
  } catch (error) {
    console.error('Erreur inattendue (GET /):', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Obtenir une note par ID
router.get('/:id', (req, res) => {
  try {
    const query = `
      SELECT n.*, c.name as connection_name 
      FROM notes n 
      LEFT JOIN connections c ON n.connection_id = c.id 
      WHERE n.id = ?
    `;
    
    db.get(query, [req.params.id], (err, row) => {
      if (err) {
        console.error('Erreur lors de la récupération de la note:', err);
        return res.status(500).json({ error: err.message });
      }
      if (!row) {
        return res.status(404).json({ error: 'Note non trouvée' });
      }
      res.json(row);
    });
  } catch (error) {
    console.error('Erreur inattendue (GET /:id):', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Créer une nouvelle note
router.post('/', (req, res) => {
  try {
    const data = req.body;
    const validationError = validateNoteData(data);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const noteId = uuidv4();
    const { title, content, connection_id, database_name, tags } = data;

    const query = `
      INSERT INTO notes (id, title, content, connection_id, database_name, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `;

    db.run(query, [noteId, title.trim(), content.trim(), connection_id || null, database_name || null, tags || null], function(err) {
      if (err) {
        console.error('Erreur lors de la création de la note:', err);
        return res.status(500).json({ error: err.message });
      }

      // Récupérer la note créée avec le nom de la connexion
      const selectQuery = `
        SELECT n.*, c.name as connection_name 
        FROM notes n 
        LEFT JOIN connections c ON n.connection_id = c.id 
        WHERE n.id = ?
      `;
      
      db.get(selectQuery, [noteId], (err, row) => {
        if (err) {
          console.error('Erreur lors de la récupération de la note créée:', err);
          return res.status(500).json({ error: err.message });
        }
        res.status(201).json(row);
      });
    });
  } catch (error) {
    console.error('Erreur inattendue (POST /):', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Mettre à jour une note
router.put('/:id', (req, res) => {
  try {
    const data = req.body;
    const validationError = validateNoteData(data);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { title, content, connection_id, database_name, tags } = data;

    const query = `
      UPDATE notes 
      SET title = ?, content = ?, connection_id = ?, database_name = ?, tags = ?, updated_at = datetime('now')
      WHERE id = ?
    `;

    db.run(query, [title.trim(), content.trim(), connection_id || null, database_name || null, tags || null, req.params.id], function(err) {
      if (err) {
        console.error('Erreur lors de la mise à jour de la note:', err);
        return res.status(500).json({ error: err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Note non trouvée' });
      }

      // Récupérer la note mise à jour avec le nom de la connexion
      const selectQuery = `
        SELECT n.*, c.name as connection_name 
        FROM notes n 
        LEFT JOIN connections c ON n.connection_id = c.id 
        WHERE n.id = ?
      `;
      
      db.get(selectQuery, [req.params.id], (err, row) => {
        if (err) {
          console.error('Erreur lors de la récupération de la note mise à jour:', err);
          return res.status(500).json({ error: err.message });
        }
        res.json(row);
      });
    });
  } catch (error) {
    console.error('Erreur inattendue (PUT /:id):', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Supprimer une note
router.delete('/:id', (req, res) => {
  try {
    db.run('DELETE FROM notes WHERE id = ?', [req.params.id], function(err) {
      if (err) {
        console.error('Erreur lors de la suppression de la note:', err);
        return res.status(500).json({ error: err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Note non trouvée' });
      }

      res.json({ message: 'Note supprimée avec succès' });
    });
  } catch (error) {
    console.error('Erreur inattendue (DELETE /:id):', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Obtenir les statistiques des notes
router.get('/stats/summary', (req, res) => {
  try {
    const queries = [
      'SELECT COUNT(*) as total FROM notes',
      'SELECT COUNT(*) as with_connection FROM notes WHERE connection_id IS NOT NULL',
      'SELECT COUNT(*) as without_connection FROM notes WHERE connection_id IS NULL',
      'SELECT COUNT(*) as recent FROM notes WHERE created_at >= datetime("now", "-7 days")'
    ];

    Promise.all(queries.map(query => {
      return new Promise((resolve, reject) => {
        db.get(query, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    })).then(results => {
      const stats = {
        total: results[0].total,
        with_connection: results[1].with_connection,
        without_connection: results[2].without_connection,
        recent: results[3].recent
      };
      res.json(stats);
    }).catch(err => {
      console.error('Erreur lors de la récupération des statistiques:', err);
      res.status(500).json({ error: err.message });
    });
  } catch (error) {
    console.error('Erreur inattendue (GET /stats/summary):', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

module.exports = router;
